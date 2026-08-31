import unittest

from embe_mcp.memos_health_probe import validate_tool_names


class MemosHealthProbeTests(unittest.TestCase):
    def test_accepts_the_curated_official_memos_surface(self) -> None:
        tools = {
            "memo_list_memos",
            "memo_get_memo",
            "memo_create_memo",
            "memo_update_memo",
            "memo_delete_memo",
            "attachment_list_attachments",
            "auth_get_current_user",
        }
        self.assertTrue(validate_tool_names(tools))

    def test_rejects_missing_contract_or_raw_query_tools(self) -> None:
        self.assertFalse(validate_tool_names({"memo_list_memos", "memo_create_memo"}))
        self.assertFalse(
            validate_tool_names(
                {
                    "memo_list_memos",
                    "memo_get_memo",
                    "memo_create_memo",
                    "memo_update_memo",
                    "memo_delete_memo",
                    "attachment_list_attachments",
                    "auth_get_current_user",
                    "raw_sql_query",
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
