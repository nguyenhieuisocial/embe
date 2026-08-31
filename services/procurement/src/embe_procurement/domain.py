from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_CEILING, Decimal
from statistics import median
from typing import Mapping, Sequence


class ProcurementError(ValueError):
    pass


class InsufficientDataError(ProcurementError):
    pass


class ExpiredQuoteError(ProcurementError):
    pass


class MissingExchangeRateError(ProcurementError):
    pass


class ProposalStateError(ProcurementError):
    pass


class StaleProposalError(ProposalStateError):
    pass


@dataclass(frozen=True)
class ReorderRecommendation:
    daily_rate: Decimal
    lead_time_days: int
    required_units: Decimal
    purchase_packs: int


def recommend_reorder(
    *,
    daily_consumption: Sequence[Decimal],
    lead_times_days: Sequence[int],
    safety_stock: Decimal,
    on_hand: Decimal,
    in_transit: Decimal,
    units_per_pack: Decimal,
) -> ReorderRecommendation:
    if len(daily_consumption) < 3 or len(lead_times_days) < 3:
        raise InsufficientDataError("Cần ít nhất ba mẫu tiêu thụ và thời gian giao hàng")
    if units_per_pack <= 0:
        raise ProcurementError("Số đơn vị trong mỗi gói phải lớn hơn 0")

    daily_rate = Decimal(median(daily_consumption))
    lead_time_days = int(median(lead_times_days))
    required = max(
        Decimal("0"),
        daily_rate * lead_time_days + safety_stock - on_hand - in_transit,
    )
    packs = int((required / units_per_pack).to_integral_value(rounding=ROUND_CEILING))
    return ReorderRecommendation(daily_rate, lead_time_days, required, packs)


@dataclass(frozen=True)
class Quote:
    unit_price: Decimal
    currency: str
    valid_until: datetime


@dataclass(frozen=True)
class Shipping:
    domestic: Decimal
    handling: Decimal
    international_per_kg: Decimal
    actual_weight_kg: Decimal
    dimensions_cm: tuple[Decimal, Decimal, Decimal]
    dimensional_divisor: Decimal
    duty_rate: Decimal
    fx_spread_rate: Decimal


@dataclass(frozen=True)
class LandedCost:
    billable_weight_kg: Decimal
    merchandise_vnd: Decimal
    shipping_vnd: Decimal
    duty_vnd: Decimal
    fx_spread_vnd: Decimal
    total_vnd: Decimal


def calculate_landed_cost(
    *,
    quote: Quote,
    quantity: int,
    shipping: Shipping,
    exchange_rates: Mapping[str, Decimal],
    now: datetime,
) -> LandedCost:
    if quote.valid_until < now:
        raise ExpiredQuoteError("Báo giá đã hết hạn")
    if quote.currency not in exchange_rates:
        raise MissingExchangeRateError(f"Thiếu tỷ giá cho {quote.currency}")
    if quantity <= 0 or shipping.dimensional_divisor <= 0:
        raise ProcurementError("Số lượng và hệ số quy đổi phải lớn hơn 0")

    dimensional_weight = (
        shipping.dimensions_cm[0]
        * shipping.dimensions_cm[1]
        * shipping.dimensions_cm[2]
        / shipping.dimensional_divisor
    )
    billable_weight = max(shipping.actual_weight_kg, dimensional_weight)
    merchandise = quote.unit_price * quantity * exchange_rates[quote.currency]
    shipping_cost = (
        shipping.domestic
        + shipping.handling
        + shipping.international_per_kg * billable_weight
    )
    duty = merchandise * shipping.duty_rate
    fx_spread = merchandise * shipping.fx_spread_rate
    total = merchandise + shipping_cost + duty + fx_spread
    money = Decimal("0.01")
    return LandedCost(
        billable_weight_kg=billable_weight,
        merchandise_vnd=merchandise.quantize(money),
        shipping_vnd=shipping_cost.quantize(money),
        duty_vnd=duty.quantize(money),
        fx_spread_vnd=fx_spread.quantize(money),
        total_vnd=total.quantize(money),
    )


@dataclass
class Proposal:
    id: str
    state: str = "DRAFT"

    def transition(self, target: str, *, actor_kind: str) -> None:
        allowed = {
            "DRAFT": {"REVIEWED", "CANCELLED"},
            "REVIEWED": {"APPROVED", "CANCELLED"},
            "APPROVED": {"ORDERED", "CANCELLED"},
            "ORDERED": {"RECEIVED", "CANCELLED"},
        }
        if target not in allowed.get(self.state, set()):
            raise ProposalStateError(f"Không thể chuyển {self.state} sang {target}")
        if target in {"APPROVED", "ORDERED", "RECEIVED", "CANCELLED"} and actor_kind != "human":
            raise ProposalStateError("Bước này cần người dùng xác nhận")
        self.state = target
