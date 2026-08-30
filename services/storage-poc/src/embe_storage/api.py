from __future__ import annotations

import hashlib
import hmac
import os
import re
import sqlite3
import tempfile
from importlib import resources
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from embe_storage.config import Settings
from embe_storage.crypto import ChunkCipher, EncryptedProvider
from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.local import LocalStorage
from embe_storage.providers.s3 import R2Storage, S3Storage
from embe_storage.providers.telegram_mtproto import TelegramMTProtoStorage
from embe_storage.repository import Repository

IDENTIFIER = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")


def _build_providers(settings: Settings) -> dict[str, object]:
    if not settings.enabled:
        return {}
    providers: dict[str, object] = {"local": LocalStorage(settings.data_dir / "objects")}
    r2_bucket = os.getenv("EMBE_R2_POC_BUCKET", "")
    r2_account = os.getenv("EMBE_R2_ACCOUNT_ID", "")
    r2_key = os.getenv("EMBE_R2_ACCESS_KEY_ID", "")
    r2_secret = os.getenv("EMBE_R2_SECRET_ACCESS_KEY", "")
    if all((r2_bucket, r2_account, r2_key, r2_secret)):
        if settings.master_key is None:
            raise RuntimeError("R2 PoC requires a 32-byte encryption master key")
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{r2_account}.r2.cloudflarestorage.com",
            aws_access_key_id=r2_key,
            aws_secret_access_key=r2_secret,
            region_name="auto",
        )
        providers["r2"] = EncryptedProvider(
            R2Storage(client, r2_bucket, prefix="embe-storage-poc"),
            ChunkCipher(settings.master_key),
            settings.data_dir / "encrypted-staging" / "r2",
        )
    s3_bucket = os.getenv("EMBE_S3_POC_BUCKET", "")
    if s3_bucket and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        if settings.master_key is None:
            raise RuntimeError("S3 PoC requires a 32-byte encryption master key")
        import boto3

        client = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-southeast-1"))
        providers["s3"] = EncryptedProvider(
            S3Storage(client, s3_bucket, prefix="embe-storage-poc"),
            ChunkCipher(settings.master_key),
            settings.data_dir / "encrypted-staging" / "s3",
        )
    if settings.telegram_enabled:
        settings.require_telegram()
        if settings.master_key is None:
            raise RuntimeError("Telegram PoC requires a 32-byte encryption master key")
        telegram = TelegramMTProtoStorage(settings, settings.master_key)
        providers["telegram_mtproto_lab"] = EncryptedProvider(
            telegram,
            ChunkCipher(settings.master_key),
            settings.data_dir / "encrypted-staging",
        )
    return providers


def _parse_range(value: str | None, size: int) -> tuple[ByteRange | None, int, dict[str, str]]:
    if not value:
        return None, 200, {"Accept-Ranges": "bytes", "Content-Length": str(size)}
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if not match or not any(match.groups()):
        raise ValueError("range_not_satisfiable")
    start_raw, end_raw = match.groups()
    if not start_raw:
        suffix = int(end_raw)
        if suffix <= 0:
            raise ValueError("range_not_satisfiable")
        start, end = max(0, size - suffix), size - 1
    else:
        start = int(start_raw)
        end = int(end_raw) if end_raw else size - 1
    selected = ByteRange(start, min(end, size - 1))
    selected.validate(size)
    length = selected.end_inclusive - selected.start + 1
    return selected, 206, {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Range": f"bytes {selected.start}-{selected.end_inclusive}/{size}",
    }


def create_app(settings: Settings | None = None, providers: dict[str, object] | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    packaged_migration = resources.files("embe_storage").joinpath("migrations/0001_storage_poc.sql")
    source_migration = Path(__file__).parents[2] / "migrations" / "0001_storage_poc.sql"
    default_migration = packaged_migration if packaged_migration.is_file() else source_migration
    migration = Path(
        os.getenv(
            "EMBE_STORAGE_POC_MIGRATION",
            str(default_migration),
        )
    )
    repository = Repository(settings.data_dir / "storage-poc.sqlite3", migration)
    if settings.enabled:
        settings.require_lab()
        repository.migrate()
    provider_map = providers if providers is not None else _build_providers(settings)
    app = FastAPI(title="EmBe Storage PoC", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.state.repository = repository
    app.state.providers = provider_map

    def authorize(
        x_embe_poc_key: Annotated[str | None, Header()] = None,
        x_tenant_id: Annotated[str | None, Header()] = None,
        x_owner_id: Annotated[str | None, Header()] = None,
    ) -> tuple[str, str]:
        if not settings.enabled:
            raise HTTPException(503, "storage PoC disabled")
        if not x_embe_poc_key or not hmac.compare_digest(x_embe_poc_key, settings.api_key):
            raise HTTPException(401, "invalid lab credential")
        if not IDENTIFIER.fullmatch(settings.lab_tenant_id) or not IDENTIFIER.fullmatch(settings.lab_owner_id):
            raise HTTPException(503, "lab principal is misconfigured")
        if x_tenant_id and x_tenant_id != settings.lab_tenant_id:
            raise HTTPException(403, "tenant override is not allowed")
        if x_owner_id and x_owner_id != settings.lab_owner_id:
            raise HTTPException(403, "owner override is not allowed")
        return settings.lab_tenant_id, settings.lab_owner_id

    @app.get("/v1/health")
    async def health(identity: tuple[str, str] = Depends(authorize)):
        statuses = {}
        for name, provider in app.state.providers.items():
            try:
                statuses[name] = await provider.health()
            except Exception as error:
                statuses[name] = {"provider": name, "status": "error", "error": type(error).__name__}
        return {"status": "ok", "feature_enabled": True, "providers": statuses}

    @app.post("/v1/files", status_code=201)
    async def upload(
        file: Annotated[UploadFile, File()],
        provider_name: Annotated[str, Form()] = "local",
        sensitivity: Annotated[str, Form()] = "family",
        identity: tuple[str, str] = Depends(authorize),
    ):
        tenant_id, owner_id = identity
        requested_provider = app.state.providers.get(provider_name)
        if requested_provider is None:
            raise HTTPException(400, "provider is not enabled")
        if sensitivity not in {"public", "family", "important", "restricted"}:
            raise HTTPException(400, "invalid sensitivity")
        if provider_name == "telegram_mtproto_lab" and sensitivity in {"important", "restricted"}:
            raise HTTPException(400, "important or restricted data cannot be Telegram-only")
        provider = (
            app.state.providers.get("local")
            if provider_name == "telegram_mtproto_lab"
            else requested_provider
        )
        if provider is None:
            raise HTTPException(503, "local canonical provider is unavailable")
        max_bytes = min(
            4_194_304_000,
            requested_provider.capabilities.max_object_bytes or 4_194_304_000,
        )
        settings.data_dir.joinpath("staging").mkdir(parents=True, exist_ok=True)
        handle, temporary_name = tempfile.mkstemp(dir=settings.data_dir / "staging", suffix=".upload")
        os.close(handle)
        temporary = Path(temporary_name)
        digest = hashlib.sha256()
        size = 0
        try:
            with temporary.open("wb") as writer:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise HTTPException(413, "file exceeds PoC ceiling")
                    digest.update(chunk)
                    writer.write(chunk)
            if size == 0:
                raise HTTPException(400, "empty files are not supported by this PoC")
            sha256 = digest.hexdigest()
            try:
                asset_id = repository.create_asset(
                    tenant_id,
                    owner_id,
                    Path(file.filename or "upload.bin").name,
                    file.content_type or "application/octet-stream",
                    size,
                    sha256,
                    sensitivity,
                )
            except sqlite3.IntegrityError:
                raise HTTPException(409, "an active asset with this checksum already exists")
            try:
                stored = await provider.put(
                    temporary,
                    PutOptions(
                        tenant_id,
                        asset_id,
                        Path(file.filename or "upload.bin").name,
                        file.content_type or "application/octet-stream",
                        sha256,
                        {"owner_id": owner_id, "sensitivity": sensitivity},
                    ),
                )
                object_id = repository.add_object(
                    asset_id, provider.name, "lab", stored.locator, stored.size, True
                )
                if provider_name == "telegram_mtproto_lab":
                    repository.enqueue(
                        "replicate_telegram",
                        object_id,
                        f"replicate:{asset_id}:telegram:v1",
                    )
            except Exception:
                repository.mark_asset_rejected(asset_id)
                if "stored" in locals():
                    try:
                        await provider.delete(stored.locator)
                    except Exception:
                        pass  # Recovery scan identifies any provider orphan.
                raise
            return {
                "id": asset_id,
                "name": Path(file.filename or "upload.bin").name,
                "size": size,
                "sha256": sha256,
                "status": "replication_pending"
                if provider_name == "telegram_mtproto_lab"
                else "available",
            }
        finally:
            temporary.unlink(missing_ok=True)

    @app.get("/v1/files/{asset_id}")
    async def metadata(asset_id: str, identity: tuple[str, str] = Depends(authorize)):
        asset = repository.get_asset(identity[0], asset_id, identity[1])
        if not asset or asset["status"] == "tombstoned":
            raise HTTPException(404, "file not found")
        return {key: asset[key] for key in ("id", "logical_name", "media_type", "byte_size", "plaintext_sha256", "sensitivity", "status", "created_at")}

    @app.get("/v1/files/{asset_id}/content")
    async def content(
        asset_id: str,
        identity: tuple[str, str] = Depends(authorize),
        range_header: Annotated[str | None, Header(alias="Range")] = None,
    ):
        asset = repository.get_asset(identity[0], asset_id, identity[1])
        storage = repository.get_primary(identity[0], asset_id, identity[1])
        if not asset or asset["status"] != "available" or not storage:
            raise HTTPException(404, "file not found")
        try:
            selected, status, headers = _parse_range(range_header, int(asset["byte_size"]))
        except ValueError:
            raise HTTPException(416, "range not satisfiable", headers={"Content-Range": f"bytes */{asset['byte_size']}"})
        provider = app.state.providers.get(storage["provider"])
        if provider is None:
            raise HTTPException(503, "provider unavailable")
        return StreamingResponse(
            provider.open(storage["locator"], selected),
            status_code=status,
            media_type=asset["media_type"],
            headers={**headers, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.delete("/v1/files/{asset_id}", status_code=202)
    async def delete(asset_id: str, identity: tuple[str, str] = Depends(authorize)):
        objects = repository.soft_delete(identity[0], asset_id, identity[1])
        if not objects:
            raise HTTPException(404, "file not found")
        pending = False
        for storage in objects:
            provider = app.state.providers.get(storage["provider"])
            if provider is not None:
                try:
                    await provider.delete(storage["locator"])
                    repository.mark_object_deleted(storage["id"])
                except Exception:
                    repository.enqueue(
                        "delete_provider",
                        storage["id"],
                        f"delete:{storage['id']}",
                    )
                    pending = True
            else:
                repository.enqueue("delete_provider", storage["id"], f"delete:{storage['id']}")
                pending = True
        return {"id": asset_id, "status": "delete_pending" if pending else "tombstoned"}

    @app.post("/v1/admin/reconcile")
    async def reconcile(identity: tuple[str, str] = Depends(authorize)):
        return {"status": "complete", **repository.reconcile()}

    @app.post("/v1/admin/telegram/rebuild-index")
    async def rebuild(identity: tuple[str, str] = Depends(authorize)):
        provider = app.state.providers.get("telegram_mtproto_lab")
        if provider is None or not settings.telegram_enabled:
            raise HTTPException(503, "Telegram lab provider disabled")
        recovered = []
        async for item in provider.scan_history():
            manifest = item["manifest"]
            if manifest.get("tenant_id") != identity[0]:
                continue
            digest = hashlib.sha256()
            try:
                async for chunk in provider.open(item["locator"]):
                    digest.update(chunk)
            except Exception:
                recovered.append({"asset_id": manifest.get("asset_id"), "created": False, "verified": False})
                continue
            if digest.hexdigest() != manifest.get("metadata", {}).get("plaintext_sha256"):
                recovered.append({"asset_id": manifest.get("asset_id"), "created": False, "verified": False})
                continue
            created = repository.recover_telegram_candidate(manifest, item["locator"])
            recovered.append({"asset_id": manifest["asset_id"], "created": created, "verified": True})
        return {"status": "rebuilt", "recovered_candidates": recovered}

    return app


app = create_app()
