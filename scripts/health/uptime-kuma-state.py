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
    parser.add_argument("--output", type=Path)
    parser.add_argument("--expected", type=int)
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
        counts = {"active": len(monitor_ids), "healthy": healthy, "stale": stale}
        print(json.dumps(counts, separators=(",", ":")))
        if args.output:
            passed = args.expected is None or (counts["active"] == args.expected and counts["healthy"] == args.expected and counts["stale"] == 0)
            report = {
                "schema_version": 1,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "status": "pass" if passed else "critical",
                **counts,
                "privacy": "Only aggregate monitor counts are stored; no name, URL, token, response body, or family content is included.",
            }
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_suffix(args.output.suffix + ".tmp")
            temporary.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
            temporary.replace(args.output)
            if not passed:
                raise SystemExit(2)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
