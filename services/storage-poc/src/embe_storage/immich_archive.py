from __future__ import annotations

import sqlite3
import tempfile
import uuid
from pathlib import Path

from embe_storage.provider import PutOptions
from embe_storage.repository import Repository


class ImmichTelegramArchive:
    def __init__(
        self,
        repository: Repository,
        immich,
        telegram,
        staging: Path,
        tenant_id: str,
        owner_id: str,
    ):
        self.repository = repository
        self.immich = immich
        self.telegram = telegram
        self.staging = staging
        self.tenant_id = tenant_id
        self.owner_id = owner_id
        self.staging.mkdir(parents=True, exist_ok=True)

    async def run_once(self, *, max_new_assets: int = 5) -> dict[str, int]:
        if not 1 <= max_new_assets <= 100:
            raise ValueError("archive batch limit is outside the accepted range")
        result = {"seen": 0, "archived": 0, "reused": 0, "rejected": 0}
        new_assets = 0
        max_bytes = self.telegram.capabilities.max_object_bytes
        if not isinstance(max_bytes, int) or max_bytes < 1:
            raise RuntimeError("Telegram provider has no bounded object limit")

        for source in self.immich.list_assets(asset_type=None):
            result["seen"] += 1
            try:
                source_id = str(uuid.UUID(str(source.get("id", "")))).lower()
                source_version = str(source.get("updatedAt", "")).strip()
                if not source_version or len(source_version) > 100 or source.get("type") not in {"IMAGE", "VIDEO"}:
                    raise ValueError("unsupported Immich asset")
            except (TypeError, ValueError):
                result["rejected"] += 1
                continue

            linked = self.repository.get_source_link("immich", source_id)
            if linked and linked["telegram_ready"]:
                if linked["source_version"] != source_version:
                    self.repository.link_source(
                        "immich", source_id, source_version, str(linked["storage_asset_id"])
                    )
                result["reused"] += 1
                continue

            if new_assets >= max_new_assets:
                break
            new_assets += 1

            temporary_directory = Path(tempfile.mkdtemp(prefix="embe-immich-", dir=self.staging))
            temporary = temporary_directory / "original"
            new_asset = False
            asset_id = ""
            try:
                downloaded = self.immich.download_original(source_id, temporary, max_bytes)
                sha256 = str(downloaded["sha256"])
                size = int(downloaded["size"])
                mime_type = str(downloaded["mime_type"])
                if len(sha256) != 64 or size < 1 or not (
                    mime_type.startswith("image/") or mime_type.startswith("video/")
                ):
                    raise ValueError("invalid downloaded Immich asset")

                asset_id = self.repository.find_active_asset_by_checksum(self.tenant_id, sha256) or ""
                if not asset_id:
                    try:
                        asset_id = self.repository.create_asset(
                            self.tenant_id,
                            self.owner_id,
                            f"immich-{source_id}",
                            mime_type,
                            size,
                            sha256,
                            "family",
                        )
                        new_asset = True
                    except sqlite3.IntegrityError:
                        asset_id = self.repository.find_active_asset_by_checksum(self.tenant_id, sha256) or ""
                        if not asset_id:
                            raise

                if not self.repository.has_active_provider(asset_id, self.telegram.name):
                    stored = await self.telegram.put(
                        temporary,
                        PutOptions(
                            self.tenant_id,
                            asset_id,
                            f"immich-{source_id}",
                            mime_type,
                            sha256,
                            {"owner_id": self.owner_id, "sensitivity": "family", "source": "immich-curated"},
                        ),
                    )
                    self.repository.add_object(
                        asset_id,
                        self.telegram.name,
                        "dedicated-telegram-account",
                        stored.locator,
                        stored.size,
                        False,
                    )
                    result["archived"] += 1
                else:
                    result["reused"] += 1
                self.repository.link_source("immich", source_id, source_version, asset_id)
            except Exception:
                if new_asset and asset_id:
                    self.repository.mark_asset_rejected(asset_id)
                raise
            finally:
                temporary.unlink(missing_ok=True)
                try:
                    temporary_directory.rmdir()
                except OSError:
                    pass
        return result
