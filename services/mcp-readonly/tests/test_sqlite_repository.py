import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_mcp.sqlite_repository import SQLiteReadOnlyRepository  # noqa: E402


class SQLiteReadOnlyRepositoryTests(unittest.TestCase):
    def test_reads_only_requested_child_from_fixed_curated_tables(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "analytics.sqlite3"
            connection = sqlite3.connect(path)
            connection.executescript(
                """
                CREATE TABLE fact_sleep (child_id TEXT, observed_at TEXT, ended_at TEXT);
                CREATE TABLE fact_feeding (child_id TEXT, observed_at TEXT, value_milliliters REAL);
                CREATE TABLE fact_room_sample (kind TEXT, observed_at TEXT, value REAL);
                INSERT INTO fact_sleep VALUES ('baby', '2026-08-30T01:00:00Z', '2026-08-30T02:00:00Z');
                INSERT INTO fact_sleep VALUES ('other', '2026-08-30T01:00:00Z', '2026-08-30T04:00:00Z');
                """
            )
            connection.commit()
            connection.close()
            repository = SQLiteReadOnlyRepository(path)
            records = repository.read_sleep(
                "baby",
                datetime(2026, 8, 30, tzinfo=timezone.utc),
                datetime(2026, 8, 31, tzinfo=timezone.utc),
                10,
            )
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].child_id, "baby")
            with self.assertRaises(sqlite3.OperationalError):
                repository.connection.execute("DELETE FROM fact_sleep")
            repository.close()


if __name__ == "__main__":
    unittest.main()
