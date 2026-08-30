from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import statistics
import time
import uuid
from pathlib import Path

from embe_storage.api import _build_providers
from embe_storage.config import Settings
from embe_storage.provider import ByteRange, PutOptions, StorageProvider
from embe_storage.providers.local import LocalStorage
from embe_storage.cache import BoundedFileCache, CachedProvider

DEFAULT_SIZES = [
    1 * 1024**2,
    20 * 1024**2,
    100 * 1024**2,
    500 * 1024**2,
    1 * 1024**3,
    2 * 1024**3,
    3_900_000_000,
]


def generate_synthetic(path: Path, size: int) -> str:
    """Generate deterministic incompressible-enough blocks without keeping them in memory."""
    digest = hashlib.sha256()
    remaining = size
    counter = 0
    with path.open("xb") as writer:
        while remaining:
            seed = hashlib.sha256(f"embe-storage-poc:{counter}".encode()).digest()
            block = (seed * (1024 * 1024 // len(seed) + 1))[: min(1024 * 1024, remaining)]
            writer.write(block)
            digest.update(block)
            remaining -= len(block)
            counter += 1
    return digest.hexdigest()


async def benchmark_provider(provider: StorageProvider, root: Path, sizes: list[int]) -> list[dict[str, object]]:
    results = []
    root.mkdir(parents=True, exist_ok=True)
    for size in sizes:
        if provider.capabilities.max_object_bytes and size > provider.capabilities.max_object_bytes:
            results.append({"provider": provider.name, "size_bytes": size, "status": "not_supported"})
            continue
        path = root / f"synthetic-{size}.bin"
        sha256 = await asyncio.to_thread(generate_synthetic, path, size)
        asset_id = str(uuid.uuid4())
        options = PutOptions("benchmark", asset_id, path.name, "application/octet-stream", sha256)
        started = time.perf_counter()
        try:
            stored = await provider.put(path, options)
            upload_seconds = time.perf_counter() - started
            started = time.perf_counter()
            first_at = None
            downloaded = 0
            async for chunk in provider.open(stored.locator):
                if first_at is None:
                    first_at = time.perf_counter()
                downloaded += len(chunk)
            download_seconds = time.perf_counter() - started
            range_latencies = []
            for offset in (0, max(0, size // 2), max(0, size - 65536)):
                r_started = time.perf_counter()
                async for _ in provider.open(stored.locator, ByteRange(offset, min(size - 1, offset + 65535))):
                    pass
                range_latencies.append((time.perf_counter() - r_started) * 1000)
            concurrent_span = min(size, 8 * 1024**2)

            async def read_window(window: int) -> int:
                offset = min(max(0, size - concurrent_span), window * max(1, size // 4))
                total = 0
                async for part in provider.open(
                    stored.locator,
                    ByteRange(offset, min(size - 1, offset + concurrent_span - 1)),
                ):
                    total += len(part)
                return total

            concurrent_started = time.perf_counter()
            concurrent_bytes = sum(await asyncio.gather(*(read_window(index) for index in range(4))))
            concurrent_seconds = time.perf_counter() - concurrent_started
            results.append(
                {
                    "provider": provider.name,
                    "size_bytes": size,
                    "status": "measured",
                    "upload_mib_s": size / 1024**2 / upload_seconds,
                    "download_mib_s": downloaded / 1024**2 / download_seconds,
                    "ttfb_ms": ((first_at - started) * 1000) if first_at else None,
                    "range_p50_ms": statistics.median(range_latencies),
                    "concurrency_4_mib_s": concurrent_bytes / 1024**2 / concurrent_seconds,
                    "cache": dict(getattr(getattr(provider, "cache", None), "metrics", None).__dict__)
                    if getattr(provider, "cache", None)
                    else None,
                }
            )
            await provider.delete(stored.locator)
        except Exception as error:
            results.append(
                {"provider": provider.name, "size_bytes": size, "status": "failed", "error": type(error).__name__}
            )
        finally:
            path.unlink(missing_ok=True)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--provider",
        choices=["local", "r2", "s3", "telegram_mtproto_lab"],
        default="local",
    )
    parser.add_argument("--data-dir", default=r"C:\EmBe\data\storage-poc\benchmark")
    parser.add_argument("--max-size-mib", type=int, default=2048)
    parser.add_argument("--cache-max-mib", type=int, default=0)
    parser.add_argument("--include-3-9gb", action="store_true")
    args = parser.parse_args()
    sizes = DEFAULT_SIZES if args.include_3_9gb else DEFAULT_SIZES[:-1]
    sizes = [size for size in sizes if size <= args.max_size_mib * 1024**2]
    if args.dry_run:
        payload = {
            "status": "skipped",
            "sizes": sizes,
            "note": "Dry-run creates no large files and performs no network calls.",
        }
    else:
        root = Path(args.data_dir)
        if args.provider == "local":
            provider = LocalStorage(root / "objects")
        else:
            settings = Settings.from_env()
            settings.require_lab()
            providers = _build_providers(settings)
            if args.provider not in providers:
                raise RuntimeError(f"{args.provider} is not configured for this isolated lab")
            provider = providers[args.provider]
        if args.cache_max_mib:
            provider = CachedProvider(
                provider,
                BoundedFileCache(root / "cache", args.cache_max_mib * 1024**2),
            )
        payload = {
            "status": "measured",
            "environment": {"provider": args.provider, "python": os.sys.version.split()[0]},
            "results": asyncio.run(benchmark_provider(provider, root / "synthetic", sizes)),
        }
    Path(args.output).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
