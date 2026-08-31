from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from inventory_worker import GrocyInventory, InventoryAction, build_snapshot, process_actions


class FakeQueue:
    def __init__(self, actions):
        self.actions = actions
        self.completed = []
        self.failed = []

    def claim(self, limit=10):
        return self.actions[:limit]

    def complete(self, action_id):
        self.completed.append(action_id)

    def fail(self, action_id, error_code):
        self.failed.append((action_id, error_code))


class FakeGrocy:
    def __init__(self):
        self.created = []
        self.stock_levels = []

    def create_item(self, **values):
        self.created.append(values)

    def set_amount(self, product_id, amount):
        self.stock_levels.append((product_id, amount))


class InventoryWorkerTests(unittest.TestCase):
    def test_grocy_set_amount_uses_idempotent_inventory_endpoint(self):
        calls = []

        def request(url, method, headers, body=None, timeout=20):
            calls.append((url, method, body, headers))
            return None

        grocy = GrocyInventory("http://127.0.0.1:9283", "secret", request_json=request)
        grocy.set_amount(12, 6)

        self.assertEqual(calls[0][0], "http://127.0.0.1:9283/api/stock/products/12/inventory")
        self.assertEqual(calls[0][1], "POST")
        self.assertEqual(calls[0][2]["new_amount"], 6.0)
        self.assertNotIn("secret", calls[0][0])

    def test_grocy_create_uses_returned_object_id_for_initial_stock(self):
        calls = []

        def request(url, method, headers, body=None, timeout=20):
            calls.append((url, method, body))
            if url.endswith("/api/objects/products") and method == "GET":
                return []
            if url.endswith("/api/objects/locations"):
                return [{"id": 3, "name": "Vật tư em bé"}]
            if url.endswith("/api/objects/quantity_units"):
                return [{"id": 5, "name": "gói"}]
            if url.endswith("/api/objects/product_groups"):
                return [{"id": 1, "name": "Bỉm và vệ sinh"}]
            if url.endswith("/api/objects/products") and method == "POST":
                return {"created_object_id": 42}
            if url.endswith("/api/stock/products/42/inventory"):
                return None
            raise AssertionError(url)

        grocy = GrocyInventory("http://127.0.0.1:9283", "secret", request_json=request)
        grocy.create_item(name="Khăn ướt", category="baby", unit="gói", amount=2, min_amount=1)

        self.assertEqual(calls[-1][0], "http://127.0.0.1:9283/api/stock/products/42/inventory")
        self.assertEqual(calls[-1][2]["new_amount"], 2.0)

    def test_snapshot_exposes_only_bounded_inventory_fields(self):
        products = [
            {
                "id": 12,
                "name": "Bỉm sơ sinh",
                "qu_id_stock": 4,
                "min_stock_amount": 10,
                "description": "private note must not leave Grocy",
            }
        ]
        details = {12: {"stock_amount": 7, "last_price": 200000, "product": {"name": "ignored"}}}
        units = {4: "cái"}

        self.assertEqual(
            build_snapshot(products, details, units),
            [
                {
                    "source_product_id": 12,
                    "name": "Bỉm sơ sinh",
                    "quantity": 7.0,
                    "unit": "cái",
                    "min_quantity": 10.0,
                    "needs_restock": True,
                }
            ],
        )

    def test_worker_applies_create_and_adjust_actions_once(self):
        queue = FakeQueue(
            [
                InventoryAction("a", "create", None, "Khăn ướt", "baby", "gói", 2, 1),
                InventoryAction("b", "set_amount", 12, None, None, None, 6, None),
            ]
        )
        grocy = FakeGrocy()

        result = process_actions(queue, grocy)

        self.assertEqual(result, {"claimed": 2, "completed": 2, "failed": 0})
        self.assertEqual(
            grocy.created,
            [{"name": "Khăn ướt", "category": "baby", "unit": "gói", "amount": 2.0, "min_amount": 1.0}],
        )
        self.assertEqual(grocy.stock_levels, [(12, 6.0)])
        self.assertEqual(queue.completed, ["a", "b"])
        self.assertEqual(queue.failed, [])

    def test_worker_dead_letters_invalid_payload_without_calling_grocy(self):
        queue = FakeQueue([InventoryAction("bad", "set_amount", 0, None, None, None, -1, None)])
        grocy = FakeGrocy()

        result = process_actions(queue, grocy)

        self.assertEqual(result, {"claimed": 1, "completed": 0, "failed": 1})
        self.assertEqual(queue.failed, [("bad", "invalid_payload")])
        self.assertEqual(grocy.stock_levels, [])


if __name__ == "__main__":
    unittest.main()
