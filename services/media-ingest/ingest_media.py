from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".mov", ".mp4",
    ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class MediaStoragePolicy:
    system_drive: str
    target_drive: str
    free_bytes: int
    total_bytes: int = 0
    allow_same_drive_for_tests: bool = False

    @classmethod
    def for_tests(cls) -> "MediaStoragePolicy":
        return cls("C", "T", 10**12, 10**12, True)

    def validate(self, incoming_bytes: int) -> None:
        if not self.allow_same_drive_for_tests and self.system_drive.casefold() == self.target_drive.casefold():
            raise RuntimeError("a separate media drive is required")
        projected_free = self.free_bytes - incoming_bytes
        if self.total_bytes <= 0 or projected_free / self.total_bytes < 0.25:
            raise RuntimeError("the media drive must retain at least 25% headroom")


def _supported_files(source: Path) -> list[Path]:
    return sorted(
        path for path in source.rglob("*")
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def ingest(
    source: Path,
    target: Path,
    *,
    apply: bool,
    policy: MediaStoragePolicy,
) -> dict[str, Any]:
    source = source.resolve()
    target = target.resolve()
    if not source.is_dir():
        raise RuntimeError("media source directory is missing")
    if target == source or source in target.parents:
        raise RuntimeError("media target must stay outside the import source")

    entries = []
    for path in _supported_files(source):
        checksum = _sha256(path)
        entries.append(
            {
                "source": str(path),
                "name": path.name,
                "size": path.stat().st_size,
                "sha256": checksum,
                "relative_object": f"objects/{checksum[:2]}/{checksum}{path.suffix.lower()}",
            }
        )

    if not apply:
        return {"status": "dry-run", "planned": len(entries), "copied": 0, "unchanged": 0}

    policy.validate(sum(entry["size"] for entry in entries))
    staging = target / ".staging"
    copied = 0
    unchanged = 0
    for entry in entries:
        destination = target / entry["relative_object"]
        if destination.exists():
            if _sha256(destination) != entry["sha256"]:
                raise RuntimeError("existing media object failed checksum verification")
            unchanged += 1
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging.mkdir(parents=True, exist_ok=True)
        partial = staging / f"{uuid.uuid4().hex}.partial"
        try:
            shutil.copy2(entry["source"], partial)
            if _sha256(partial) != entry["sha256"]:
                raise RuntimeError("staged media failed checksum verification")
            os.replace(partial, destination)
            copied += 1
        finally:
            partial.unlink(missing_ok=True)

    manifest = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_retained": True,
        "entries": entries,
    }
    manifest_dir = target / "manifests"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex}.json"
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, manifest_path)
    return {
        "status": "ok",
        "planned": len(entries),
        "copied": copied,
        "unchanged": unchanged,
        "manifest": str(manifest_path),
    }


def _nearest_existing(path: Path) -> Path:
    current = path.resolve()
    while not current.exists() and current.parent != current:
        current = current.parent
    return current


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fail-closed EmBe media import; dry-run by default.")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    target_drive = args.target.resolve().drive.rstrip(":")
    system_drive = Path(os.environ.get("SystemDrive", "C:")).drive.rstrip(":")
    usage = shutil.disk_usage(_nearest_existing(args.target))
    policy = MediaStoragePolicy(system_drive, target_drive, usage.free, usage.total)
    result = ingest(args.source, args.target, apply=args.apply, policy=policy)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
