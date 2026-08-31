"""Remove only abandoned bare PowerShell children leaked by Claude Desktop."""

from __future__ import annotations

import argparse
import csv
import io
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def is_leaked_shell(
    *,
    name: str,
    command_line: list[str],
    parent_name: str,
    age_seconds: float,
) -> bool:
    return (
        name.casefold() == "powershell.exe"
        and len(command_line) == 1
        and Path(command_line[0]).name.casefold() == "powershell.exe"
        and parent_name.casefold() == "claude.exe"
        and age_seconds >= 10
    )


def _creation_flags() -> int:
    return 0x08000000 if hasattr(subprocess, "CREATE_NO_WINDOW") else 0


def process_rows() -> list[dict[str, str]]:
    result = subprocess.run(
        [
            "wmic", "process", "where", "name='powershell.exe'", "get",
            "CommandLine,CreationDate,Name,ParentProcessId,ProcessId", "/FORMAT:CSV",
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
        creationflags=_creation_flags(),
    )
    output = result.stdout.lstrip("\ufeff\r\n ")
    return [dict(row) for row in csv.DictReader(io.StringIO(output))]


def process_name(process_id: str) -> str:
    if not process_id.isdigit():
        return ""
    result = subprocess.run(
        ["wmic", "process", "where", f"processid={process_id}", "get", "Name", "/VALUE"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
        creationflags=_creation_flags(),
    )
    for line in result.stdout.splitlines():
        if line.strip().casefold().startswith("name="):
            return line.split("=", 1)[1].strip()
    return ""


def find_leaks(rows: list[dict[str, str]] | None = None) -> list[int]:
    records = rows if rows is not None else process_rows()
    names = {
        str(row.get("ProcessId") or "").strip(): str(row.get("Name") or "").strip()
        for row in records
    }
    parent_ids = {
        str(row.get("ParentProcessId") or "").strip()
        for row in records
        if str(row.get("Name") or "").strip().casefold() == "powershell.exe"
    }
    for parent_id in parent_ids:
        if parent_id and not names.get(parent_id):
            names[parent_id] = process_name(parent_id)
    now = datetime.now()
    candidates: list[int] = []
    for row in records:
        created = str(row.get("CreationDate") or "")[:14]
        try:
            age = (now - datetime.strptime(created, "%Y%m%d%H%M%S")).total_seconds()
            process_id = int(str(row.get("ProcessId") or "0"))
        except (ValueError, TypeError):
            continue
        command_line = str(row.get("CommandLine") or "").strip()
        parent_id = str(row.get("ParentProcessId") or "").strip()
        parent_name = names.get(parent_id, "")
        if is_leaked_shell(
            name=str(row.get("Name") or ""),
            command_line=[command_line],
            parent_name=parent_name,
            age_seconds=age,
        ):
            candidates.append(process_id)
    return candidates


def clean_once(rows: list[dict[str, str]] | None = None) -> int:
    leaked = find_leaks(rows)
    for process_id in leaked:
        subprocess.run(
            ["taskkill", "/F", "/PID", str(process_id)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=False,
            creationflags=_creation_flags(),
        )
    return len(leaked)


def write_status(path: Path, removed: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "generated_at": datetime.now(UTC).isoformat(),
                "status": "pass",
                "removed": removed,
            }
        ),
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean abandoned Claude Desktop PowerShell shells once.")
    parser.add_argument("--report", action="store_true")
    parser.add_argument(
        "--status",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "status" / "shell-leak-guard.json",
    )
    args = parser.parse_args()
    rows = process_rows()
    removed = clean_once(rows)
    write_status(args.status, removed)
    if args.report:
        print(json.dumps({"removed": removed}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
