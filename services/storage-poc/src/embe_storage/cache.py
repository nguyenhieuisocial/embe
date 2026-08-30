from __future__ import annotations

import os
import asyncio
import hashlib
import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

from embe_storage.provider import ByteRange, ObjectStat


@dataclass
class CacheMetrics:
    hits: int = 0
    misses: int = 0
    evictions: int = 0


class BoundedFileCache:
    def __init__(self, root: Path, max_bytes: int):
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.max_bytes = max_bytes
        self.metrics = CacheMetrics()

    def _path(self, cache_key: str) -> Path:
        if not cache_key or any(ch not in "0123456789abcdef" for ch in cache_key.lower()):
            raise ValueError("cache key must be hexadecimal")
        return self.root / cache_key.lower()

    def get(self, cache_key: str) -> Path | None:
        path = self._path(cache_key)
        if not path.exists():
            self.metrics.misses += 1
            return None
        self.metrics.hits += 1
        os.utime(path, None)
        return path

    def put(self, cache_key: str, source: Path) -> Path:
        path = self._path(cache_key)
        temporary = path.with_suffix(".partial")
        shutil.copyfile(source, temporary)
        os.replace(temporary, path)
        self._evict()
        return path

    def _evict(self) -> None:
        files = sorted(
            (path for path in self.root.iterdir() if path.is_file() and path.suffix != ".partial"),
            key=lambda path: path.stat().st_atime,
        )
        total = sum(path.stat().st_size for path in files)
        while total > self.max_bytes and files:
            victim = files.pop(0)
            total -= victim.stat().st_size
            victim.unlink(missing_ok=True)
            self.metrics.evictions += 1


class CachedProvider:
    def __init__(self, inner, cache: BoundedFileCache):
        self.inner = inner
        self.cache = cache
        self.name = inner.name
        self.capabilities = inner.capabilities

    @staticmethod
    def _key(locator: dict[str, object]) -> str:
        return hashlib.sha256(json.dumps(locator, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    async def _ensure(self, locator: dict[str, object]) -> Path:
        key = self._key(locator)
        existing = self.cache.get(key)
        if existing:
            return existing
        handle, name = tempfile.mkstemp(prefix="embe-cache-", suffix=".partial", dir=self.cache.root)
        os.close(handle)
        temporary = Path(name)
        try:
            with temporary.open("wb") as writer:
                async for chunk in self.inner.open(locator):
                    writer.write(chunk)
            return await asyncio.to_thread(self.cache.put, key, temporary)
        finally:
            temporary.unlink(missing_ok=True)

    async def put(self, source: Path, options):
        return await self.inner.put(source, options)

    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]:
        path = await self._ensure(locator)
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
        return await self.inner.stat(locator)

    async def delete(self, locator: dict[str, object]) -> None:
        self.cache._path(self._key(locator)).unlink(missing_ok=True)
        await self.inner.delete(locator)

    async def health(self) -> dict[str, object]:
        result = await self.inner.health()
        return {**result, "cache": self.cache.metrics.__dict__}
