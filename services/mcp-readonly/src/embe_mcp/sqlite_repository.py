from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from .analytics import EnvironmentRecord, FeedingRecord, SleepRecord


class SQLiteReadOnlyRepository:
    """Reads fixed curated tables through an OS- and SQLite-enforced read-only connection."""

    def __init__(self, path: Path):
        if not path.is_file():
            raise FileNotFoundError("analytics database does not exist")
        self.connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        self.connection.execute("PRAGMA query_only = ON")

    def close(self):
        self.connection.close()

    def read_sleep(self, child_id: str, start: datetime, end: datetime, limit: int):
        rows = self.connection.execute(
            """
            SELECT observed_at, ended_at, child_id FROM fact_sleep
            WHERE child_id = ? AND observed_at >= ? AND observed_at < ?
            ORDER BY observed_at LIMIT ?
            """,
            (child_id, self._text(start), self._text(end), limit),
        ).fetchall()
        return tuple(SleepRecord(self._time(row[0]), self._time(row[1]), row[2]) for row in rows)

    def read_feedings(self, child_id: str, start: datetime, end: datetime, limit: int):
        rows = self.connection.execute(
            """
            SELECT observed_at, value_milliliters, child_id FROM fact_feeding
            WHERE child_id = ? AND observed_at >= ? AND observed_at < ?
            ORDER BY observed_at LIMIT ?
            """,
            (child_id, self._text(start), self._text(end), limit),
        ).fetchall()
        return tuple(FeedingRecord(self._time(row[0]), round(row[1]), row[2]) for row in rows)

    def read_environment(self, start: datetime, end: datetime, limit: int):
        rows = self.connection.execute(
            """
            SELECT observed_at,
                   MAX(CASE WHEN kind = 'temperature' THEN value END),
                   MAX(CASE WHEN kind = 'humidity' THEN value END)
            FROM fact_room_sample
            WHERE observed_at >= ? AND observed_at < ?
            GROUP BY observed_at
            HAVING COUNT(DISTINCT kind) = 2
            ORDER BY observed_at LIMIT ?
            """,
            (self._text(start), self._text(end), limit),
        ).fetchall()
        return tuple(EnvironmentRecord(self._time(row[0]), row[1], row[2]) for row in rows)

    @staticmethod
    def _text(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    @staticmethod
    def _time(value: str) -> datetime:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
