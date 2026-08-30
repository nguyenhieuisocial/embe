from __future__ import annotations

import hashlib
import json
import os
import struct
import tempfile
import base64
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from embe_storage.provider import ByteRange, Capabilities, ObjectStat, PutOptions, StoredObject

MAGIC = b"EMBEAE1\x00"
TAG_SIZE = 16


@dataclass(frozen=True)
class Envelope:
    wrapped_dek: bytes
    wrap_nonce: bytes
    nonce_prefix: bytes
    chunk_size: int
    key_version: str = "poc-v1"
    algorithm: str = "AES-256-GCM-CHUNKED-V1"


class ChunkCipher:
    def __init__(self, master_key: bytes, chunk_size: int = 1024 * 1024):
        if len(master_key) != 32:
            raise ValueError("master key must be exactly 32 bytes")
        if not 65536 <= chunk_size <= 8 * 1024 * 1024:
            raise ValueError("chunk size outside supported range")
        self.master_key = master_key
        self.chunk_size = chunk_size

    @staticmethod
    def _nonce(prefix: bytes, index: int) -> bytes:
        if len(prefix) != 8 or not 0 <= index < 2**32:
            raise ValueError("invalid nonce coordinates")
        return prefix + index.to_bytes(4, "big")

    @staticmethod
    def _aad(asset_id: str, size: int, index: int) -> bytes:
        return f"embe-storage-poc:v1:{asset_id}:{size}:{index}".encode()

    def encrypt_file(self, source: Path, destination: Path, asset_id: str) -> tuple[Envelope, str]:
        dek = AESGCM.generate_key(bit_length=256)
        nonce_prefix = os.urandom(8)
        original_size = source.stat().st_size
        header = json.dumps(
            {"version": 1, "asset_id": asset_id, "original_size": original_size, "chunk_size": self.chunk_size},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        aes = AESGCM(dek)
        with source.open("rb") as reader, destination.open("xb") as writer:
            writer.write(MAGIC)
            writer.write(struct.pack(">I", len(header)))
            writer.write(header)
            index = 0
            while chunk := reader.read(self.chunk_size):
                encrypted = aes.encrypt(self._nonce(nonce_prefix, index), chunk, self._aad(asset_id, original_size, index))
                writer.write(encrypted)
                index += 1
        wrap_nonce = os.urandom(12)
        wrapped_dek = AESGCM(self.master_key).encrypt(wrap_nonce, dek, b"embe-storage-poc:keywrap:v1")
        digest = hashlib.sha256()
        with destination.open("rb") as reader:
            while block := reader.read(1024 * 1024):
                digest.update(block)
        return Envelope(wrapped_dek, wrap_nonce, nonce_prefix, self.chunk_size), digest.hexdigest()

    def unwrap(self, envelope: Envelope) -> bytes:
        return AESGCM(self.master_key).decrypt(
            envelope.wrap_nonce, envelope.wrapped_dek, b"embe-storage-poc:keywrap:v1"
        )

    def decrypt_range(
        self,
        source: Path,
        envelope: Envelope,
        asset_id: str,
        start: int,
        end_inclusive: int,
    ) -> bytes:
        with source.open("rb") as reader:
            if reader.read(len(MAGIC)) != MAGIC:
                raise ValueError("invalid encrypted container")
            header_len = struct.unpack(">I", reader.read(4))[0]
            header = json.loads(reader.read(header_len))
            original_size = int(header["original_size"])
            if header["asset_id"] != asset_id or header["chunk_size"] != envelope.chunk_size:
                raise ValueError("envelope metadata mismatch")
            if start < 0 or end_inclusive < start or start >= original_size:
                raise ValueError("range_not_satisfiable")
            end_inclusive = min(end_inclusive, original_size - 1)
            first = start // envelope.chunk_size
            last = end_inclusive // envelope.chunk_size
            record_size = envelope.chunk_size + TAG_SIZE
            body_offset = len(MAGIC) + 4 + header_len
            aes = AESGCM(self.unwrap(envelope))
            plaintext = bytearray()
            for index in range(first, last + 1):
                plain_len = min(envelope.chunk_size, original_size - index * envelope.chunk_size)
                reader.seek(body_offset + index * record_size)
                encrypted = reader.read(plain_len + TAG_SIZE)
                plaintext.extend(
                    aes.decrypt(
                        self._nonce(envelope.nonce_prefix, index),
                        encrypted,
                        self._aad(asset_id, original_size, index),
                    )
                )
            left = start - first * envelope.chunk_size
            right = left + end_inclusive - start + 1
            return bytes(plaintext[left:right])


class EncryptedProvider:
    """Encrypt before provider upload; first read downloads ciphertext privately.

    This deliberately favors correctness over streaming performance. A production
    implementation would combine this boundary with a sparse ciphertext cache.
    """

    def __init__(self, inner, cipher: ChunkCipher, temp_dir: Path):
        self.inner = inner
        self.cipher = cipher
        self.temp_dir = temp_dir
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.name = inner.name
        max_plaintext = (
            inner.capabilities.max_object_bytes - 1024 * 1024
            if inner.capabilities.max_object_bytes is not None
            else None
        )
        self.capabilities = Capabilities(
            True,
            inner.capabilities.multipart_upload,
            False,
            True,
            max_plaintext,
        )

    @staticmethod
    def _encode_envelope(envelope: Envelope) -> dict[str, str | int]:
        return {
            "wrapped_dek": base64.b64encode(envelope.wrapped_dek).decode(),
            "wrap_nonce": base64.b64encode(envelope.wrap_nonce).decode(),
            "nonce_prefix": base64.b64encode(envelope.nonce_prefix).decode(),
            "chunk_size": envelope.chunk_size,
            "key_version": envelope.key_version,
        }

    @staticmethod
    def _decode_envelope(value: dict[str, object]) -> Envelope:
        return Envelope(
            wrapped_dek=base64.b64decode(str(value["wrapped_dek"])),
            wrap_nonce=base64.b64decode(str(value["wrap_nonce"])),
            nonce_prefix=base64.b64decode(str(value["nonce_prefix"])),
            chunk_size=int(value["chunk_size"]),
            key_version=str(value["key_version"]),
        )

    async def put(self, source: Path, options: PutOptions) -> StoredObject:
        encrypted = self.temp_dir / f"{options.asset_id}.encrypted.partial"
        try:
            envelope, cipher_sha = self.cipher.encrypt_file(source, encrypted, options.asset_id)
            encrypted_options = PutOptions(
                options.tenant_id,
                options.asset_id,
                f"{options.asset_id}.bin",
                "application/octet-stream",
                cipher_sha,
                {
                    **options.metadata,
                    "encrypted": "true",
                    "encryption_envelope": json.dumps(self._encode_envelope(envelope), sort_keys=True, separators=(",", ":")),
                    "original_size": str(source.stat().st_size),
                    "plaintext_sha256": options.sha256,
                },
            )
            stored = await self.inner.put(encrypted, encrypted_options)
            return StoredObject(
                locator={
                    "inner": stored.locator,
                    "envelope": self._encode_envelope(envelope),
                    "asset_id": options.asset_id,
                    "original_size": source.stat().st_size,
                    "plaintext_sha256": options.sha256,
                },
                size=source.stat().st_size,
                sha256=options.sha256,
                etag=stored.etag,
            )
        finally:
            encrypted.unlink(missing_ok=True)

    async def _fetch_ciphertext(self, locator: dict[str, object]) -> Path:
        handle, name = tempfile.mkstemp(prefix="embe-poc-", suffix=".cipher", dir=self.temp_dir)
        os.close(handle)
        path = Path(name)
        with path.open("wb") as writer:
            async for chunk in self.inner.open(dict(locator["inner"])):
                writer.write(chunk)
        return path

    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]:
        original_size = int(locator["original_size"])
        selected = byte_range or ByteRange(0, original_size - 1)
        selected.validate(original_size)
        ciphertext = await self._fetch_ciphertext(locator)
        try:
            envelope = self._decode_envelope(dict(locator["envelope"]))
            start = selected.start
            while start <= selected.end_inclusive:
                end = min(selected.end_inclusive, start + envelope.chunk_size - 1)
                yield self.cipher.decrypt_range(ciphertext, envelope, str(locator["asset_id"]), start, end)
                start = end + 1
        finally:
            ciphertext.unlink(missing_ok=True)

    async def stat(self, locator: dict[str, object]) -> ObjectStat:
        return ObjectStat(
            size=int(locator["original_size"]),
            sha256=str(locator["plaintext_sha256"]),
        )

    async def delete(self, locator: dict[str, object]) -> None:
        await self.inner.delete(dict(locator["inner"]))

    async def health(self) -> dict[str, object]:
        result = await self.inner.health()
        return {**result, "encryption": "AES-256-GCM-CHUNKED-V1"}

    async def scan_history(self):
        async for item in self.inner.scan_history():
            metadata = dict(item["manifest"].get("metadata", {}))
            envelope = json.loads(metadata["encryption_envelope"])
            yield {
                "manifest": item["manifest"],
                "locator": {
                    "inner": item["locator"],
                    "envelope": envelope,
                    "asset_id": item["manifest"]["asset_id"],
                    "original_size": int(metadata["original_size"]),
                    "plaintext_sha256": metadata["plaintext_sha256"],
                },
            }
