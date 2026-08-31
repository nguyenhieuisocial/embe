from __future__ import annotations

import base64
import json

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

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


def test_encrypted_recovery_manifest_fits_telegram_caption():
    payload = {
        "asset_id": "00000000-0000-4000-8000-000000000000",
        "tenant_hash": "a" * 16,
        "name_hash": "b" * 16,
        "size": 1_048_576,
        "sha256": "c" * 64,
        "encrypted": True,
        "tenant_id": "storage-poc-lab",
        "logical_name": "telegram-pipeline-smoke.bin",
        "media_type": "application/octet-stream",
        "metadata": {
            "owner_id": "storage-poc-operator",
            "sensitivity": "family",
            "encrypted": "true",
            "encryption_envelope": '{"chunk_size":1048576,"key_version":"poc-v1","nonce_prefix":"xxxxxxxxxxxx","wrap_nonce":"xxxxxxxxxxxxxxxx","wrapped_dek":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
            "original_size": "1048576",
            "plaintext_sha256": "d" * 64,
        },
        "version": 1,
    }

    value = encode_manifest(payload, b"k" * 32)

    assert len(value) <= 1024
    assert decode_manifest(value, b"k" * 32) == payload


def test_decoder_keeps_v2_recovery_compatibility():
    payload = {"asset_id": "legacy", "size": 3}
    prefix = "EMBE-POC-MANIFEST-V2"
    nonce = b"n" * 12
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    encrypted = AESGCM(b"k" * 32).encrypt(nonce, body, prefix.encode())
    encoded = base64.urlsafe_b64encode(nonce + encrypted).decode().rstrip("=")

    assert decode_manifest(f"{prefix}.{encoded}", b"k" * 32) == payload


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
