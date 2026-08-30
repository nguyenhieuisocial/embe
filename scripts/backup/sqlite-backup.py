from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    if not args.source.is_file():
        raise FileNotFoundError(args.source)
    args.destination.parent.mkdir(parents=True, exist_ok=True)

    source = sqlite3.connect(f"file:{args.source.as_posix()}?mode=ro", uri=True)
    destination = sqlite3.connect(args.destination)
    try:
        source.backup(destination)
        result = destination.execute("pragma integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise RuntimeError("SQLite integrity_check failed")
    finally:
        destination.close()
        source.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
