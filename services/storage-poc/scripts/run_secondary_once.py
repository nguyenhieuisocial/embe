"""Run the Windows Telegram secondary pipeline directly, without PowerShell."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def load_env(path: Path, environment: dict[str, str]) -> None:
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            environment[key] = value


def run_json(script: Path, environment: dict[str, str], *arguments: str) -> tuple[int, dict | None]:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    completed = subprocess.run(
        [sys.executable, str(script), *arguments], capture_output=True, text=True,
        env=environment, timeout=900, creationflags=flags,
    )
    try:
        value = json.loads(completed.stdout.strip().splitlines()[-1]) if completed.stdout.strip() else None
    except (json.JSONDecodeError, IndexError):
        value = None
    return completed.returncode, value


def main() -> int:
    parser = argparse.ArgumentParser(description="Run EmBe Telegram secondary storage without PowerShell.")
    parser.add_argument("--project-root", type=Path, default=Path(r"C:\EmBe"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    environment = dict(os.environ)
    for relative in ("infra/compose/storage-poc.env", "secrets/telegram-poc.env", "secrets/runtime/media-publisher.env"):
        load_env(root / relative, environment)
    environment.update({
        "EMBE_STORAGE_POC_ENABLED": "true", "EMBE_TELEGRAM_POC_ENABLED": "true",
        "EMBE_TELEGRAM_REPLICATION_ENABLED": "true",
        "EMBE_STORAGE_POC_DATA_DIR": str(root / "data/storage-poc"),
        "PYTHONPATH": os.pathsep.join((str(root / "services/storage-poc/src"), str(root / "services/media-publisher"))),
    })
    scripts = root / "services/storage-poc/scripts"
    archive_code, archive = run_json(scripts / "queue_immich_curated.py", environment)
    worker_code, worker = (run_json(scripts / "run_worker_once.py", environment) if archive_code == 0 else (1, None))
    smoke_path = root / "data/status/telegram-live-smoke.json"
    smoke = None
    if smoke_path.is_file():
        try: smoke = json.loads(smoke_path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError): pass
    run_smoke = not smoke or smoke.get("status") != "pass"
    if smoke and smoke.get("generated_at"):
        age = datetime.now(timezone.utc) - datetime.fromisoformat(str(smoke["generated_at"]).replace("Z", "+00:00"))
        run_smoke = run_smoke or age.days > 30
    if archive_code == 0 and worker_code == 0 and run_smoke:
        smoke_code, smoke = run_json(scripts / "telegram_live_smoke.py", environment, "--output", str(smoke_path), "--size-mib", "1")
    else:
        smoke_code = 0 if smoke and smoke.get("status") == "pass" else 1
    exit_code = 0 if archive_code == worker_code == smoke_code == 0 else 1
    result = {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "pass" if exit_code == 0 else "critical", "archive": archive, "worker": worker, "live_smoke": smoke,
    }
    output = root / "data/status/telegram-secondary.json"
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(output)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
