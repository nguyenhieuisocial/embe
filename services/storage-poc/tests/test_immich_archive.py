from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

import embe_storage.immich_archive as archive_module
from embe_storage.immich_archive import ImmichTelegramArchive
from embe_storage.provider import StoredObject
from embe_storage.repository import Repository


ASSET_ID = "11111111-1111-4111-8111-111111111111"


class FakeImmich:
    def __init__(self):
        self.downloads = 0

    def list_assets(self, asset_type=None):
        assert asset_type is None
        return [{"id": ASSET_ID, "type": "IMAGE", "updatedAt": "2026-08-31T01:00:00Z", "originalFileName": "home-gps.jpg"}]

    def download_original(self, asset_id, destination, max_bytes):
        assert asset_id == ASSET_ID
        assert max_bytes == 1_900_000_000
        self.downloads += 1
        content = b"private-family-photo"
        destination.write_bytes(content)
        return {
            "size": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "mime_type": "image/jpeg",
        }


class FakeTelegram:
    name = "telegram_mtproto_lab"
    capabilities = SimpleNamespace(max_object_bytes=1_900_000_000)

    def __init__(self):
        self.uploads = []

    async def put(self, source, options):
        self.uploads.append((source.read_bytes(), options))
        return StoredObject(
            locator={"inner": {"message_id": 42}, "asset_id": options.asset_id},
            size=source.stat().st_size,
            sha256=options.sha256,
        )


@pytest.mark.asyncio
async def test_curated_immich_original_is_archived_once_without_leaking_filename(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(tmp_path / "storage.sqlite3", migration)
    repository.migrate()
    immich = FakeImmich()
    telegram = FakeTelegram()
    archive = ImmichTelegramArchive(repository, immich, telegram, tmp_path / "staging", "family", "parents")

    first = await archive.run_once()
    second = await archive.run_once()

    assert first == {"seen": 1, "archived": 1, "reused": 0, "rejected": 0}
    assert second == {"seen": 1, "archived": 0, "reused": 1, "rejected": 0}
    assert immich.downloads == 1
    assert len(telegram.uploads) == 1
    _body, options = telegram.uploads[0]
    assert options.logical_name == f"immich-{ASSET_ID}"
    assert "home-gps" not in str(options)
    linked = repository.get_source_link("immich", ASSET_ID)
    assert linked and linked["telegram_ready"] is True
    assert list((tmp_path / "staging").glob("*")) == []


@pytest.mark.asyncio
async def test_non_media_asset_is_rejected_without_download(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(tmp_path / "storage.sqlite3", migration)
    repository.migrate()
    immich = FakeImmich()
    immich.list_assets = lambda asset_type=None: [{"id": ASSET_ID, "type": "SIDECAR", "updatedAt": "v1"}]
    telegram = FakeTelegram()
    archive = ImmichTelegramArchive(repository, immich, telegram, tmp_path / "staging", "family", "parents")

    assert await archive.run_once() == {"seen": 1, "archived": 0, "reused": 0, "rejected": 1}
    assert immich.downloads == 0
    assert telegram.uploads == []


@pytest.mark.asyncio
async def test_windows_staging_does_not_delete_and_recreate_the_same_file(tmp_path: Path, monkeypatch):
    def forbidden_mkstemp(*_args, **_kwargs):
        raise AssertionError("mkstemp delete/recreate is racy on Windows")

    monkeypatch.setattr(archive_module.tempfile, "mkstemp", forbidden_mkstemp)
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(tmp_path / "storage.sqlite3", migration)
    repository.migrate()
    archive = ImmichTelegramArchive(
        repository,
        FakeImmich(),
        FakeTelegram(),
        tmp_path / "staging",
        "family",
        "parents",
    )

    assert (await archive.run_once())["archived"] == 1


@pytest.mark.asyncio
async def test_archive_limits_new_uploads_per_scheduled_run(tmp_path: Path):
    ids = [f"{value:08d}-1111-4111-8111-111111111111" for value in range(1, 4)]

    class MultipleImmich(FakeImmich):
        def list_assets(self, asset_type=None):
            return [{"id": value, "type": "IMAGE", "updatedAt": "v1"} for value in ids]

        def download_original(self, asset_id, destination, max_bytes):
            content = asset_id.encode()
            self.downloads += 1
            destination.write_bytes(content)
            return {"size": len(content), "sha256": hashlib.sha256(content).hexdigest(), "mime_type": "image/jpeg"}

    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repository = Repository(tmp_path / "storage.sqlite3", migration)
    repository.migrate()
    immich = MultipleImmich()
    telegram = FakeTelegram()
    archive = ImmichTelegramArchive(repository, immich, telegram, tmp_path / "staging", "family", "parents")

    first = await archive.run_once(max_new_assets=2)
    second = await archive.run_once(max_new_assets=2)

    assert first["archived"] == 2
    assert second["archived"] == 1
    assert immich.downloads == 3
