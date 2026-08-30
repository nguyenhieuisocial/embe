"""Idempotently create EmBe Uptime Kuma monitors without persisting credentials."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def desired_monitors() -> list[dict]:
    return [
        {"type": "http", "name": "EmBe Portal", "url": "https://embe.hieu.asia/", "interval": 60},
        {"type": "http", "name": "BabyBuddy", "url": "http://babybuddy:8000/", "interval": 60},
        {"type": "http", "name": "Memos", "url": "http://memos:5230/", "interval": 60},
        {"type": "http", "name": "Grocy", "url": "http://grocy/", "interval": 60},
        {"type": "http", "name": "Node-RED", "url": "http://node-red:1880/", "interval": 60},
        {
            "type": "http",
            "name": "Ollama local AI",
            "url": "http://host.docker.internal:11434/api/tags",
            "interval": 120,
        },
    ]


def reconcile_monitors(api, monitors: list[dict]) -> dict:
    existing_by_name = {str(item.get("name")): item for item in api.get_monitors()}
    result = {"created": [], "existing": []}
    for monitor in monitors:
        if monitor["name"] in existing_by_name:
            result["existing"].append(monitor["name"])
            continue
        api.add_monitor(**monitor)
        result["created"].append(monitor["name"])
    return result


class KumaMonitorClient:
    def __init__(self, api, monitor_type):
        self.api = api
        self.monitor_type = monitor_type

    def get_monitors(self):
        return self.api.get_monitors()

    def add_monitor(self, **monitor):
        payload = dict(monitor)
        payload["type"] = self.monitor_type.HTTP
        return self.api.add_monitor(**payload)


def write_status(path: Path, result: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "status": "ok",
        "created_count": len(result["created"]),
        "existing_count": len(result["existing"]),
        "monitor_count": len(result["created"]) + len(result["existing"]),
        "privacy": "No credential, response body, or family content is stored.",
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Create the minimal private EmBe monitor set")
    parser.add_argument("--url", default="http://127.0.0.1:3001")
    parser.add_argument("--allow-initial-setup", action="store_true")
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\uptime-kuma-bootstrap.json"))
    args = parser.parse_args(argv)

    username = os.environ.get("EMBE_KUMA_USERNAME", "")
    password = os.environ.get("EMBE_KUMA_PASSWORD", "")
    if not username or not password:
        parser.error("EMBE_KUMA_USERNAME and EMBE_KUMA_PASSWORD are required")

    try:
        from uptime_kuma_api import MonitorType, UptimeKumaApi
    except ImportError as exc:
        raise SystemExit("Install scripts/health/requirements.txt in the project virtual environment") from exc

    with UptimeKumaApi(args.url) as raw_api:
        if raw_api.need_setup():
            if not args.allow_initial_setup:
                raise SystemExit("Uptime Kuma requires initial setup; rerun with --allow-initial-setup")
            raw_api.setup(username, password)
        raw_api.login(username, password)
        result = reconcile_monitors(KumaMonitorClient(raw_api, MonitorType), desired_monitors())

    write_status(args.status, result)
    print(json.dumps({"status": "ok", "created_count": len(result["created"]), "existing_count": len(result["existing"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
