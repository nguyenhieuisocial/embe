from __future__ import annotations

import base64

import pytest

from embe_storage.manifest import decode_manifest, encode_manifest
from embe_storage.provider import ProviderError
from embe_storage.retry import with_backoff


def test_manifest_is_signed_and_tamper_evident():
    value = encode_manifest({"asset_id": "a", "size": 3}, b"k" * 32)
    assert decode_manifest(value, b"k" * 32)["asset_id"] == "a"
    prefix, encoded = value.split(".", 1)
    raw = bytearray(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    raw[-1] ^= 1
    tampered = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    with pytest.raises(ValueError, match="signature"):
        decode_manifest(f"{prefix}.{tampered}", b"k" * 32)


@pytest.mark.asyncio
async def test_retry_honors_server_wait_without_rotating_identity():
    calls = 0
    waits = []

    async def operation():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise ProviderError("flood_wait", "wait", retry_after=2)
        return "ok"

    async def fake_sleep(seconds: float):
        waits.append(seconds)

    assert await with_backoff(operation, sleep=fake_sleep) == "ok"
    assert calls == 3
    assert all(wait >= 2 for wait in waits)
