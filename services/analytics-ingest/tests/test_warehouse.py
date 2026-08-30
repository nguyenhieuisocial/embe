import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.home_assistant import RoomSample  # noqa: E402
from embe_analytics.warehouse import ReconciliationMismatch, Warehouse  # noqa: E402


class WarehouseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.warehouse = Warehouse(Path(self.temp.name) / "analytics.sqlite3")

    def tearDown(self):
        self.warehouse.close()
        self.temp.cleanup()

    def sample(self, source_id="sample-1", hour=1):
        return RoomSample(
            source_id=source_id,
            entity_id="sensor.phong_em_be_temperature",
            kind="temperature",
            observed_at=datetime(2026, 8, 30, hour, tzinfo=timezone.utc),
            value=25.0,
            unit="°C",
            raw_value="25",
            raw_unit="°C",
            quality_flag="ok",
        )

    def test_room_sample_ingest_is_idempotent_and_tracks_checkpoint(self):
        self.assertTrue(self.warehouse.upsert_room_sample(self.sample()))
        self.assertFalse(self.warehouse.upsert_room_sample(self.sample()))
        self.assertEqual(self.warehouse.room_sample_count(), 1)
        self.assertEqual(
            self.warehouse.checkpoint("home_assistant"),
            datetime(2026, 8, 30, 1, tzinfo=timezone.utc),
        )

    def test_schema_contains_all_canonical_fact_tables(self):
        self.assertEqual(
            set(self.warehouse.fact_tables()),
            {
                "fact_sleep",
                "fact_feeding",
                "fact_diaper",
                "fact_growth",
                "fact_room_sample",
                "fact_media_state",
                "fact_stock_movement",
                "fact_milestone",
            },
        )

    def test_reconcile_raises_instead_of_silently_accepting_mismatch(self):
        self.warehouse.upsert_room_sample(self.sample())
        with self.assertRaises(ReconciliationMismatch):
            self.warehouse.reconcile_day("2026-08-30", expected_count=2, expected_hash="wrong")

    def test_hourly_aggregate_has_count_mean_min_and_max(self):
        self.warehouse.upsert_room_sample(self.sample("one", 1))
        second = self.sample("two", 1)
        second = RoomSample(**{**second.__dict__, "value": 27.0, "raw_value": "27"})
        self.warehouse.upsert_room_sample(second)
        rows = self.warehouse.hourly_room_aggregates("2026-08-30")
        self.assertEqual(rows, [("temperature", "2026-08-30T01:00:00Z", 2, 26.0, 25.0, 27.0)])


if __name__ == "__main__":
    unittest.main()
