from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Return privacy-safe Uptime Kuma monitor counts")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--maximum-age-minutes", type=int, default=5)
    args = parser.parse_args()

    if not args.database.is_file():
        raise FileNotFoundError("Uptime Kuma database is unavailable")

    connection = sqlite3.connect(f"file:{args.database.as_posix()}?mode=ro", uri=True)
    try:
        monitor_ids = [row[0] for row in connection.execute("SELECT id FROM monitor WHERE active = 1")]
        healthy = 0
        stale = 0
        deadline = datetime.now(timezone.utc) - timedelta(minutes=args.maximum_age_minutes)
        for monitor_id in monitor_ids:
            latest = connection.execute(
                "SELECT status, time FROM heartbeat WHERE monitor_id = ? ORDER BY id DESC LIMIT 1",
                (monitor_id,),
            ).fetchone()
            if latest is None:
                stale += 1
                continue
            observed_at = datetime.fromisoformat(str(latest[1]).replace("Z", "+00:00"))
            if observed_at.tzinfo is None:
                observed_at = observed_at.replace(tzinfo=timezone.utc)
            if observed_at < deadline:
                stale += 1
            elif int(latest[0]) == 1:
                healthy += 1
        print(json.dumps({"active": len(monitor_ids), "healthy": healthy, "stale": stale}, separators=(",", ":")))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
