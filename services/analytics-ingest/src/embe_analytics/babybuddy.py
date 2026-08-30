from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from .http_client import request_json as default_request_json
from .http_client import validate_private_base_url, validate_same_origin_url


class BabyBuddyEventRejected(ValueError):
    pass


@dataclass(frozen=True)
class SleepFact:
    source_id: str
    child_id: str
    observed_at: datetime
    ended_at: datetime
    duration_seconds: int
    raw_value: str
    raw_unit: str = "seconds"
    quality_flag: str = "ok"


@dataclass(frozen=True)
class FeedingFact:
    source_id: str
    child_id: str
    observed_at: datetime
    value_milliliters: float
    raw_value: str
    raw_unit: str
    quality_flag: str = "ok"


@dataclass(frozen=True)
class DiaperFact:
    source_id: str
    child_id: str
    observed_at: datetime
    diaper_type: str
    raw_value: str
    raw_unit: str = "event"
    quality_flag: str = "ok"


@dataclass(frozen=True)
class GrowthFact:
    source_id: str
    child_id: str
    observed_at: datetime
    measure: str
    value: float
    unit: str
    raw_value: str
    raw_unit: str
    quality_flag: str = "ok"


class BabyBuddyNormalizer:
    RESOURCES = ("sleep", "feeding", "diaper", "weight", "height")
    _DIAPER_TYPES = {"wet", "solid", "both", "dry"}

    def __init__(self, child_allowlist: dict[int, str], source_units: dict[str, str] | None = None):
        self._children = {int(source_id): alias for source_id, alias in child_allowlist.items() if alias}
        if not self._children:
            raise ValueError("BabyBuddy child allowlist must not be empty")
        self._source_units = {"feeding": "mL", "weight": "kg", "height": "cm"}
        if source_units:
            self._source_units.update(source_units)

    def normalize(self, resource: str, event: dict):
        if resource not in self.RESOURCES:
            raise BabyBuddyEventRejected("BabyBuddy resource is not allowlisted")
        child_id = self._child_alias(event.get("child"))
        event_id = self._identifier(event.get("id"))

        if resource == "sleep":
            start = self._timestamp(event.get("start"))
            end = self._timestamp(event.get("end"))
            seconds = int((end - start).total_seconds())
            if seconds <= 0 or seconds > 24 * 60 * 60:
                raise BabyBuddyEventRejected("sleep duration is outside the accepted range")
            return SleepFact(
                source_id=f"babybuddy:sleep:{event_id}",
                child_id=child_id,
                observed_at=start,
                ended_at=end,
                duration_seconds=seconds,
                raw_value=str(seconds),
            )

        if resource == "feeding":
            observed_at = self._timestamp(event.get("start", event.get("time")))
            raw_value = self._number(event.get("amount"), minimum=0, maximum=5000, exclusive_minimum=True)
            raw_unit = str(event.get("unit", "mL")).strip()
            if raw_unit in {"mL", "ml"}:
                milliliters = raw_value
            elif raw_unit in {"fl oz", "oz"}:
                milliliters = raw_value * 29.5735
            else:
                raise BabyBuddyEventRejected("feeding unit is unsupported")
            return FeedingFact(
                source_id=f"babybuddy:feeding:{event_id}",
                child_id=child_id,
                observed_at=observed_at,
                value_milliliters=round(milliliters, 4),
                raw_value=self._raw_number(event.get("amount")),
                raw_unit=raw_unit,
            )

        if resource == "diaper":
            observed_at = self._timestamp(event.get("time", event.get("start")))
            diaper_type = str(event.get("type", "")).strip().lower()
            if not diaper_type and ("wet" in event or "solid" in event):
                wet = bool(event.get("wet"))
                solid = bool(event.get("solid"))
                diaper_type = "both" if wet and solid else "wet" if wet else "solid" if solid else "dry"
            if diaper_type not in self._DIAPER_TYPES:
                raise BabyBuddyEventRejected("diaper type is unsupported")
            return DiaperFact(
                source_id=f"babybuddy:diaper:{event_id}",
                child_id=child_id,
                observed_at=observed_at,
                diaper_type=diaper_type,
                raw_value=diaper_type,
            )

        observed_at = self._timestamp(event.get("date", event.get("time")))
        source_value = event.get(resource, event.get("value"))
        raw_value = self._number(source_value, minimum=0, maximum=1000, exclusive_minimum=True)
        raw_unit = str(event.get("unit", self._source_units[resource])).strip()
        if resource == "weight":
            if raw_unit == "g":
                value = raw_value
            elif raw_unit == "kg":
                value = raw_value * 1000
            elif raw_unit == "lb":
                value = raw_value * 453.59237
            else:
                raise BabyBuddyEventRejected("weight unit is unsupported")
            unit = "g"
        else:
            if raw_unit == "cm":
                value = raw_value
            elif raw_unit in {"in", "inch"}:
                value = raw_value * 2.54
            else:
                raise BabyBuddyEventRejected("height unit is unsupported")
            unit = "cm"
        return GrowthFact(
            source_id=f"babybuddy:{resource}:{event_id}",
            child_id=child_id,
            observed_at=observed_at,
            measure=resource,
            value=round(value, 4),
            unit=unit,
            raw_value=self._raw_number(source_value),
            raw_unit=raw_unit,
        )

    def _child_alias(self, raw_child_id) -> str:
        try:
            alias = self._children[int(raw_child_id)]
        except (TypeError, ValueError, KeyError) as error:
            raise BabyBuddyEventRejected("BabyBuddy child is not allowlisted") from error
        return alias

    @staticmethod
    def _identifier(value) -> str:
        text = str(value).strip() if value is not None else ""
        if not text or len(text) > 128:
            raise BabyBuddyEventRejected("BabyBuddy event id is invalid")
        return text

    @staticmethod
    def _timestamp(value) -> datetime:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError as error:
            raise BabyBuddyEventRejected("BabyBuddy timestamp is invalid") from error
        if parsed.tzinfo is None:
            raise BabyBuddyEventRejected("BabyBuddy timestamp must include a timezone")
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _number(value, *, minimum: float, maximum: float, exclusive_minimum: bool = False) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            raise BabyBuddyEventRejected("BabyBuddy numeric value is invalid") from error
        lower_ok = number > minimum if exclusive_minimum else number >= minimum
        if not math.isfinite(number) or not lower_ok or number > maximum:
            raise BabyBuddyEventRejected("BabyBuddy numeric value is outside the accepted range")
        return number

    @staticmethod
    def _raw_number(value) -> str:
        return str(value).strip()


class BabyBuddyApiClient:
    _ENDPOINTS = {
        "sleep": "/api/sleep/",
        "feeding": "/api/feedings/",
        "diaper": "/api/changes/",
        "weight": "/api/weight/",
        "height": "/api/height/",
    }

    def __init__(self, base_url: str, token: str, *, request_json=None):
        if not token:
            raise ValueError("BabyBuddy token must not be empty")
        self._base_url = validate_private_base_url(base_url, {"babybuddy"})
        self._headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
        self._request_json = request_json or default_request_json

    def fetch_page(self, resource: str, cursor=None, page_size: int = 100) -> dict:
        endpoint = self._ENDPOINTS.get(resource)
        if endpoint is None:
            raise ValueError("BabyBuddy resource is not allowlisted")
        if cursor is None:
            url = f"{self._base_url}{endpoint}?{urlencode({'limit': page_size})}"
        else:
            url = validate_same_origin_url(self._base_url, str(cursor), endpoint)
        payload = self._request_json(url, self._headers)
        if isinstance(payload, list):
            return {"items": payload, "next": None}
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            raise ValueError("BabyBuddy API response is malformed")
        next_url = payload.get("next")
        if next_url is not None:
            next_url = validate_same_origin_url(self._base_url, str(next_url), endpoint)
        return {"items": payload["results"], "next": next_url}
