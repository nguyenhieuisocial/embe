from __future__ import annotations

import datetime as dt
import email.utils
import json
import time
import urllib.request
from urllib.error import HTTPError, URLError


class SyncFailure(RuntimeError):
    pass


class AuthFailure(SyncFailure):
    pass


class PermanentFailure(SyncFailure):
    pass


class NotFound(SyncFailure):
    pass


class Conflict(SyncFailure):
    pass


class TransientFailure(SyncFailure):
    pass


class HttpClient:
    TRANSIENT_STATUSES = {408, 425, 429}

    def __init__(self, *, max_attempts: int = 4, timeout: float = 30.0):
        self.max_attempts = max_attempts
        self.timeout = timeout

    def request_json(self, method: str, url: str, payload=None, headers=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request_headers = {"Accept": "application/json", **(headers or {})}
        if body is not None:
            request_headers["Content-Type"] = "application/json"

        for attempt in range(1, self.max_attempts + 1):
            request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else None
            except HTTPError as error:
                if error.code in (401, 403):
                    raise AuthFailure("remote authentication or authorization failed") from None
                if error.code == 404:
                    raise NotFound("remote object was not found") from None
                if error.code == 409:
                    raise Conflict("remote object already exists") from None
                if error.code in (400, 422):
                    raise PermanentFailure("remote service rejected the request") from None
                if error.code not in self.TRANSIENT_STATUSES and error.code < 500:
                    raise PermanentFailure(f"remote request failed with status {error.code}") from None
                if attempt == self.max_attempts:
                    raise TransientFailure("remote service remained unavailable") from None
                time.sleep(self._retry_delay(error.headers.get("Retry-After"), attempt))
            except (URLError, TimeoutError, OSError):
                if attempt == self.max_attempts:
                    raise TransientFailure("remote network remained unavailable") from None
                time.sleep(float(2 ** (attempt - 1)))

        raise TransientFailure("remote request failed")

    @staticmethod
    def _retry_delay(value: str | None, attempt: int) -> float:
        if value:
            try:
                return max(0.0, float(value))
            except ValueError:
                try:
                    target = email.utils.parsedate_to_datetime(value)
                    now = dt.datetime.now(dt.timezone.utc)
                    return max(0.0, (target - now).total_seconds())
                except (TypeError, ValueError):
                    pass
        return float(2 ** (attempt - 1))
