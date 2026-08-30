import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_procurement.domain import (
    ExpiredQuoteError,
    InsufficientDataError,
    MissingExchangeRateError,
    Proposal,
    ProposalStateError,
    Quote,
    Shipping,
    calculate_landed_cost,
    recommend_reorder,
)


class ReorderRecommendationTests(unittest.TestCase):
    def test_recommends_whole_purchase_packs_from_robust_usage_and_lead_time(self):
        recommendation = recommend_reorder(
            daily_consumption=[Decimal("10"), Decimal("12"), Decimal("11")],
            lead_times_days=[6, 7, 30],
            safety_stock=Decimal("3"),
            on_hand=Decimal("50"),
            in_transit=Decimal("10"),
            units_per_pack=Decimal("30"),
        )

        self.assertEqual(recommendation.daily_rate, Decimal("11"))
        self.assertEqual(recommendation.lead_time_days, 7)
        self.assertEqual(recommendation.required_units, Decimal("20"))
        self.assertEqual(recommendation.purchase_packs, 1)

    def test_reports_insufficient_data_instead_of_guessing(self):
        with self.assertRaises(InsufficientDataError):
            recommend_reorder(
                daily_consumption=[Decimal("10"), Decimal("12")],
                lead_times_days=[7, 8, 9],
                safety_stock=Decimal("3"),
                on_hand=Decimal("0"),
                in_transit=Decimal("0"),
                units_per_pack=Decimal("30"),
            )


class LandedCostTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 31, tzinfo=timezone.utc)
        self.quote = Quote(
            unit_price=Decimal("100"),
            currency="CNY",
            valid_until=self.now + timedelta(days=1),
        )
        self.shipping = Shipping(
            domestic=Decimal("10"),
            handling=Decimal("5"),
            international_per_kg=Decimal("20"),
            actual_weight_kg=Decimal("2"),
            dimensions_cm=(Decimal("50"), Decimal("40"), Decimal("30")),
            dimensional_divisor=Decimal("5000"),
            duty_rate=Decimal("0.10"),
            fx_spread_rate=Decimal("0.02"),
        )

    def test_includes_dimensional_shipping_duty_and_fx_spread(self):
        result = calculate_landed_cost(
            quote=self.quote,
            quantity=2,
            shipping=self.shipping,
            exchange_rates={"CNY": Decimal("3500")},
            now=self.now,
        )

        self.assertEqual(result.billable_weight_kg, Decimal("12"))
        self.assertEqual(result.total_vnd, Decimal("784255.00"))

    def test_rejects_expired_quote(self):
        expired = Quote(
            unit_price=Decimal("100"),
            currency="CNY",
            valid_until=self.now - timedelta(seconds=1),
        )
        with self.assertRaises(ExpiredQuoteError):
            calculate_landed_cost(
                quote=expired,
                quantity=1,
                shipping=self.shipping,
                exchange_rates={"CNY": Decimal("3500")},
                now=self.now,
            )

    def test_rejects_missing_exchange_rate(self):
        with self.assertRaises(MissingExchangeRateError):
            calculate_landed_cost(
                quote=self.quote,
                quantity=1,
                shipping=self.shipping,
                exchange_rates={},
                now=self.now,
            )


class ProposalWorkflowTests(unittest.TestCase):
    def test_only_human_actor_can_approve_or_order(self):
        proposal = Proposal(id="proposal-1")

        proposal.transition("REVIEWED", actor_kind="system")
        with self.assertRaises(ProposalStateError):
            proposal.transition("APPROVED", actor_kind="system")

        proposal.transition("APPROVED", actor_kind="human")
        proposal.transition("ORDERED", actor_kind="human")
        self.assertEqual(proposal.state, "ORDERED")

    def test_duplicate_order_transition_is_refused(self):
        proposal = Proposal(id="proposal-1", state="ORDERED")
        with self.assertRaises(ProposalStateError):
            proposal.transition("ORDERED", actor_kind="human")


if __name__ == "__main__":
    unittest.main()
