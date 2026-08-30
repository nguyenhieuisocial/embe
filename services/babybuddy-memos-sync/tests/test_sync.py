import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from embe_sync.sync import (
    AuthFailure,
    BabyBuddyNote,
    Ledger,
    MemosClient,
    PermanentFailure,
    SyncEngine,
    canonical_hash,
    render_memo,
)
from embe_sync.transport import Conflict


class FakeBabyBuddy:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def list_notes(self, *, limit, offset):
        self.calls.append((limit, offset))
        return self.pages[offset]


class FakeMemos:
    def __init__(self):
        self.items = {}
        self.calls = []
        self.missing_on_update = set()

    def get(self, memo_id):
        return self.items.get(memo_id)

    def create(self, memo_id, content, visibility="PRIVATE"):
        self.calls.append(("create", memo_id, content, visibility))
        self.items[memo_id] = {"content": content, "state": "NORMAL"}

    def update(self, memo_id, content):
        self.calls.append(("update", memo_id, content))
        if memo_id in self.missing_on_update:
            self.missing_on_update.remove(memo_id)
            self.items.pop(memo_id, None)
            return False
        self.items[memo_id] = {"content": content, "state": "NORMAL"}
        return True

    def archive(self, memo_id):
        self.calls.append(("archive", memo_id))
        if memo_id in self.items:
            self.items[memo_id]["state"] = "ARCHIVED"

    def restore(self, memo_id):
        self.calls.append(("restore", memo_id))
        self.items[memo_id]["state"] = "NORMAL"


def note(note_id=7, text="Bé biết lẫy", tags=("milestone",), time="2026-08-30T08:00:00+07:00"):
    return BabyBuddyNote(note_id, 1, text, time, tuple(tags))


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name) / "ledger.sqlite3")
        self.memos = FakeMemos()

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def test_hash_is_stable_for_tag_order_and_changes_with_content(self):
        first = canonical_hash(note(tags=("portal", "milestone")))
        reordered = canonical_hash(note(tags=("milestone", "portal")))
        changed = canonical_hash(note(text="Bé biết bò"))
        self.assertEqual(first, reordered)
        self.assertNotEqual(first, changed)

    def test_render_is_private_milestone_and_portal_is_opt_in(self):
        self.assertEqual(
            render_memo(note()),
            'Bé biết lẫy\n\n#milestone #babybuddy\n\n<!-- embe-sync:{"origin":"babybuddy","schema":1,"source_id":7} -->',
        )
        self.assertEqual(
            render_memo(note(tags=("milestone", "portal"))),
            'Bé biết lẫy\n\n#milestone #babybuddy #portal\n\n<!-- embe-sync:{"origin":"babybuddy","schema":1,"source_id":7} -->',
        )

    def test_hash_normalizes_equivalent_utc_time_and_tags(self):
        first = canonical_hash(note(time="2026-08-30T08:00:00+07:00", tags=("portal", "milestone")))
        same = canonical_hash(note(time="2026-08-30T01:00:00Z", tags=("milestone", "portal", "portal")))
        self.assertEqual(first, same)

    def test_full_paginated_scan_creates_deterministic_private_memo(self):
        source = FakeBabyBuddy(
            {
                0: {"count": 2, "next": "page2", "previous": None, "results": [note(1)]},
                1: {"count": 2, "next": None, "previous": "page1", "results": [note(2)]},
            }
        )
        result = SyncEngine(source, self.memos, self.ledger, page_size=1).run()
        self.assertEqual(source.calls, [(1, 0), (1, 1)])
        self.assertEqual(result, {"created": 2, "updated": 0, "archived": 0, "restored": 0, "unchanged": 0})
        self.assertEqual([call[1] for call in self.memos.calls], ["bb-note-1", "bb-note-2"])
        self.assertTrue(all(call[3] == "PRIVATE" for call in self.memos.calls))

    def test_unchanged_scan_is_noop_and_edit_updates_same_memo(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        self.memos.calls.clear()
        self.assertEqual(engine.run()["unchanged"], 1)
        self.assertEqual(self.memos.calls, [])
        source.pages[0]["results"] = [note(text="Bé biết bò")]
        self.assertEqual(engine.run()["updated"], 1)
        self.assertEqual(self.memos.calls[0][0:2], ("update", "bb-note-7"))

    def test_removed_or_untagged_note_is_archived_after_two_complete_scans(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        source.pages = {0: {"count": 0, "next": None, "previous": None, "results": []}}
        self.memos.calls.clear()
        self.assertEqual(engine.run()["archived"], 0)
        self.assertEqual(self.memos.calls, [])
        self.assertEqual(engine.run()["archived"], 1)
        self.assertEqual(self.memos.calls, [("archive", "bb-note-7")])

    def test_incomplete_scan_never_archives(self):
        source = FakeBabyBuddy({0: {"count": 2, "next": None, "previous": None, "results": [note()]}})
        with self.assertRaises(PermanentFailure):
            SyncEngine(source, self.memos, self.ledger).run()
        self.assertEqual(self.ledger.all_active(), [])

    def test_archived_note_reappearing_is_restored(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        source.pages[0] = {"count": 0, "next": None, "previous": None, "results": []}
        engine.run()
        engine.run()
        self.memos.calls.clear()
        source.pages[0] = {"count": 1, "next": None, "previous": None, "results": [note()]}
        self.assertEqual(engine.run()["restored"], 1)
        self.assertEqual(self.memos.calls[0], ("restore", "bb-note-7"))

    def test_mass_delete_circuit_breaker_prevents_bulk_archive(self):
        notes = [note(index) for index in range(1, 7)]
        source = FakeBabyBuddy({0: {"count": 6, "next": None, "previous": None, "results": notes}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        source.pages[0] = {"count": 0, "next": None, "previous": None, "results": []}
        engine.run()
        with self.assertRaisesRegex(PermanentFailure, "mass archive"):
            engine.run()
        self.assertFalse(any(call[0] == "archive" for call in self.memos.calls))

    def test_existing_deterministic_id_without_owned_marker_goes_to_dlq(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        self.memos.items["bb-note-7"] = {"content": "Một ghi chú thủ công", "state": "NORMAL"}
        with self.assertRaisesRegex(PermanentFailure, "collision"):
            SyncEngine(source, self.memos, self.ledger).run()
        self.assertEqual(self.ledger.deadletters(), [(7, "memo_id_collision")])

    def test_owned_existing_memo_is_adopted_after_ledger_loss(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        self.memos.items["bb-note-7"] = {"content": render_memo(note()), "state": "NORMAL"}
        result = SyncEngine(source, self.memos, self.ledger).run()
        self.assertEqual(result["created"], 0)
        self.assertEqual(result["unchanged"], 1)
        self.assertIsNotNone(self.ledger.get(7))

    def test_rebuild_ledger_recovers_normal_and_archived_owned_memos(self):
        records = [
            {"name": "memos/bb-note-7", "content": render_memo(note()), "state": "NORMAL"},
            {"name": "memos/bb-note-8", "content": render_memo(note(8)), "state": "ARCHIVED"},
            {"name": "memos/manual", "content": "Không thuộc daemon", "state": "NORMAL"},
        ]
        recovered = self.ledger.rebuild(records)
        self.assertEqual(recovered, 2)
        self.assertFalse(self.ledger.get(7).archived)
        self.assertTrue(self.ledger.get(8).archived)

    def test_recovery_scan_reads_all_pages_in_normal_and_archived_states(self):
        class RecordingHttp:
            def __init__(self):
                self.urls = []

            def request_json(self, method, url, payload=None, headers=None):
                self.urls.append(url)
                if "state=NORMAL" in url and "pageToken" not in url:
                    return {"memos": [{"name": "memos/one"}], "nextPageToken": "next"}
                if "state=NORMAL" in url:
                    return {"memos": [{"name": "memos/two"}]}
                return {"memos": [{"name": "memos/three"}]}

        http = RecordingHttp()
        records = MemosClient("http://memos", "token", http=http).list_for_rebuild()
        self.assertEqual([record["name"] for record in records], ["memos/one", "memos/two", "memos/three"])
        self.assertTrue(any("state=NORMAL" in url for url in http.urls))
        self.assertTrue(any("state=ARCHIVED" in url for url in http.urls))

    def test_create_conflict_does_not_overwrite_unowned_memo(self):
        class ConflictHttp:
            def request_json(self, method, url, payload=None, headers=None):
                if method == "POST":
                    raise Conflict("exists")
                return {"content": "Ghi chú thủ công", "state": "NORMAL"}

        client = MemosClient("http://memos", "token", http=ConflictHttp())
        with self.assertRaisesRegex(PermanentFailure, "collision"):
            client.create("bb-note-7", render_memo(note()))

    def test_missing_memo_during_update_is_recreated(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        source.pages[0]["results"] = [note(text="Bé biết bò")]
        self.memos.missing_on_update.add("bb-note-7")
        self.memos.calls.clear()
        result = engine.run()
        self.assertEqual(result["updated"], 1)
        self.assertEqual([call[0] for call in self.memos.calls], ["update", "create"])

    def test_replaced_owned_id_is_not_overwritten_on_edit(self):
        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        engine = SyncEngine(source, self.memos, self.ledger)
        engine.run()
        self.memos.items["bb-note-7"] = {"content": "Ghi chú của gia đình", "state": "NORMAL"}
        source.pages[0]["results"] = [note(text="Bé biết bò")]
        with self.assertRaisesRegex(PermanentFailure, "ownership"):
            engine.run()

    def test_ledger_commits_only_after_sink_success(self):
        class FailingMemos(FakeMemos):
            def create(self, memo_id, content, visibility="PRIVATE"):
                raise AuthFailure("memos authentication failed")

        source = FakeBabyBuddy({0: {"count": 1, "next": None, "previous": None, "results": [note()]}})
        with self.assertRaises(AuthFailure):
            SyncEngine(source, FailingMemos(), self.ledger).run()
        self.assertEqual(self.ledger.all_active(), [])


if __name__ == "__main__":
    unittest.main()
