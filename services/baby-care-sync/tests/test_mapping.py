import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_baby_care_sync.mapping import UnsupportedEvent, to_babybuddy


class MappingTests(unittest.TestCase):
    def event(self, kind, details, ended="2026-09-01T01:25:00Z"):
        return {"id": "2e39dad3-c419-458d-beba-9c2063289792", "kind": kind,
                "occurred_at": "2026-09-01T01:00:00Z", "ended_at": ended,
                "caregiver": "mother", "details": details}

    def test_maps_breastfeeding_to_official_api_fields(self):
        resource, payload = to_babybuddy(self.event("feeding", {
            "mode": "breast", "side": "left", "milkType": "breast_milk", "amountMl": None
        }), 7)
        self.assertEqual(resource, "feedings")
        self.assertEqual(payload["method"], "left breast")
        self.assertEqual(payload["type"], "breast milk")
        self.assertNotIn("amount", payload)
        self.assertIn("embe:event:", payload["notes"])

    def test_maps_diaper_sleep_temperature_and_care(self):
        self.assertEqual(to_babybuddy(self.event("diaper", {"wet": True, "solid": False}), 7)[0], "changes")
        self.assertEqual(to_babybuddy(self.event("sleep", {"nap": True}), 7)[0], "sleep")
        self.assertEqual(to_babybuddy(self.event("temperature", {"temperatureC": 36.8}), 7)[0], "temperature")
        self.assertEqual(to_babybuddy(self.event("care", {"action": "bath"}), 7)[0], "notes")

    def test_rejects_a_milk_type_babybuddy_cannot_represent(self):
        with self.assertRaises(UnsupportedEvent):
            to_babybuddy(self.event("feeding", {"mode": "bottle", "milkType": "mixed", "amountMl": 60}), 7)


if __name__ == "__main__":
    unittest.main()
