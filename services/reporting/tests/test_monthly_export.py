from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from monthly_export import (
    approved_events_from_memos,
    build_monthly_document,
    previous_month_key,
    run_export,
    write_monthly_snapshot,
)


class MonthlyExportTests(unittest.TestCase):
    def test_default_month_is_previous_calendar_month_in_vietnam(self):
        self.assertEqual(
            previous_month_key(datetime(2027, 1, 1, 2, 0, tzinfo=timezone.utc)),
            "2026-12",
        )

    def test_only_explicitly_approved_non_sensitive_memos_enter_the_book(self):
        common = {
            "visibility": "PRIVATE",
            "state": "NORMAL",
            "createTime": "2026-08-15T09:00:00Z",
        }
        memos = [
            {
                **common,
                "name": "memos/approved",
                "content": "# Một ngày vui\nNội dung gia đình.\n#portal",
                "tags": ["portal"],
            },
            {
                **common,
                "name": "memos/medical",
                "content": "# Không xuất\nNội dung nhạy cảm.",
                "tags": ["portal", "medical"],
            },
            {
                **common,
                "name": "memos/unreviewed",
                "content": "# Chưa duyệt\nKhông được xuất.",
                "tags": [],
            },
        ]

        events = approved_events_from_memos(memos)

        self.assertEqual([event["source_event_id"] for event in events], ["memos/approved"])

    def test_month_boundary_uses_vietnam_time_and_keeps_source_provenance(self):
        events = [
            {
                "source_event_id": "memos/late-july-utc",
                "event_at": "2026-07-31T17:30:00Z",
                "portal_event_type": "journal",
                "title": "Ngày đầu tháng",
                "caption": "Một khoảnh khắc đã được chọn cho gia đình.",
            },
            {
                "source_event_id": "memos/next-month",
                "event_at": "2026-08-31T17:00:00Z",
                "portal_event_type": "milestone",
                "title": "Sang tháng sau",
                "caption": "Không thuộc tháng tám theo giờ Việt Nam.",
            },
        ]

        document = build_monthly_document(events, "2026-08")

        self.assertEqual(document["month_key"], "2026-08")
        self.assertEqual(document["source_manifest"]["event_count"], 1)
        source = document["source_manifest"]["events"][0]
        self.assertEqual(source["source_event_id"], "memos/late-july-utc")
        expected_hash = hashlib.sha256(
            "Một khoảnh khắc đã được chọn cho gia đình.".encode("utf-8")
        ).hexdigest()
        self.assertEqual(source["caption_sha256"], expected_hash)
        rendered = json.dumps(document, ensure_ascii=False)
        self.assertIn("Ngày đầu tháng", rendered)
        self.assertNotIn("Sang tháng sau", rendered)

    def test_snapshot_is_draft_and_contains_no_event_when_month_is_empty(self):
        document = build_monthly_document([], "2026-08")

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "source.json"
            write_monthly_snapshot(document, output)
            saved = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(saved["status"], "DRAFT")
        self.assertEqual(saved["source_manifest"]["event_count"], 0)
        self.assertIn("chưa có nhật ký", json.dumps(saved, ensure_ascii=False).lower())

    def test_run_export_reads_memos_and_writes_selected_month(self):
        memo = {
            "visibility": "PRIVATE",
            "state": "NORMAL",
            "createTime": "2026-08-15T09:00:00Z",
            "name": "memos/approved",
            "content": "# Kỷ niệm\nNội dung gia đình.\n#portal",
            "tags": ["portal"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_path = root / "portal.env"
            output = root / "source.json"
            env_path.write_text("MEMOS_BASE_URL=http://127.0.0.1\n", encoding="utf-8")

            result = run_export(env_path, "2026-08", output, memo_loader=lambda _env: [memo])
            saved = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(result, {"month": "2026-08", "selected": 1})
        self.assertEqual(saved["source_manifest"]["event_count"], 1)


if __name__ == "__main__":
    unittest.main()
