from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from .mapping import UnsupportedEvent, to_babybuddy


class RemoteError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code[:80]


class JsonHttp:
    def __init__(self, timeout: float = 15.0, attempts: int = 4):
        self.timeout = timeout
        self.attempts = attempts

    def request(self, method: str, url: str, *, headers: dict[str, str], payload=None):
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers = {"Accept": "application/json", **headers}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        for attempt in range(self.attempts):
            request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as error:
                if error.code in {400, 401, 403, 404, 409, 422}:
                    raise RemoteError(f"http_{error.code}") from None
                if attempt + 1 == self.attempts:
                    raise RemoteError(f"http_{error.code}") from None
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt + 1 == self.attempts:
                    raise RemoteError("network_unavailable") from None
            time.sleep(2**attempt)
        raise RemoteError("network_unavailable")


class SupabaseQueue:
    def __init__(self, url: str, key: str, http: JsonHttp):
        self.url = url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self.http = http

    def rpc(self, name: str, payload: dict):
        return self.http.request("POST", f"{self.url}/rest/v1/rpc/{name}", headers=self.headers, payload=payload)

    def claim(self, limit: int = 20) -> list[dict]:
        now = datetime.now(timezone.utc).isoformat()
        value = self.rpc("embe_claim_baby_care_sync", {"p_now": now, "p_limit": limit})
        if not isinstance(value, list):
            raise RemoteError("malformed_claim")
        return value

    def complete(self, event_id: str, success: bool, babybuddy_id: int | None = None, error: str | None = None):
        self.rpc("embe_complete_baby_care_sync", {
            "p_id": event_id, "p_success": success, "p_babybuddy_id": babybuddy_id, "p_error_code": error
        })


class BabyBuddy:
    def __init__(self, url: str, token: str, http: JsonHttp, child_id: int | None = None):
        self.url = url.rstrip("/")
        self.headers = {"Authorization": f"Token {token}"}
        self.http = http
        self._child_id = child_id

    @property
    def child_id(self) -> int:
        if self._child_id is not None:
            return self._child_id
        page = self.http.request("GET", f"{self.url}/api/children/?limit=2", headers=self.headers)
        results = page.get("results", []) if isinstance(page, dict) else []
        if len(results) != 1 or not isinstance(results[0].get("id"), int):
            raise RemoteError("babybuddy_child_not_unique")
        self._child_id = results[0]["id"]
        return self._child_id

    def save(self, event: dict) -> int:
        resource, payload = to_babybuddy(event, self.child_id)
        source_id = event.get("babybuddy_id")
        if not isinstance(source_id, int) or source_id < 1:
            marker = f"embe:event:{event['id']}"
            page = self.http.request(
                "GET", f"{self.url}/api/{resource}/?limit=100&ordering=-id", headers=self.headers
            )
            results = page.get("results", []) if isinstance(page, dict) else []
            for candidate in results:
                text = str(candidate.get("notes") or candidate.get("note") or "")
                if marker in text and isinstance(candidate.get("id"), int):
                    return candidate["id"]
        method = "PATCH" if isinstance(source_id, int) and source_id > 0 else "POST"
        url = f"{self.url}/api/{resource}/{source_id}/" if method == "PATCH" else f"{self.url}/api/{resource}/"
        result = self.http.request(method, url, headers=self.headers, payload=payload)
        if not isinstance(result, dict) or not isinstance(result.get("id"), int):
            raise RemoteError("babybuddy_malformed_response")
        return result["id"]


def run_once(queue: SupabaseQueue, babybuddy: BabyBuddy) -> dict[str, int]:
    result = {"synced": 0, "failed": 0}
    for event in queue.claim():
        event_id = str(event.get("id", ""))
        try:
            source_id = babybuddy.save(event)
            queue.complete(event_id, True, source_id)
            result["synced"] += 1
        except UnsupportedEvent as error:
            queue.complete(event_id, False, error=str(error))
            result["failed"] += 1
        except RemoteError as error:
            queue.complete(event_id, False, error=error.code)
            result["failed"] += 1
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=int, default=20)
    args = parser.parse_args()
    required = ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "BABYBUDDY_BASE_URL", "BABYBUDDY_TOKEN")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit(f"missing required environment: {', '.join(missing)}")
    http = JsonHttp()
    queue = SupabaseQueue(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"], http)
    raw_child = os.environ.get("BABYBUDDY_CHILD_ID")
    babybuddy = BabyBuddy(os.environ["BABYBUDDY_BASE_URL"], os.environ["BABYBUDDY_TOKEN"], http,
                          int(raw_child) if raw_child else None)
    while True:
        run_once(queue, babybuddy)
        if args.once:
            return 0
        time.sleep(max(5, min(args.interval, 300)))


if __name__ == "__main__":
    raise SystemExit(main())
