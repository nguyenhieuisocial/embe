import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.home_assistant import (  # noqa: E402
    EntityNotAllowed,
    HomeAssistantNormalizer,
    InvalidSensorState,
    HomeAssistantHistoryClient,
)


class HomeAssistantNormalizerTests(unittest.TestCase):
    def setUp(self):
        self.normalizer = HomeAssistantNormalizer(
            {
                "sensor.phong_em_be_temperature": "temperature",
                "sensor.phong_em_be_humidity": "humidity",
            }
        )

    def test_converts_allowlisted_fahrenheit_to_celsius_and_utc(self):
        sample = self.normalizer.normalize_state(
            {
                "entity_id": "sensor.phong_em_be_temperature",
                "state": "77",
                "last_updated": "2026-08-30T08:00:00+07:00",
                "attributes": {"unit_of_measurement": "°F"},
            }
        )
        self.assertEqual(sample.kind, "temperature")
        self.assertAlmostEqual(sample.value, 25.0)
        self.assertEqual(sample.unit, "°C")
        self.assertEqual(sample.observed_at, datetime(2026, 8, 30, 1, tzinfo=timezone.utc))
        self.assertEqual(sample.raw_value, "77")
        self.assertEqual(sample.raw_unit, "°F")

    def test_rejects_unknown_entity_and_non_numeric_or_out_of_range_states(self):
        with self.assertRaises(EntityNotAllowed):
            self.normalizer.normalize_state(
                {"entity_id": "sensor.other", "state": "25", "last_updated": "2026-08-30T01:00:00Z", "attributes": {}}
            )
        for value in ("unknown", "nan", "101"):
            with self.subTest(value=value), self.assertRaises(InvalidSensorState):
                self.normalizer.normalize_state(
                    {
                        "entity_id": "sensor.phong_em_be_humidity",
                        "state": value,
                        "last_updated": "2026-08-30T01:00:00Z",
                        "attributes": {"unit_of_measurement": "%"},
                    }
                )

    def test_deduplication_key_is_stable_for_same_event(self):
        state = {
            "entity_id": "sensor.phong_em_be_humidity",
            "state": "65",
            "last_updated": "2026-08-30T01:00:00Z",
            "attributes": {"unit_of_measurement": "%"},
        }
        self.assertEqual(
            self.normalizer.normalize_state(state).source_id,
            self.normalizer.normalize_state(dict(state)).source_id,
        )

    def test_history_backfill_is_allowlisted_and_flattens_response(self):
        calls = []

        def request_json(url, headers):
            calls.append((url, headers))
            return [[{"entity_id": "sensor.phong_em_be_temperature", "state": "25"}]]

        client = HomeAssistantHistoryClient(
            "http://127.0.0.1:8123",
            "private-token",
            {"sensor.phong_em_be_temperature"},
            request_json=request_json,
        )
        states = client.fetch_history(
            datetime(2026, 8, 30, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 30, 1, tzinfo=timezone.utc),
            ["sensor.phong_em_be_temperature"],
        )
        self.assertEqual(len(states), 1)
        self.assertIn("filter_entity_id=sensor.phong_em_be_temperature", calls[0][0])
        self.assertEqual(calls[0][1]["Authorization"], "Bearer private-token")
        with self.assertRaises(EntityNotAllowed):
            client.fetch_history(
                datetime(2026, 8, 30, 0, tzinfo=timezone.utc),
                datetime(2026, 8, 30, 1, tzinfo=timezone.utc),
                ["sensor.not_allowed"],
            )

    def test_history_client_rejects_public_home_assistant_endpoint(self):
        with self.assertRaisesRegex(ValueError, "private"):
            HomeAssistantHistoryClient("https://ha.example.com", "token", {"sensor.room"})


if __name__ == "__main__":
    unittest.main()
