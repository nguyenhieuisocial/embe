from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mcp import Client  # noqa: E402

from embe_mcp.analytics import InMemoryRepository  # noqa: E402
from embe_mcp.server import create_server  # noqa: E402


class MCPContractTests(unittest.TestCase):
    def test_server_exposes_only_three_read_only_tools(self) -> None:
        async def run() -> None:
            server = create_server(InMemoryRepository(), allowed_child_ids={"baby"})
            async with Client(server) as client:
                tools = await client.list_tools()
                by_name = {tool.name: tool for tool in tools.tools}
                self.assertEqual(
                    set(by_name),
                    {"sleep_summary", "feeding_summary", "environment_sleep_correlation"},
                )
                for tool in by_name.values():
                    self.assertTrue(tool.annotations and tool.annotations.read_only_hint)
                    self.assertFalse(tool.annotations.open_world_hint)
                    self.assertIn("child_id", tool.input_schema.get("required", []))
                    self.assertNotIn("sql", tool.input_schema.get("properties", {}))
                    self.assertNotIn("prompt", tool.input_schema.get("properties", {}))

                result = await client.call_tool(
                    "sleep_summary",
                    {"child_id": "baby", "start_date": "2026-08-01", "end_date": "2026-08-07"},
                )
                self.assertFalse(result.is_error)
                self.assertIsNotNone(result.structured_content)

        asyncio.run(run())

    def test_write_or_raw_query_tool_does_not_exist(self) -> None:
        async def run() -> None:
            async with Client(create_server(InMemoryRepository(), allowed_child_ids={"baby"})) as client:
                for name in ("execute_sql", "write_data", "delete_record"):
                    result = await client.call_tool(name, {"sql": "DROP TABLE fact_sleep"})
                    self.assertTrue(result.is_error)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
