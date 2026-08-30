from pathlib import Path

import hashlib
import pytest

from embe_storage.cache import BoundedFileCache, CachedProvider
from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.local import LocalStorage


def test_cache_counts_hits_misses_and_evicts(tmp_path: Path):
    cache = BoundedFileCache(tmp_path / "cache", max_bytes=8)
    one = tmp_path / "one"
    two = tmp_path / "two"
    one.write_bytes(b"123456")
    two.write_bytes(b"abcdef")
    assert cache.get("a" * 64) is None
    cache.put("a" * 64, one)
    assert cache.get("a" * 64).read_bytes() == b"123456"
    cache.put("b" * 64, two)
    assert cache.metrics.hits == 1
    assert cache.metrics.misses == 1
    assert cache.metrics.evictions == 1


@pytest.mark.asyncio
async def test_cached_provider_records_miss_then_hit(tmp_path: Path):
    payload = b"cache me" * 10000
    source = tmp_path / "source"
    source.write_bytes(payload)
    cache = BoundedFileCache(tmp_path / "cache", max_bytes=len(payload) * 2)
    provider = CachedProvider(LocalStorage(tmp_path / "origin"), cache)
    stored = await provider.put(
        source,
        PutOptions("tenant", "asset", "x", "application/octet-stream", hashlib.sha256(payload).hexdigest()),
    )
    first = b"".join([chunk async for chunk in provider.open(stored.locator, ByteRange(10, 99))])
    second = b"".join([chunk async for chunk in provider.open(stored.locator, ByteRange(20, 109))])
    assert first == payload[10:100]
    assert second == payload[20:110]
    assert cache.metrics.misses == 1
    assert cache.metrics.hits == 1
