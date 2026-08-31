"""Archive curated Immich originals to encrypted Telegram storage."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
import uuid
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(PROJECT_ROOT / "services" / "media-publisher"))

from publisher import ImmichClient, _valid_local_url  # noqa: E402

from embe_storage.api import _build_providers  # noqa: E402
from embe_storage.config import Settings  # noqa: E402
from embe_storage.immich_archive import ImmichTelegramArchive  # noqa: E402
from embe_storage.repository import Repository  # noqa: E402


def _immich_client() -> ImmichClient:
    base_url = os.getenv("IMMICH_BASE_URL", "").rstrip("/")
    api_key = os.getenv("IMMICH_API_KEY", "")
    album_ids = tuple(
        value.strip().lower()
        for value in os.getenv("IMMICH_ALBUM_IDS", "").split(",")
        if value.strip()
    )
    if not _valid_local_url(base_url) or not api_key or not album_ids:
        raise RuntimeError("Immich archive configuration is incomplete")
    if any(str(uuid.UUID(value)) != value for value in album_ids):
        raise RuntimeError("Immich archive album allowlist is invalid")
    return ImmichClient(
        SimpleNamespace(
            immich_base_url=base_url,
            immich_api_key=api_key,
            album_ids=album_ids,
        )
    )


async def main() -> int:
    settings = Settings.from_env()
    settings.require_lab()
    settings.require_telegram()
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(settings.data_dir / "storage-poc.sqlite3", migration)
    repository.migrate()
    providers = _build_providers(settings)
    telegram = providers.get("telegram_mtproto_lab")
    if telegram is None:
        raise RuntimeError("Telegram archive provider is unavailable")
    archive = ImmichTelegramArchive(
        repository,
        _immich_client(),
        telegram,
        settings.data_dir / "immich-archive-staging",
        settings.lab_tenant_id,
        settings.lab_owner_id,
    )
    try:
        result = await archive.run_once()
        print(json.dumps({"status": "ok", **result}, separators=(",", ":")))
        return 0
    finally:
        inner = getattr(telegram, "inner", telegram)
        client = getattr(inner, "_client", None)
        if client is not None and client.is_connected():
            await client.disconnect()


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as error:
        frame = traceback.extract_tb(error.__traceback__)[-1]
        print(
            json.dumps(
                {"status": "error", "error_type": type(error).__name__, "error_origin": f"{frame.name}:{frame.lineno}"},
                separators=(",", ":"),
            )
        )
        raise SystemExit(1)
