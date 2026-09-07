from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Protocol

MAX_IMAGE_BYTES = 10_000_000


class AssetUnavailable(RuntimeError):
    pass


class AssetSource(Protocol):
    def read(self, asset_id: str) -> bytes: ...


class EditorialAssets:
    """Only generated, provenance-recorded graphics; no family-data adapter."""

    def __init__(self, manifest: Path):
        self.root = manifest.resolve().parent
        if manifest.stat().st_size > 1_000_000:
            raise ValueError("manifest_too_large")
        self.items = json.loads(manifest.read_text(encoding="utf-8"))

    def read(self, asset_id: str) -> bytes:
        item = self.items.get(asset_id)
        if not isinstance(item, dict) or item.get("provenance") != "embe_educational_layout":
            raise AssetUnavailable("editorial_asset_not_registered")
        name = item.get("file", "")
        if not re.fullmatch(r"[0-9a-f-]{36}\.png", name):
            raise AssetUnavailable("invalid_editorial_asset")
        path = self.root / name
        if path.is_symlink() or not path.resolve().is_relative_to(self.root) or not path.is_file() or path.stat().st_size > MAX_IMAGE_BYTES:
            raise AssetUnavailable("invalid_editorial_asset")
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != item.get("checksum_sha256"):
            raise AssetUnavailable("asset_checksum_mismatch")
        return body
