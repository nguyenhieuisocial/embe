import hashlib
import io
import json
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

import av
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_studio.api import create_app
from embe_studio.assets import AssetUnavailable, EditorialAssets
from embe_studio.campaign import load_catalog, propose
from embe_studio.contracts import Project, Scene
from embe_studio.render import RenderCancelled, decode_image, render
from embe_studio.repository import QueueConflict, QueueFull, Repository
from embe_studio.worker import output_path, run_once, worker_lock


def project(**kwargs):
    return Project(scenes=[Scene(asset_id=str(uuid4()), seconds=2)], **kwargs)


def picture():
    stream = io.BytesIO()
    Image.new("RGB", (120, 80), "pink").save(stream, format="PNG")
    return stream.getvalue()


class Source:
    def read(self, _id):
        return picture()


def test_submission_is_idempotent_and_conflict_does_not_change_job(tmp_path):
    repo = Repository(tmp_path)
    key, draft = str(uuid4()), project()
    first = repo.submit(key, draft)
    assert repo.submit(key, draft)["id"] == first["id"]
    with pytest.raises(QueueConflict):
        repo.submit(key, project())
    assert len(repo.list()) == 1
    assert "project" not in first and "request_hash" not in first


def test_queue_bounds_and_crash_recovery(tmp_path):
    repo = Repository(tmp_path)
    for _ in range(5):
        repo.submit(str(uuid4()), project())
    with pytest.raises(QueueFull):
        repo.submit(str(uuid4()), project())
    claimed = repo.claim()
    assert repo.get(claimed["id"])["attempts"] == 1
    with worker_lock(repo.root):
        repo.recover()
    assert repo.get(claimed["id"])["status"] == "queued"


def test_exclusive_worker_lock(tmp_path):
    with worker_lock(tmp_path):
        with pytest.raises(OSError):
            with worker_lock(tmp_path):
                pass


def test_cancel_is_not_overwritten_by_stale_worker(tmp_path):
    repo = Repository(tmp_path)
    job = repo.submit(str(uuid4()), project())
    repo.claim()
    assert repo.cancel(job["id"])
    assert not repo.complete(job["id"], {"test": True})
    assert not repo.progress(job["id"], 50)
    assert repo.get(job["id"])["status"] == "cancelled"


def test_api_auth_payload_limits_idempotency_and_delete(tmp_path):
    token = "x" * 40
    with TestClient(create_app(tmp_path, token)) as client:
        assert client.get("/health").status_code == 401
        headers = {"authorization": "Bearer " + token}
        assert client.get("/health", headers=headers).json()["publishing"] is False
        assert client.get("/jobs", headers={**headers, "origin": "https://evil.invalid"}).status_code == 403
        assert client.post("/jobs", content=b"x" * 20000, headers=headers).status_code == 413
        body = {"idempotency_key": str(uuid4()), "project": project().model_dump()}
        created = client.post("/jobs", json=body, headers=headers)
        assert created.status_code == 202
        identifier = created.json()["id"]
        assert client.post("/jobs", json=body, headers=headers).json()["id"] == identifier
        body["project"]["scenes"][0]["asset_id"] = "https://example.com/private.jpg"
        assert client.post("/jobs", json=body, headers=headers).status_code == 400
        assert client.get(f"/jobs/{identifier}/video", headers=headers).status_code == 404
        assert client.delete(f"/jobs/{identifier}", headers=headers).status_code == 204
        assert client.get(f"/jobs/{identifier}", headers=headers).status_code == 404


def test_editorial_manifest_rejects_family_paths_and_modified_files(tmp_path):
    identifier = str(uuid4())
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({identifier: {"file": "../../vault/photo.jpg", "provenance": "embe_educational_layout"}}))
    with pytest.raises(AssetUnavailable):
        EditorialAssets(manifest).read(identifier)
    body = picture()
    (tmp_path / f"{identifier}.png").write_bytes(body)
    item = {"file": f"{identifier}.png", "provenance": "embe_educational_layout", "checksum_sha256": hashlib.sha256(body).hexdigest()}
    manifest.write_text(json.dumps({identifier: item}))
    assert EditorialAssets(manifest).read(identifier) == body
    (tmp_path / f"{identifier}.png").write_bytes(b"changed")
    with pytest.raises(AssetUnavailable):
        EditorialAssets(manifest).read(identifier)


def test_bounded_image_and_no_source_paths():
    with pytest.raises(ValueError):
        decode_image(b"x" * 10_000_001)
    with pytest.raises(ValueError):
        Scene(asset_id=r"C:\Anh\private.jpg")


def test_real_render_exact_frames_and_dimensions(tmp_path):
    draft = project(motion=False)
    path = tmp_path / "draft.mp4"
    result = render(draft, Source(), path, lambda _: True)
    assert (result["width"], result["height"], result["frames"]) == (360, 640, 60)
    assert result["duration_seconds"] == 2
    assert result["checksum_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    with av.open(str(path)) as container:
        frames = list(container.decode(video=0))
    assert len(frames) == 60
    assert frames[-1].time == pytest.approx(59 / 30)
    data = path.read_bytes()
    assert data.index(b"moov") < data.index(b"mdat")


def test_worker_result_video_range_and_garbage_collection(tmp_path):
    repo = Repository(tmp_path)
    saved = repo.submit(str(uuid4()), project())
    result = run_once(repo, Source())
    assert result["status"] == "completed"
    token = "x" * 40
    with TestClient(create_app(tmp_path, token)) as client:
        response = client.get(f"/jobs/{saved['id']}/video", headers={"authorization": "Bearer " + token, "range": "bytes=0-31"})
        assert response.status_code == 206 and len(response.content) == 32
        assert response.headers["cache-control"] == "private, no-store"
    repo.delete(saved["id"])
    run_once(repo, Source())
    assert not output_path(repo, saved["id"]).exists()


def test_cancellation_prevents_render(tmp_path):
    with pytest.raises(RenderCancelled):
        render(project(), Source(), tmp_path / "cancelled.mp4", lambda _: False)


def test_catalog_is_evidence_linked_draft_and_stale_catalog_stops():
    path = Path(__file__).resolve().parents[1] / "content/catalog.json"
    catalog = load_catalog(path, today=date(2026, 9, 7))
    topics = propose(catalog)
    assert len(topics) == 8 and len(catalog["research_backlog"]) == 22
    assert topics[0]["pillar"] != topics[1]["pillar"]
    assert all(item["sources"] for item in topics)
    with pytest.raises(ValueError, match="sources_require_recheck"):
        load_catalog(path, today=date(2026, 11, 1))
