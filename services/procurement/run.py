from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from embe_procurement.bridge import (
    SupabaseProcurement,
    process_actions,
    read_env,
    timestamp,
    write_status,
)
from embe_procurement.runtime import ProcurementRuntime


def run(env_path: Path, database: Path) -> dict[str, object]:
    env = read_env(env_path)
    queue = SupabaseProcurement(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    runtime = ProcurementRuntime(database)
    return {"status": "ok", **process_actions(queue, runtime)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the private EmBe procurement decision bridge once.")
    parser.add_argument("--env", type=Path, default=Path(r"C:\EmBe\secrets\runtime\portal-sync.env"))
    parser.add_argument("--database", type=Path, default=Path(r"C:\EmBe\data\procurement\procurement.sqlite3"))
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\procurement-worker.json"))
    args = parser.parse_args()
    attempted_at = timestamp()
    try:
        result = run(args.env, args.database)
        write_status(args.status, {**result, "last_attempt_at": attempted_at, "last_success_at": attempted_at})
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        write_status(
            args.status,
            {"status": "error", "last_attempt_at": attempted_at, "error_type": type(error).__name__},
        )
        print("Procurement worker failed; see the local status file.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
