import sqlite3
import unittest
from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0001_procurement.sql"


class ProcurementSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_creates_provider_neutral_procurement_tables(self):
        tables = {
            row[0]
            for row in self.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        self.assertTrue(
            {
                "supplier",
                "supplier_listing",
                "quote",
                "warehouse_route",
                "landed_cost_rule",
                "purchase_proposal",
                "approval",
            }.issubset(tables)
        )

    def test_prevents_two_open_proposals_for_the_same_product(self):
        self.db.execute("INSERT INTO supplier (id, name) VALUES ('s1', 'Manual')")
        self.db.execute(
            "INSERT INTO supplier_listing (id, supplier_id, product_ref, title, units_per_pack) "
            "VALUES ('l1', 's1', 'grocy:1', 'Bỉm', 30)"
        )
        self.db.execute(
            "INSERT INTO purchase_proposal (id, product_ref, listing_id, state, packs) "
            "VALUES ('p1', 'grocy:1', 'l1', 'DRAFT', 1)"
        )

        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO purchase_proposal (id, product_ref, listing_id, state, packs) "
                "VALUES ('p2', 'grocy:1', 'l1', 'REVIEWED', 1)"
            )

    def test_rejects_invalid_proposal_state(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO purchase_proposal (id, product_ref, state, packs) "
                "VALUES ('p1', 'grocy:1', 'AUTO_ORDERED', 1)"
            )


if __name__ == "__main__":
    unittest.main()
