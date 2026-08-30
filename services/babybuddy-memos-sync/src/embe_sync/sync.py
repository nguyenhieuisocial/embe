from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from .transport import AuthFailure, Conflict, HttpClient, NotFound, PermanentFailure, TransientFailure


@dataclass(frozen=True)
class BabyBuddyNote:
    id: int
    child: int
    note: str
    time: str
    tags: tuple[str, ...]

    @classmethod
    def from_api(cls, value: dict) -> "BabyBuddyNote":
        try:
            return cls(
                id=int(value["id"]),
                child=int(value["child"]),
                note=str(value["note"]),
                time=str(value["time"]),
                tags=tuple(str(tag) for tag in value.get("tags", [])),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise PermanentFailure("BabyBuddy returned a malformed note") from error


def canonical_hash(note: BabyBuddyNote) -> str:
    try:
        timestamp = datetime.fromisoformat(note.time.replace("Z", "+00:00")).astimezone(timezone.utc)
        canonical_time = timestamp.isoformat().replace("+00:00", "Z")
    except ValueError as error:
        raise PermanentFailure("BabyBuddy returned an invalid note timestamp") from error
    payload = {
        "child": note.child,
        "id": note.id,
        "note": note.note,
        "tags": sorted(set(tag.strip().lower() for tag in note.tags)),
        "time": canonical_time,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def render_memo(note: BabyBuddyNote) -> str:
    tags = ["#milestone", "#babybuddy"]
    if "portal" in note.tags:
        tags.append("#portal")
    marker = json.dumps(
        {"origin": "babybuddy", "schema": 1, "source_id": note.id},
        sort_keys=True,
        separators=(",", ":"),
    )
    return f"{note.note.strip()}\n\n{' '.join(tags)}\n\n<!-- embe-sync:{marker} -->"


def owned_source_id(content: str) -> int | None:
    prefix = "<!-- embe-sync:"
    suffix = " -->"
    for line in reversed(content.splitlines()):
        stripped = line.strip()
        if not (stripped.startswith(prefix) and stripped.endswith(suffix)):
            continue
        try:
            marker = json.loads(stripped[len(prefix) : -len(suffix)])
        except json.JSONDecodeError:
            return None
        if marker.get("origin") != "babybuddy" or marker.get("schema") != 1:
            return None
        source_id = marker.get("source_id")
        return source_id if isinstance(source_id, int) and source_id > 0 else None
    return None


@dataclass(frozen=True)
class LedgerEntry:
    note_id: int
    memo_id: str
    digest: str
    archived: bool
    missing_scans: int


class Ledger:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS synced_notes (
                note_id INTEGER PRIMARY KEY,
                memo_id TEXT NOT NULL UNIQUE,
                digest TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                missing_scans INTEGER NOT NULL DEFAULT 0,
                synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS deadletters (
                note_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(note_id, reason)
            )
            """
        )
        columns = {row[1] for row in self.connection.execute("PRAGMA table_info(synced_notes)")}
        if "missing_scans" not in columns:
            self.connection.execute("ALTER TABLE synced_notes ADD COLUMN missing_scans INTEGER NOT NULL DEFAULT 0")
        self.connection.commit()

    def close(self):
        self.connection.close()

    def get(self, note_id: int) -> LedgerEntry | None:
        row = self.connection.execute(
            "SELECT note_id, memo_id, digest, archived, missing_scans FROM synced_notes WHERE note_id = ?", (note_id,)
        ).fetchone()
        return LedgerEntry(row[0], row[1], row[2], bool(row[3]), row[4]) if row else None

    def save(self, note_id: int, memo_id: str, digest: str, *, archived: bool):
        self.connection.execute(
            """
            INSERT INTO synced_notes (note_id, memo_id, digest, archived)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(note_id) DO UPDATE SET
                memo_id = excluded.memo_id,
                digest = excluded.digest,
                archived = excluded.archived,
                missing_scans = 0,
                synced_at = CURRENT_TIMESTAMP
            """,
            (note_id, memo_id, digest, int(archived)),
        )
        self.connection.commit()

    def set_archived(self, note_id: int, archived: bool):
        self.connection.execute(
            "UPDATE synced_notes SET archived = ?, synced_at = CURRENT_TIMESTAMP WHERE note_id = ?",
            (int(archived), note_id),
        )
        self.connection.commit()

    def increment_missing(self, note_id: int) -> int:
        self.connection.execute(
            "UPDATE synced_notes SET missing_scans = missing_scans + 1 WHERE note_id = ?", (note_id,)
        )
        self.connection.commit()
        return self.get(note_id).missing_scans

    def reset_missing(self, note_id: int):
        self.connection.execute("UPDATE synced_notes SET missing_scans = 0 WHERE note_id = ?", (note_id,))
        self.connection.commit()

    def add_deadletter(self, note_id: int, reason: str):
        self.connection.execute(
            "INSERT OR IGNORE INTO deadletters (note_id, reason) VALUES (?, ?)", (note_id, reason)
        )
        self.connection.commit()

    def deadletters(self) -> list[tuple[int, str]]:
        return self.connection.execute(
            "SELECT note_id, reason FROM deadletters ORDER BY note_id, reason"
        ).fetchall()

    def rebuild(self, records: list[dict]) -> int:
        recovered = 0
        for record in records:
            content = record.get("content")
            if not isinstance(content, str):
                continue
            note_id = owned_source_id(content)
            if note_id is None:
                continue
            memo_id = str(record.get("name", "")).rsplit("/", 1)[-1]
            if memo_id != f"bb-note-{note_id}":
                self.add_deadletter(note_id, "memo_id_marker_mismatch")
                continue
            digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
            self.save(note_id, memo_id, digest, archived=record.get("state") == "ARCHIVED")
            recovered += 1
        return recovered

    def all_active(self) -> list[LedgerEntry]:
        rows = self.connection.execute(
            "SELECT note_id, memo_id, digest, archived, missing_scans FROM synced_notes WHERE archived = 0 ORDER BY note_id"
        ).fetchall()
        return [LedgerEntry(row[0], row[1], row[2], bool(row[3]), row[4]) for row in rows]


class BabyBuddyClient:
    def __init__(self, base_url: str, token: str, http: HttpClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Token {token}"}
        self.http = http or HttpClient()

    def list_notes(self, *, limit: int, offset: int):
        query = urlencode({"tags": "milestone", "limit": limit, "offset": offset})
        value = self.http.request_json(
            "GET", f"{self.base_url}/api/notes/?{query}", headers=self.headers
        )
        if not isinstance(value, dict):
            raise PermanentFailure("BabyBuddy returned a malformed page")
        results = value.get("results")
        if not isinstance(results, list):
            raise PermanentFailure("BabyBuddy returned a malformed page")
        return {**value, "results": [BabyBuddyNote.from_api(item) for item in results]}


class MemosClient:
    def __init__(self, base_url: str, token: str, http: HttpClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.http = http or HttpClient()

    def get(self, memo_id: str):
        try:
            return self.http.request_json(
                "GET", f"{self.base_url}/api/v1/memos/{memo_id}", headers=self.headers
            )
        except NotFound:
            return None

    def list_for_rebuild(self) -> list[dict]:
        records = []
        for state in ("NORMAL", "ARCHIVED"):
            page_token = ""
            for _ in range(100):
                query = {"pageSize": 1000, "state": state}
                if page_token:
                    query["pageToken"] = page_token
                payload = self.http.request_json(
                    "GET",
                    f"{self.base_url}/api/v1/memos?{urlencode(query)}",
                    headers=self.headers,
                )
                if not isinstance(payload, dict) or not isinstance(payload.get("memos", []), list):
                    raise PermanentFailure("Memos returned a malformed recovery page")
                records.extend(payload.get("memos", []))
                page_token = str(payload.get("nextPageToken", ""))
                if not page_token:
                    break
            else:
                raise PermanentFailure("Memos recovery pagination exceeded safety limit")
        return records

    def create(self, memo_id: str, content: str, visibility: str = "PRIVATE"):
        payload = {"memoId": memo_id, "content": content, "visibility": visibility}
        try:
            self.http.request_json("POST", f"{self.base_url}/api/v1/memos", payload, self.headers)
        except Conflict:
            existing = self.get(memo_id)
            if existing is None:
                raise PermanentFailure("Memos reported a conflicting memo that cannot be read") from None
            expected_source = owned_source_id(content)
            if expected_source is None or owned_source_id(str(existing.get("content", ""))) != expected_source:
                raise PermanentFailure("Memos deterministic id collision") from None
            if not self.update(memo_id, content):
                raise PermanentFailure("Memos memo disappeared during conflict recovery") from None

    def update(self, memo_id: str, content: str) -> bool:
        payload = {
            "memo": {"content": content, "visibility": "PRIVATE"},
            "updateMask": "content,visibility",
        }
        try:
            self.http.request_json(
                "PATCH", f"{self.base_url}/api/v1/memos/{memo_id}", payload, self.headers
            )
            return True
        except NotFound:
            return False

    def archive(self, memo_id: str):
        self._set_state(memo_id, "ARCHIVED")

    def restore(self, memo_id: str):
        self._set_state(memo_id, "NORMAL")

    def _set_state(self, memo_id: str, state: str):
        payload = {"memo": {"state": state}, "updateMask": "state"}
        try:
            self.http.request_json(
                "PATCH", f"{self.base_url}/api/v1/memos/{memo_id}", payload, self.headers
            )
        except NotFound:
            if state == "NORMAL":
                raise PermanentFailure("archived Memos memo no longer exists") from None


class SyncEngine:
    def __init__(self, babybuddy, memos, ledger: Ledger, *, page_size: int = 100):
        self.babybuddy = babybuddy
        self.memos = memos
        self.ledger = ledger
        self.page_size = page_size

    def run(self) -> dict[str, int]:
        notes = self._complete_scan()
        counts = {"created": 0, "updated": 0, "archived": 0, "restored": 0, "unchanged": 0}

        seen = set()
        for note in notes:
            if "milestone" not in note.tags:
                continue
            seen.add(note.id)
            memo_id = f"bb-note-{note.id}"
            digest = canonical_hash(note)
            current = self.ledger.get(note.id)
            content = render_memo(note)

            if current is None:
                existing = self.memos.get(memo_id)
                if existing is not None:
                    if owned_source_id(str(existing.get("content", ""))) != note.id:
                        self.ledger.add_deadletter(note.id, "memo_id_collision")
                        raise PermanentFailure("deterministic memo id collision")
                    if existing.get("state") == "ARCHIVED":
                        self.memos.restore(memo_id)
                        counts["restored"] += 1
                    if existing.get("content") != content:
                        if not self.memos.update(memo_id, content):
                            raise PermanentFailure("owned memo disappeared during recovery")
                        counts["updated"] += 1
                    else:
                        counts["unchanged"] += 1
                else:
                    self.memos.create(memo_id, content, visibility="PRIVATE")
                    counts["created"] += 1
                self.ledger.save(note.id, memo_id, digest, archived=False)
            elif current.archived:
                existing = self.memos.get(memo_id)
                if existing is None:
                    self.memos.create(memo_id, content, visibility="PRIVATE")
                else:
                    if owned_source_id(str(existing.get("content", ""))) != note.id:
                        self.ledger.add_deadletter(note.id, "memo_ownership_lost")
                        raise PermanentFailure("memo ownership marker was lost")
                    self.memos.restore(memo_id)
                    if current.digest != digest:
                        if not self.memos.update(memo_id, content):
                            self.memos.create(memo_id, content, visibility="PRIVATE")
                self.ledger.save(note.id, memo_id, digest, archived=False)
                counts["restored"] += 1
            elif current.digest != digest:
                existing = self.memos.get(memo_id)
                if existing is not None and owned_source_id(str(existing.get("content", ""))) != note.id:
                    self.ledger.add_deadletter(note.id, "memo_ownership_lost")
                    raise PermanentFailure("memo ownership marker was lost")
                if existing is None or not self.memos.update(memo_id, content):
                    self.memos.create(memo_id, content, visibility="PRIVATE")
                self.ledger.save(note.id, memo_id, digest, archived=False)
                counts["updated"] += 1
            else:
                self.ledger.reset_missing(note.id)
                counts["unchanged"] += 1

        active = self.ledger.all_active()
        archive_candidates = []
        for entry in active:
            if entry.note_id not in seen:
                if self.ledger.increment_missing(entry.note_id) < 2:
                    continue
                archive_candidates.append(entry)

        if len(active) >= 5 and len(archive_candidates) / len(active) > 0.5:
            raise PermanentFailure("mass archive circuit breaker opened")

        for entry in archive_candidates:
            self.memos.archive(entry.memo_id)
            self.ledger.set_archived(entry.note_id, True)
            counts["archived"] += 1

        return counts

    def _complete_scan(self) -> list[BabyBuddyNote]:
        offset = 0
        notes = []
        expected_count = None
        pages = 0
        while True:
            pages += 1
            if pages > 1000:
                raise PermanentFailure("BabyBuddy pagination exceeded safety limit")
            page = self.babybuddy.list_notes(limit=self.page_size, offset=offset)
            try:
                count = int(page["count"])
                results = page["results"]
                next_page = page.get("next")
            except (KeyError, TypeError, ValueError) as error:
                raise PermanentFailure("BabyBuddy returned a malformed page") from error
            if expected_count is None:
                expected_count = count
            elif expected_count != count:
                raise PermanentFailure("BabyBuddy note set changed during scan")
            notes.extend(results)
            if not next_page:
                break
            if not results:
                raise PermanentFailure("BabyBuddy pagination did not advance")
            offset += len(results)
        if len(notes) != expected_count or len({item.id for item in notes}) != len(notes):
            raise PermanentFailure("BabyBuddy scan was incomplete or duplicated")
        return notes
