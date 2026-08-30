"""Publish explicitly approved Memos into the minimal Supabase portal read-model."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SENSITIVE_TAGS = {"gps", "health", "location", "medical", "private", "restricted"}
APPROVAL_TAG = "portal"
SYNC_BATCH_SIZE = 500
TAG_ONLY = re.compile(r"^(?:\s*#[\w-]+\s*)+$", re.UNICODE)
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")
JOURNAL_MARKER = re.compile(r"<!--\s*embe-journal:([0-9a-f-]{36})\s*-->", re.IGNORECASE)


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
    if str(memo.get("visibility", "")).upper() != "PRIVATE":
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
    safe_headers = {"User-Agent": "EmBe-Local-Sync/1.0", **headers}
    for attempt, delay in enumerate((0, 1, 2, 4)):
        if delay:
            time.sleep(delay)
        request = Request(url, data=payload, headers=safe_headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as error:
            if error.code not in {408, 425, 429, 500, 502, 503, 504} or attempt == 3:
                raise RuntimeError(f"Integration endpoint returned HTTP {error.code}") from error
        except (URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                raise RuntimeError("Integration endpoint is temporarily unavailable") from error
    raise RuntimeError("Integration request exhausted its retry policy")


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

    def create_private_memo(self, content: str) -> dict[str, Any]:
        return _json_request(
            f"{self.base_url.rstrip('/')}/api/v1/memos",
            "POST",
            {
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json; charset=utf-8",
            },
            {"content": content, "visibility": "PRIVATE"},
        )


def list_portal_memos(env: dict[str, str]) -> list[dict[str, Any]]:
    token_names = ("MEMOS_PORTAL_PAT", "MEMOS_BABYBUDDY_PORTAL_PAT")
    by_name: dict[str, dict[str, Any]] = {}
    for token_name in token_names:
        token = env.get(token_name)
        if not token:
            continue
        for memo in MemosClient(env["MEMOS_BASE_URL"], token).list_memos():
            name = str(memo.get("name", ""))
            if name:
                by_name[name] = memo
    return list(by_name.values())


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
        sync_run_id = str(uuid.uuid4())
        for offset in range(0, len(events), SYNC_BATCH_SIZE):
            _json_request(
                f"{self.base_url.rstrip('/')}/rest/v1/rpc/embe_stage_timeline_batch",
                "POST",
                self.headers,
                {
                    "p_sync_run_id": sync_run_id,
                    "p_events": events[offset : offset + SYNC_BATCH_SIZE],
                },
            )
        result = _json_request(
            f"{self.base_url.rstrip('/')}/rest/v1/rpc/embe_finalize_timeline_sync",
            "POST",
            self.headers,
            {"p_sync_run_id": sync_run_id, "p_expected_count": len(events)},
        )
        return {"upserted": int(result["upserted"]), "unapproved": int(result["unapproved"])}


@dataclass(frozen=True)
class SupabaseJournalInbox:
    base_url: str
    secret_key: str

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.secret_key,
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json; charset=utf-8",
        }

    def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        return _json_request(
            f"{self.base_url.rstrip('/')}/rest/v1/rpc/{name}",
            "POST",
            self.headers,
            body,
        )

    def claim(self, limit: int = 10) -> list[dict[str, Any]]:
        result = self._rpc("embe_claim_journal_entries", {"p_limit": max(1, min(limit, 20))})
        return result if isinstance(result, list) else []

    def complete(self, entry_id: str) -> None:
        self._rpc("embe_complete_journal_entry", {"p_id": entry_id})

    def fail(self, entry_id: str, error_code: str) -> None:
        self._rpc("embe_fail_journal_entry", {"p_id": entry_id, "p_error_code": error_code})

    def status(self) -> dict[str, int]:
        result = self._rpc("embe_journal_queue_status", {})
        value = result if isinstance(result, dict) else {}
        return {
            "pending": int(value.get("pending", 0)),
            "processing": int(value.get("processing", 0)),
            "dead_letters": int(value.get("dead_letters", 0)),
        }


def import_journal_inbox(
    inbox: SupabaseJournalInbox,
    memos_client: MemosClient,
    existing_memos: list[dict[str, Any]],
) -> dict[str, int]:
    existing_ids = {
        match.group(1).lower()
        for memo in existing_memos
        for match in JOURNAL_MARKER.finditer(str(memo.get("content", "")))
    }
    claimed = inbox.claim(limit=10)
    imported = 0
    failed = 0
    author_names = {"father": "Ba Hiếu", "mother": "Mẹ Ngân"}

    for entry in claimed:
        entry_id = str(entry.get("id", "")).lower()
        content = str(entry.get("content", "")).strip()
        author = author_names.get(str(entry.get("author_role", "")))
        try:
            uuid.UUID(entry_id)
            if not author or not 1 <= len(content) <= 1000:
                raise ValueError("invalid inbox payload")
            if entry_id not in existing_ids:
                memos_client.create_private_memo(
                    f"# Nhật ký của {author}\n\n{content}\n\n#portal\n\n"
                    f"<!-- embe-journal:{entry_id} -->"
                )
                existing_ids.add(entry_id)
            inbox.complete(entry_id)
            imported += 1
        except ValueError:
            inbox.fail(entry_id, "invalid_payload")
            failed += 1
        except Exception:  # one unavailable dependency must not lose or block other entries
            inbox.fail(entry_id, "memos_unavailable")
            failed += 1
    return {"claimed": len(claimed), "imported": imported, "failed": failed}


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
    ).export(records, reconcile=True)


def run_sync(env_path: Path, vault_root: Path, child_id: str = "embe-family") -> dict[str, Any]:
    env = read_env(env_path)
    required = ("MEMOS_BASE_URL", "MEMOS_PORTAL_PAT", "SUPABASE_URL", "SUPABASE_SECRET_KEY")
    missing = [name for name in required if not env.get(name)]
    if missing:
        raise RuntimeError(f"Missing integration settings: {', '.join(missing)}")
    memos_client = MemosClient(env["MEMOS_BASE_URL"], env["MEMOS_PORTAL_PAT"])
    existing_human_memos = memos_client.list_memos()
    inbox = SupabaseJournalInbox(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    inbox_result = import_journal_inbox(
        inbox,
        memos_client,
        existing_human_memos,
    )
    inbox_result.update(inbox.status())
    memos = list_portal_memos(env)
    events = [event for memo in memos if (event := sanitize_memo(memo, child_id)) is not None]
    read_model = SupabaseReadModel(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    sync_result = read_model.sync(events)
    export_to_vault(events, vault_root)
    return {
        "status": "ok",
        "scanned": len(memos),
        "published": len(events),
        "unapproved": sync_result["unapproved"],
        "journal_inbox": inbox_result,
    }


def _read_status(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def _append_log(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 1_000_000:
        recent = path.read_text(encoding="utf-8", errors="replace").splitlines()[-200:]
        path.write_text("\n".join(recent) + "\n", encoding="utf-8")
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync approved Memos to the EmBe family portal.")
    parser.add_argument("--env", type=Path, default=Path(r"C:\EmBe\secrets\runtime\portal-sync.env"))
    parser.add_argument("--vault", type=Path, default=Path(r"C:\EmBe\embe"))
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\portal-sync.json"))
    parser.add_argument("--log", type=Path, default=Path(r"C:\EmBe\data\logs\portal-sync.jsonl"))
    args = parser.parse_args()
    attempted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    previous = _read_status(args.status)
    try:
        result = run_sync(args.env, args.vault)
        status = {
            **result,
            "last_attempt_at": attempted_at,
            "last_success_at": attempted_at,
        }
        _write_status(args.status, status)
        _append_log(args.log, status)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:  # the scheduled task must persist a safe failure signal
        status = {
            "status": "error",
            "last_attempt_at": attempted_at,
            "last_success_at": previous.get("last_success_at"),
            "error_type": type(error).__name__,
        }
        _write_status(args.status, status)
        _append_log(args.log, status)
        print("Portal timeline sync failed; see the local status file.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
