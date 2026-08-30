from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .home_assistant import RoomSample
from .babybuddy import DiaperFact, FeedingFact, GrowthFact, SleepFact
from .grocy import StockMovementFact


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

    def upsert_sleep(self, fact: SleepFact) -> bool:
        return self._insert_fact(
            """
            INSERT OR IGNORE INTO fact_sleep
              (source, source_id, child_id, observed_at, ended_at, duration_seconds,
               raw_value, raw_unit, quality_flag)
            VALUES ('babybuddy', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.source_id,
                fact.child_id,
                self._utc_text(fact.observed_at),
                self._utc_text(fact.ended_at),
                fact.duration_seconds,
                fact.raw_value,
                fact.raw_unit,
                fact.quality_flag,
            ),
            "babybuddy:sleep",
            fact.observed_at,
        )

    def upsert_feeding(self, fact: FeedingFact) -> bool:
        return self._insert_fact(
            """
            INSERT OR IGNORE INTO fact_feeding
              (source, source_id, child_id, observed_at, value_milliliters,
               raw_value, raw_unit, quality_flag)
            VALUES ('babybuddy', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.source_id,
                fact.child_id,
                self._utc_text(fact.observed_at),
                fact.value_milliliters,
                fact.raw_value,
                fact.raw_unit,
                fact.quality_flag,
            ),
            "babybuddy:feeding",
            fact.observed_at,
        )

    def upsert_diaper(self, fact: DiaperFact) -> bool:
        return self._insert_fact(
            """
            INSERT OR IGNORE INTO fact_diaper
              (source, source_id, child_id, observed_at, diaper_type,
               raw_value, raw_unit, quality_flag)
            VALUES ('babybuddy', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.source_id,
                fact.child_id,
                self._utc_text(fact.observed_at),
                fact.diaper_type,
                fact.raw_value,
                fact.raw_unit,
                fact.quality_flag,
            ),
            "babybuddy:diaper",
            fact.observed_at,
        )

    def upsert_growth(self, fact: GrowthFact) -> bool:
        return self._insert_fact(
            """
            INSERT OR IGNORE INTO fact_growth
              (source, source_id, child_id, observed_at, measure, value, unit,
               raw_value, raw_unit, quality_flag)
            VALUES ('babybuddy', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.source_id,
                fact.child_id,
                self._utc_text(fact.observed_at),
                fact.measure,
                fact.value,
                fact.unit,
                fact.raw_value,
                fact.raw_unit,
                fact.quality_flag,
            ),
            f"babybuddy:{fact.measure}",
            fact.observed_at,
        )

    def upsert_stock_movement(self, fact: StockMovementFact) -> bool:
        return self._insert_fact(
            """
            INSERT OR IGNORE INTO fact_stock_movement
              (source, source_id, item_id, observed_at, quantity, unit,
               raw_value, raw_unit, quality_flag)
            VALUES ('grocy', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.source_id,
                fact.item_id,
                self._utc_text(fact.observed_at),
                fact.quantity,
                fact.unit,
                fact.raw_value,
                fact.raw_unit,
                fact.quality_flag,
            ),
            "grocy:stock_movement",
            fact.observed_at,
        )

    def _insert_fact(self, statement: str, values: tuple, checkpoint_source: str, observed_at: datetime) -> bool:
        cursor = self._connection.execute(statement, values)
        self._connection.execute(
            """
            INSERT INTO ingest_checkpoint (source, observed_at) VALUES (?, ?)
            ON CONFLICT(source) DO UPDATE SET observed_at = MAX(observed_at, excluded.observed_at)
            """,
            (checkpoint_source, self._utc_text(observed_at)),
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

    def fact_count(self, table: str) -> int:
        if table not in self.fact_tables():
            raise ValueError("unknown fact table")
        return self._connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

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
