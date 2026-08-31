from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from mcp import Client

from .server import create_server
from .sqlite_repository import SQLiteReadOnlyRepository


async def probe(database: Path, child_id: str) -> None:
    repository = SQLiteReadOnlyRepository(database)
    try:
        async with Client(create_server(repository, allowed_child_ids={child_id})) as client:
            result = await client.call_tool(
                "sleep_summary",
                {"child_id": child_id, "start_date": "1970-01-01", "end_date": "1970-01-02"},
            )
            if result.is_error:
                raise RuntimeError("read-only MCP probe failed")
    finally:
        repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe the EmBe read-only MCP data path")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--child-id", required=True)
    args = parser.parse_args()
    asyncio.run(probe(args.database, args.child_id))


if __name__ == "__main__":
    main()
