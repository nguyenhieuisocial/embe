from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from embe_storage.api import create_app
from embe_storage.provider import Capabilities
from embe_storage.providers.local import LocalStorage


def test_api_upload_range_metadata_delete(settings, auth_headers):
    client = TestClient(create_app(settings))
    payload = bytes(range(251)) * 1000
    response = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("baby-preview.bin", payload, "application/octet-stream")},
        data={"provider_name": "local", "sensitivity": "family"},
    )
    assert response.status_code == 201
    asset_id = response.json()["id"]
    assert "locator" not in response.text.lower()

    metadata = client.get(f"/v1/files/{asset_id}", headers=auth_headers)
    assert metadata.status_code == 200
    assert "provider" not in metadata.text.lower()

    ranged = client.get(f"/v1/files/{asset_id}/content", headers={**auth_headers, "Range": "bytes=123-999"})
    assert ranged.status_code == 206
    assert ranged.content == payload[123:1000]
    assert ranged.headers["content-range"] == f"bytes 123-999/{len(payload)}"

    deleted = client.delete(f"/v1/files/{asset_id}", headers=auth_headers)
    assert deleted.status_code == 202
    assert client.get(f"/v1/files/{asset_id}", headers=auth_headers).status_code == 404


def test_api_fails_closed_and_isolates_tenants(settings, auth_headers):
    client = TestClient(create_app(settings))
    assert client.get("/v1/health").status_code == 401
    created = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("x.txt", b"hello", "text/plain")},
        data={"provider_name": "local"},
    ).json()
    other = {**auth_headers, "X-Tenant-Id": "family-b"}
    assert client.get(f"/v1/files/{created['id']}", headers=other).status_code == 403
    other_owner = {**auth_headers, "X-Owner-Id": "other-owner"}
    assert client.get(f"/v1/files/{created['id']}", headers=other_owner).status_code == 403
    assert client.delete(f"/v1/files/{created['id']}", headers=other_owner).status_code == 403
    invalid_range = client.get(
        f"/v1/files/{created['id']}/content", headers={**auth_headers, "Range": "bytes=999-1000"}
    )
    assert invalid_range.status_code == 416


def test_api_rejects_empty_and_duplicate_active_files(settings, auth_headers):
    client = TestClient(create_app(settings))
    empty = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("empty.bin", b"", "application/octet-stream")},
        data={"provider_name": "local"},
    )
    assert empty.status_code == 400
    first = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("same.bin", b"same", "application/octet-stream")},
        data={"provider_name": "local"},
    )
    assert first.status_code == 201
    duplicate = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("same-again.bin", b"same", "application/octet-stream")},
        data={"provider_name": "local"},
    )
    assert duplicate.status_code == 409


def test_telegram_request_commits_local_then_enqueues_worker(settings, auth_headers):
    class TelegramPlaceholder:
        name = "telegram_mtproto_lab"
        capabilities = Capabilities(True, True, False, False, 4_194_304_000)

    app = create_app(
        settings,
        {
            "local": LocalStorage(settings.data_dir / "objects"),
            "telegram_mtproto_lab": TelegramPlaceholder(),
        },
    )
    client = TestClient(app)
    response = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("replicate.bin", b"synthetic", "application/octet-stream")},
        data={"provider_name": "telegram_mtproto_lab", "sensitivity": "family"},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "replication_pending"
    jobs = app.state.repository.due_outbox()
    assert [job["operation"] for job in jobs] == ["replicate_telegram"]


def test_api_can_queue_telegram_for_windows_worker_without_linux_session(settings, auth_headers):
    queued_settings = replace(
        settings,
        telegram_replication_enabled=True,
        telegram_account_tier="standard",
    )
    app = create_app(
        queued_settings,
        {"local": LocalStorage(settings.data_dir / "objects")},
    )
    client = TestClient(app)

    response = client.post(
        "/v1/files",
        headers=auth_headers,
        files={"file": ("preview.bin", b"secondary-copy", "application/octet-stream")},
        data={"provider_name": "telegram_mtproto_lab", "sensitivity": "family"},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "replication_pending"
    assert [job["operation"] for job in app.state.repository.due_outbox()] == ["replicate_telegram"]
