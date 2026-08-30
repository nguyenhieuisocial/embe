from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "EMBE-POC-MANIFEST-V2"


def encode_manifest(payload: dict[str, Any], signing_key: bytes) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    nonce = os.urandom(12)
    encrypted = AESGCM(signing_key).encrypt(nonce, body, PREFIX.encode())
    encoded = base64.urlsafe_b64encode(nonce + encrypted).decode().rstrip("=")
    return f"{PREFIX}.{encoded}"


def decode_manifest(value: str, signing_key: bytes) -> dict[str, Any]:
    prefix, encoded = value.split(".", 1)
    if prefix != PREFIX:
        raise ValueError("unknown manifest")
    padded = encoded + "=" * (-len(encoded) % 4)
    raw = base64.urlsafe_b64decode(padded)
    if len(raw) < 29:
        raise ValueError("invalid encrypted manifest")
    try:
        body = AESGCM(signing_key).decrypt(raw[:12], raw[12:], PREFIX.encode())
    except Exception as error:
        raise ValueError("invalid manifest signature") from error
    return json.loads(body)
