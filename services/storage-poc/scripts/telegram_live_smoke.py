"""Upload, read, range-read and delete an encrypted Telegram canary."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from embe_storage.api import _build_providers
from embe_storage.config import Settings
from embe_storage.live_smoke import run_provider_smoke
from embe_storage.worker import summarize_telegram_health


async def main(output: Path, size_mib: int) -> int:
    settings = Settings.from_env()
    settings.require_lab()
    providers = _build_providers(settings)
    telegram = providers.get("telegram_mtproto_lab")
    if telegram is None:
        raise RuntimeError("Windows Telegram provider is not enabled")

    report: dict[str, object]
    try:
        health = summarize_telegram_health(await telegram.health())
        if not health["provider_ready"]:
            raise RuntimeError("Telegram provider is unavailable")
        result = await run_provider_smoke(
            telegram,
            settings.data_dir / "live-smoke-staging",
            size_bytes=size_mib * 1024 * 1024,
        )
        report = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            **health,
            **result,
            "deleted": True,
            "privacy": "Random canary bytes only; no family content or provider locator is retained.",
        }
    except Exception as error:
        report = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "error_type": type(error).__name__,
            "privacy": "No exception message, credential, locator, or family content is retained.",
        }
    finally:
        inner = getattr(telegram, "inner", telegram)
        client = getattr(inner, "_client", None)
        if client is not None and client.is_connected():
            await client.disconnect()

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    temporary.replace(output)
    print(json.dumps(report, separators=(",", ":")))
    return 0 if report["status"] == "pass" else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size-mib", type=int, default=1, choices=range(1, 21))
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.output, args.size_mib)))
