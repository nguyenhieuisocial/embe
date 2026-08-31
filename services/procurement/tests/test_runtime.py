import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from embe_procurement.domain import ProposalStateError, Quote, Shipping
from embe_procurement.runtime import PlanInput, ProcurementRuntime


class ProcurementRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.database = Path(self.temporary.name) / "procurement.sqlite3"
        self.runtime = ProcurementRuntime(self.database)
        self.now = datetime(2026, 8, 31, tzinfo=timezone.utc)

    def tearDown(self):
        self.temporary.cleanup()

    def plan(self, *, samples=("10", "12", "11")) -> PlanInput:
        return PlanInput(
            product_ref="grocy:12",
            product_name="Bỉm sơ sinh",
            supplier_id="supplier-manual",
            supplier_name="Nguồn đã xác minh",
            listing_id="listing-12",
            units_per_pack=Decimal("30"),
            daily_consumption=tuple(Decimal(value) for value in samples),
            lead_times_days=(6, 7, 9),
            safety_stock=Decimal("20"),
            on_hand=Decimal("10"),
            in_transit=Decimal("0"),
            quote=Quote(Decimal("100"), "CNY", self.now + timedelta(days=2)),
            route_id="route-cn-vn",
            route_name="Kho trung gian",
            shipping=Shipping(
                domestic=Decimal("10"), handling=Decimal("5"),
                international_per_kg=Decimal("20"), actual_weight_kg=Decimal("2"),
                dimensions_cm=(Decimal("50"), Decimal("40"), Decimal("30")),
                dimensional_divisor=Decimal("5000"), duty_rate=Decimal("0.10"),
                fx_spread_rate=Decimal("0.02"),
            ),
            exchange_rates={"CNY": Decimal("3500")},
            now=self.now,
        )

    def test_plan_is_idempotent_and_projection_contains_only_bounded_decision_data(self):
        first = self.runtime.plan(self.plan())
        second = self.runtime.plan(self.plan())

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["state"], "DRAFT")
        self.assertGreater(first["estimated_total_vnd"], 0)
        self.assertEqual(self.runtime.projection(), [first])
        self.assertNotIn("source_ref", first)
        self.assertEqual(len(first["proposal_hash"]), 64)

    def test_runtime_can_restart_against_the_same_database(self):
        first = self.runtime.plan(self.plan())
        restarted = ProcurementRuntime(self.database)

        self.assertEqual(restarted.projection()[0]["id"], first["id"])

    def test_insufficient_history_is_reported_without_creating_a_proposal(self):
        result = self.runtime.plan(self.plan(samples=("10", "12")))

        self.assertEqual(result, {"status": "insufficient_data", "product_ref": "grocy:12"})
        self.assertEqual(self.runtime.projection(), [])

    def test_human_transition_is_hash_locked_and_audited(self):
        draft = self.runtime.plan(self.plan())

        reviewed = self.runtime.transition(
            draft["id"], "REVIEWED", actor_ref="family", expected_hash=draft["proposal_hash"]
        )
        approved = self.runtime.transition(
            draft["id"], "APPROVED", actor_ref="family", expected_hash=reviewed["proposal_hash"]
        )

        self.assertEqual(approved["state"], "APPROVED")
        with closing(sqlite3.connect(self.database)) as connection:
            actions = connection.execute(
                "SELECT action, actor_kind FROM approval ORDER BY created_at, action"
            ).fetchall()
        self.assertEqual(actions, [("REVIEWED", "human"), ("APPROVED", "human")])

    def test_stale_hash_and_invalid_state_do_not_mutate_the_proposal(self):
        draft = self.runtime.plan(self.plan())

        with self.assertRaises(ProposalStateError):
            self.runtime.transition(draft["id"], "APPROVED", actor_ref="family", expected_hash="0" * 64)
        with self.assertRaises(ProposalStateError):
            self.runtime.transition(draft["id"], "ORDERED", actor_ref="family", expected_hash=draft["proposal_hash"])

        self.assertEqual(self.runtime.projection()[0]["state"], "DRAFT")


if __name__ == "__main__":
    unittest.main()
