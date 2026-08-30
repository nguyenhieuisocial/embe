from __future__ import annotations

import hashlib
import ipaddress
import json
import math
import time
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse


class EntityNotAllowed(ValueError):
    pass


class InvalidSensorState(ValueError):
    pass


@dataclass(frozen=True)
class RoomSample:
    source_id: str
    entity_id: str
    kind: str
    observed_at: datetime
    value: float
    unit: str
    raw_value: str
    raw_unit: str
    quality_flag: str


class HomeAssistantNormalizer:
    def __init__(self, entity_allowlist: dict[str, str]):
        self._allowlist = dict(entity_allowlist)

    @property
    def entity_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._allowlist))

    def normalize_state(self, state: dict) -> RoomSample:
        entity_id = str(state.get("entity_id", ""))
        kind = self._allowlist.get(entity_id)
        if kind not in {"temperature", "humidity"}:
            raise EntityNotAllowed("Home Assistant entity is not allowlisted")

        raw_value = str(state.get("state", ""))
        raw_unit = str(state.get("attributes", {}).get("unit_of_measurement", ""))
        try:
            value = float(raw_value)
        except ValueError as error:
            raise InvalidSensorState("sensor state is not numeric") from error
        if not math.isfinite(value):
            raise InvalidSensorState("sensor state is not finite")

        try:
            observed_at = datetime.fromisoformat(str(state["last_updated"]).replace("Z", "+00:00"))
        except (KeyError, ValueError) as error:
            raise InvalidSensorState("sensor timestamp is invalid") from error
        if observed_at.tzinfo is None:
            raise InvalidSensorState("sensor timestamp must include a timezone")
        observed_at = observed_at.astimezone(timezone.utc)

        if kind == "temperature":
            if raw_unit in {"°F", "F"}:
                value = (value - 32.0) * 5.0 / 9.0
            elif raw_unit not in {"°C", "C"}:
                raise InvalidSensorState("temperature unit is unsupported")
            unit = "°C"
            if not -20 <= value <= 60:
                raise InvalidSensorState("temperature is outside the accepted sensor range")
        else:
            if raw_unit not in {"%", "%RH"} or not 0 <= value <= 100:
                raise InvalidSensorState("humidity is outside the accepted sensor range")
            unit = "%RH"

        source_material = f"{entity_id}\n{observed_at.isoformat()}\n{raw_value}\n{raw_unit}"
        source_id = hashlib.sha256(source_material.encode("utf-8")).hexdigest()
        return RoomSample(
            source_id=source_id,
            entity_id=entity_id,
            kind=kind,
            observed_at=observed_at,
            value=round(value, 4),
            unit=unit,
            raw_value=raw_value,
            raw_unit=raw_unit,
            quality_flag="ok",
        )


class HomeAssistantHistoryClient:
    def __init__(self, base_url: str, token: str, entity_allowlist: set[str], *, request_json=None):
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not self._is_private_host(parsed.hostname or ""):
            raise ValueError("Home Assistant endpoint must be private or loopback")
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        self._allowlist = frozenset(entity_allowlist)
        self._request_json = request_json or self._default_request_json

    def fetch_history(self, start: datetime, end: datetime, entity_ids: list[str]) -> list[dict]:
        if start.tzinfo is None or end.tzinfo is None or start >= end:
            raise ValueError("history window must be timezone-aware and increasing")
        if not entity_ids or any(entity not in self._allowlist for entity in entity_ids):
            raise EntityNotAllowed("Home Assistant history entity is not allowlisted")
        query = urlencode(
            {
                "filter_entity_id": ",".join(entity_ids),
                "end_time": end.astimezone(timezone.utc).isoformat(),
                "minimal_response": "false",
                "no_attributes": "false",
            }
        )
        start_text = start.astimezone(timezone.utc).isoformat()
        payload = self._request_json(
            f"{self._base_url}/api/history/period/{start_text}?{query}",
            self._headers,
        )
        if not isinstance(payload, list) or any(not isinstance(group, list) for group in payload):
            raise InvalidSensorState("Home Assistant history response is malformed")
        return [state for group in payload for state in group if isinstance(state, dict)]

    @staticmethod
    def _is_private_host(host: str) -> bool:
        if host in {"localhost", "home-assistant"} or host.endswith(".home.arpa"):
            return True
        try:
            address = ipaddress.ip_address(host)
            return address.is_private or address.is_loopback
        except ValueError:
            return False

    @staticmethod
    def _default_request_json(url: str, headers: dict[str, str]):
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers=headers, method="GET")
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.loads(response.read())
            except HTTPError as error:
                if error.code in {401, 403}:
                    raise PermissionError("Home Assistant authorization failed") from None
                if error.code < 500 or attempt == 2:
                    raise RuntimeError(f"Home Assistant history request failed with status {error.code}") from None
            except (URLError, TimeoutError, OSError):
                if attempt == 2:
                    raise RuntimeError("Home Assistant history endpoint is unavailable") from None
            time.sleep(float(2**attempt))
        raise RuntimeError("Home Assistant history request failed")
