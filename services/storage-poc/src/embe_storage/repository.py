from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any


class Repository:
    def __init__(self, database: Path, migration: Path):
        self.database = database
        self.migration = migration
        database.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma busy_timeout = 5000")
        connection.execute("pragma journal_mode = wal")
        connection.execute("pragma foreign_keys = on")
        return connection

    def migrate(self) -> None:
        sql = self.migration.read_text(encoding="utf-8")
        with self.connect() as connection:
            connection.executescript(sql)
            connection.execute(
                "insert or ignore into schema_migrations(version) values (?)",
                (self.migration.stem,),
            )

    def create_asset(
        self,
        tenant_id: str,
        owner_id: str,
        logical_name: str,
        media_type: str,
        byte_size: int,
        sha256: str,
        sensitivity: str = "family",
    ) -> str:
        asset_id = str(uuid.uuid4())
        with self.connect() as connection:
            connection.execute(
                """insert into assets
                (id,tenant_id,owner_id,logical_name,media_type,byte_size,plaintext_sha256,sensitivity,status)
                values (?,?,?,?,?,?,?,?,?)""",
                (asset_id, tenant_id, owner_id, logical_name, media_type, byte_size, sha256, sensitivity, "uploading"),
            )
            connection.execute(
                "insert into asset_acl(asset_id,principal_type,principal_id,permission) values (?,?,?,?)",
                (asset_id, "user", owner_id, "admin"),
            )
        return asset_id

    def mark_asset_rejected(self, asset_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "update assets set status='rejected' where id=? and status='uploading'",
                (asset_id,),
            )

    def add_object(
        self,
        asset_id: str,
        provider: str,
        provider_account_id: str,
        locator: dict[str, Any],
        byte_size: int,
        is_primary: bool,
    ) -> str:
        object_id = str(uuid.uuid4())
        with self.connect() as connection:
            existing = connection.execute(
                """select id from storage_objects
                   where asset_id=? and provider=? and provider_account_id=? and state <> 'deleted'""",
                (asset_id, provider, provider_account_id),
            ).fetchone()
            if existing:
                return str(existing["id"])
            connection.execute(
                """insert into storage_objects
                (id,asset_id,provider,provider_account_id,locator_json,byte_size,state,is_primary,verified_at)
                values (?,?,?,?,?,?, 'available', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                (object_id, asset_id, provider, provider_account_id, json.dumps(locator), byte_size, int(is_primary)),
            )
            connection.execute("update assets set status='available' where id=?", (asset_id,))
        return object_id

    def get_asset(
        self, tenant_id: str, asset_id: str, principal_id: str | None = None
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """select a.* from assets a where a.tenant_id=? and a.id=? and
                   (? is null or exists (
                     select 1 from asset_acl acl where acl.asset_id=a.id and acl.principal_id=?
                   ))""",
                (tenant_id, asset_id, principal_id, principal_id),
            ).fetchone()
        return dict(row) if row else None

    def get_primary(
        self, tenant_id: str, asset_id: str, principal_id: str | None = None
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """select so.* from storage_objects so join assets a on a.id=so.asset_id
                   where a.tenant_id=? and a.id=? and so.is_primary=1 and so.state='available'
                   and (? is null or exists (
                     select 1 from asset_acl acl where acl.asset_id=a.id and acl.principal_id=?
                   ))""",
                (tenant_id, asset_id, principal_id, principal_id),
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["locator"] = json.loads(result.pop("locator_json"))
        return result

    def soft_delete(
        self, tenant_id: str, asset_id: str, principal_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self.connect() as connection:
            asset = connection.execute(
                """select a.status from assets a where a.tenant_id=? and a.id=? and
                   (? is null or exists (
                     select 1 from asset_acl acl where acl.asset_id=a.id and acl.principal_id=?
                     and acl.permission='admin'
                   ))""",
                (tenant_id, asset_id, principal_id, principal_id),
            ).fetchone()
            if not asset:
                return []
            rows = connection.execute(
                "select * from storage_objects where asset_id=? and state in ('available','deleting')",
                (asset_id,),
            ).fetchall()
            connection.execute(
                "update assets set status='tombstoned', deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?",
                (asset_id,),
            )
            connection.execute(
                "update storage_objects set state='deleting' where asset_id=? and state='available'",
                (asset_id,),
            )
        result = []
        for row in rows:
            item = dict(row)
            item["locator"] = json.loads(item.pop("locator_json"))
            result.append(item)
        return result

    def mark_object_deleted(self, object_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "update storage_objects set state='deleted', deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?",
                (object_id,),
            )

    def reconcile(self) -> dict[str, int]:
        with self.connect() as connection:
            dangling = connection.execute(
                """select count(*) from storage_objects so left join assets a on a.id=so.asset_id
                   where a.id is null"""
            ).fetchone()[0]
            tombstoned_available = connection.execute(
                """select count(*) from storage_objects so join assets a on a.id=so.asset_id
                   where a.status='tombstoned' and so.state='available'"""
            ).fetchone()[0]
            deleting = connection.execute(
                "select count(*) from storage_objects where state='deleting'"
            ).fetchone()[0]
        return {
            "dangling_rows": dangling,
            "tombstoned_available_replicas": tombstoned_available,
            "delete_pending_replicas": deleting,
        }

    def recover_telegram_candidate(self, manifest: dict[str, Any], locator: dict[str, Any]) -> bool:
        metadata = dict(manifest.get("metadata", {}))
        required = {"asset_id", "tenant_id", "logical_name", "media_type", "size"}
        metadata_required = {"owner_id", "original_size", "plaintext_sha256"}
        if not required.issubset(manifest) or not metadata_required.issubset(metadata):
            raise ValueError("recovery manifest is incomplete")
        asset_id = str(manifest["asset_id"])
        with self.connect() as connection:
            if connection.execute("select 1 from assets where id=?", (asset_id,)).fetchone():
                return False
            connection.execute(
                """insert into assets
                (id,tenant_id,owner_id,logical_name,media_type,byte_size,plaintext_sha256,sensitivity,status)
                values (?,?,?,?,?,?,?,?, 'available')""",
                (
                    asset_id,
                    str(manifest["tenant_id"]),
                    str(metadata["owner_id"]),
                    str(manifest["logical_name"]),
                    str(manifest["media_type"]),
                    int(metadata["original_size"]),
                    str(metadata["plaintext_sha256"]),
                    str(metadata.get("sensitivity", "family")),
                ),
            )
            connection.execute(
                "insert into asset_acl(asset_id,principal_type,principal_id,permission) values (?,?,?,?)",
                (asset_id, "user", str(metadata["owner_id"]), "admin"),
            )
            connection.execute(
                """insert into storage_objects
                (id,asset_id,provider,provider_account_id,locator_json,byte_size,state,is_primary,verified_at)
                values (?,?,?,?,?,?, 'available', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                (
                    str(uuid.uuid4()),
                    asset_id,
                    "telegram_mtproto_lab",
                    "recovered-lab",
                    json.dumps(locator),
                    int(metadata["original_size"]),
                ),
            )
        return True

    def enqueue(self, operation: str, storage_object_id: str, idempotency_key: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                """insert or ignore into storage_outbox(id,operation,storage_object_id,idempotency_key)
                   values (?,?,?,?)""",
                (str(uuid.uuid4()), operation, storage_object_id, idempotency_key),
            )
        return cursor.rowcount == 1

    def due_outbox(self, limit: int = 10) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """select * from storage_outbox where next_attempt_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
                   order by created_at limit ?""",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def complete_outbox(self, outbox_id: str) -> None:
        with self.connect() as connection:
            connection.execute("delete from storage_outbox where id=?", (outbox_id,))

    def retry_outbox(self, outbox_id: str, code: str, detail: str, delay_seconds: int) -> None:
        with self.connect() as connection:
            connection.execute(
                """update storage_outbox set attempts=attempts+1,
                   next_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ','now', ?),
                   last_error_code=?, last_error_detail=? where id=?""",
                (f"+{max(1, delay_seconds)} seconds", code, detail[:1000], outbox_id),
            )

    def get_object_context(self, object_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """select so.*, a.tenant_id, a.owner_id, a.logical_name, a.media_type,
                          a.plaintext_sha256, a.sensitivity
                   from storage_objects so join assets a on a.id=so.asset_id
                   where so.id=?""",
                (object_id,),
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["locator"] = json.loads(result.pop("locator_json"))
        return result
