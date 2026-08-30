from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

FAMILY_TIMEZONE = timezone(timedelta(hours=7), name="Asia/Ho_Chi_Minh")
FAMILY_NAME = "Gia đình Hiếu - Ngân"

LOCAL_BFF_SOURCE = Path(__file__).resolve().parents[1] / "local-bff" / "src"
if str(LOCAL_BFF_SOURCE) not in sys.path:
    sys.path.insert(0, str(LOCAL_BFF_SOURCE))
from sync_portal import list_portal_memos, read_env, sanitize_memo  # noqa: E402


def _parse_month(month_key: str) -> tuple[int, int]:
    try:
        value = datetime.strptime(month_key, "%Y-%m")
    except ValueError as error:
        raise ValueError("month must use YYYY-MM") from error
    return value.year, value.month


def previous_month_key(now: datetime | None = None) -> str:
    local = (now or datetime.now(timezone.utc)).astimezone(FAMILY_TIMEZONE)
    if local.month == 1:
        return f"{local.year - 1}-12"
    return f"{local.year}-{local.month - 1:02d}"


def _event_in_month(event: dict[str, Any], year: int, month: int) -> bool:
    timestamp = datetime.fromisoformat(str(event["event_at"]).replace("Z", "+00:00"))
    local = timestamp.astimezone(FAMILY_TIMEZONE)
    return local.year == year and local.month == month


def approved_events_from_memos(memos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        event
        for memo in memos
        if (event := sanitize_memo(memo, "embe-family")) is not None
    ]


def build_monthly_document(events: list[dict[str, Any]], month_key: str) -> dict[str, Any]:
    year, month = _parse_month(month_key)
    selected = sorted(
        (event for event in events if _event_in_month(event, year, month)),
        key=lambda event: str(event["event_at"]),
    )
    provenance = [
        {
            "source_event_id": str(event["source_event_id"]),
            "event_at": str(event["event_at"]),
            "caption_sha256": hashlib.sha256(str(event["caption"]).encode("utf-8")).hexdigest(),
        }
        for event in selected
    ]
    if selected:
        subsections = [
            {"title": str(event["title"]), "paragraphs": [str(event["caption"])]}
            for event in selected
        ]
        overview = f"Gia đình đã chọn {len(selected)} nhật ký để lưu trong tháng này."
    else:
        subsections = []
        overview = "Tháng này chưa có nhật ký nào được bố mẹ chọn để đưa vào sách."

    return {
        "schema_version": 1,
        "status": "DRAFT",
        "month_key": month_key,
        "title": "Nhật ký Em Bé",
        "month": f"Tháng {month:02d} / {year}",
        "family": FAMILY_NAME,
        "intro": "Bản nháp tự động từ những nhật ký đã được bố mẹ chọn cho gia đình.",
        "source_manifest": {"event_count": len(selected), "events": provenance},
        "sections": [
            {
                "title": "Nhật ký trong tháng",
                "paragraphs": [overview],
                "subsections": subsections,
            },
            {
                "title": "Trạng thái bản sách",
                "paragraphs": [
                    "Đây là bản nháp. Bố mẹ cần xem lại nội dung trước khi gửi in."
                ],
                "metrics": [
                    {"label": "Nhật ký đã chọn", "value": str(len(selected)), "note": "Nguồn Memos đã duyệt"},
                    {"label": "Trạng thái", "value": "BẢN NHÁP", "note": "Chưa duyệt để in"},
                ],
            },
        ],
    }


def write_monthly_snapshot(document: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    temporary.replace(output)


def run_export(
    env_path: Path,
    month_key: str,
    output: Path,
    memo_loader: Callable[[dict[str, str]], list[dict[str, Any]]] = list_portal_memos,
) -> dict[str, Any]:
    memos = memo_loader(read_env(env_path))
    document = build_monthly_document(approved_events_from_memos(memos), month_key)
    write_monthly_snapshot(document, output)
    return {"month": month_key, "selected": document["source_manifest"]["event_count"]}


def main(argv: list[str] | None = None) -> int:
    project_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Export reviewed family memos for a monthly draft book.")
    parser.add_argument("--env", type=Path, default=project_root / "secrets/runtime/portal-sync.env")
    parser.add_argument("--month", default=previous_month_key())
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    output = args.output or project_root / "exports/monthly" / args.month / "source.json"
    result = run_export(args.env, args.month, output)
    print(json.dumps({"status": "ok", **result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
