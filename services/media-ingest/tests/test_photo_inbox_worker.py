import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from photo_inbox_worker import Config, HttpResponse, PhotoInboxWorker, validate_image  # noqa: E402


JPEG = b"\xff\xd8\xff\xe0" + b"family-photo"
UPLOAD_ID = "11111111-1111-4111-8111-111111111111"
ASSET_ID = "22222222-2222-4222-8222-222222222222"
ALBUM_ID = "33333333-3333-4333-8333-333333333333"


class FakeTransport:
    def __init__(self):
        self.calls = []

    def __call__(self, method, url, headers, body=None):
        self.calls.append((method, url, headers, body))
        if url.endswith("/rest/v1/rpc/embe_claim_photo_upload"):
            return HttpResponse(200, {}, json.dumps({
                "id": UPLOAD_ID,
                "storage_path": f"incoming/2026/09/{UPLOAD_ID}.jpg",
                "mime_type": "image/jpeg",
                "byte_size": len(JPEG),
                "caption": "Chào cả nhà",
                "captured_at": "2026-09-01T01:00:00+00:00",
                "original_filename": "IMG_1.JPG",
                "attempts": 1,
            }).encode())
        if "/storage/v1/object/authenticated/" in url:
            return HttpResponse(200, {"content-type": "image/jpeg", "content-length": str(len(JPEG))}, JPEG)
        if url.endswith("/api/assets"):
            return HttpResponse(201, {"content-type": "application/json"}, json.dumps({"id": ASSET_ID, "duplicate": False}).encode())
        if url.endswith(f"/api/assets/{ASSET_ID}"):
            return HttpResponse(200, {}, b"{}")
        if url.endswith(f"/api/albums/{ALBUM_ID}/assets"):
            return HttpResponse(200, {}, b"[]")
        if url.endswith("/rest/v1/rpc/embe_finish_photo_import"):
            return HttpResponse(204, {}, b"")
        if "/storage/v1/object/embe-photo-inbox/" in url and method == "DELETE":
            return HttpResponse(200, {}, b"{}")
        raise AssertionError((method, url))


def config():
    return Config(
        supabase_url="https://project.supabase.co",
        supabase_secret_key="server-secret",
        immich_base_url="http://127.0.0.1:2283",
        immich_api_key="immich-secret",
        immich_album_id=ALBUM_ID,
    )


def test_validates_magic_bytes_not_only_claimed_mime():
    assert validate_image(JPEG, "image/jpeg") == "image/jpeg"
    try:
        validate_image(b"<svg onload=alert(1)>", "image/jpeg")
    except ValueError as error:
        assert str(error) == "invalid_image_signature"
    else:
        raise AssertionError("spoofed image was accepted")


def test_claim_download_validate_import_album_finish_and_cleanup():
    transport = FakeTransport()
    result = PhotoInboxWorker(config(), transport).run_once()

    assert result == {"status": "ok", "upload_id": UPLOAD_ID, "immich_asset_id": ASSET_ID}
    urls = [call[1] for call in transport.calls]
    assert any(url.endswith("/api/assets") for url in urls)
    assert any(url.endswith(f"/api/albums/{ALBUM_ID}/assets") for url in urls)
    finish = next(call for call in transport.calls if call[1].endswith("embe_finish_photo_import"))
    assert json.loads(finish[3]) == {
        "p_upload_id": UPLOAD_ID,
        "p_immich_asset_id": ASSET_ID,
        "p_checksum_sha256": hashlib.sha256(JPEG).hexdigest(),
    }
    assert transport.calls[-1][0] == "DELETE"


def test_failure_is_requeued_with_bounded_error_code():
    class Broken(FakeTransport):
        def __call__(self, method, url, headers, body=None):
            if url.endswith("/api/assets"):
                self.calls.append((method, url, headers, body))
                return HttpResponse(503, {}, b"")
            if url.endswith("/rest/v1/rpc/embe_fail_photo_import"):
                self.calls.append((method, url, headers, body))
                return HttpResponse(204, {}, b"")
            return super().__call__(method, url, headers, body)

    transport = Broken()
    result = PhotoInboxWorker(config(), transport).run_once()
    assert result == {"status": "retry", "upload_id": UPLOAD_ID, "error": "immich_upload_failed"}
    failed = next(call for call in transport.calls if call[1].endswith("embe_fail_photo_import"))
    payload = json.loads(failed[3])
    assert payload["p_error_code"] == "immich_upload_failed"
    assert payload["p_retry_after_seconds"] == 60
    assert not any(call[0] == "DELETE" for call in transport.calls)
