from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

from .http_client import request_json as default_request_json
from .http_client import validate_private_base_url


class GrocyEventRejected(ValueError):
    pass


@dataclass(frozen=True)
class StockMovementFact:
    source_id: str
    item_id: str
    observed_at: datetime
    quantity: float
    unit: str
    raw_value: str
    raw_unit: str
    quality_flag: str = "ok"


class GrocyNormalizer:
    RESOURCES = ("stock_movement",)

    def __init__(self, product_allowlist: dict[int, tuple[str, str]]):
        self._products = {
            int(product_id): (alias, unit)
            for product_id, (alias, unit) in product_allowlist.items()
            if alias and unit
        }
        if not self._products:
            raise ValueError("Grocy product allowlist must not be empty")

    def normalize(self, resource: str, event: dict) -> StockMovementFact:
        if resource not in self.RESOURCES:
            raise GrocyEventRejected("Grocy resource is not allowlisted")
        try:
            item_id, allowed_unit = self._products[int(event.get("product_id"))]
        except (TypeError, ValueError, KeyError) as error:
            raise GrocyEventRejected("Grocy product is not allowlisted") from error

        event_id = str(event.get("id", "")).strip()
        if not event_id or len(event_id) > 128:
            raise GrocyEventRejected("Grocy movement id is invalid")
        raw_unit = str(event.get("unit", allowed_unit)).strip()
        if raw_unit != allowed_unit:
            raise GrocyEventRejected("Grocy movement unit does not match the allowlist")
        raw_quantity = event.get("amount")
        try:
            quantity = float(raw_quantity)
        except (TypeError, ValueError) as error:
            raise GrocyEventRejected("Grocy movement amount is invalid") from error
        if not math.isfinite(quantity) or quantity == 0 or abs(quantity) > 1_000_000:
            raise GrocyEventRejected("Grocy movement amount is outside the accepted range")
        try:
            observed_at = datetime.fromisoformat(
                str(event.get("row_created_timestamp", event.get("created_at"))).replace("Z", "+00:00")
            )
        except ValueError as error:
            raise GrocyEventRejected("Grocy movement timestamp is invalid") from error
        if observed_at.tzinfo is None:
            raise GrocyEventRejected("Grocy movement timestamp must include a timezone")

        return StockMovementFact(
            source_id=f"grocy:stock_movement:{event_id}",
            item_id=item_id,
            observed_at=observed_at.astimezone(timezone.utc),
            quantity=quantity,
            unit=allowed_unit,
            raw_value=str(raw_quantity).strip(),
            raw_unit=raw_unit,
        )


class GrocyApiClient:
    _ENDPOINTS = {"stock_movement": "/api/stock/transactions"}

    def __init__(self, base_url: str, api_key: str, *, request_json=None):
        if not api_key:
            raise ValueError("Grocy API key must not be empty")
        self._base_url = validate_private_base_url(base_url, {"grocy"})
        self._headers = {"GROCY-API-KEY": api_key, "Accept": "application/json"}
        self._request_json = request_json or default_request_json
        self._snapshot = None

    def fetch_page(self, resource: str, cursor=None, page_size: int = 100) -> dict:
        endpoint = self._ENDPOINTS.get(resource)
        if endpoint is None:
            raise ValueError("Grocy resource is not allowlisted")
        try:
            offset = 0 if cursor is None else int(cursor)
        except (TypeError, ValueError) as error:
            raise ValueError("Grocy pagination cursor is invalid") from error
        if offset < 0:
            raise ValueError("Grocy pagination cursor is invalid")
        if offset == 0:
            payload = self._request_json(f"{self._base_url}{endpoint}", self._headers)
            if not isinstance(payload, list) or any(not isinstance(item, dict) for item in payload):
                raise ValueError("Grocy API response is malformed")
            self._snapshot = payload
        elif self._snapshot is None:
            raise ValueError("Grocy pagination cursor has no active snapshot")

        items = self._snapshot[offset : offset + page_size]
        next_offset = offset + len(items)
        next_cursor = str(next_offset) if next_offset < len(self._snapshot) else None
        if next_cursor is None:
            self._snapshot = None
        return {"items": items, "next": next_cursor}

    def discover_ids(self) -> list[int]:
        payload = self._request_json(f"{self._base_url}/api/objects/products", self._headers)
        if not isinstance(payload, list):
            raise ValueError("Grocy products response is malformed")
        identifiers = set()
        for item in payload:
            if not isinstance(item, dict):
                continue
            try:
                identifier = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            if identifier > 0:
                identifiers.add(identifier)
        return sorted(identifiers)
