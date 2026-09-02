"""Write a privacy-safe readiness probe for the Immich family account."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path


QUERY = 'SELECT COUNT(*) FROM "user" WHERE NOT "isAdmin" AND NOT "shouldChangePassword" AND "deletedAt" IS NULL;'


def parse_account_count(output: str) -> int:
    value = output.strip()
    if not value.isdigit():
        raise ValueError("Immich account probe returned an invalid aggregate")
    return int(value)


def probe(docker: str) -> bool:
    result = subprocess.run(
        [
            docker,
            "exec",
            "embe-immich-postgres-1",
            "psql",
            "-U",
            "postgres",
            "-d",
            "immich",
            "-Atc",
            QUERY,
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
        creationflags=0x08000000 if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    return parse_account_count(result.stdout) >= 1


def write_status(path: Path, ready: bool) -> None:
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "status": "pass" if ready else "critical",
        "ready": ready,
        "admin": False,
        "privacy": "Only aggregate account readiness is stored; no email, name, password, token, or family content is included.",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe aggregate Immich family-account readiness")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    docker = shutil.which("docker")
    ready = False
    if docker:
        try:
            ready = probe(docker)
        except (OSError, subprocess.SubprocessError, ValueError):
            ready = False
    write_status(args.output, ready)
    return 0 if ready else 2


if __name__ == "__main__":
    raise SystemExit(main())
