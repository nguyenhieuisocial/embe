from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_mcp.analytics import (  # noqa: E402
    AnalyticsService,
    EnvironmentRecord,
    FeedingRecord,
    InMemoryRepository,
    SleepRecord,
)


def utc(day: int, hour: int) -> datetime:
    return datetime(2026, 8, day, hour, tzinfo=timezone.utc)


class AnalyticsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        repository = InMemoryRepository(
            sleeps=[
                SleepRecord(utc(1, 10), utc(1, 12), "baby"),
                SleepRecord(utc(2, 10), utc(2, 13), "baby"),
                SleepRecord(utc(3, 10), utc(3, 14), "baby"),
            ],
            feedings=[
                FeedingRecord(utc(1, 8), 90, "baby"),
                FeedingRecord(utc(1, 12), 110, "baby"),
                FeedingRecord(utc(5, 8), 120, "baby"),
            ],
            environment=[
                EnvironmentRecord(utc(1, 10), 28.0, 70.0),
                EnvironmentRecord(utc(2, 10), 27.0, 65.0),
                EnvironmentRecord(utc(3, 10), 26.0, 60.0),
            ],
        )
        self.service = AnalyticsService(repository, allowed_child_ids={"baby"})

    def test_sleep_and_feeding_summaries_are_bounded(self) -> None:
        sleep = self.service.sleep_summary(date(2026, 8, 1), date(2026, 8, 3), child_id="baby")
        feeding = self.service.feeding_summary(date(2026, 8, 1), date(2026, 8, 3), child_id="baby")

        self.assertEqual(sleep.session_count, 3)
        self.assertEqual(sleep.total_minutes, 540)
        self.assertEqual(sleep.average_minutes, 180)
        self.assertEqual(feeding.feeding_count, 2)
        self.assertEqual(feeding.total_milliliters, 200)
        self.assertEqual(sleep.provenance.source, "curated_analytics")
        self.assertEqual(sleep.provenance.sample_count, 3)

    def test_environment_correlation_uses_only_matched_samples(self) -> None:
        result = self.service.environment_sleep_correlation(
            date(2026, 8, 1), date(2026, 8, 3), child_id="baby"
        )

        self.assertEqual(result.sample_count, 3)
        self.assertAlmostEqual(result.temperature_sleep_correlation or 0, -1.0, places=3)
        self.assertAlmostEqual(result.humidity_sleep_correlation or 0, -1.0, places=3)
        self.assertIn("không phải chẩn đoán", result.caution)

    def test_rejects_invalid_or_unbounded_date_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "start_date"):
            self.service.sleep_summary(date(2026, 8, 3), date(2026, 8, 1), child_id="baby")
        with self.assertRaisesRegex(ValueError, "31 days"):
            self.service.sleep_summary(date(2026, 1, 1), date(2026, 3, 1), child_id="baby")

    def test_child_scope_and_injection_like_identifier_are_rejected(self) -> None:
        for child_id in ("other", "baby; DROP TABLE fact_sleep"):
            with self.subTest(child_id=child_id), self.assertRaises(PermissionError):
                self.service.sleep_summary(date(2026, 8, 1), date(2026, 8, 2), child_id=child_id)

    def test_calendar_days_follow_vietnam_time_not_utc(self) -> None:
        service = AnalyticsService(
            InMemoryRepository(
                feedings=[FeedingRecord(utc(31, 18), 90, "baby")],
            ),
            allowed_child_ids={"baby"},
        )

        result = service.feeding_summary(
            date(2026, 9, 1), date(2026, 9, 1), child_id="baby"
        )

        self.assertEqual(result.feeding_count, 1)


if __name__ == "__main__":
    unittest.main()

