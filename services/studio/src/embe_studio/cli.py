from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from .api import create_app
from .assets import EditorialAssets
from .repository import Repository
from .worker import run_once


def main():
    parser = argparse.ArgumentParser(description="EmBe Mẹ Bầu editorial drafts; no social publishing.")
    parser.add_argument("command", choices=["campaign", "serve", "worker-once", "worker"])
    parser.add_argument("--root", type=Path, default=Path(r"C:\EmBe\data\studio"))
    parser.add_argument("--port", type=int, default=8794)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--illustration", type=Path)
    parser.add_argument("--render-count", type=int, default=0)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    if args.command == "campaign":
        from .campaign import build_campaign
        if not args.catalog:
            parser.error("campaign requires --catalog")
        print(json.dumps(build_campaign(args.catalog, args.root, args.illustration, args.render_count, args.full), ensure_ascii=False))
        return
    if os.getenv("EMBE_STUDIO_ENABLED") != "true":
        raise SystemExit("Studio is disabled; set EMBE_STUDIO_ENABLED=true only for an explicitly configured instance.")
    if args.command == "serve":
        import uvicorn
        uvicorn.run(create_app(args.root, os.getenv("EMBE_STUDIO_TOKEN", "")), host="127.0.0.1", port=args.port,
                    access_log=False, log_level="warning")
        return
    if not args.manifest:
        parser.error("worker requires --manifest")
    source = EditorialAssets(args.manifest)
    repository = Repository(args.root)
    font = Path(os.environ["EMBE_STUDIO_FONT"]) if os.getenv("EMBE_STUDIO_FONT") else None
    while True:
        result = run_once(repository, source, font_path=font)
        print(json.dumps(result, ensure_ascii=False))
        if args.command == "worker-once":
            return
        time.sleep(3 if result["status"] == "completed" else 15)


if __name__ == "__main__":
    main()
