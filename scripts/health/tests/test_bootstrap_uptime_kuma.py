import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "bootstrap_uptime_kuma.py"
SPEC = importlib.util.spec_from_file_location("bootstrap_uptime_kuma", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class FakeApi:
    def __init__(self, monitors=()):
        self.monitors = list(monitors)
        self.added = []

    def get_monitors(self):
        return list(self.monitors)

    def add_monitor(self, **monitor):
        self.added.append(monitor)
        return {"monitorID": len(self.added)}


class UptimeKumaBootstrapTests(unittest.TestCase):
    def test_adds_only_missing_monitors_and_is_idempotent(self):
        desired = MODULE.desired_monitors()
        existing = [{"name": desired[0]["name"], "url": desired[0]["url"]}]
        api = FakeApi(existing)

        first = MODULE.reconcile_monitors(api, desired)
        api.monitors.extend(api.added)
        second = MODULE.reconcile_monitors(api, desired)

        self.assertEqual(len(first["created"]), len(desired) - 1)
        self.assertEqual(second, {"created": [], "existing": [item["name"] for item in desired]})
        self.assertTrue(all(item["interval"] >= 60 for item in api.added))

    def test_result_never_contains_credentials_or_response_bodies(self):
        api = FakeApi()
        result = MODULE.reconcile_monitors(api, MODULE.desired_monitors())
        serialized = repr(result).lower()

        self.assertNotIn("password", serialized)
        self.assertNotIn("token", serialized)
        self.assertNotIn("response_body", serialized)


if __name__ == "__main__":
    unittest.main()
