from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .home_assistant import RoomSample


class ReconciliationMismatch(RuntimeError):
    pass


class Warehouse:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(path)
        migration = Path(__file__).resolve().parents[2] / "migrations" / "0001_core.sql"
        self._connection.executescript(migration.read_text(encoding="utf-8"))
        self._connection.commit()

    def close(self):
        self._connection.close()

    def upsert_room_sample(self, sample: RoomSample) -> bool:
        cursor = self._connection.execute(
            """
            INSERT OR IGNORE INTO fact_room_sample
              (source, source_id, entity_id, kind, observed_at, value, unit, raw_value, raw_unit, quality_flag)
            VALUES ('home_assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sample.source_id,
                sample.entity_id,
                sample.kind,
                self._utc_text(sample.observed_at),
                sample.value,
                sample.unit,
                sample.raw_value,
                sample.raw_unit,
                sample.quality_flag,
            ),
        )
        self._connection.execute(
            """
            INSERT INTO ingest_checkpoint (source, observed_at) VALUES ('home_assistant', ?)
            ON CONFLICT(source) DO UPDATE SET observed_at = MAX(observed_at, excluded.observed_at)
            """,
            (self._utc_text(sample.observed_at),),
        )
        self._connection.commit()
        return cursor.rowcount == 1

    def checkpoint(self, source: str) -> datetime | None:
        row = self._connection.execute(
            "SELECT observed_at FROM ingest_checkpoint WHERE source = ?", (source,)
        ).fetchone()
        return datetime.fromisoformat(row[0].replace("Z", "+00:00")) if row else None

    def room_sample_count(self) -> int:
        return self._connection.execute("SELECT COUNT(*) FROM fact_room_sample").fetchone()[0]

    def fact_tables(self) -> list[str]:
        return [
            row[0]
            for row in self._connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'fact_%' ORDER BY name"
            )
        ]

    def reconcile_day(self, day: str, *, expected_count: int, expected_hash: str):
        rows = self._connection.execute(
            "SELECT source_id FROM fact_room_sample WHERE substr(observed_at, 1, 10) = ? ORDER BY source_id",
            (day,),
        ).fetchall()
        actual_hash = hashlib.sha256("\n".join(row[0] for row in rows).encode("ascii")).hexdigest()
        if len(rows) != expected_count or actual_hash != expected_hash:
            raise ReconciliationMismatch("warehouse daily count/hash mismatch")

    def hourly_room_aggregates(self, day: str) -> list[tuple]:
        rows = self._connection.execute(
            """
            SELECT kind, substr(observed_at, 1, 13) || ':00:00Z', COUNT(*), ROUND(AVG(value), 4), MIN(value), MAX(value)
            FROM fact_room_sample
            WHERE substr(observed_at, 1, 10) = ?
            GROUP BY kind, substr(observed_at, 1, 13)
            ORDER BY kind, substr(observed_at, 1, 13)
            """,
            (day,),
        ).fetchall()
        return [tuple(row) for row in rows]

    @staticmethod
    def _utc_text(value: datetime) -> str:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
