from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


class UptimeKumaStateTests(unittest.TestCase):
    def test_writes_atomic_health_report_for_direct_background_execution(self) -> None:
        script = Path(__file__).resolve().parents[1] / "uptime-kuma-state.py"
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "kuma.db"
            output = Path(directory) / "health.json"
            connection = sqlite3.connect(database)
            connection.executescript("""
                CREATE TABLE monitor (id INTEGER PRIMARY KEY, active INTEGER);
                CREATE TABLE heartbeat (id INTEGER PRIMARY KEY, monitor_id INTEGER, status INTEGER, time TEXT);
            """)
            observed_at = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")
            for monitor_id in range(1, 8):
                connection.execute("INSERT INTO monitor VALUES (?, 1)", (monitor_id,))
                connection.execute("INSERT INTO heartbeat (monitor_id,status,time) VALUES (?,1,?)", (monitor_id, observed_at))
            connection.commit(); connection.close()

            completed = subprocess.run(
                [sys.executable, str(script), "--database", str(database), "--output", str(output), "--expected", "7"],
                check=True, capture_output=True, text=True,
            )
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "pass")
            self.assertEqual((report["active"], report["healthy"], report["stale"]), (7, 7, 0))

    def test_reports_only_privacy_safe_monitor_counts(self) -> None:
        script = Path(__file__).resolve().parents[1] / "uptime-kuma-state.py"
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "kuma.db"
            connection = sqlite3.connect(database)
            connection.executescript(
                """
                CREATE TABLE monitor (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
                CREATE TABLE heartbeat (id INTEGER PRIMARY KEY, monitor_id INTEGER, status INTEGER, time TEXT);
                INSERT INTO monitor VALUES (1, 'private portal address', 1);
                INSERT INTO monitor VALUES (2, 'private baby service', 1);
                """
            )
            observed_at = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")
            connection.executemany(
                "INSERT INTO heartbeat (monitor_id, status, time) VALUES (?, ?, ?)",
                [(1, 1, observed_at), (2, 0, observed_at)],
            )
            connection.commit()
            connection.close()

            completed = subprocess.run(
                [sys.executable, str(script), "--database", str(database)],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(json.loads(completed.stdout), {"active": 2, "healthy": 1, "stale": 0})
            self.assertNotIn("private", completed.stdout)


if __name__ == "__main__":
    unittest.main()
