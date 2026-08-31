import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "immich-family-state.py"
SPEC = importlib.util.spec_from_file_location("immich_family_state", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ImmichFamilyStateTests(unittest.TestCase):
    def test_accepts_only_an_integer_aggregate(self):
        self.assertEqual(MODULE.parse_account_count("1\n"), 1)
        with self.assertRaises(ValueError):
            MODULE.parse_account_count("family@example.test")

    def test_status_contains_no_account_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            MODULE.write_status(path, True)
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "pass")
            self.assertTrue(payload["ready"])
            self.assertFalse(payload["admin"])
            self.assertNotIn("email", payload)
            self.assertNotIn("name", payload)


if __name__ == "__main__":
    unittest.main()
