import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.runtime import RuntimeConfigError, discover, run  # noqa: E402


class FakeBabyBuddyClient:
    def __init__(self, pages=None, ids=None):
        self.pages = pages or {}
        self.ids = ids or []

    def fetch_page(self, resource, cursor=None, page_size=100):
        return self.pages.get((resource, cursor), {"items": [], "next": None})

    def discover_ids(self):
        return self.ids


class FakeGrocyClient(FakeBabyBuddyClient):
    pass


class FakeHomeAssistantClient:
    def __init__(self, states=None):
        self.states = states or []
        self.calls = []

    def fetch_history(self, start, end, entity_ids):
        self.calls.append((start, end, entity_ids))
        return self.states


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = self.root / "config.local.json"
        self.secrets = self.root / "secrets.local.env"
        self.status = self.root / "status.json"

    def tearDown(self):
        self.temp.cleanup()

    def test_missing_config_is_a_safe_noop_and_never_builds_clients(self):
        built = []
        with redirect_stdout(io.StringIO()):
            result = run(
                self.config,
                self.secrets,
                self.status,
                client_factories={"babybuddy": lambda *_: built.append("babybuddy")},
            )
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "configuration_missing")
        self.assertEqual(built, [])
        self.assertEqual(json.loads(self.status.read_text(encoding="utf-8"))["status"], "skipped")

    def test_disabled_sources_initialize_an_empty_read_only_warehouse(self):
        database = self.root / "family-analytics.sqlite3"
        self.config.write_text(
            json.dumps(
                {
                    "database_path": database.name,
                    "babybuddy": {"enabled": False},
                    "grocy": {"enabled": False},
                }
            ),
            encoding="utf-8",
        )

        with redirect_stdout(io.StringIO()):
            result = run(self.config, self.secrets, self.status)

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "all_sources_disabled")
        self.assertTrue(database.is_file())

    def test_runtime_rejects_inline_secrets_before_any_network_client_exists(self):
        self.config.write_text(
            json.dumps(
                {
                    "database_path": "analytics.sqlite3",
                    "babybuddy": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:8000",
                        "token": "must-never-live-in-json",
                        "children": {"7": "child-primary"},
                    },
                }
            ),
            encoding="utf-8",
        )
        built = []
        with self.assertRaises(RuntimeConfigError):
            run(
                self.config,
                self.secrets,
                self.status,
                client_factories={"babybuddy": lambda *_: built.append("babybuddy")},
            )
        self.assertEqual(built, [])

    def test_discovery_writes_only_ids_locally_and_prints_counts(self):
        self.config.write_text(
            json.dumps(
                {
                    "database_path": "analytics.sqlite3",
                    "babybuddy": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:8000",
                        "token_env": "BABYBUDDY_ANALYTICS_TOKEN",
                        "children": {},
                    },
                    "grocy": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:9283",
                        "api_key_env": "GROCY_ANALYTICS_KEY",
                        "products": {},
                    },
                }
            ),
            encoding="utf-8",
        )
        self.secrets.write_text(
            "BABYBUDDY_ANALYTICS_TOKEN=bb-secret\nGROCY_ANALYTICS_KEY=grocy-secret\n",
            encoding="utf-8",
        )
        discovery_path = self.root / "discovery.local.json"
        output = io.StringIO()
        with redirect_stdout(output):
            result = discover(
                self.config,
                self.secrets,
                discovery_path,
                client_factories={
                    "babybuddy": lambda *_: FakeBabyBuddyClient(ids=[7, 8]),
                    "grocy": lambda *_: FakeGrocyClient(ids=[12, 14]),
                },
            )

        self.assertEqual(result, {"babybuddy_child_count": 2, "grocy_product_count": 2})
        self.assertEqual(
            json.loads(discovery_path.read_text(encoding="utf-8")),
            {"babybuddy": {"child_ids": [7, 8]}, "grocy": {"product_ids": [12, 14]}},
        )
        visible = output.getvalue()
        for private_value in ("bb-secret", "grocy-secret", "7", "8", "12", "14"):
            self.assertNotIn(private_value, visible)

    def test_run_uses_aliases_and_writes_only_aggregate_status(self):
        self.config.write_text(
            json.dumps(
                {
                    "database_path": "analytics.sqlite3",
                    "babybuddy": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:8000",
                        "token_env": "BABYBUDDY_ANALYTICS_TOKEN",
                        "children": {"7": "child-primary"},
                    },
                    "grocy": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:9283",
                        "api_key_env": "GROCY_ANALYTICS_KEY",
                        "products": {"12": {"alias": "diaper-newborn", "unit": "piece"}},
                    },
                }
            ),
            encoding="utf-8",
        )
        self.secrets.write_text(
            "BABYBUDDY_ANALYTICS_TOKEN=bb-secret\nGROCY_ANALYTICS_KEY=grocy-secret\n",
            encoding="utf-8",
        )
        clients = {
            "babybuddy": FakeBabyBuddyClient(
                pages={
                    ("sleep", None): {
                        "items": [
                            {
                                "id": 1,
                                "child": 7,
                                "start": "2026-08-30T01:00:00Z",
                                "end": "2026-08-30T02:00:00Z",
                                "notes": "private note",
                            }
                        ],
                        "next": None,
                    }
                }
            ),
            "grocy": FakeGrocyClient(
                pages={
                    ("stock_movement", None): {
                        "items": [
                            {
                                "id": 2,
                                "product_id": 12,
                                "row_created_timestamp": "2026-08-30T03:00:00Z",
                                "amount": -1,
                            }
                        ],
                        "next": None,
                    }
                }
            ),
        }
        seen_secrets = []
        output = io.StringIO()
        with redirect_stdout(output):
            result = run(
                self.config,
                self.secrets,
                self.status,
                client_factories={
                    "babybuddy": lambda _url, secret: seen_secrets.append(secret) or clients["babybuddy"],
                    "grocy": lambda _url, secret: seen_secrets.append(secret) or clients["grocy"],
                },
            )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["babybuddy"]["inserted"], 1)
        self.assertEqual(result["grocy"]["inserted"], 1)
        self.assertEqual(seen_secrets, ["bb-secret", "grocy-secret"])
        visible = output.getvalue() + self.status.read_text(encoding="utf-8")
        for private_value in ("bb-secret", "grocy-secret", "private note", "child-primary", "diaper-newborn"):
            self.assertNotIn(private_value, visible)

    def test_run_ingests_allowlisted_home_assistant_entities_without_exposing_identifiers(self):
        self.config.write_text(
            json.dumps(
                {
                    "database_path": "analytics.sqlite3",
                    "home_assistant": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:8123",
                        "token_env": "HOME_ASSISTANT_ANALYTICS_TOKEN",
                        "entities": {
                            "sensor.private_nursery_temperature": "temperature",
                            "sensor.private_nursery_humidity": "humidity",
                        },
                    },
                }
            ),
            encoding="utf-8",
        )
        self.secrets.write_text("HOME_ASSISTANT_ANALYTICS_TOKEN=ha-secret\n", encoding="utf-8")
        client = FakeHomeAssistantClient(
            states=[
                {
                    "entity_id": "sensor.private_nursery_temperature",
                    "state": "25.5",
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "attributes": {"unit_of_measurement": "°C"},
                }
            ]
        )
        seen = []
        output = io.StringIO()
        with redirect_stdout(output):
            result = run(
                self.config,
                self.secrets,
                self.status,
                client_factories={
                    "home_assistant": lambda url, secret, entities: seen.append((url, secret, entities)) or client
                },
            )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["home_assistant"]["inserted"], 1)
        self.assertEqual(seen[0][1], "ha-secret")
        self.assertEqual(seen[0][2], {"sensor.private_nursery_temperature", "sensor.private_nursery_humidity"})
        visible = output.getvalue() + self.status.read_text(encoding="utf-8")
        for private_value in ("ha-secret", "private_nursery_temperature", "private_nursery_humidity"):
            self.assertNotIn(private_value, visible)

    def test_runtime_rejects_invalid_home_assistant_allowlist_before_building_client(self):
        self.config.write_text(
            json.dumps(
                {
                    "database_path": "analytics.sqlite3",
                    "home_assistant": {
                        "enabled": True,
                        "base_url": "http://127.0.0.1:8123",
                        "token_env": "HOME_ASSISTANT_ANALYTICS_TOKEN",
                        "entities": {"light.nursery": "temperature"},
                    },
                }
            ),
            encoding="utf-8",
        )
        self.secrets.write_text("HOME_ASSISTANT_ANALYTICS_TOKEN=ha-secret\n", encoding="utf-8")
        built = []
        with self.assertRaises(RuntimeConfigError):
            run(
                self.config,
                self.secrets,
                self.status,
                client_factories={"home_assistant": lambda *_: built.append(True)},
            )
        self.assertEqual(built, [])


if __name__ == "__main__":
    unittest.main()
