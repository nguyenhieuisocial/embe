from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import TextIO


class CsvQuoteError(ValueError):
    pass


@dataclass(frozen=True)
class VerifiedQuote:
    listing_id: str
    unit_price: Decimal
    currency: str
    valid_until: datetime
    source_ref: str


def _parse_time(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CsvQuoteError("Thời hạn báo giá không hợp lệ") from exc


def read_verified_quotes(source: TextIO, *, now: datetime) -> list[VerifiedQuote]:
    required = {"listing_id", "unit_price", "currency", "valid_until", "verified", "source_ref"}
    reader = csv.DictReader(source)
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise CsvQuoteError("CSV thiếu cột bắt buộc")

    result: list[VerifiedQuote] = []
    for row in reader:
        if row["verified"].strip().lower() != "true":
            raise CsvQuoteError("Mọi báo giá phải được người dùng xác nhận")
        valid_until = _parse_time(row["valid_until"].strip())
        if valid_until < now:
            raise CsvQuoteError("CSV chứa báo giá đã hết hạn")
        try:
            unit_price = Decimal(row["unit_price"].strip())
        except InvalidOperation as exc:
            raise CsvQuoteError("Đơn giá không hợp lệ") from exc
        if unit_price < 0:
            raise CsvQuoteError("Đơn giá không được âm")
        listing_id = row["listing_id"].strip()
        currency = row["currency"].strip().upper()
        if not listing_id or not currency:
            raise CsvQuoteError("Mã sản phẩm và tiền tệ không được để trống")
        result.append(
            VerifiedQuote(
                listing_id=listing_id,
                unit_price=unit_price,
                currency=currency,
                valid_until=valid_until,
                source_ref=row["source_ref"].strip(),
            )
        )
    return result
