from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path


ENTITY_MAP = {
    "locations": "locations",
    "quantity_units": "quantity_units",
    "product_groups": "product_groups",
}


class GrocyClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {"GROCY-API-KEY": api_key, "Accept": "application/json"}

    def list(self, entity: str) -> list[dict]:
        request = urllib.request.Request(f"{self.base_url}/api/objects/{entity}", headers=self.headers)
        with urllib.request.urlopen(request, timeout=10) as response:
            value = json.load(response)
        if not isinstance(value, list):
            raise RuntimeError("Grocy returned an invalid list")
        return value

    def create(self, entity: str, item: dict) -> None:
        headers = {**self.headers, "Content-Type": "application/json"}
        request = urllib.request.Request(
            f"{self.base_url}/api/objects/{entity}",
            data=json.dumps({**item, "active": 1}, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10):
            return


def load_master_data(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != 1:
        raise ValueError("unsupported Grocy master-data schema")
    for section in ENTITY_MAP:
        items = value.get(section)
        if not isinstance(items, list) or any(not str(item.get("name", "")).strip() for item in items):
            raise ValueError(f"invalid Grocy section: {section}")
        names = [item["name"].casefold() for item in items]
        if len(names) != len(set(names)):
            raise ValueError(f"duplicate names in Grocy section: {section}")
    return value


def apply_master_data(client, master_data: dict) -> dict[str, int]:
    result = {"created": 0, "unchanged": 0}
    for section, entity in ENTITY_MAP.items():
        existing = {str(item.get("name", "")).casefold() for item in client.list(entity)}
        for item in master_data[section]:
            if item["name"].casefold() in existing:
                result["unchanged"] += 1
                continue
            client.create(entity, item)
            existing.add(item["name"].casefold())
            result["created"] += 1
    return result


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Seed safe Grocy master data without stock quantities")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:9283")
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    master_data = load_master_data(args.data)
    planned = sum(len(master_data[section]) for section in ENTITY_MAP)
    if not args.apply:
        print(json.dumps({"status": "dry-run", "planned": planned}))
        return 0
    api_key = os.environ.get("GROCY_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("GROCY_API_KEY is required for --apply")
    try:
        result = apply_master_data(GrocyClient(args.base_url, api_key), master_data)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Grocy API request failed with status {error.code}") from None
    print(json.dumps({"status": "ok", **result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
