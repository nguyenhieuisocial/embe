import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from publisher import Config, HttpResponse, SupabaseMediaStore, publish, request_with_retry, write_status


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
        response_or_error = self.responses.pop(0)
        if isinstance(response_or_error, BaseException):
            raise response_or_error
        return response_or_error


class FakeOriginalResponse:
    status = 200
    headers = {"Content-Type": "image/heic", "Content-Length": "12"}

    def __init__(self):
        self.body = io.BytesIO(b"family-photo")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, size=-1):
        return self.body.read(size)


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
        "originalPath": "/external-library/family/Đà Lạt 23.12.2025/Chọn/GPS-home-address.jpg",
        "exifInfo": {
            "city": "Đà Lạt",
            "state": "Lâm Đồng",
            "country": "Việt Nam",
            "latitude": 10.0,
            "longitude": 106.0,
        },
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

    def test_enabled_config_uses_a_bounded_incremental_batch(self):
        configured = Config.from_env({
            "EMBE_MEDIA_PUBLISHER_ENABLED": "true",
            "EMBE_MEDIA_PUBLISHER_BATCH_SIZE": "25",
            "IMMICH_BASE_URL": "http://127.0.0.1:2283",
            "IMMICH_API_KEY": "secret",
            "IMMICH_ALBUM_IDS": ALBUM_ID,
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_SECRET_KEY": "secret",
        })
        self.assertEqual(configured.batch_size, 25)


class PublisherTests(unittest.TestCase):
    def test_status_file_is_atomic_and_contains_no_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            write_status(path, {"status": "disabled", "published": 0})
            self.assertEqual(json.loads(path.read_text())["status"], "disabled")
            self.assertFalse(path.with_suffix(".json.tmp").exists())

    def test_existing_preview_index_paginates_past_supabase_row_limit(self):
        first_page = [{"source_asset_id": f"asset-{index}"} for index in range(1000)]
        final_item = {"source_asset_id": "asset-1000"}
        fake = FakeTransport([response(payload=first_page), response(payload=[final_item])])

        existing = SupabaseMediaStore(config(), fake, sleep=lambda _: None).existing()

        self.assertEqual(len(existing), 1001)
        self.assertIn("offset=1000", fake.calls[1][1])

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
        self.assertNotIn("longitude", serialized)
        self.assertEqual(item["place_city"], "Đà Lạt")
        self.assertEqual(item["place_region"], "Lâm Đồng")
        self.assertEqual(item["place_country"], "Việt Nam")
        self.assertEqual(item["album_key"], "da-lat-2025")
        self.assertEqual(item["album_title"], "Đà Lạt · 23.12.2025")
        self.assertEqual(item["album_order"], 50)
        self.assertEqual(item["title"], "Nụ cười đầu ngày ấm áp")
        self.assertNotIn("external-library", serialized)
        self.assertNotIn("immich-secret", json.dumps(result))
        search_body = json.loads(fake.calls[1][3])
        self.assertTrue(search_body["withExif"])

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

    def test_reuses_preview_when_postgres_formats_the_same_timestamp_differently(self):
        state = {
            "source_asset_id": ASSET_ID,
            "source_updated_at": "2026-08-30T11:00:00+00:00",
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

    def test_reuses_preview_when_only_immich_metadata_timestamp_changes(self):
        state = {
            "source_asset_id": ASSET_ID,
            "source_updated_at": "2026-08-29T11:00:00Z",
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
        stage_body = json.loads(fake.calls[-2][3])
        self.assertEqual(stage_body["p_items"][0]["source_updated_at"], "2026-08-30T11:00:00.000Z")

    def test_rejects_non_image_preview(self):
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [asset()], "nextPage": None, "nextCursor": None}}),
            response(headers={"Content-Type": "text/html"}, body=b"<html>not an image</html>"),
        ])
        with self.assertRaises(ValueError):
            publish(config(), fake, sleep=lambda _: None)

    def test_defers_a_preview_that_immich_has_not_generated_yet(self):
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [asset()], "nextPage": None, "nextCursor": None}}),
            response(status=404, payload={}),
            response(payload={"upserted": 0, "unapproved": 0}),
        ])
        result = publish(config(), fake, sleep=lambda _: None)
        self.assertEqual(result["published"], 0)
        self.assertEqual(result["deferred"], 1)

    def test_skips_thumbnail_download_while_immich_marks_asset_unresized(self):
        pending_asset = {**asset(), "thumbhash": None, "resized": False}
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [pending_asset], "nextPage": None, "nextCursor": None}}),
            response(payload={"upserted": 0, "unapproved": 0}),
        ])
        result = publish(config(), fake, sleep=lambda _: None)
        self.assertEqual(result["deferred"], 1)
        self.assertFalse(any("/thumbnail?" in call[1] for call in fake.calls))

    def test_limits_new_preview_uploads_per_run_but_keeps_the_sync_successful(self):
        second = {**asset(), "id": "33333333-3333-4333-8333-333333333333"}
        limited = Config(
            True,
            "http://127.0.0.1:2283",
            "immich-secret",
            (ALBUM_ID,),
            "https://project.supabase.co",
            "server-secret",
            batch_size=1,
        )
        fake = FakeTransport([
            response(payload=[]),
            response(payload={"assets": {"items": [asset(), second], "nextPage": None, "nextCursor": None}}),
            response(headers={"Content-Type": "application/octet-stream"}, body=JPEG),
            response(status=200, payload={"Key": "stored"}),
            response(payload={"staged": 1}),
            response(payload={"upserted": 1, "unapproved": 0}),
        ])
        result = publish(limited, fake, sleep=lambda _: None)
        self.assertEqual(result["uploaded"], 1)
        self.assertEqual(result["deferred"], 1)

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

    def test_retries_a_temporary_transport_timeout(self):
        fake = FakeTransport([
            TimeoutError("Immich is still generating thumbnails"),
            response(status=200, payload={}),
        ])
        delays = []
        result = request_with_retry(fake, "GET", "http://127.0.0.1:2283", {}, sleep=delays.append)
        self.assertEqual(result.status, 200)
        self.assertEqual(delays, [1.0])

    def test_archive_listing_can_include_images_and_videos(self):
        fake = FakeTransport([
            response(payload={"assets": {"items": [], "nextPage": None, "nextCursor": None}}),
        ])
        client = __import__("publisher").ImmichClient(config(), fake, sleep=lambda _: None)
        self.assertEqual(client.list_assets(asset_type=None), [])
        self.assertNotIn("type", json.loads(fake.calls[0][3]))

    def test_original_download_streams_to_disk_without_using_original_filename(self):
        client = __import__("publisher").ImmichClient(config())
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "opaque.upload"
            result = client.download_original(
                ASSET_ID,
                destination,
                100,
                open_response=lambda *_args, **_kwargs: FakeOriginalResponse(),
            )
            self.assertEqual(destination.read_bytes(), b"family-photo")
            self.assertEqual(result["mime_type"], "image/heic")
            self.assertEqual(result["sha256"], hashlib.sha256(b"family-photo").hexdigest())


if __name__ == "__main__":
    unittest.main()
