"""Run the Windows-hosted secondary-storage worker to an idle queue."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from embe_storage.api import _build_providers
from embe_storage.config import Settings
from embe_storage.repository import Repository
from embe_storage.worker import MaintenanceWorker, TelegramReplicationWorker


async def main() -> int:
    settings = Settings.from_env()
    settings.require_lab()
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(settings.data_dir / "storage-poc.sqlite3", migration)
    repository.migrate()
    providers = _build_providers(settings)
    worker = MaintenanceWorker(repository, providers)
    telegram = providers.get("telegram_mtproto_lab")
    if telegram is None:
        raise RuntimeError("Windows Telegram provider is not enabled")
    replication = TelegramReplicationWorker(
        repository,
        providers,
        telegram,
        settings.data_dir / "replication-staging",
    )
    worker.handlers.update(replication.handlers)

    totals = {"completed": 0, "retried": 0, "failed": 0}
    try:
        for _ in range(100):
            result = await worker.run_once(limit=20)
            for key in totals:
                totals[key] += result[key]
            if not any(result.values()):
                break
        print(json.dumps({"status": "ok", **totals}, separators=(",", ":")))
        return 0 if totals["failed"] == 0 else 2
    finally:
        inner = getattr(telegram, "inner", telegram)
        client = getattr(inner, "_client", None)
        if client is not None and client.is_connected():
            await client.disconnect()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
