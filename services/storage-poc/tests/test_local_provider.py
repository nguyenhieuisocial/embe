from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.local import LocalStorage


async def collect(iterator) -> bytes:
    return b"".join([chunk async for chunk in iterator])


@pytest.mark.asyncio
async def test_local_provider_round_trip_range_and_delete(tmp_path: Path):
    source = tmp_path / "source.bin"
    payload = bytes(range(256)) * 8192
    source.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    provider = LocalStorage(tmp_path / "objects")
    stored = await provider.put(source, PutOptions("tenant", "asset", "x.bin", "application/octet-stream", digest))

    assert await collect(provider.open(stored.locator)) == payload
    assert await collect(provider.open(stored.locator, ByteRange(123, 999))) == payload[123:1000]
    await provider.delete(stored.locator)
    assert not (tmp_path / "objects" / str(stored.locator["key"])).exists()


@pytest.mark.asyncio
async def test_local_provider_rejects_checksum_and_path_escape(tmp_path: Path):
    source = tmp_path / "source.bin"
    source.write_bytes(b"bad")
    provider = LocalStorage(tmp_path / "objects")
    with pytest.raises(ValueError, match="checksum"):
        await provider.put(source, PutOptions("tenant", "asset", "x", "x", "0" * 64))
    with pytest.raises(ValueError, match="invalid object key"):
        await collect(provider.open({"key": "../../secret"}))
