from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .home_assistant import EntityNotAllowed, HomeAssistantNormalizer, InvalidSensorState
from .warehouse import Warehouse


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
