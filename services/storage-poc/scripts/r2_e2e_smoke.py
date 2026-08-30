from __future__ import annotations

import hashlib
import json
import os

import httpx


def main() -> int:
    api_key = os.environ["EMBE_STORAGE_POC_API_KEY"]
    base_url = os.getenv("EMBE_STORAGE_POC_BASE_URL", "http://127.0.0.1:8099")
    payload = os.urandom(1024 * 1024)
    headers = {"X-Embe-Poc-Key": api_key}

    with httpx.Client(base_url=base_url, headers=headers, timeout=60) as client:
        health = client.get("/v1/health")
        health.raise_for_status()
        created = client.post(
            "/v1/files",
            files={"file": ("r2-e2e.bin", payload, "application/octet-stream")},
            data={"provider_name": "r2", "sensitivity": "family"},
        )
        created.raise_for_status()
        asset = created.json()

        try:
            downloaded = client.get(f"/v1/files/{asset['id']}/content")
            downloaded.raise_for_status()
            ranged = client.get(
                f"/v1/files/{asset['id']}/content",
                headers={**headers, "Range": "bytes=123-999"},
            )
            ranged.raise_for_status()
        finally:
            deleted = client.delete(f"/v1/files/{asset['id']}")
            deleted.raise_for_status()

        after_delete = client.get(f"/v1/files/{asset['id']}")
        result = {
            "health": health.json()["status"],
            "r2": health.json()["providers"]["r2"]["status"],
            "upload": asset["status"],
            "full_checksum": hashlib.sha256(downloaded.content).digest()
            == hashlib.sha256(payload).digest(),
            "range": ranged.status_code == 206 and ranged.content == payload[123:1000],
            "delete": deleted.json()["status"],
            "after_delete_http": after_delete.status_code,
        }
        print(json.dumps(result, separators=(",", ":")))
        return 0 if all(
            (
                result["health"] == "ok",
                result["r2"] == "ok",
                result["upload"] == "available",
                result["full_checksum"],
                result["range"],
                result["delete"] == "tombstoned",
                result["after_delete_http"] == 404,
            )
        ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
