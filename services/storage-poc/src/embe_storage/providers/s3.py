from __future__ import annotations

import asyncio
from pathlib import Path
from typing import AsyncIterator

from embe_storage.provider import ByteRange, Capabilities, ObjectStat, PutOptions, StoredObject


class S3Storage:
    capabilities = Capabilities(True, True, True, True, 5 * 1024**4)

    def __init__(self, client, bucket: str, prefix: str = "poc", name: str = "s3"):
        self.client = client
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.name = name

    def _key(self, options: PutOptions) -> str:
        return f"{self.prefix}/{options.tenant_id}/{options.asset_id}/original"

    async def put(self, source: Path, options: PutOptions) -> StoredObject:
        key = self._key(options)
        await asyncio.to_thread(
            self.client.upload_file,
            str(source),
            self.bucket,
            key,
            ExtraArgs={"ContentType": options.media_type, "Metadata": {"sha256": options.sha256}},
        )
        head = await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=key)
        return StoredObject(
            locator={"bucket": self.bucket, "key": key},
            size=int(head["ContentLength"]),
            sha256=options.sha256,
            etag=str(head.get("ETag", "")).strip('"') or None,
        )

    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]:
        request = {"Bucket": str(locator["bucket"]), "Key": str(locator["key"])}
        if byte_range:
            request["Range"] = f"bytes={byte_range.start}-{byte_range.end_inclusive}"
        response = await asyncio.to_thread(self.client.get_object, **request)
        body = response["Body"]
        while chunk := await asyncio.to_thread(body.read, 1024 * 1024):
            yield chunk

    async def stat(self, locator: dict[str, object]) -> ObjectStat:
        head = await asyncio.to_thread(
            self.client.head_object, Bucket=str(locator["bucket"]), Key=str(locator["key"])
        )
        return ObjectStat(
            size=int(head["ContentLength"]),
            sha256=head.get("Metadata", {}).get("sha256"),
            etag=str(head.get("ETag", "")).strip('"') or None,
        )

    async def delete(self, locator: dict[str, object]) -> None:
        await asyncio.to_thread(
            self.client.delete_object, Bucket=str(locator["bucket"]), Key=str(locator["key"])
        )

    async def health(self) -> dict[str, object]:
        await asyncio.to_thread(self.client.head_bucket, Bucket=self.bucket)
        return {"provider": self.name, "status": "ok"}


class R2Storage(S3Storage):
    def __init__(self, client, bucket: str, prefix: str = "poc"):
        super().__init__(client, bucket, prefix, name="r2")
