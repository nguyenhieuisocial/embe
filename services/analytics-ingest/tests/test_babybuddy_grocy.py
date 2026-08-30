import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.babybuddy import BabyBuddyApiClient, BabyBuddyNormalizer  # noqa: E402
from embe_analytics.grocy import GrocyApiClient, GrocyNormalizer  # noqa: E402
from embe_analytics.ingest import (  # noqa: E402
    PaginationLoop,
    ingest_babybuddy,
    ingest_grocy,
)
from embe_analytics.warehouse import Warehouse  # noqa: E402


class FakePagedSource:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def fetch_page(self, resource, cursor=None, page_size=100):
        self.calls.append((resource, cursor, page_size))
        return self.pages.get((resource, cursor), {"items": [], "next": None})


class AnalyticsSourceIngestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp.name) / "analytics.sqlite3"
        self.warehouse = Warehouse(self.database_path)

    def tearDown(self):
        self.warehouse.close()
        self.temp.cleanup()

    def test_babybuddy_ingest_paginates_converts_units_and_is_idempotent(self):
        source = FakePagedSource(
            {
                ("sleep", None): {
                    "items": [
                        {
                            "id": 10,
                            "child": 7,
                            "start": "2026-08-30T08:00:00+07:00",
                            "end": "2026-08-30T09:30:00+07:00",
                            "notes": "private sleep note must not be stored",
                        }
                    ],
                    "next": "sleep-page-2",
                },
                ("sleep", "sleep-page-2"): {"items": [], "next": None},
                ("feeding", None): {
                    "items": [
                        {
                            "id": 20,
                            "child": 7,
                            "start": "2026-08-30T10:00:00+07:00",
                            "amount": 2,
                            "unit": "fl oz",
                            "notes": "private feeding note must not be stored",
                        }
                    ],
                    "next": None,
                },
                ("diaper", None): {
                    "items": [
                        {
                            "id": 30,
                            "child": 7,
                            "time": "2026-08-30T10:30:00+07:00",
                            "wet": True,
                            "solid": True,
                        }
                    ],
                    "next": None,
                },
                ("weight", None): {
                    "items": [
                        {
                            "id": 40,
                            "child": 7,
                            "date": "2026-08-30T11:00:00+07:00",
                            "weight": 3.2,
                        }
                    ],
                    "next": None,
                },
                ("height", None): {"items": [], "next": None},
            }
        )
        normalizer = BabyBuddyNormalizer({7: "child-primary"})

        first = ingest_babybuddy(source, normalizer, self.warehouse, page_size=1)
        second = ingest_babybuddy(source, normalizer, self.warehouse, page_size=1)

        self.assertEqual(first, {"received": 4, "inserted": 4, "duplicates": 0, "rejected": 0})
        self.assertEqual(second, {"received": 4, "inserted": 0, "duplicates": 4, "rejected": 0})
        self.assertIn(("sleep", "sleep-page-2", 1), source.calls)
        self.assertEqual(self.warehouse.fact_count("fact_sleep"), 1)
        self.assertEqual(self.warehouse.fact_count("fact_feeding"), 1)
        self.assertEqual(self.warehouse.fact_count("fact_diaper"), 1)
        self.assertEqual(self.warehouse.fact_count("fact_growth"), 1)

        connection = sqlite3.connect(self.database_path)
        feeding = connection.execute(
            "SELECT child_id, value_milliliters, raw_value, raw_unit FROM fact_feeding"
        ).fetchone()
        sleep = connection.execute(
            "SELECT observed_at, ended_at, duration_seconds FROM fact_sleep"
        ).fetchone()
        persisted_text = " ".join(
            str(value)
            for table in ("fact_sleep", "fact_feeding")
            for row in connection.execute(f"SELECT * FROM {table}")
            for value in row
        )
        connection.close()

        self.assertEqual(feeding[0], "child-primary")
        self.assertAlmostEqual(feeding[1], 59.147, places=3)
        self.assertEqual(feeding[2:], ("2", "fl oz"))
        self.assertEqual(sleep, ("2026-08-30T01:00:00Z", "2026-08-30T02:30:00Z", 5400))
        self.assertNotIn("private", persisted_text)

    def test_babybuddy_rejects_unknown_child_and_unapproved_event_fields(self):
        source = FakePagedSource(
            {
                ("sleep", None): {
                    "items": [
                        {
                            "id": 99,
                            "child": 999,
                            "start": "2026-08-30T01:00:00Z",
                            "end": "2026-08-30T02:00:00Z",
                        }
                    ],
                    "next": None,
                }
            }
        )
        result = ingest_babybuddy(source, BabyBuddyNormalizer({7: "child-primary"}), self.warehouse)
        self.assertEqual(result["rejected"], 1)
        self.assertEqual(self.warehouse.fact_count("fact_sleep"), 0)

    def test_grocy_ingest_only_stores_allowlisted_products_and_is_idempotent(self):
        source = FakePagedSource(
            {
                ("stock_movement", None): {
                    "items": [
                        {
                            "id": "tx-1",
                            "product_id": 12,
                            "row_created_timestamp": "2026-08-30T08:00:00+07:00",
                            "amount": -6,
                            "user_name": "must not be stored",
                        },
                        {
                            "id": "tx-private",
                            "product_id": 999,
                            "row_created_timestamp": "2026-08-30T08:05:00+07:00",
                            "amount": 1,
                            "unit": "piece",
                        },
                    ],
                    "next": "stock-page-2",
                },
                ("stock_movement", "stock-page-2"): {"items": [], "next": None},
            }
        )
        normalizer = GrocyNormalizer({12: ("diaper-newborn", "piece")})

        first = ingest_grocy(source, normalizer, self.warehouse, page_size=2)
        second = ingest_grocy(source, normalizer, self.warehouse, page_size=2)

        self.assertEqual(first, {"received": 2, "inserted": 1, "duplicates": 0, "rejected": 1})
        self.assertEqual(second, {"received": 2, "inserted": 0, "duplicates": 1, "rejected": 1})
        self.assertIn(("stock_movement", "stock-page-2", 2), source.calls)
        self.assertEqual(self.warehouse.fact_count("fact_stock_movement"), 1)

        connection = sqlite3.connect(self.database_path)
        row = connection.execute(
            "SELECT item_id, observed_at, quantity, unit, raw_value, raw_unit FROM fact_stock_movement"
        ).fetchone()
        persisted_text = " ".join(str(value) for value in connection.execute("SELECT * FROM fact_stock_movement").fetchone())
        connection.close()
        self.assertEqual(row, ("diaper-newborn", "2026-08-30T01:00:00Z", -6.0, "piece", "-6", "piece"))
        self.assertNotIn("must not be stored", persisted_text)

    def test_repeated_pagination_cursor_fails_closed(self):
        source = FakePagedSource(
            {
                ("stock_movement", None): {"items": [], "next": "same"},
                ("stock_movement", "same"): {"items": [], "next": "same"},
            }
        )
        with self.assertRaises(PaginationLoop):
            ingest_grocy(source, GrocyNormalizer({12: ("diaper-newborn", "piece")}), self.warehouse)

    def test_babybuddy_client_uses_fixed_endpoints_and_validates_next_url(self):
        calls = []

        def request_json(url, headers):
            calls.append((url, headers))
            if "offset=2" in url:
                return {"results": [{"id": 2}], "next": None}
            return {
                "results": [{"id": 1}],
                "next": "http://127.0.0.1:8000/api/sleep/?limit=2&offset=2",
            }

        client = BabyBuddyApiClient(
            "http://127.0.0.1:8000",
            "secret-token",
            request_json=request_json,
        )
        first = client.fetch_page("sleep", page_size=2)
        second = client.fetch_page("sleep", cursor=first["next"], page_size=2)

        self.assertEqual(first["items"], [{"id": 1}])
        self.assertEqual(second, {"items": [{"id": 2}], "next": None})
        self.assertEqual(calls[0][1]["Authorization"], "Token secret-token")
        self.assertIn("/api/sleep/", calls[0][0])
        with self.assertRaises(ValueError):
            client.fetch_page("notes")
        with self.assertRaises(ValueError):
            client.fetch_page("sleep", cursor="https://attacker.example/api/sleep/")
        with self.assertRaisesRegex(ValueError, "private"):
            BabyBuddyApiClient("https://baby.example.com", "token")

    def test_api_discovery_returns_ids_without_names(self):
        baby = BabyBuddyApiClient(
            "http://127.0.0.1:8000",
            "token",
            request_json=lambda _url, _headers: {
                "results": [{"id": 7, "name": "Private Child Name"}, {"id": 8, "name": "Another Name"}],
                "next": None,
            },
        )
        grocy = GrocyApiClient(
            "http://127.0.0.1:9283",
            "key",
            request_json=lambda _url, _headers: [
                {"id": 12, "name": "Private Product Name"},
                {"id": 14, "name": "Another Product"},
            ],
        )
        self.assertEqual(baby.discover_ids(), [7, 8])
        self.assertEqual(grocy.discover_ids(), [12, 14])

    def test_grocy_client_pages_a_list_without_exposing_key(self):
        calls = []

        def request_json(url, headers):
            calls.append((url, headers))
            return [{"id": 1}, {"id": 2}, {"id": 3}]

        client = GrocyApiClient(
            "http://127.0.0.1:9283",
            "grocy-secret",
            request_json=request_json,
        )
        first = client.fetch_page("stock_movement", page_size=2)
        second = client.fetch_page("stock_movement", cursor=first["next"], page_size=2)

        self.assertEqual(first["items"], [{"id": 1}, {"id": 2}])
        self.assertEqual(second, {"items": [{"id": 3}], "next": None})
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["GROCY-API-KEY"], "grocy-secret")
        self.assertNotIn("grocy-secret", calls[0][0])
        self.assertIn("/api/stock/transactions", calls[0][0])

    def test_pagination_has_a_hard_page_limit(self):
        class EndlessSource:
            def fetch_page(self, resource, cursor=None, page_size=100):
                number = 1 if cursor is None else int(cursor) + 1
                return {"items": [], "next": str(number)}

        with self.assertRaises(PaginationLoop):
            ingest_grocy(
                EndlessSource(),
                GrocyNormalizer({12: ("diaper-newborn", "piece")}),
                self.warehouse,
                max_pages=3,
            )


if __name__ == "__main__":
    unittest.main()
