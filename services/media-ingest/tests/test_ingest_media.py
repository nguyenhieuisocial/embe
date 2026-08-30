from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ingest_media import MediaStoragePolicy, ingest


class MediaIngestTests(unittest.TestCase):
    def test_dry_run_hashes_supported_media_without_copying_or_deleting_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "iphone"
            target = root / "archive"
            source.mkdir()
            photo = source / "IMG_0001.HEIC"
            photo.write_bytes(b"synthetic-heic")
            (source / "notes.txt").write_text("ignored", encoding="utf-8")

            result = ingest(source, target, apply=False, policy=MediaStoragePolicy.for_tests())

            self.assertEqual(result["planned"], 1)
            self.assertEqual(result["copied"], 0)
            self.assertTrue(photo.exists())
            self.assertFalse(target.exists())

    def test_apply_is_atomic_idempotent_and_never_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "iphone"
            target = root / "archive"
            source.mkdir()
            video = source / "IMG_0002.MOV"
            payload = b"synthetic-video" * 1024
            video.write_bytes(payload)

            first = ingest(source, target, apply=True, policy=MediaStoragePolicy.for_tests())
            second = ingest(source, target, apply=True, policy=MediaStoragePolicy.for_tests())

            objects = list((target / "objects").rglob("*.mov"))
            self.assertEqual(first["copied"], 1)
            self.assertEqual(second["unchanged"], 1)
            self.assertEqual(len(objects), 1)
            self.assertEqual(objects[0].read_bytes(), payload)
            self.assertTrue(video.exists())
            self.assertFalse(list(target.rglob("*.partial")))

    def test_policy_rejects_system_drive_and_insufficient_headroom(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "iphone"
            source.mkdir()
            (source / "IMG_0003.jpg").write_bytes(b"photo")

            with self.assertRaisesRegex(RuntimeError, "separate media drive"):
                ingest(
                    source,
                    root / "archive",
                    apply=True,
                    policy=MediaStoragePolicy(system_drive="C", target_drive="C", free_bytes=10**9),
                )
            with self.assertRaisesRegex(RuntimeError, "25% headroom"):
                ingest(
                    source,
                    root / "archive",
                    apply=True,
                    policy=MediaStoragePolicy(
                        system_drive="C",
                        target_drive="D",
                        free_bytes=1,
                        total_bytes=100,
                    ),
                )


if __name__ == "__main__":
    unittest.main()
