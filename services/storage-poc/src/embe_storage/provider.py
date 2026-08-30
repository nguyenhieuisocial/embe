from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Protocol


@dataclass(frozen=True)
class ByteRange:
    start: int
    end_inclusive: int

    def validate(self, size: int) -> None:
        if self.start < 0 or self.end_inclusive < self.start or self.start >= size:
            raise ValueError("range_not_satisfiable")


@dataclass(frozen=True)
class Capabilities:
    range_read: bool
    multipart_upload: bool
    presigned_read: bool
    native_checksum: bool
    max_object_bytes: int | None


@dataclass(frozen=True)
class PutOptions:
    tenant_id: str
    asset_id: str
    logical_name: str
    media_type: str
    sha256: str
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class StoredObject:
    locator: dict[str, str | int]
    size: int
    sha256: str
    etag: str | None = None


@dataclass(frozen=True)
class ObjectStat:
    size: int
    sha256: str | None
    etag: str | None = None


class StorageProvider(Protocol):
    name: str
    capabilities: Capabilities

    async def put(self, source: Path, options: PutOptions) -> StoredObject: ...
    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]: ...
    async def stat(self, locator: dict[str, object]) -> ObjectStat: ...
    async def delete(self, locator: dict[str, object]) -> None: ...
    async def health(self) -> dict[str, object]: ...


class ProviderError(RuntimeError):
    def __init__(self, code: str, detail: str, retry_after: int | None = None):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.retry_after = retry_after
