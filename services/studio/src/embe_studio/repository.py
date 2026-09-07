from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from .contracts import Project


class QueueConflict(RuntimeError):
    pass


class QueueFull(RuntimeError):
    pass


class Repository:
    """Private editorial queue; not a multi-tenant authentication model."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.database = self.root / "studio.sqlite3"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
                project TEXT NOT NULL, request_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued'
                    CHECK(status IN ('queued','rendering','completed','failed','cancelled','deleted')),
                progress INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL, updated_at REAL NOT NULL, available_at REAL NOT NULL,
                error_code TEXT, result TEXT
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, available_at)")
            db.execute("PRAGMA user_version=1")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def public(row) -> dict:
        return {key: row[key] for key in ("id", "status", "progress", "attempts", "created_at", "updated_at", "error_code")} | {
            "result": json.loads(row["result"]) if row["result"] else None,
        }

    def submit(self, key: str, project: Project) -> dict:
        encoded = json.dumps(project.model_dump(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT * FROM jobs WHERE idempotency_key=?", (key,)).fetchone()
            if existing:
                if existing["request_hash"] != digest:
                    raise QueueConflict("idempotency_conflict")
                return self.public(existing)
            # Bound both storage and active work, including repeated retry attempts.
            if db.execute("SELECT count(*) FROM jobs").fetchone()[0] >= 200 or db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','rendering')").fetchone()[0] >= 5:
                raise QueueFull("queue_full")
            identifier = str(uuid4())
            db.execute("INSERT INTO jobs(id,idempotency_key,project,request_hash,created_at,updated_at,available_at) VALUES(?,?,?,?,?,?,?)",
                       (identifier, key, encoded, digest, now, now, now))
            return self.public(db.execute("SELECT * FROM jobs WHERE id=?", (identifier,)).fetchone())

    def get(self, identifier: str) -> dict | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=? AND status != 'deleted'", (identifier,)).fetchone()
            return self.public(row) if row else None

    def list(self) -> list[dict]:
        with self.connect() as db:
            return [self.public(row) for row in db.execute("SELECT * FROM jobs WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 50")]

    def recover(self):
        """Only call while holding the exclusive worker process lock."""
        with self.connect() as db:
            db.execute("UPDATE jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END, error_code='worker_interrupted', updated_at=?, available_at=? WHERE status='rendering'", (time.time(), time.time()))

    def claim(self) -> dict | None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM jobs WHERE status='queued' AND available_at<=? ORDER BY created_at LIMIT 1", (time.time(),)).fetchone()
            if not row:
                return None
            db.execute("UPDATE jobs SET status='rendering', attempts=attempts+1, progress=0, error_code=NULL, updated_at=? WHERE id=?", (time.time(), row["id"]))
            return {"id": row["id"], "project": Project.model_validate(json.loads(row["project"]))}

    def progress(self, identifier: str, value: int) -> bool:
        with self.connect() as db:
            return db.execute("UPDATE jobs SET progress=?, updated_at=? WHERE id=? AND status='rendering'", (max(0, min(99, value)), time.time(), identifier)).rowcount == 1

    def complete(self, identifier: str, result: dict) -> bool:
        with self.connect() as db:
            return db.execute("UPDATE jobs SET status='completed', progress=100, result=?, updated_at=? WHERE id=? AND status='rendering'", (json.dumps(result), time.time(), identifier)).rowcount == 1

    def fail(self, identifier: str, code: str, retryable: bool = False):
        with self.connect() as db:
            db.execute("""UPDATE jobs SET status=CASE WHEN ? AND attempts<3 THEN 'queued' ELSE 'failed' END,
                error_code=?, available_at=? + 30 * attempts * attempts, updated_at=?
                WHERE id=? AND status='rendering'""", (retryable, code, time.time(), time.time(), identifier))

    def cancel(self, identifier: str) -> bool:
        with self.connect() as db:
            return db.execute("UPDATE jobs SET status='cancelled', updated_at=? WHERE id=? AND status IN ('queued','rendering')", (time.time(), identifier)).rowcount == 1

    def retry(self, identifier: str) -> bool:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','rendering')").fetchone()[0] >= 5:
                raise QueueFull("queue_full")
            return db.execute("UPDATE jobs SET status='queued', error_code=NULL, progress=0, updated_at=?, available_at=? WHERE id=? AND status='failed' AND attempts<3", (time.time(), time.time(), identifier)).rowcount == 1

    def delete(self, identifier: str) -> bool:
        with self.connect() as db:
            # Scrub private text/selection while keeping idempotency tombstones.
            return db.execute("UPDATE jobs SET status='deleted', project='{}', result=NULL, error_code=NULL, updated_at=? WHERE id=? AND status!='deleted'", (time.time(), identifier)).rowcount == 1

    def garbage_ids(self) -> list[str]:
        with self.connect() as db:
            return [row[0] for row in db.execute("SELECT id FROM jobs WHERE status IN ('deleted','cancelled','failed')")]
