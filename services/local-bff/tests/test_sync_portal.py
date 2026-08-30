from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from sync_portal import MemosClient, SupabaseReadModel, sanitize_memo


class TestPortalSyncPolicy(unittest.TestCase):
    def test_only_explicit_private_portal_memos_are_published(self) -> None:
        memo = {
            "name": "memos/family-day",
            "visibility": "PRIVATE",
            "state": "NORMAL",
            "tags": ["portal", "milestone"],
            "content": "# Ngày đáng nhớ\n\nHôm nay cả nhà cùng mỉm cười.\n\n#portal #milestone",
            "createTime": "2026-08-30T10:00:00Z",
            "location": {"latitude": 10.1, "longitude": 106.1},
        }

        event = sanitize_memo(memo, child_id="embe-family")

        self.assertIsNotNone(event)
        self.assertEqual(event["source_event_id"], "memos/family-day")
        self.assertEqual(event["title"], "Ngày đáng nhớ")
        self.assertEqual(event["caption"], "Hôm nay cả nhà cùng mỉm cười.")
        self.assertEqual(event["portal_event_type"], "milestone")
        self.assertNotIn("location", event)

    def test_public_or_unapproved_memo_is_rejected(self) -> None:
        base = {
            "name": "memos/private",
            "state": "NORMAL",
            "tags": ["portal"],
            "content": "Không được xuất",
            "createTime": "2026-08-30T10:00:00Z",
        }
        self.assertIsNone(sanitize_memo({**base, "visibility": "PUBLIC"}, "embe-family"))
        self.assertIsNone(
            sanitize_memo({**base, "visibility": "PRIVATE", "tags": ["family"]}, "embe-family")
        )

    def test_sensitive_tag_overrides_portal_approval(self) -> None:
        memo = {
            "name": "memos/medical",
            "visibility": "PRIVATE",
            "state": "NORMAL",
            "tags": ["portal", "medical"],
            "content": "# Kết quả khám\n\nKhông được đưa lên cloud.",
            "createTime": "2026-08-30T10:00:00Z",
        }
        self.assertIsNone(sanitize_memo(memo, "embe-family"))

    @patch("sync_portal._json_request")
    def test_memos_pagination_is_complete(self, request) -> None:
        request.side_effect = [
            {"memos": [{"name": "memos/1"}], "nextPageToken": "next"},
            {"memos": [{"name": "memos/2"}]},
        ]

        result = MemosClient("http://memos", "token").list_memos()

        self.assertEqual([memo["name"] for memo in result], ["memos/1", "memos/2"])
        self.assertEqual(request.call_count, 2)
        self.assertIn("pageToken=next", request.call_args_list[1].args[0])

    @patch("sync_portal._json_request")
    def test_large_timeline_is_staged_then_finalized_once(self, request) -> None:
        request.return_value = {"upserted": 501, "unapproved": 0}
        events = [{"source_event_id": f"memos/{index}"} for index in range(501)]

        result = SupabaseReadModel("https://project.supabase.co", "secret").sync(events)

        self.assertEqual(result, {"upserted": 501, "unapproved": 0})
        self.assertEqual(request.call_count, 3)
        self.assertEqual(len(request.call_args_list[0].args[3]["p_events"]), 500)
        self.assertEqual(len(request.call_args_list[1].args[3]["p_events"]), 1)
        self.assertIn("embe_finalize_timeline_sync", request.call_args_list[2].args[0])
        self.assertEqual(request.call_args_list[2].args[3]["p_expected_count"], 501)

    @patch("sync_portal._json_request")
    def test_failed_stage_never_finalizes_partial_timeline(self, request) -> None:
        request.side_effect = RuntimeError("offline")

        with self.assertRaises(RuntimeError):
            SupabaseReadModel("https://project.supabase.co", "secret").sync(
                [{"source_event_id": "memos/1"}]
            )

        self.assertEqual(request.call_count, 1)
        self.assertIn("embe_stage_timeline_batch", request.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
