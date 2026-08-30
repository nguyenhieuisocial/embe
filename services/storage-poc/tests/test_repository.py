from pathlib import Path

from embe_storage.repository import Repository


def test_migration_idempotency_and_tenant_isolation(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repo = Repository(tmp_path / "poc.sqlite3", migration)
    repo.migrate()
    repo.migrate()
    asset_id = repo.create_asset("tenant-a", "owner", "file", "text/plain", 3, "a" * 64)
    repo.add_object(asset_id, "local", "lab", {"key": "safe"}, 3, True)
    assert repo.get_asset("tenant-a", asset_id)["status"] == "available"
    assert repo.get_asset("tenant-b", asset_id) is None


def test_soft_delete_is_idempotent(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repo = Repository(tmp_path / "poc.sqlite3", migration)
    repo.migrate()
    asset_id = repo.create_asset("tenant-a", "owner", "file", "text/plain", 3, "a" * 64)
    repo.add_object(asset_id, "local", "lab", {"key": "safe"}, 3, True)
    pending = repo.soft_delete("tenant-a", asset_id)
    assert len(pending) == 1
    assert len(repo.soft_delete("tenant-a", asset_id)) == 1
    repo.mark_object_deleted(pending[0]["id"])
    assert repo.soft_delete("tenant-a", asset_id) == []


def test_recovery_manifest_rebuilds_mapping_once(tmp_path: Path):
    migration = Path(__file__).parents[1] / "migrations" / "0001_storage_poc.sql"
    repo = Repository(tmp_path / "poc.sqlite3", migration)
    repo.migrate()
    manifest = {
        "asset_id": "asset-recovered",
        "tenant_id": "tenant-a",
        "logical_name": "recovered.bin",
        "media_type": "application/octet-stream",
        "size": 144,
        "metadata": {
            "owner_id": "owner-a",
            "original_size": 100,
            "plaintext_sha256": "b" * 64,
            "sensitivity": "family",
        },
    }
    locator = {"shard_ref": "-1001", "message_id": 42}

    assert repo.recover_telegram_candidate(manifest, locator) is True
    assert repo.recover_telegram_candidate(manifest, locator) is False
    asset = repo.get_asset("tenant-a", "asset-recovered")
    assert asset is not None
    assert asset["byte_size"] == 100
    assert repo.get_primary("tenant-a", "asset-recovered")["locator"] == locator
