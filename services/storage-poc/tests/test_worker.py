from __future__ import annotations

from pathlib import Path

import pytest

from embe_storage.repository import Repository
from embe_storage.provider import ProviderError
from embe_storage.worker import MaintenanceWorker, StorageWorker


@pytest.mark.asyncio
async def test_worker_outbox_is_idempotent(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repo = Repository(tmp_path / "poc.sqlite3", migration)
    repo.migrate()
    asset_id = repo.create_asset("tenant", "owner", "x", "text/plain", 1, "a" * 64)
    object_id = repo.add_object(asset_id, "local", "lab", {"key": "x"}, 1, True)
    assert repo.enqueue("replicate_telegram", object_id, "asset:telegram:v1") is True
    assert repo.enqueue("replicate_telegram", object_id, "asset:telegram:v1") is False
    calls = []

    async def handler(job):
        calls.append(job["id"])

    worker = StorageWorker(repo, {"replicate_telegram": handler})
    assert await worker.run_once() == {"completed": 1, "retried": 0, "failed": 0}
    assert len(calls) == 1
    assert await worker.run_once() == {"completed": 0, "retried": 0, "failed": 0}


@pytest.mark.asyncio
async def test_delete_worker_retries_then_marks_deleted(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repo = Repository(tmp_path / "poc.sqlite3", migration)
    repo.migrate()
    asset_id = repo.create_asset("tenant", "owner", "x", "text/plain", 1, "b" * 64)
    object_id = repo.add_object(asset_id, "local", "lab", {"key": "x"}, 1, True)
    repo.soft_delete("tenant", asset_id, "owner")
    repo.enqueue("delete_provider", object_id, f"delete:{object_id}")

    class FlakyProvider:
        calls = 0

        async def delete(self, locator):
            self.calls += 1
            if self.calls == 1:
                raise ProviderError("transient_unavailable", "retry")

    provider = FlakyProvider()
    worker = MaintenanceWorker(repo, {"local": provider})
    assert await worker.run_once() == {"completed": 0, "retried": 1, "failed": 0}
    with repo.connect() as connection:
        connection.execute("update storage_outbox set next_attempt_at='1970-01-01T00:00:00Z'")
    assert await worker.run_once() == {"completed": 1, "retried": 0, "failed": 0}
    assert repo.soft_delete("tenant", asset_id, "owner") == []
