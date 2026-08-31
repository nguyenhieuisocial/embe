from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Sequence

from .domain import (
    InsufficientDataError,
    Proposal,
    ProposalStateError,
    Quote,
    Shipping,
    StaleProposalError,
    calculate_landed_cost,
    recommend_reorder,
)


MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "0001_procurement.sql"
OPEN_STATES = ("DRAFT", "REVIEWED", "APPROVED", "ORDERED")


@dataclass(frozen=True)
class PlanInput:
    product_ref: str
    product_name: str
    supplier_id: str
    supplier_name: str
    listing_id: str
    units_per_pack: Decimal
    daily_consumption: Sequence[Decimal]
    lead_times_days: Sequence[int]
    safety_stock: Decimal
    on_hand: Decimal
    in_transit: Decimal
    quote: Quote
    route_id: str
    route_name: str
    shipping: Shipping
    exchange_rates: Mapping[str, Decimal]
    now: datetime


def _bounded_text(value: str, *, maximum: int = 128) -> str:
    clean = value.strip()
    if not clean or len(clean) > maximum or any(ord(character) < 32 for character in clean):
        raise ValueError("invalid procurement text")
    return clean


def _utc(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("procurement timestamps must include a timezone")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class ProcurementRuntime:
    def __init__(self, database: Path):
        self.database = Path(database)
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection, connection:
            connection.executescript(MIGRATION.read_text(encoding="utf-8"))

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    @staticmethod
    def _row_payload(row: sqlite3.Row) -> dict[str, object]:
        payload: dict[str, object] = {
            "id": row["id"],
            "product_ref": row["product_ref"],
            "product_name": row["product_name"],
            "state": row["state"],
            "packs": int(row["packs"]),
            "required_units": float(row["required_units"] or 0),
            "estimated_total_vnd": float(row["estimated_total_vnd"] or 0),
            "updated_at": row["updated_at"],
        }
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        payload["proposal_hash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        return payload

    @staticmethod
    def _select(connection: sqlite3.Connection, proposal_id: str | None = None) -> list[sqlite3.Row]:
        where = "WHERE proposal.id = ?" if proposal_id else ""
        parameters = (proposal_id,) if proposal_id else ()
        return connection.execute(
            "SELECT proposal.id, proposal.product_ref, listing.title AS product_name, "
            "proposal.state, proposal.packs, proposal.required_units, "
            "proposal.estimated_total_vnd, proposal.updated_at "
            "FROM purchase_proposal AS proposal "
            "LEFT JOIN supplier_listing AS listing ON listing.id = proposal.listing_id "
            f"{where} ORDER BY proposal.updated_at DESC, proposal.id",
            parameters,
        ).fetchall()

    def projection(self) -> list[dict[str, object]]:
        with closing(self._connect()) as connection:
            return [self._row_payload(row) for row in self._select(connection)]

    def plan(self, item: PlanInput) -> dict[str, object]:
        product_ref = _bounded_text(item.product_ref)
        product_name = _bounded_text(item.product_name, maximum=80)
        supplier_id = _bounded_text(item.supplier_id)
        supplier_name = _bounded_text(item.supplier_name, maximum=80)
        listing_id = _bounded_text(item.listing_id)
        route_id = _bounded_text(item.route_id)
        route_name = _bounded_text(item.route_name, maximum=80)
        try:
            recommendation = recommend_reorder(
                daily_consumption=item.daily_consumption,
                lead_times_days=item.lead_times_days,
                safety_stock=item.safety_stock,
                on_hand=item.on_hand,
                in_transit=item.in_transit,
                units_per_pack=item.units_per_pack,
            )
        except InsufficientDataError:
            return {"status": "insufficient_data", "product_ref": product_ref}
        if recommendation.purchase_packs == 0:
            return {"status": "not_required", "product_ref": product_ref}

        landed = calculate_landed_cost(
            quote=item.quote,
            quantity=recommendation.purchase_packs,
            shipping=item.shipping,
            exchange_rates=item.exchange_rates,
            now=item.now,
        )
        timestamp = _utc(item.now)
        quote_key = "|".join(
            (listing_id, str(item.quote.unit_price), item.quote.currency, _utc(item.quote.valid_until))
        )
        quote_id = hashlib.sha256(quote_key.encode("utf-8")).hexdigest()[:32]
        snapshot = json.dumps(
            {
                "daily_rate": str(recommendation.daily_rate),
                "lead_time_days": recommendation.lead_time_days,
                "safety_stock": str(item.safety_stock),
                "on_hand": str(item.on_hand),
                "in_transit": str(item.in_transit),
                "units_per_pack": str(item.units_per_pack),
                "quote_valid_until": _utc(item.quote.valid_until),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

        with closing(self._connect()) as connection, connection:
            connection.execute(
                "INSERT INTO supplier (id, name, source_kind) VALUES (?, ?, 'manual') "
                "ON CONFLICT(id) DO UPDATE SET name = excluded.name",
                (supplier_id, supplier_name),
            )
            connection.execute(
                "INSERT INTO supplier_listing "
                "(id, supplier_id, product_ref, title, units_per_pack) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET supplier_id = excluded.supplier_id, "
                "product_ref = excluded.product_ref, title = excluded.title, "
                "units_per_pack = excluded.units_per_pack",
                (listing_id, supplier_id, product_ref, product_name, str(item.units_per_pack)),
            )
            connection.execute(
                "INSERT INTO warehouse_route "
                "(id, name, domestic_shipping, handling, international_per_kg, dimensional_divisor, lead_time_days) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, "
                "domestic_shipping = excluded.domestic_shipping, handling = excluded.handling, "
                "international_per_kg = excluded.international_per_kg, "
                "dimensional_divisor = excluded.dimensional_divisor, lead_time_days = excluded.lead_time_days",
                (
                    route_id, route_name, str(item.shipping.domestic), str(item.shipping.handling),
                    str(item.shipping.international_per_kg), str(item.shipping.dimensional_divisor),
                    recommendation.lead_time_days,
                ),
            )
            connection.execute(
                "INSERT INTO quote "
                "(id, listing_id, unit_price, currency, quoted_at, valid_until, source_ref) "
                "VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING",
                (
                    quote_id, listing_id, str(item.quote.unit_price), item.quote.currency,
                    timestamp, _utc(item.quote.valid_until),
                ),
            )
            existing = connection.execute(
                "SELECT id, state FROM purchase_proposal WHERE product_ref = ? "
                "AND state IN ('DRAFT','REVIEWED','APPROVED','ORDERED') LIMIT 1",
                (product_ref,),
            ).fetchone()
            if existing is None:
                proposal_id = str(uuid.uuid4())
                connection.execute(
                    "INSERT INTO purchase_proposal "
                    "(id, product_ref, listing_id, quote_id, warehouse_route_id, state, packs, "
                    "required_units, estimated_total_vnd, input_snapshot, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)",
                    (
                        proposal_id, product_ref, listing_id, quote_id, route_id,
                        recommendation.purchase_packs, str(recommendation.required_units),
                        str(landed.total_vnd), snapshot, timestamp, timestamp,
                    ),
                )
            else:
                proposal_id = str(existing["id"])
                if existing["state"] == "DRAFT":
                    connection.execute(
                        "UPDATE purchase_proposal SET listing_id = ?, quote_id = ?, warehouse_route_id = ?, "
                        "packs = ?, required_units = ?, estimated_total_vnd = ?, input_snapshot = ?, updated_at = ? "
                        "WHERE id = ? AND state = 'DRAFT'",
                        (
                            listing_id, quote_id, route_id, recommendation.purchase_packs,
                            str(recommendation.required_units), str(landed.total_vnd), snapshot,
                            timestamp, proposal_id,
                        ),
                    )
            row = self._select(connection, proposal_id)[0]
            return self._row_payload(row)

    def transition(
        self,
        proposal_id: str,
        target: str,
        *,
        actor_ref: str,
        expected_hash: str,
    ) -> dict[str, object]:
        proposal_id = _bounded_text(proposal_id)
        actor_ref = _bounded_text(actor_ref, maximum=80)
        if len(expected_hash) != 64:
            raise StaleProposalError("Dữ liệu đề xuất đã thay đổi; cần tải lại trước khi duyệt")
        with closing(self._connect()) as connection, connection:
            rows = self._select(connection, proposal_id)
            if not rows:
                raise ProposalStateError("Không tìm thấy đề xuất")
            current = self._row_payload(rows[0])
            if current["proposal_hash"] != expected_hash:
                raise StaleProposalError("Dữ liệu đề xuất đã thay đổi; cần tải lại trước khi duyệt")
            proposal = Proposal(id=proposal_id, state=str(current["state"]))
            proposal.transition(target, actor_kind="human")
            timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            approval_id = str(uuid.uuid4())
            connection.execute(
                "UPDATE purchase_proposal SET state = ?, updated_at = ? WHERE id = ? AND state = ?",
                (proposal.state, timestamp, proposal_id, current["state"]),
            )
            if connection.execute("SELECT changes()").fetchone()[0] != 1:
                raise StaleProposalError("Dữ liệu đề xuất đã thay đổi; cần tải lại trước khi duyệt")
            connection.execute(
                "INSERT INTO approval (id, proposal_id, action, actor_ref, actor_kind, proposal_hash, created_at) "
                "VALUES (?, ?, ?, ?, 'human', ?, ?)",
                (approval_id, proposal_id, proposal.state, actor_ref, expected_hash, timestamp),
            )
            return self._row_payload(self._select(connection, proposal_id)[0])
