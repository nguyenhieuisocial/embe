"""One-way exporter from Memos notes to Obsidian-like markdown files."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List


def _safe_filename(source_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", str(source_id)).strip("-") or "source"


def _dump_jsonl_line(handle, payload: Dict[str, Any]) -> None:
    handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    handle.write("\n")


def _is_deleted(record: Dict[str, Any]) -> bool:
    status = str(record.get("status", "")).lower()
    return bool(record.get("deleted") or status == "deleted" or status == "archived")


def _extract_exported_at(existing_payload: str) -> str | None:
    for raw_line in existing_payload.splitlines():
        if raw_line.startswith("exported_at:"):
            return raw_line.replace("exported_at:", "", 1).strip()
    return None


@dataclass
class VaultExporter:
    vault_root: Path
    notes_dirname: str = "notes"
    archive_dirname: str = "archive"
    archive_manifest_name: str = "manifest.jsonl"

    def __post_init__(self) -> None:
        self.notes_dir = self.vault_root / self.notes_dirname
        self.archive_dir = self.vault_root / self.archive_dirname
        self.notes_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        (self.archive_dir / self.archive_manifest_name).touch(exist_ok=True)

    @property
    def archive_manifest_path(self) -> Path:
        return self.archive_dir / self.archive_manifest_name

    def _note_path(self, source_id: str) -> Path:
        return self.notes_dir / f"{_safe_filename(source_id)}.md"

    def _to_markdown(self, source: str, source_id: str, title: str, content: str, exported_at: str) -> str:
        safe_title = title.replace("\n", " ")
        lines = [
            "---",
            f"source: {source}",
            f"source_id: {source_id}",
            f"exported_at: {exported_at}",
            "---",
            "",
            f"# {safe_title}",
            "",
            content.rstrip(),
            "",
        ]
        return "\n".join(lines).strip() + "\n"

    def _read_existing_archive_events(self) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if not self.archive_manifest_path.exists():
            return events
        with self.archive_manifest_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                text = line.strip()
                if not text:
                    continue
                events.append(json.loads(text))
        return events

    def _already_archived(self, source_id: str, events: Iterable[Dict[str, Any]]) -> bool:
        for event in events:
            if event.get("source_id") == source_id and event.get("action") == "archived":
                return True
        return False

    def _append_archive(self, source_id: str, title: str, path: Path) -> None:
        event = {
            "action": "archived",
            "source_id": source_id,
            "title": title,
            "path": str(path.as_posix()),
            "archived_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        with self.archive_manifest_path.open("a", encoding="utf-8") as handle:
            _dump_jsonl_line(handle, event)

    def export(self, records: List[Dict[str, Any]]) -> None:
        events = self._read_existing_archive_events()
        for record in records:
            source = str(record.get("source", "memos"))
            source_id = str(record["source_id"])
            title = str(record.get("title", source_id))
            path = self._note_path(source_id)

            if _is_deleted(record):
                if not self._already_archived(source_id, events):
                    self._append_archive(source_id, title, path)
                    events.append({"action": "archived", "source_id": source_id})
                continue

            content = str(record.get("content", "")).strip()
            existing = path.read_text(encoding="utf-8") if path.exists() else ""
            exported_at = str(
                record.get("exported_at")
                or _extract_exported_at(existing)
                or datetime.now(timezone.utc).isoformat()
            )
            markdown = self._to_markdown(source, source_id, title, content, exported_at)
            if existing != markdown:
                path.write_text(markdown, encoding="utf-8")
