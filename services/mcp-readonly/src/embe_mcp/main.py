from __future__ import annotations

import argparse
from pathlib import Path

from .server import create_server
from .sqlite_repository import SQLiteReadOnlyRepository


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Run the private read-only EmBe analytics MCP over stdio")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--child-id", action="append", required=True)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    repository = SQLiteReadOnlyRepository(args.database)
    try:
        create_server(repository, allowed_child_ids=set(args.child_id)).run()
    finally:
        repository.close()


if __name__ == "__main__":
    main()
