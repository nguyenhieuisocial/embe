import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.home_assistant import HomeAssistantNormalizer  # noqa: E402
from embe_analytics.ingest import ingest_once  # noqa: E402
from embe_analytics.warehouse import Warehouse  # noqa: E402


class FakeHistory:
    def __init__(self, states):
        self.states = states
        self.calls = []

    def fetch_history(self, start, end, entities):
        self.calls.append((start, end, entities))
        return self.states


class IngestTests(unittest.TestCase):
    def test_ingest_reports_rejected_states_without_storing_them(self):
        valid = {
            "entity_id": "sensor.room_temperature",
            "state": "25",
            "last_updated": "2026-08-30T01:00:00Z",
            "attributes": {"unit_of_measurement": "°C"},
        }
        invalid = {**valid, "state": "unknown"}
        history = FakeHistory([valid, invalid, valid])
        normalizer = HomeAssistantNormalizer({"sensor.room_temperature": "temperature"})
        with tempfile.TemporaryDirectory() as directory:
            warehouse = Warehouse(Path(directory) / "analytics.sqlite3")
            result = ingest_once(
                history,
                normalizer,
                warehouse,
                now=datetime(2026, 8, 30, 2, tzinfo=timezone.utc),
            )
            self.assertEqual(result, {"received": 3, "inserted": 1, "duplicates": 1, "rejected": 1})
            self.assertEqual(warehouse.room_sample_count(), 1)
            self.assertEqual(history.calls[0][2], ["sensor.room_temperature"])
            warehouse.close()


if __name__ == "__main__":
    unittest.main()
