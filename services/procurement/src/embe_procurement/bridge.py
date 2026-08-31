from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .domain import ProposalStateError, StaleProposalError


def request_json(
    url: str,
    method: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    *,
    timeout: int = 20,
) -> Any:
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    safe_headers = {"User-Agent": "EmBe-Procurement/1.0", **headers}
    for attempt, delay in enumerate((0, 1, 2, 4)):
        if delay:
            time.sleep(delay)
        try:
            request = Request(url, data=payload, headers=safe_headers, method=method)
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as error:
            if error.code not in {408, 425, 429, 500, 502, 503, 504} or attempt == 3:
                raise RuntimeError(f"Procurement bridge returned HTTP {error.code}") from error
        except (URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                raise RuntimeError("Procurement bridge is unavailable") from error
    raise RuntimeError("Procurement request exhausted retry policy")


@dataclass(frozen=True)
class ProcurementAction:
    id: str
    proposal_id: str
    target_state: str
    expected_hash: str

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "ProcurementAction":
        return cls(
            id=str(raw.get("id", "")),
            proposal_id=str(raw.get("proposal_id", "")),
            target_state=str(raw.get("target_state", "")),
            expected_hash=str(raw.get("expected_hash", "")),
        )


class SupabaseProcurement:
    def __init__(self, base_url: str, secret_key: str):
        if not base_url.startswith("https://") or not secret_key:
            raise ValueError("invalid Supabase procurement configuration")
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json; charset=utf-8",
        }

    def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        return request_json(f"{self.base_url}/rest/v1/rpc/{name}", "POST", self.headers, body)

    def claim(self, limit: int = 10) -> list[ProcurementAction]:
        payload = self._rpc("embe_claim_procurement_actions", {"p_limit": max(1, min(limit, 20))})
        return [ProcurementAction.from_raw(item) for item in payload] if isinstance(payload, list) else []

    def complete(self, action_id: str) -> None:
        self._rpc("embe_complete_procurement_action", {"p_id": action_id})

    def fail(self, action_id: str, error_code: str) -> None:
        self._rpc("embe_fail_procurement_action", {"p_id": action_id, "p_error_code": error_code})

    def sync(self, proposals: list[dict[str, object]]) -> dict[str, int]:
        result = self._rpc("embe_sync_procurement", {"p_proposals": proposals}) or {}
        return {"upserted": int(result.get("upserted", 0)), "retired": int(result.get("retired", 0))}

    def status(self) -> dict[str, int]:
        result = self._rpc("embe_procurement_queue_status", {}) or {}
        return {key: int(result.get(key, 0)) for key in ("pending", "processing", "dead_letters")}


def process_actions(queue: Any, runtime: Any) -> dict[str, Any]:
    actions = queue.claim(limit=10)
    completed = 0
    failed = 0
    for action in actions:
        try:
            runtime.transition(
                action.proposal_id,
                action.target_state,
                actor_ref="family",
                expected_hash=action.expected_hash,
            )
            queue.complete(action.id)
            completed += 1
        except StaleProposalError:
            queue.fail(action.id, "stale_proposal")
            failed += 1
        except ProposalStateError:
            queue.fail(action.id, "invalid_transition")
            failed += 1
        except Exception:
            queue.fail(action.id, "local_unavailable")
            failed += 1
    synced = queue.sync(runtime.projection())
    return {
        "claimed": len(actions),
        "completed": completed,
        "failed": failed,
        "sync": synced,
        "queue": queue.status(),
    }


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if raw_line and not raw_line.startswith("#") and "=" in raw_line:
            key, value = raw_line.split("=", 1)
            values[key] = value
    return values


def write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
