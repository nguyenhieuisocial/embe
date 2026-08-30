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
                SleepRecord(utc(1, 20), utc(1, 22)),
                SleepRecord(utc(2, 20), utc(2, 23)),
                SleepRecord(utc(3, 20), utc(4, 0)),
            ],
            feedings=[
                FeedingRecord(utc(1, 8), 90),
                FeedingRecord(utc(1, 12), 110),
                FeedingRecord(utc(5, 8), 120),
            ],
            environment=[
                EnvironmentRecord(utc(1, 20), 28.0, 70.0),
                EnvironmentRecord(utc(2, 20), 27.0, 65.0),
                EnvironmentRecord(utc(3, 20), 26.0, 60.0),
            ],
        )
        self.service = AnalyticsService(repository)

    def test_sleep_and_feeding_summaries_are_bounded(self) -> None:
        sleep = self.service.sleep_summary(date(2026, 8, 1), date(2026, 8, 3))
        feeding = self.service.feeding_summary(date(2026, 8, 1), date(2026, 8, 3))

        self.assertEqual(sleep.session_count, 3)
        self.assertEqual(sleep.total_minutes, 540)
        self.assertEqual(sleep.average_minutes, 180)
        self.assertEqual(feeding.feeding_count, 2)
        self.assertEqual(feeding.total_milliliters, 200)

    def test_environment_correlation_uses_only_matched_samples(self) -> None:
        result = self.service.environment_sleep_correlation(date(2026, 8, 1), date(2026, 8, 3))

        self.assertEqual(result.sample_count, 3)
        self.assertAlmostEqual(result.temperature_sleep_correlation or 0, -1.0, places=3)
        self.assertAlmostEqual(result.humidity_sleep_correlation or 0, -1.0, places=3)
        self.assertIn("không phải chẩn đoán", result.caution)

    def test_rejects_invalid_or_unbounded_date_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "start_date"):
            self.service.sleep_summary(date(2026, 8, 3), date(2026, 8, 1))
        with self.assertRaisesRegex(ValueError, "31 days"):
            self.service.sleep_summary(date(2026, 1, 1), date(2026, 3, 1))


if __name__ == "__main__":
    unittest.main()

