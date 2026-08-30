from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from embe_storage.crypto import ChunkCipher, EncryptedProvider
from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.local import LocalStorage


@pytest.mark.parametrize("start,end", [(0, 0), (0, 65535), (65530, 130000), (200000, 299999)])
def test_chunk_cipher_round_trip_ranges(tmp_path: Path, start: int, end: int):
    payload = bytes(range(251)) * 1400
    source = tmp_path / "plain.bin"
    encrypted = tmp_path / "cipher.bin"
    source.write_bytes(payload)
    cipher = ChunkCipher(b"m" * 32, chunk_size=65536)
    envelope, _ = cipher.encrypt_file(source, encrypted, "asset-a")
    assert cipher.decrypt_range(encrypted, envelope, "asset-a", start, end) == payload[start : end + 1]


def test_chunk_cipher_fails_closed_on_corruption(tmp_path: Path):
    source = tmp_path / "plain.bin"
    encrypted = tmp_path / "cipher.bin"
    source.write_bytes(b"a" * 100000)
    cipher = ChunkCipher(b"m" * 32, chunk_size=65536)
    envelope, _ = cipher.encrypt_file(source, encrypted, "asset-a")
    data = bytearray(encrypted.read_bytes())
    data[-1] ^= 1
    encrypted.write_bytes(data)
    with pytest.raises(Exception):
        cipher.decrypt_range(encrypted, envelope, "asset-a", 65536, 99999)


@pytest.mark.asyncio
async def test_encrypted_provider_returns_plaintext_range(tmp_path: Path):
    payload = b"private family bytes" * 10000
    source = tmp_path / "source.bin"
    source.write_bytes(payload)
    inner = LocalStorage(tmp_path / "inner")
    provider = EncryptedProvider(inner, ChunkCipher(b"m" * 32, 65536), tmp_path / "temp")
    stored = await provider.put(
        source,
        PutOptions("tenant", "asset-a", "source.bin", "application/octet-stream", hashlib.sha256(payload).hexdigest()),
    )
    result = b"".join([chunk async for chunk in provider.open(stored.locator, ByteRange(10, 99999))])
    assert result == payload[10:100000]
    raw_files = list((tmp_path / "inner").rglob("*.blob"))
    assert raw_files and payload[:100] not in raw_files[0].read_bytes()
