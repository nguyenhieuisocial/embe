from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from pathlib import Path
from typing import AsyncIterator

from embe_storage.provider import ByteRange, Capabilities, ObjectStat, PutOptions, StoredObject


class LocalStorage:
    name = "local"
    capabilities = Capabilities(True, False, False, True, None)

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("invalid object key")
        return path

    async def put(self, source: Path, options: PutOptions) -> StoredObject:
        key = f"{options.tenant_id}/{options.asset_id}/{uuid.uuid4().hex}.blob"
        destination = self._resolve(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".partial")

        def copy_and_hash() -> tuple[int, str]:
            digest = hashlib.sha256()
            size = 0
            try:
                with source.open("rb") as reader, temporary.open("xb") as writer:
                    while chunk := reader.read(1024 * 1024):
                        writer.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
                    writer.flush()
                    os.fsync(writer.fileno())
                if digest.hexdigest() != options.sha256:
                    raise ValueError("checksum_mismatch")
                os.replace(temporary, destination)
                return size, digest.hexdigest()
            finally:
                temporary.unlink(missing_ok=True)

        size, sha256 = await asyncio.to_thread(copy_and_hash)
        return StoredObject(locator={"key": key}, size=size, sha256=sha256, etag=sha256)

    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]:
        path = self._resolve(str(locator["key"]))
        size = path.stat().st_size
        start, remaining = 0, size
        if byte_range:
            byte_range.validate(size)
            start = byte_range.start
            remaining = min(byte_range.end_inclusive, size - 1) - start + 1
        with path.open("rb") as reader:
            reader.seek(start)
            while remaining:
                chunk = await asyncio.to_thread(reader.read, min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    async def stat(self, locator: dict[str, object]) -> ObjectStat:
        path = self._resolve(str(locator["key"]))
        return ObjectStat(size=path.stat().st_size, sha256=None)

    async def delete(self, locator: dict[str, object]) -> None:
        self._resolve(str(locator["key"])).unlink(missing_ok=True)

    async def health(self) -> dict[str, object]:
        return {"provider": self.name, "status": "ok", "root": str(self.root)}
