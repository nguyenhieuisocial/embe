from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Protocol, Sequence

MAX_RANGE_DAYS = 31
MAX_RECORDS = 5_000


@dataclass(frozen=True)
class SleepRecord:
    started_at: datetime
    ended_at: datetime
    child_id: str


@dataclass(frozen=True)
class FeedingRecord:
    occurred_at: datetime
    milliliters: int
    child_id: str


@dataclass(frozen=True)
class EnvironmentRecord:
    observed_at: datetime
    temperature_celsius: float
    humidity_percent: float


@dataclass(frozen=True)
class Provenance:
    source: str
    start_date: str
    end_date: str
    sample_count: int
    missingness_percent: float | None
    algorithm_version: str


@dataclass(frozen=True)
class SleepSummary:
    start_date: str
    end_date: str
    session_count: int
    total_minutes: int
    average_minutes: int
    provenance: Provenance


@dataclass(frozen=True)
class FeedingSummary:
    start_date: str
    end_date: str
    feeding_count: int
    total_milliliters: int
    average_milliliters: int
    provenance: Provenance
    caution: str


@dataclass(frozen=True)
class EnvironmentSleepCorrelation:
    start_date: str
    end_date: str
    sample_count: int
    temperature_sleep_correlation: float | None
    humidity_sleep_correlation: float | None
    caution: str
    provenance: Provenance


class ReadOnlyRepository(Protocol):
    def read_sleep(self, child_id: str, start: datetime, end: datetime, limit: int) -> Sequence[SleepRecord]: ...

    def read_feedings(self, child_id: str, start: datetime, end: datetime, limit: int) -> Sequence[FeedingRecord]: ...

    def read_environment(self, start: datetime, end: datetime, limit: int) -> Sequence[EnvironmentRecord]: ...


class InMemoryRepository:
    """Fixture adapter; production adapters must query curated read-only views."""

    def __init__(
        self,
        sleeps: Sequence[SleepRecord] = (),
        feedings: Sequence[FeedingRecord] = (),
        environment: Sequence[EnvironmentRecord] = (),
    ) -> None:
        self._sleeps = tuple(sleeps)
        self._feedings = tuple(feedings)
        self._environment = tuple(environment)

    def read_sleep(self, child_id: str, start: datetime, end: datetime, limit: int) -> Sequence[SleepRecord]:
        return tuple(item for item in self._sleeps if item.child_id == child_id and start <= item.started_at < end)[:limit]

    def read_feedings(self, child_id: str, start: datetime, end: datetime, limit: int) -> Sequence[FeedingRecord]:
        return tuple(item for item in self._feedings if item.child_id == child_id and start <= item.occurred_at < end)[:limit]

    def read_environment(self, start: datetime, end: datetime, limit: int) -> Sequence[EnvironmentRecord]:
        return tuple(item for item in self._environment if start <= item.observed_at < end)[:limit]


def _bounded_window(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date")
    if (end_date - start_date).days >= MAX_RANGE_DAYS:
        raise ValueError("date range must not exceed 31 days")
    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end


def _pearson(left: Sequence[float], right: Sequence[float]) -> float | None:
    if len(left) < 3 or len(left) != len(right):
        return None
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = sum((x - left_mean) * (y - right_mean) for x, y in zip(left, right, strict=True))
    left_square = sum((x - left_mean) ** 2 for x in left)
    right_square = sum((y - right_mean) ** 2 for y in right)
    denominator = math.sqrt(left_square * right_square)
    return None if denominator == 0 else round(numerator / denominator, 4)


class AnalyticsService:
    def __init__(self, repository: ReadOnlyRepository, *, allowed_child_ids: set[str] | None = None) -> None:
        self._repository = repository
        self._allowed_child_ids = frozenset(allowed_child_ids or {"default"})

    def sleep_summary(self, start_date: date, end_date: date, *, child_id: str) -> SleepSummary:
        self._require_child(child_id)
        start, end = _bounded_window(start_date, end_date)
        records = tuple(self._repository.read_sleep(child_id, start, end, MAX_RECORDS + 1))
        self._assert_record_limit(records)
        minutes = [max(0, round((item.ended_at - item.started_at).total_seconds() / 60)) for item in records]
        total = sum(minutes)
        return SleepSummary(
            str(start_date),
            str(end_date),
            len(records),
            total,
            round(total / len(records)) if records else 0,
            self._provenance(start_date, end_date, len(records), "sleep-summary-v1"),
        )

    def feeding_summary(self, start_date: date, end_date: date, *, child_id: str) -> FeedingSummary:
        self._require_child(child_id)
        start, end = _bounded_window(start_date, end_date)
        records = tuple(self._repository.read_feedings(child_id, start, end, MAX_RECORDS + 1))
        self._assert_record_limit(records)
        total = sum(max(0, item.milliliters) for item in records)
        return FeedingSummary(
            str(start_date),
            str(end_date),
            len(records),
            total,
            round(total / len(records)) if records else 0,
            self._provenance(start_date, end_date, len(records), "feeding-summary-v1"),
            "Thông tin theo dõi, không thay thế tư vấn của bác sĩ.",
        )

    def environment_sleep_correlation(
        self, start_date: date, end_date: date, *, child_id: str
    ) -> EnvironmentSleepCorrelation:
        self._require_child(child_id)
        start, end = _bounded_window(start_date, end_date)
        sleeps = tuple(self._repository.read_sleep(child_id, start, end, MAX_RECORDS + 1))
        environment = tuple(self._repository.read_environment(start, end, MAX_RECORDS + 1))
        self._assert_record_limit(sleeps)
        self._assert_record_limit(environment)

        matched: list[tuple[SleepRecord, EnvironmentRecord]] = []
        for sleep in sleeps:
            nearby = sorted(environment, key=lambda item: abs((item.observed_at - sleep.started_at).total_seconds()))
            if nearby and abs((nearby[0].observed_at - sleep.started_at).total_seconds()) <= 3600:
                matched.append((sleep, nearby[0]))

        durations = [(sleep.ended_at - sleep.started_at).total_seconds() / 60 for sleep, _ in matched]
        temperatures = [reading.temperature_celsius for _, reading in matched]
        humidity = [reading.humidity_percent for _, reading in matched]
        return EnvironmentSleepCorrelation(
            str(start_date),
            str(end_date),
            len(matched),
            _pearson(temperatures, durations),
            _pearson(humidity, durations),
            "Tương quan mô tả, không phải chẩn đoán y khoa hoặc quan hệ nhân quả.",
            self._provenance(start_date, end_date, len(matched), "environment-sleep-pearson-v1"),
        )

    def _require_child(self, child_id: str) -> None:
        if child_id not in self._allowed_child_ids:
            raise PermissionError("child_id is outside the configured MCP scope")

    @staticmethod
    def _provenance(start_date: date, end_date: date, count: int, algorithm: str) -> Provenance:
        return Provenance(
            source="curated_analytics",
            start_date=str(start_date),
            end_date=str(end_date),
            sample_count=count,
            missingness_percent=None,
            algorithm_version=algorithm,
        )

    @staticmethod
    def _assert_record_limit(records: Sequence[object]) -> None:
        if len(records) > MAX_RECORDS:
            raise ValueError("result exceeds the 5000-record safety limit")

