from __future__ import annotations

import json
import tempfile
import unittest
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from export import VaultExporter


class TestVaultExporterIdempotency(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp(prefix="embe-vault-export-"))
        self.exporter = VaultExporter(vault_root=self.tmpdir)

    def test_idempotent_export_updates_same_file(self) -> None:
        source_id = "memos-101"
        records = [
            {
                "source": "memos",
                "source_id": source_id,
                "title": "Milestone",
                "content": "Ngày đầu tiên đi bộ.",
            }
        ]

        self.exporter.export(records)
        notes = list(self.exporter.notes_dir.glob("*.md"))
        self.assertEqual(len(notes), 1)

        first_payload = notes[0].read_text(encoding="utf-8")
        self.assertIn("source_id: memos-101", first_payload)

        self.exporter.export(records)
        notes_after = list(self.exporter.notes_dir.glob("*.md"))
        self.assertEqual(len(notes_after), 1)
        self.assertEqual(notes_after[0].read_text(encoding="utf-8"), first_payload)

        records[0]["content"] = "Cập nhật ghi chú."
        records[0]["exported_at"] = datetime.now(timezone.utc).isoformat()
        self.exporter.export(records)
        updated_payload = notes_after[0].read_text(encoding="utf-8")
        self.assertNotEqual(updated_payload, first_payload)

    def test_delete_only_appends_archive_manifest(self) -> None:
        source_id = "memos-102"
        alive = {
            "source": "memos",
            "source_id": source_id,
            "title": "Checklist",
            "content": "Bản ghi để xóa",
        }
        self.exporter.export([alive])
        note_path = self.exporter._note_path(source_id)
        self.assertTrue(note_path.exists())

        self.exporter.export(
            [
                {
                    **alive,
                    "status": "deleted",
                }
            ]
        )
        manifest = self.exporter.archive_manifest_path.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(manifest), 1)
        manifest_payload = json.loads(manifest[0])
        self.assertEqual(manifest_payload["action"], "archived")
        self.assertEqual(manifest_payload["source_id"], source_id)
        self.assertTrue(note_path.exists())

        # Delete repeated should not duplicate archive rows.
        self.exporter.export([{"**": "noop", "source_id": source_id, "status": "deleted"}])  # noqa: B018
        manifest_after = self.exporter.archive_manifest_path.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(manifest_after), 1)

    def test_duplicate_delete_events_in_one_batch_are_archived_once(self) -> None:
        deleted = {"source_id": "memos-103", "status": "deleted"}

        self.exporter.export([deleted, deleted])

        manifest = self.exporter.archive_manifest_path.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(manifest), 1)


if __name__ == "__main__":
    unittest.main()
