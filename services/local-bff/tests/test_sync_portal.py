from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from sync_portal import (
    MemosClient,
    SupabaseJournalInbox,
    SupabaseReadModel,
    import_journal_inbox,
    list_portal_memos,
    sanitize_memo,
)


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

    @patch.object(MemosClient, "list_memos")
    def test_portal_merges_human_and_babybuddy_private_timelines(self, list_memos) -> None:
        list_memos.side_effect = [
            [{"name": "memos/family"}],
            [{"name": "memos/babybuddy"}],
        ]

        result = list_portal_memos(
            {
                "MEMOS_BASE_URL": "http://memos",
                "MEMOS_PORTAL_PAT": "human-token",
                "MEMOS_BABYBUDDY_PORTAL_PAT": "bridge-read-token",
            }
        )

        self.assertEqual([memo["name"] for memo in result], ["memos/family", "memos/babybuddy"])
        self.assertEqual(list_memos.call_count, 2)

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

    @patch("sync_portal._json_request")
    def test_journal_inbox_uses_server_only_claim_complete_and_fail_rpcs(self, request) -> None:
        request.side_effect = [
            [{"id": "11111111-1111-4111-8111-111111111111", "content": "Một ngày vui", "author_role": "father"}],
            None,
            None,
        ]
        inbox = SupabaseJournalInbox("https://project.supabase.co", "secret")

        claimed = inbox.claim(limit=5)
        inbox.complete(claimed[0]["id"])
        inbox.fail(claimed[0]["id"], "memos_unavailable")

        self.assertEqual(len(claimed), 1)
        self.assertIn("embe_claim_journal_entries", request.call_args_list[0].args[0])
        self.assertIn("embe_complete_journal_entry", request.call_args_list[1].args[0])
        self.assertIn("embe_fail_journal_entry", request.call_args_list[2].args[0])

    @patch.object(MemosClient, "create_private_memo")
    def test_inbox_entry_becomes_one_private_portal_memo(self, create_memo) -> None:
        entry = {
            "id": "11111111-1111-4111-8111-111111111111",
            "content": "Hôm nay cả nhà cùng đi dạo.",
            "author_role": "father",
        }
        inbox = Mock()
        inbox.claim.return_value = [entry]

        result = import_journal_inbox(
            inbox,
            MemosClient("http://memos", "token"),
            existing_memos=[],
        )

        self.assertEqual(result, {"claimed": 1, "imported": 1, "failed": 0})
        payload = create_memo.call_args.args[0]
        self.assertIn("# Nhật ký của Ba Hiếu", payload)
        self.assertIn("#portal", payload)
        self.assertIn("<!-- embe-journal:11111111-1111-4111-8111-111111111111 -->", payload)
        inbox.complete.assert_called_once_with(entry["id"])

    @patch.object(MemosClient, "create_private_memo")
    def test_retry_completes_existing_marker_without_duplicate_memo(self, create_memo) -> None:
        identifier = "11111111-1111-4111-8111-111111111111"
        entry = {"id": identifier, "content": "Một ngày vui", "author_role": "mother"}
        inbox = Mock()
        inbox.claim.return_value = [entry]
        existing = [{"content": f"Đã lưu\n<!-- embe-journal:{identifier} -->"}]

        result = import_journal_inbox(inbox, MemosClient("http://memos", "token"), existing)

        self.assertEqual(result["imported"], 1)
        create_memo.assert_not_called()
        inbox.complete.assert_called_once_with(identifier)

    @patch.object(MemosClient, "create_private_memo", side_effect=RuntimeError("offline"))
    def test_failed_memos_write_returns_entry_to_bounded_retry(self, _create_memo) -> None:
        entry = {
            "id": "11111111-1111-4111-8111-111111111111",
            "content": "Một ngày vui",
            "author_role": "father",
        }
        inbox = Mock()
        inbox.claim.return_value = [entry]

        result = import_journal_inbox(inbox, MemosClient("http://memos", "token"), [])

        self.assertEqual(result, {"claimed": 1, "imported": 0, "failed": 1})
        inbox.fail.assert_called_once_with(entry["id"], "memos_unavailable")


if __name__ == "__main__":
    unittest.main()
