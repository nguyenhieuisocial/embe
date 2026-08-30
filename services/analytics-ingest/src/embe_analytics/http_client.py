from __future__ import annotations

import ipaddress
import json
import time
import urllib.request
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse


def validate_private_base_url(base_url: str, service_names: set[str]) -> str:
    parsed = urlparse(base_url)
    host = parsed.hostname or ""
    if parsed.scheme not in {"http", "https"} or not _is_private_host(host, service_names):
        raise ValueError("API endpoint must be private or loopback")
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("API base URL must not contain credentials, query or fragment")
    return base_url.rstrip("/")


def validate_same_origin_url(base_url: str, candidate: str, path_prefix: str) -> str:
    base = urlparse(base_url)
    parsed = urlparse(candidate)
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("pagination URL must not contain credentials or a fragment")
    if (parsed.scheme, parsed.hostname, parsed.port) != (base.scheme, base.hostname, base.port):
        raise ValueError("pagination URL must stay on the configured API origin")
    if parsed.path != path_prefix:
        raise ValueError("pagination URL is outside the allowed API endpoint")
    return candidate


def request_json(url: str, headers: dict[str, str]):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except HTTPError as error:
            if error.code in {401, 403}:
                raise PermissionError("source API authorization failed") from None
            if error.code < 500 or attempt == 2:
                raise RuntimeError(f"source API request failed with status {error.code}") from None
        except (URLError, TimeoutError, OSError, json.JSONDecodeError):
            if attempt == 2:
                raise RuntimeError("source API is unavailable or returned invalid JSON") from None
        time.sleep(float(2**attempt))
    raise RuntimeError("source API request failed")


def _is_private_host(host: str, service_names: set[str]) -> bool:
    if host in {"localhost", *service_names} or host.endswith(".home.arpa"):
        return True
    try:
        address = ipaddress.ip_address(host)
        return address.is_private or address.is_loopback
    except ValueError:
        return False
