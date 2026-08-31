import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from publisher import Config, HttpResponse, publish, request_with_retry, write_status


ASSET_ID = "11111111-1111-4111-8111-111111111111"
ALBUM_ID = "22222222-2222-4222-8222-222222222222"
JPEG = b"\xff\xd8\xff" + b"preview"


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, body))
        if not self.responses:
            raise AssertionError(f"unexpected request: {method} {url}")
        return self.responses.pop(0)


def response(status=200, payload=None, headers=None, body=None):
    data = body if body is not None else json.dumps(payload).encode()
    return HttpResponse(status, headers or {"Content-Type": "application/json"}, data)


def config():
    return Config(True, "http://127.0.0.1:2283", "immich-secret", (ALBUM_ID,), "https://project.supabase.co", "server-secret")


def asset():
    return {
        "id": ASSET_ID,
        "type": "IMAGE",
        "localDateTime": "2026-08-30T10:00:00.000Z",
        "updatedAt": "2026-08-30T11:00:00.000Z",
        "description": "Nụ cười đầu ngày\x00 ấm áp.",
        "originalFileName": "GPS-home-address.jpg",
        "exifInfo": {"latitude": 10.0, "longitude": 106.0},
    }


class ConfigTests(unittest.TestCase):
    def test_feature_is_fail_closed(self):
        self.assertFalse(Config.from_env({}).enabled)

    def test_enabled_config_rejects_public_immich_url(self):
        with self.assertRaises(ValueError):
            Config.from_env({
                "EMBE_MEDIA_PUBLISHER_ENABLED": "true",
                "IMMICH_BASE_URL": "https://evil.example",
                "IMMICH_API_KEY": "secret",
                "IMMICH_ALBUM_IDS": ALBUM_ID,
                "SUPABASE_URL": "https://project.supabase.co",
                "SUPABASE_SECRET_KEY": "secret",
            })


class PublisherTests(unittest.TestCase):
    def test_status_file_is_atomic_and_contains_no_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            write_status(path, {"status": "disabled", "published": 0})
            self.assertEqual(json.loads(path.read_text())["status"], "disabled")
            self.assertFalse(path.with_suffix(".json.tmp").exists())

    def test_publishes_only_sanitized_preview_metadata(self):
        checksum = hashlib.sha256(JPEG).hexdigest()
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [asset()], "nextPage": None, "nextCursor": None}}),
            response(headers={"Content-Type": "application/octet-stream"}, body=JPEG),
            response(status=200, payload={"Key": "stored"}),
            response(payload={"staged": 1}),
            response(payload={"upserted": 1, "unapproved": 0}),
        ])
        result = publish(config(), fake, sleep=lambda _: None)
        self.assertEqual(result["uploaded"], 1)
        stage_body = json.loads(fake.calls[-2][3])
        item = stage_body["p_items"][0]
        self.assertEqual(item["object_path"], f"assets/{ASSET_ID}/{checksum}.jpg")
        serialized = json.dumps(item)
        self.assertNotIn("GPS-home-address", serialized)
        self.assertNotIn("latitude", serialized)
        self.assertEqual(item["title"], "Nụ cười đầu ngày ấm áp")
        self.assertNotIn("immich-secret", json.dumps(result))

    def test_reuses_unchanged_preview(self):
        state = {
            "source_asset_id": ASSET_ID,
            "source_updated_at": "2026-08-30T11:00:00.000Z",
            "object_path": f"assets/{ASSET_ID}/{'a' * 64}.webp",
            "mime_type": "image/webp",
            "checksum_sha256": "a" * 64,
            "width": 1000,
            "height": 750,
        }
        fake = FakeTransport([
            response(payload=[state]),
            response(payload={"assets": {"items": [asset()], "nextPage": None, "nextCursor": None}}),
            response(payload={"staged": 1}),
            response(payload={"upserted": 1, "unapproved": 0}),
        ])
        result = publish(config(), fake, sleep=lambda _: None)
        self.assertEqual(result["uploaded"], 0)
        self.assertEqual(result["reused"], 1)
        self.assertFalse(any("/storage/v1/object/" in call[1] for call in fake.calls))

    def test_rejects_non_image_preview(self):
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [asset()], "nextPage": None, "nextCursor": None}}),
            response(headers={"Content-Type": "text/html"}, body=b"<html>not an image</html>"),
        ])
        with self.assertRaises(ValueError):
            publish(config(), fake, sleep=lambda _: None)

    def test_empty_album_atomically_unapproves_old_items(self):
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [], "nextPage": None, "nextCursor": None}}),
            response(payload={"upserted": 0, "unapproved": 2}),
        ])
        result = publish(config(), fake, sleep=lambda _: None)
        self.assertEqual(result["published"], 0)
        self.assertEqual(json.loads(fake.calls[-1][3])["p_expected_count"], 0)

    def test_retries_transient_failures_with_bounded_delay(self):
        fake = FakeTransport([
            response(status=429, payload={}, headers={"Retry-After": "30"}),
            response(status=200, payload={}),
        ])
        delays = []
        result = request_with_retry(fake, "GET", "https://project.supabase.co", {}, sleep=delays.append)
        self.assertEqual(result.status, 200)
        self.assertEqual(delays, [10.0])


if __name__ == "__main__":
    unittest.main()
