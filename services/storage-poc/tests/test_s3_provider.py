from __future__ import annotations

import hashlib
import io
from pathlib import Path

import pytest

from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.s3 import R2Storage, S3Storage


class FakeS3:
    def __init__(self):
        self.objects = {}

    def upload_file(self, source, bucket, key, ExtraArgs):
        self.objects[(bucket, key)] = (Path(source).read_bytes(), ExtraArgs["Metadata"])

    def head_object(self, Bucket, Key):
        payload, metadata = self.objects[(Bucket, Key)]
        return {"ContentLength": len(payload), "Metadata": metadata, "ETag": '"etag"'}

    def get_object(self, Bucket, Key, Range=None):
        payload = self.objects[(Bucket, Key)][0]
        if Range:
            start, end = [int(value) for value in Range.removeprefix("bytes=").split("-")]
            payload = payload[start : end + 1]
        return {"Body": io.BytesIO(payload)}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def head_bucket(self, Bucket):
        return {}


@pytest.mark.asyncio
async def test_s3_and_r2_share_contract_without_leaking_credentials(tmp_path: Path):
    payload = b"s3 compatible" * 100
    source = tmp_path / "source"
    source.write_bytes(payload)
    client = FakeS3()
    provider = S3Storage(client, "lab")
    stored = await provider.put(
        source,
        PutOptions("tenant", "asset", "x", "application/octet-stream", hashlib.sha256(payload).hexdigest()),
    )
    result = b"".join([chunk async for chunk in provider.open(stored.locator, ByteRange(10, 99))])
    assert result == payload[10:100]
    assert R2Storage(client, "lab").name == "r2"
    assert all("secret" not in str(value).lower() for value in stored.locator.values())
