from __future__ import annotations

from collections.abc import Awaitable, Callable
import os
import tempfile
import asyncio
from pathlib import Path

from embe_storage.provider import ProviderError, PutOptions
from embe_storage.repository import Repository


class StorageWorker:
    def __init__(
        self,
        repository: Repository,
        handlers: dict[str, Callable[[dict[str, object]], Awaitable[None]]],
    ):
        self.repository = repository
        self.handlers = handlers

    async def run_once(self, limit: int = 10) -> dict[str, int]:
        completed = retried = failed = 0
        for job in self.repository.due_outbox(limit):
            handler = self.handlers.get(str(job["operation"]))
            if handler is None:
                self.repository.retry_outbox(str(job["id"]), "unknown_operation", "no handler", 3600)
                failed += 1
                continue
            try:
                await handler(job)
                self.repository.complete_outbox(str(job["id"]))
                completed += 1
            except ProviderError as error:
                delay = error.retry_after or min(3600, 2 ** min(int(job["attempts"]), 10))
                self.repository.retry_outbox(str(job["id"]), error.code, error.detail, delay)
                retried += 1
            except Exception as error:
                delay = min(3600, 2 ** min(int(job["attempts"]), 10))
                self.repository.retry_outbox(
                    str(job["id"]), "unexpected_error", type(error).__name__, delay
                )
                retried += 1
        return {"completed": completed, "retried": retried, "failed": failed}


class MaintenanceWorker(StorageWorker):
    def __init__(self, repository: Repository, providers: dict[str, object]):
        self.providers = providers
        super().__init__(repository, {"delete_provider": self._delete_provider})

    async def _delete_provider(self, job: dict[str, object]) -> None:
        context = self.repository.get_object_context(str(job["storage_object_id"]))
        if not context:
            return
        provider = self.providers.get(str(context["provider"]))
        if provider is None:
            raise ProviderError("provider_unavailable", "delete provider is unavailable")
        await provider.delete(context["locator"])
        self.repository.mark_object_deleted(str(context["id"]))


class TelegramReplicationWorker(StorageWorker):
    def __init__(self, repository: Repository, providers: dict[str, object], telegram_provider, staging: Path):
        self.providers = providers
        self.telegram_provider = telegram_provider
        self.staging = staging
        staging.mkdir(parents=True, exist_ok=True)
        super().__init__(repository, {"replicate_telegram": self._replicate})

    async def _replicate(self, job: dict[str, object]) -> None:
        context = self.repository.get_object_context(str(job["storage_object_id"]))
        if not context:
            raise ProviderError("source_missing", "source storage object is missing")
        source_provider = self.providers.get(str(context["provider"]))
        if source_provider is None:
            raise ProviderError("source_provider_unavailable", "source provider is unavailable")
        handle, name = tempfile.mkstemp(prefix="embe-replicate-", suffix=".plain", dir=self.staging)
        os.close(handle)
        temporary = Path(name)
        try:
            with temporary.open("wb") as writer:
                async for chunk in source_provider.open(context["locator"]):
                    writer.write(chunk)
            stored = await self.telegram_provider.put(
                temporary,
                PutOptions(
                    str(context["tenant_id"]),
                    str(context["asset_id"]),
                    str(context["logical_name"]),
                    str(context["media_type"]),
                    str(context["plaintext_sha256"]),
                    {"owner_id": str(context["owner_id"]), "sensitivity": str(context["sensitivity"])},
                ),
            )
            self.repository.add_object(
                str(context["asset_id"]),
                self.telegram_provider.name,
                "dedicated-premium-lab",
                stored.locator,
                stored.size,
                False,
            )
        finally:
            temporary.unlink(missing_ok=True)


async def _run_forever() -> None:
    from embe_storage.api import _build_providers
    from embe_storage.config import Settings

    settings = Settings.from_env()
    settings.require_lab()
    migration = Path(os.environ.get("EMBE_STORAGE_POC_MIGRATION", "/app/migrations/0001_storage_poc.sql"))
    repository = Repository(settings.data_dir / "storage-poc.sqlite3", migration)
    repository.migrate()
    providers = _build_providers(settings)
    worker = MaintenanceWorker(repository, providers)
    telegram = providers.get("telegram_mtproto_lab")
    if telegram is not None:
        replication = TelegramReplicationWorker(
            repository,
            providers,
            telegram,
            settings.data_dir / "replication-staging",
        )
        worker.handlers.update(replication.handlers)
    while True:
        await worker.run_once()
        await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(_run_forever())
