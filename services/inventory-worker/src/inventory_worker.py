"""Move bounded family inventory actions between Supabase and local Grocy."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ALLOWED_UNITS = {"cái", "gói", "hộp", "ml", "g"}
CATEGORY_GROUPS = {
    "baby": "Bỉm và vệ sinh",
    "nutrition": "Sữa và dinh dưỡng",
    "mother": "Đồ dùng của mẹ",
    "other": None,
}
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


def _request_json(
    url: str,
    method: str,
    headers: dict[str, str],
    body: Any = None,
    *,
    timeout: int = 20,
) -> Any:
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request_headers = {"User-Agent": "EmBe-Inventory/1.0", **headers}
    for attempt, delay in enumerate((0, 1, 2, 4)):
        if delay:
            time.sleep(delay)
        request = Request(url, data=payload, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as error:
            if error.code not in {408, 425, 429, 500, 502, 503, 504} or attempt == 3:
                raise RuntimeError(f"Inventory integration returned HTTP {error.code}") from error
        except (URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                raise RuntimeError("Inventory integration is unavailable") from error
    raise RuntimeError("Inventory request exhausted retry policy")


def _bounded_number(value: Any, *, minimum: float = 0, maximum: float = 100_000) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("invalid inventory number") from error
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValueError("inventory number outside accepted range")
    return number


def _bounded_name(value: Any) -> str:
    name = str(value or "").strip()
    if not 1 <= len(name) <= 80 or CONTROL_CHARACTERS.search(name):
        raise ValueError("invalid inventory name")
    return name


@dataclass(frozen=True)
class InventoryAction:
    id: str
    action_type: str
    product_id: int | None
    name: str | None
    category: str | None
    unit: str | None
    amount: float
    min_amount: float | None

    @classmethod
    def from_raw(cls, value: dict[str, Any]) -> "InventoryAction":
        product_id = value.get("product_id")
        return cls(
            id=str(value.get("id", "")),
            action_type=str(value.get("action_type", "")),
            product_id=int(product_id) if product_id is not None else None,
            name=value.get("name"),
            category=value.get("category"),
            unit=value.get("unit"),
            amount=float(value.get("amount", 0)),
            min_amount=float(value["min_amount"]) if value.get("min_amount") is not None else None,
        )


class SupabaseInventory:
    def __init__(self, base_url: str, secret_key: str):
        if not base_url.startswith("https://") or not secret_key:
            raise ValueError("invalid Supabase inventory configuration")
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json; charset=utf-8",
        }

    def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        return _request_json(f"{self.base_url}/rest/v1/rpc/{name}", "POST", self.headers, body)

    def claim(self, limit: int = 10) -> list[InventoryAction]:
        payload = self._rpc("embe_claim_inventory_actions", {"p_limit": max(1, min(limit, 20))})
        return [InventoryAction.from_raw(item) for item in payload] if isinstance(payload, list) else []

    def complete(self, action_id: str) -> None:
        self._rpc("embe_complete_inventory_action", {"p_id": action_id})

    def fail(self, action_id: str, error_code: str) -> None:
        self._rpc("embe_fail_inventory_action", {"p_id": action_id, "p_error_code": error_code})

    def sync(self, items: list[dict[str, Any]]) -> dict[str, int]:
        result = self._rpc("embe_sync_inventory", {"p_items": items})
        return {
            "upserted": int((result or {}).get("upserted", 0)),
            "retired": int((result or {}).get("retired", 0)),
        }

    def status(self) -> dict[str, int]:
        result = self._rpc("embe_inventory_queue_status", {}) or {}
        return {key: int(result.get(key, 0)) for key in ("pending", "processing", "dead_letters")}


class GrocyInventory:
    def __init__(self, base_url: str, api_key: str, *, request_json: Any = None):
        parsed = urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "grocy"}:
            raise ValueError("Grocy inventory endpoint must stay private")
        if not api_key:
            raise ValueError("Grocy API key is missing")
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "GROCY-API-KEY": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
        }
        self.request_json = request_json or _request_json

    def _get(self, path: str) -> Any:
        return self.request_json(f"{self.base_url}{path}", "GET", self.headers)

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        return self.request_json(f"{self.base_url}{path}", "POST", self.headers, body)

    def list_objects(self, entity: str) -> list[dict[str, Any]]:
        if entity not in {"products", "quantity_units", "locations", "product_groups"}:
            raise ValueError("Grocy entity is not allowlisted")
        payload = self._get(f"/api/objects/{quote(entity)}")
        if payload is None:
            return []
        if not isinstance(payload, list) or any(not isinstance(item, dict) for item in payload):
            raise RuntimeError("Grocy object response is malformed")
        return payload

    def snapshot(self) -> list[dict[str, Any]]:
        products = self.list_objects("products")
        units = {int(item["id"]): str(item["name"]) for item in self.list_objects("quantity_units")}
        details = {
            int(product["id"]): self._get(f"/api/stock/products/{int(product['id'])}")
            for product in products
            if int(product.get("active", 1)) == 1
        }
        return build_snapshot(products, details, units)

    def create_item(self, *, name: str, category: str, unit: str, amount: float, min_amount: float) -> None:
        name = _bounded_name(name)
        amount = _bounded_number(amount)
        min_amount = _bounded_number(min_amount)
        if category not in CATEGORY_GROUPS or unit not in ALLOWED_UNITS:
            raise ValueError("invalid inventory category or unit")

        products = self.list_objects("products")
        if any(str(product.get("name", "")).strip().casefold() == name.casefold() for product in products):
            raise ValueError("inventory item already exists")
        locations = {str(item.get("name")): int(item["id"]) for item in self.list_objects("locations")}
        units = {str(item.get("name")): int(item["id"]) for item in self.list_objects("quantity_units")}
        groups = {str(item.get("name")): int(item["id"]) for item in self.list_objects("product_groups")}
        if "Vật tư em bé" not in locations or unit not in units:
            raise RuntimeError("Grocy master data is incomplete")
        group_name = CATEGORY_GROUPS[category]
        group_id = groups.get(group_name) if group_name else None

        created = self._post(
            "/api/objects/products",
            {
                "name": name,
                "description": "",
                "location_id": locations["Vật tư em bé"],
                "qu_id_purchase": units[unit],
                "qu_id_stock": units[unit],
                "product_group_id": group_id,
                "min_stock_amount": min_amount,
                "default_best_before_days": 0,
                "default_best_before_days_after_open": 0,
                "enable_tare_weight_handling": 0,
                "not_check_stock_fulfillment_for_recipes": 1,
                "treat_opened_as_out_of_stock": 0,
            },
        )
        if not isinstance(created, dict):
            raise RuntimeError("Grocy create response is malformed")
        product_id = int(created.get("created_object_id", 0))
        if product_id <= 0:
            raise RuntimeError("Grocy create response is malformed")
        if amount > 0:
            self.set_amount(product_id, amount)

    def set_amount(self, product_id: int, amount: float) -> None:
        if product_id <= 0:
            raise ValueError("invalid Grocy product id")
        amount = _bounded_number(amount)
        self._post(
            f"/api/stock/products/{product_id}/inventory",
            {"new_amount": amount, "best_before_date": "2999-12-31", "note": "EmBe family portal"},
        )


def build_snapshot(
    products: list[dict[str, Any]],
    details: dict[int, dict[str, Any]],
    units: dict[int, str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for product in products:
        if int(product.get("active", 1)) != 1:
            continue
        try:
            product_id = int(product["id"])
            name = _bounded_name(product.get("name"))
            unit = units[int(product["qu_id_stock"])]
            if unit not in ALLOWED_UNITS:
                continue
            quantity = _bounded_number(details[product_id].get("stock_amount", 0))
            minimum = _bounded_number(product.get("min_stock_amount", 0))
        except (KeyError, TypeError, ValueError):
            continue
        result.append(
            {
                "source_product_id": product_id,
                "name": name,
                "quantity": quantity,
                "unit": unit,
                "min_quantity": minimum,
                "needs_restock": quantity <= minimum,
            }
        )
    return sorted(result, key=lambda item: (not item["needs_restock"], item["name"].casefold()))


def process_actions(queue: Any, grocy: Any) -> dict[str, int]:
    actions = queue.claim(limit=10)
    completed = 0
    failed = 0
    for action in actions:
        try:
            if action.action_type == "create":
                if action.product_id is not None or action.name is None or action.category is None or action.unit is None:
                    raise ValueError("invalid create action")
                grocy.create_item(
                    name=_bounded_name(action.name),
                    category=action.category,
                    unit=action.unit,
                    amount=_bounded_number(action.amount),
                    min_amount=_bounded_number(action.min_amount),
                )
            elif action.action_type == "set_amount":
                if action.product_id is None or action.product_id <= 0:
                    raise ValueError("invalid set amount action")
                grocy.set_amount(action.product_id, _bounded_number(action.amount))
            else:
                raise ValueError("unknown inventory action")
            queue.complete(action.id)
            completed += 1
        except ValueError:
            queue.fail(action.id, "invalid_payload")
            failed += 1
        except Exception:
            queue.fail(action.id, "grocy_unavailable")
            failed += 1
    return {"claimed": len(actions), "completed": completed, "failed": failed}


def _read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if raw_line and not raw_line.startswith("#") and "=" in raw_line:
            key, value = raw_line.split("=", 1)
            values[key] = value
    return values


def _write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def read_dpapi_clixml(path: Path, *, decryptor: Callable[[bytes], bytes] | None = None) -> str:
    """Read a current-user DPAPI SecureString export without launching PowerShell."""
    root = ET.parse(path).getroot()
    node = next((item for item in root.iter() if item.tag.endswith("SS")), None)
    if node is None or not node.text:
        raise ValueError("DPAPI credential is malformed")
    try:
        encrypted = bytes.fromhex(node.text.strip())
    except ValueError as error:
        raise ValueError("DPAPI credential is malformed") from error
    if decryptor is None:
        if os.name != "nt":
            raise RuntimeError("Windows DPAPI is required")
        import win32crypt

        decryptor = lambda value: win32crypt.CryptUnprotectData(value, None, None, None, 0)[1]
    secret = decryptor(encrypted).decode("utf-16-le")
    if not secret or not secret.isprintable():
        raise ValueError("DPAPI credential is invalid")
    return secret


def run(env_path: Path, api_key: str | None = None) -> dict[str, Any]:
    env = _read_env(env_path)
    queue = SupabaseInventory(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    grocy = GrocyInventory("http://127.0.0.1:9283", api_key or os.environ.get("GROCY_API_KEY", ""))
    actions = process_actions(queue, grocy)
    snapshot = grocy.snapshot()
    synced = queue.sync(snapshot)
    return {"status": "ok", "items": len(snapshot), "actions": actions, "sync": synced, "queue": queue.status()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Process EmBe inventory actions and publish a safe Grocy snapshot.")
    parser.add_argument("--env", type=Path, default=Path(r"C:\EmBe\secrets\runtime\portal-sync.env"))
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\inventory-worker.json"))
    parser.add_argument("--grocy-credential", type=Path)
    args = parser.parse_args()
    attempted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        api_key = read_dpapi_clixml(args.grocy_credential) if args.grocy_credential else None
        result = run(args.env, api_key)
        _write_status(args.status, {**result, "last_attempt_at": attempted_at, "last_success_at": attempted_at})
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        _write_status(args.status, {"status": "error", "last_attempt_at": attempted_at, "error_type": type(error).__name__})
        print("Inventory worker failed; see the local status file.", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
