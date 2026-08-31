from __future__ import annotations

import hashlib
import os
import time
import uuid
from pathlib import Path

from embe_storage.provider import ByteRange, PutOptions


async def run_provider_smoke(provider, staging_dir: Path, size_bytes: int = 1024 * 1024) -> dict[str, object]:
    if size_bytes < 64 * 1024:
        raise ValueError("canary must be at least 64 KiB")

    staging_dir.mkdir(parents=True, exist_ok=True)
    asset_id = f"canary-{uuid.uuid4()}"
    source = staging_dir / f"{asset_id}.bin"
    payload = os.urandom(size_bytes)
    source.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()
    locator: dict[str, object] | None = None
    deleted = False

    try:
        upload_started = time.perf_counter()
        stored = await provider.put(
            source,
            PutOptions(
                tenant_id="embe-storage-canary",
                asset_id=asset_id,
                logical_name="canary.bin",
                media_type="application/octet-stream",
                sha256=checksum,
                metadata={"purpose": "live-smoke"},
            ),
        )
        upload_ms = round((time.perf_counter() - upload_started) * 1000, 1)
        locator = dict(stored.locator)

        stat = await provider.stat(locator)
        download_started = time.perf_counter()
        downloaded = b"".join([chunk async for chunk in provider.open(locator)])
        download_ms = round((time.perf_counter() - download_started) * 1000, 1)

        range_start = 8192
        range_end = min(size_bytes - 1, range_start + 65535)
        range_started = time.perf_counter()
        ranged = b"".join(
            [chunk async for chunk in provider.open(locator, ByteRange(range_start, range_end))]
        )
        range_ms = round((time.perf_counter() - range_started) * 1000, 1)

        checksum_matches = hashlib.sha256(downloaded).hexdigest() == checksum
        range_matches = ranged == payload[range_start : range_end + 1]
        stat_matches = stat.size == size_bytes and stat.sha256 == checksum
        if not checksum_matches or not range_matches or not stat_matches:
            raise RuntimeError("provider verification failed")

        return {
            "status": "pass",
            "size_bytes": size_bytes,
            "upload_ms": upload_ms,
            "download_ms": download_ms,
            "range_ms": range_ms,
            "checksum_matches": checksum_matches,
            "range_matches": range_matches,
            "stat_matches": stat_matches,
        }
    finally:
        if locator is not None:
            await provider.delete(locator)
            deleted = True
        source.unlink(missing_ok=True)
        if locator is not None and not deleted:
            raise RuntimeError("canary cleanup failed")
