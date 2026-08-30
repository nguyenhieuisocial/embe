"""Publish explicitly approved Memos into the minimal Supabase portal read-model."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SENSITIVE_TAGS = {"gps", "health", "location", "medical", "private", "restricted"}
APPROVAL_TAG = "portal"
TAG_ONLY = re.compile(r"^(?:\s*#[\w-]+\s*)+$", re.UNICODE)
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")


def _normalized_tags(memo: dict[str, Any]) -> set[str]:
    return {str(tag).strip().lstrip("#").lower() for tag in memo.get("tags", []) if str(tag).strip()}


def _valid_timestamp(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return value


def _content_fields(content: str) -> tuple[str, str]:
    title = "Một ngày đáng nhớ"
    body: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or TAG_ONLY.fullmatch(line):
            continue
        heading = HEADING.fullmatch(line)
        if heading and title == "Một ngày đáng nhớ":
            title = heading.group(1).strip()
            continue
        line = re.sub(r"(?:^|\s)#portal(?:\s|$)", " ", line, flags=re.IGNORECASE).strip()
        if line:
            body.append(line)
    caption = "\n".join(body).strip()
    return title[:120], caption[:1000]


def sanitize_memo(memo: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    tags = _normalized_tags(memo)
    if str(memo.get("visibility", "")).upper() != "PUBLIC":
        return None
    if str(memo.get("state", "NORMAL")).upper() != "NORMAL":
        return None
    if APPROVAL_TAG not in tags or tags.intersection(SENSITIVE_TAGS):
        return None
    source_id = str(memo.get("name", "")).strip()
    event_at = _valid_timestamp(memo.get("createTime"))
    if not source_id.startswith("memos/") or event_at is None:
        return None
    title, caption = _content_fields(str(memo.get("content", "")))
    if not caption:
        return None
    return {
        "source_system": "memos",
        "source_event_id": source_id,
        "child_id": child_id,
        "event_at": event_at,
        "portal_event_type": "milestone" if "milestone" in tags else "journal",
        "title": title,
        "caption": caption,
        "album_cover_url": None,
        "portal_role": "family",
        "approved": True,
        "approved_at": event_at,
    }


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if raw_line and not raw_line.startswith("#") and "=" in raw_line:
            key, value = raw_line.split("=", 1)
            values[key] = value
    return values


def _json_request(url: str, method: str, headers: dict[str, str], body: Any = None) -> Any:
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=payload, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {error.code} from approved integration endpoint: {detail}") from error


@dataclass(frozen=True)
class MemosClient:
    base_url: str
    token: str

    def list_memos(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        page_token = ""
        for _ in range(100):
            query = {"pageSize": "100"}
            if page_token:
                query["pageToken"] = page_token
            payload = _json_request(
                f"{self.base_url.rstrip('/')}/api/v1/memos?{urlencode(query)}",
                "GET",
                {"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
            )
            results.extend(payload.get("memos", []))
            page_token = str(payload.get("nextPageToken", ""))
            if not page_token:
                return results
        raise RuntimeError("Memos pagination exceeded the safety ceiling")


@dataclass(frozen=True)
class SupabaseReadModel:
    base_url: str
    secret_key: str

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.secret_key,
            "Content-Type": "application/json; charset=utf-8",
        }

    def sync(self, events: list[dict[str, Any]]) -> dict[str, int]:
        result = _json_request(
            f"{self.base_url.rstrip('/')}/rest/v1/rpc/embe_sync_timeline",
            "POST",
            self.headers,
            {"p_events": events},
        )
        return {"upserted": int(result["upserted"]), "unapproved": int(result["unapproved"])}


def export_to_vault(events: list[dict[str, Any]], vault_root: Path) -> None:
    exporter_path = Path(__file__).parents[2] / "vault-export" / "src"
    sys.path.insert(0, str(exporter_path))
    from export import VaultExporter  # pylint: disable=import-outside-toplevel

    records = [
        {
            "source": "memos",
            "source_id": event["source_event_id"],
            "title": event["title"],
            "content": event["caption"],
            "exported_at": event["event_at"],
        }
        for event in events
    ]
    VaultExporter(
        vault_root=vault_root,
        notes_dirname="20-Timeline/Memos",
        archive_dirname="90-System/Memos-Archive",
    ).export(records)


def run_sync(env_path: Path, vault_root: Path, child_id: str = "embe-family") -> dict[str, Any]:
    env = read_env(env_path)
    required = ("MEMOS_BASE_URL", "MEMOS_PORTAL_PAT", "SUPABASE_URL", "SUPABASE_SECRET_KEY")
    missing = [name for name in required if not env.get(name)]
    if missing:
        raise RuntimeError(f"Missing integration settings: {', '.join(missing)}")
    memos = MemosClient(env["MEMOS_BASE_URL"], env["MEMOS_PORTAL_PAT"]).list_memos()
    events = [event for memo in memos if (event := sanitize_memo(memo, child_id)) is not None]
    read_model = SupabaseReadModel(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    sync_result = read_model.sync(events)
    export_to_vault(events, vault_root)
    return {
        "status": "ok",
        "scanned": len(memos),
        "published": len(events),
        "unapproved": sync_result["unapproved"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync approved Memos to the EmBe family portal.")
    parser.add_argument("--env", type=Path, default=Path(r"C:\EmBe\secrets\portal-data.env"))
    parser.add_argument("--vault", type=Path, default=Path(r"C:\EmBe\vault"))
    args = parser.parse_args()
    print(json.dumps(run_sync(args.env, args.vault), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
