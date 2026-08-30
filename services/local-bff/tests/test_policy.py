from __future__ import annotations

import json
import unittest
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from main import BFFConfig, route_request


class TestLocalBFFPolicy(unittest.TestCase):
    def setUp(self) -> None:
        self.config = BFFConfig.from_raw(
            album_allowlist=("family",),
            memos=(
                {
                    "id": "memo-1",
                    "visibility": "PUBLIC",
                    "tags": ["family", "milestone"],
                    "content": "Ngày đầu tiên ngủ được cả đêm.",
                    "metadata": {
                        "location": "home",
                        "gps": {"lat": 10.7625, "lon": 106.6602},
                        "camera": "front-door",
                        "nested_token": "must-not-leak",
                    },
                    "service_token": "should-not-leak",
                },
                {
                    "id": "memo-2",
                    "visibility": "PRIVATE",
                    "tags": ["family"],
                    "content": "Không được trả về khi private",
                },
            ),
            media=(
                {
                    "id": "asset-1",
                    "album_id": "family",
                    "filename": "baby-1.jpg",
                    "encoded_video_url": "https://local/asset-1/video.m3u8",
                    "thumbnail_url": "https://local/asset-1/thumb.jpg",
                    "original_url": "https://local/asset-1/original.jpg",
                    "gps": {"lat": 1.0, "lon": 2.0},
                    "media_type": "photo",
                },
                {
                    "id": "asset-2",
                    "album_id": "private",
                    "filename": "blocked.jpg",
                    "thumbnail_url": "https://local/asset-2/thumb.jpg",
                    "media_type": "photo",
                },
            ),
        )

    def test_unknown_route_is_rejected(self) -> None:
        status, _, payload = route_request("GET", "/api/v1/does-not-exist", self.config)
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_original_route_is_rejected(self) -> None:
        status, _, payload = route_request("GET", "/api/v1/media/asset-1/original", self.config)
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_gps_and_token_fields_are_removed_from_timeline(self) -> None:
        status, _, payload = route_request("GET", "/api/v1/timeline", self.config)
        self.assertEqual(status, 200)
        body = json.loads(json.dumps(payload))
        self.assertEqual(len(body["items"]), 1)

        item = body["items"][0]
        self.assertNotIn("service_token", item)
        self.assertNotIn("metadata", item)
        self.assertEqual(
            set(item),
            {"id", "visibility", "tags", "content"},
        )

    def test_asset_blocked_when_album_not_allowlisted(self) -> None:
        status, _, payload = route_request("GET", "/api/v1/media/asset-2/thumbnail", self.config)
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_thumbnail_for_allowlisted_album_is_safe(self) -> None:
        status, _, payload = route_request("GET", "/api/v1/media/asset-1/thumbnail", self.config)
        self.assertEqual(status, 200)
        self.assertIn("thumbnail_url", payload)
        self.assertNotIn("original_url", payload)
        self.assertNotIn("gps", payload)


if __name__ == "__main__":
    unittest.main()
