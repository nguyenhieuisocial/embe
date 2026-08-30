from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from embe_sync.transport import AuthFailure, PermanentFailure, SyncFailure, TransientFailure
from embe_sync.sync import BabyBuddyClient, Ledger, MemosClient, SyncEngine


REQUIRED_ENV = ("BABYBUDDY_BASE_URL", "BABYBUDDY_TOKEN", "MEMOS_BASE_URL", "MEMOS_SYNC_PAT", "SYNC_LEDGER")


def credential_review_due(config: dict[str, str], now: datetime) -> bool:
    value = config.get("BABYBUDDY_TOKEN_REVIEW_AFTER")
    if not value:
        return False
    try:
        review_after = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError as error:
        raise PermanentFailure("BabyBuddy credential review date is invalid") from error
    return now.astimezone(timezone.utc) >= review_after


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key.strip():
            raise PermanentFailure("runtime environment file is malformed")
        values[key.strip()] = value.strip()
    missing = [key for key in REQUIRED_ENV if not values.get(key)]
    if missing:
        raise PermanentFailure("runtime environment file is incomplete")
    return values


def atomic_json(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, path)


def append_log(path: Path, value: dict, *, max_bytes: int = 1_000_000):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > max_bytes:
        path.replace(path.with_suffix(path.suffix + ".1"))
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def execute(env_path: Path, status_path: Path, log_path: Path, *, rebuild_ledger: bool = False) -> int:
    current_time = datetime.now(timezone.utc)
    now = current_time.isoformat()
    ledger = None
    try:
        config = read_env(env_path)
        ledger = Ledger(Path(config["SYNC_LEDGER"]))
        sink = MemosClient(config["MEMOS_BASE_URL"], config["MEMOS_SYNC_PAT"])
        if rebuild_ledger:
            recovered = ledger.rebuild(sink.list_for_rebuild())
            event = {"time": now, "healthy": True, "credential_review_due": credential_review_due(config, current_time), "result": {"recovered": recovered}}
        else:
            source = BabyBuddyClient(config["BABYBUDDY_BASE_URL"], config["BABYBUDDY_TOKEN"])
            counts = SyncEngine(source, sink, ledger).run()
            event = {"time": now, "healthy": True, "credential_review_due": credential_review_due(config, current_time), "result": counts}
        exit_code = 0
    except AuthFailure:
        event = {"time": now, "healthy": False, "error": "authentication_failed"}
        exit_code = 20
    except TransientFailure:
        event = {"time": now, "healthy": False, "error": "temporarily_unavailable"}
        exit_code = 30
    except (PermanentFailure, OSError, sqlite3.Error):
        event = {"time": now, "healthy": False, "error": "configuration_or_data_error"}
        exit_code = 40
    finally:
        if ledger is not None:
            ledger.close()
    atomic_json(status_path, event)
    append_log(log_path, event)
    return exit_code


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Synchronize BabyBuddy milestones to private Memos entries")
    parser.add_argument("--env", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--rebuild-ledger", action="store_true")
    parser.add_argument("--status", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    return parser.parse_args(argv)


if __name__ == "__main__":
    arguments = parse_args()
    raise SystemExit(
        execute(
            arguments.env,
            arguments.status,
            arguments.log,
            rebuild_ledger=arguments.rebuild_ledger,
        )
    )
