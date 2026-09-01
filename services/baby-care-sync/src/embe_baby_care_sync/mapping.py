from __future__ import annotations


class UnsupportedEvent(ValueError):
    pass


def _marker(event: dict) -> str:
    caregiver = "Mẹ Ngân" if event["caregiver"] == "mother" else "Ba Hiếu"
    note = str(event.get("details", {}).get("note") or "").strip()
    parts = [note] if note else []
    parts.extend((f"Người ghi: {caregiver}", f"embe:event:{event['id']}"))
    return " · ".join(parts)


def to_babybuddy(event: dict, child_id: int) -> tuple[str, dict]:
    kind = event.get("kind")
    detail = event.get("details") or {}
    occurred = event.get("occurred_at")
    ended = event.get("ended_at")
    base = {"child": child_id, "notes": _marker(event)}

    if kind == "feeding":
        milk_type = detail.get("milkType")
        if milk_type not in {"breast_milk", "formula"}:
            raise UnsupportedEvent("unsupported milk type")
        method = "bottle" if detail.get("mode") == "bottle" else {
            "left": "left breast", "right": "right breast", "both": "both breasts"
        }.get(detail.get("side"))
        if not method:
            raise UnsupportedEvent("unsupported feeding method")
        payload = {**base, "start": occurred, "end": ended,
                   "type": "breast milk" if milk_type == "breast_milk" else "formula",
                   "method": method}
        if detail.get("amountMl") is not None:
            payload["amount"] = detail["amountMl"]
        return "feedings", payload

    if kind == "pumping":
        payload = {**base, "start": occurred, "end": ended, "amount": detail.get("amountMl", 0)}
        payload["notes"] = f"{payload['notes']} · Bên: {detail.get('side', 'both')}"
        return "pumping", payload

    if kind == "sleep":
        return "sleep", {**base, "start": occurred, "end": ended, "nap": bool(detail.get("nap"))}

    if kind == "diaper":
        payload = {**base, "time": occurred, "wet": bool(detail.get("wet")), "solid": bool(detail.get("solid"))}
        if detail.get("color") in {"black", "brown", "green", "yellow"}:
            payload["color"] = detail["color"]
        return "changes", payload

    if kind == "temperature":
        return "temperature", {**base, "time": occurred, "temperature": detail.get("temperatureC")}

    if kind == "care":
        labels = {"bath": "Đã tắm", "cord": "Đã chăm rốn", "vitamin": "Đã dùng vitamin theo hướng dẫn",
                  "medicine": "Đã dùng thuốc theo hướng dẫn", "other": "Chăm sóc khác"}
        action = labels.get(detail.get("action"))
        if not action:
            raise UnsupportedEvent("unsupported care action")
        return "notes", {"child": child_id, "time": occurred, "note": f"{action} · {_marker(event)}"}

    raise UnsupportedEvent("unsupported event kind")
