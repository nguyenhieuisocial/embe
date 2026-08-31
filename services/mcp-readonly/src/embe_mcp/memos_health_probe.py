"""Verify the built-in Memos MCP contract without reading family content."""

from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Collection

import anyio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

REQUIRED_TOOLS = {
    "memo_list_memos",
    "memo_get_memo",
    "memo_create_memo",
    "memo_update_memo",
    "memo_delete_memo",
    "attachment_list_attachments",
    "auth_get_current_user",
}
FORBIDDEN_TOOLS = {"raw_sql", "raw_sql_query", "execute_sql", "database_query"}


def validate_tool_names(names: Collection[str]) -> bool:
    normalized = {str(name) for name in names}
    return REQUIRED_TOOLS <= normalized and not (FORBIDDEN_TOOLS & normalized)


async def probe(url: str = "http://127.0.0.1:5230/mcp") -> dict[str, object]:
    try:
        with anyio.fail_after(10):
            async with streamable_http_client(url) as streams:
                read_stream, write_stream = streams[:2]
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    result = await session.list_tools()
        names = {tool.name for tool in result.tools}
        passed = validate_tool_names(names)
        return {
            "status": "pass" if passed else "critical",
            "tool_count": len(names),
            "contract_valid": passed,
        }
    except Exception:
        return {"status": "critical", "tool_count": 0, "contract_valid": False}


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the official Memos MCP contract.")
    parser.add_argument("--url", default="http://127.0.0.1:5230/mcp")
    args = parser.parse_args()
    result = asyncio.run(probe(args.url))
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["status"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
