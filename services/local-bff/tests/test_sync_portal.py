from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from sync_portal import sanitize_memo


class TestPortalSyncPolicy(unittest.TestCase):
    def test_only_explicit_public_portal_memos_are_published(self) -> None:
        memo = {
            "name": "memos/family-day",
            "visibility": "PUBLIC",
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

    def test_private_or_unapproved_memo_is_rejected(self) -> None:
        base = {
            "name": "memos/private",
            "state": "NORMAL",
            "tags": ["portal"],
            "content": "Không được xuất",
            "createTime": "2026-08-30T10:00:00Z",
        }
        self.assertIsNone(sanitize_memo({**base, "visibility": "PRIVATE"}, "embe-family"))
        self.assertIsNone(
            sanitize_memo({**base, "visibility": "PUBLIC", "tags": ["family"]}, "embe-family")
        )

    def test_sensitive_tag_overrides_portal_approval(self) -> None:
        memo = {
            "name": "memos/medical",
            "visibility": "PUBLIC",
            "state": "NORMAL",
            "tags": ["portal", "medical"],
            "content": "# Kết quả khám\n\nKhông được đưa lên cloud.",
            "createTime": "2026-08-30T10:00:00Z",
        }
        self.assertIsNone(sanitize_memo(memo, "embe-family"))


if __name__ == "__main__":
    unittest.main()
