from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .home_assistant import EntityNotAllowed, HomeAssistantNormalizer, InvalidSensorState
from .babybuddy import (
    BabyBuddyEventRejected,
    BabyBuddyNormalizer,
    DiaperFact,
    FeedingFact,
    GrowthFact,
    SleepFact,
)
from .grocy import GrocyEventRejected, GrocyNormalizer
from .warehouse import Warehouse


class PaginationLoop(RuntimeError):
    pass


def ingest_once(history, normalizer: HomeAssistantNormalizer, warehouse: Warehouse, *, now: datetime) -> dict[str, int]:
    if now.tzinfo is None:
        raise ValueError("now must include a timezone")
    end = now.astimezone(timezone.utc)
    checkpoint = warehouse.checkpoint("home_assistant")
    start = checkpoint - timedelta(minutes=5) if checkpoint else end - timedelta(hours=1)
    states = history.fetch_history(start, end, list(normalizer.entity_ids))
    result = {"received": len(states), "inserted": 0, "duplicates": 0, "rejected": 0}
    for state in states:
        try:
            sample = normalizer.normalize_state(state)
        except (EntityNotAllowed, InvalidSensorState):
            result["rejected"] += 1
            continue
        if warehouse.upsert_room_sample(sample):
            result["inserted"] += 1
        else:
            result["duplicates"] += 1
    return result


def ingest_babybuddy(
    source,
    normalizer: BabyBuddyNormalizer,
    warehouse: Warehouse,
    *,
    page_size: int = 100,
    max_pages: int = 1000,
):
    writers = {
        SleepFact: warehouse.upsert_sleep,
        FeedingFact: warehouse.upsert_feeding,
        DiaperFact: warehouse.upsert_diaper,
        GrowthFact: warehouse.upsert_growth,
    }
    result = _empty_result()
    for resource in normalizer.RESOURCES:
        for event in _iter_pages(source, resource, page_size, max_pages):
            result["received"] += 1
            try:
                fact = normalizer.normalize(resource, event)
            except BabyBuddyEventRejected:
                result["rejected"] += 1
                continue
            if writers[type(fact)](fact):
                result["inserted"] += 1
            else:
                result["duplicates"] += 1
    return result


def ingest_grocy(
    source,
    normalizer: GrocyNormalizer,
    warehouse: Warehouse,
    *,
    page_size: int = 100,
    max_pages: int = 1000,
):
    result = _empty_result()
    for resource in normalizer.RESOURCES:
        for event in _iter_pages(source, resource, page_size, max_pages):
            result["received"] += 1
            try:
                fact = normalizer.normalize(resource, event)
            except GrocyEventRejected:
                result["rejected"] += 1
                continue
            if warehouse.upsert_stock_movement(fact):
                result["inserted"] += 1
            else:
                result["duplicates"] += 1
    return result


def _iter_pages(source, resource: str, page_size: int, max_pages: int):
    if page_size < 1 or page_size > 500:
        raise ValueError("page_size must be between 1 and 500")
    if max_pages < 1:
        raise ValueError("max_pages must be positive")
    cursor = None
    visited = set()
    for _ in range(max_pages):
        page = source.fetch_page(resource, cursor=cursor, page_size=page_size)
        if not isinstance(page, dict) or not isinstance(page.get("items"), list):
            raise ValueError("source page is malformed")
        for event in page["items"]:
            if isinstance(event, dict):
                yield event
        next_cursor = page.get("next")
        if next_cursor is None:
            return
        if not isinstance(next_cursor, str) or not next_cursor or next_cursor in visited:
            raise PaginationLoop(f"{resource} pagination cursor repeated or invalid")
        visited.add(next_cursor)
        cursor = next_cursor
    raise PaginationLoop(f"{resource} exceeded the configured page limit")


def _empty_result() -> dict[str, int]:
    return {"received": 0, "inserted": 0, "duplicates": 0, "rejected": 0}
