from pathlib import Path

import pytest

from embe_storage.live_smoke import run_provider_smoke
from embe_storage.provider import ByteRange, ObjectStat, StoredObject


class MemoryProvider:
    def __init__(self):
        self.payload = b""
        self.deleted = False

    async def put(self, source: Path, options):
        self.payload = source.read_bytes()
        self.sha256 = options.sha256
        return StoredObject(locator={"opaque": "test"}, size=len(self.payload), sha256=self.sha256)

    async def stat(self, locator):
        return ObjectStat(size=len(self.payload), sha256=self.sha256)

    async def open(self, locator, byte_range: ByteRange | None = None):
        payload = self.payload
        if byte_range is not None:
            payload = payload[byte_range.start : byte_range.end_inclusive + 1]
        yield payload

    async def delete(self, locator):
        self.deleted = True


@pytest.mark.asyncio
async def test_live_smoke_verifies_full_and_range_reads_and_deletes(tmp_path):
    provider = MemoryProvider()
    result = await run_provider_smoke(provider, tmp_path, size_bytes=64 * 1024)

    assert result["status"] == "pass"
    assert result["checksum_matches"] is True
    assert result["range_matches"] is True
    assert result["stat_matches"] is True
    assert provider.deleted is True
    assert list(tmp_path.iterdir()) == []
