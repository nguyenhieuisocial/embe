from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import time
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

MAX_PREVIEW_BYTES = 10_000_000
MAX_ASSETS = 10_000
ALLOWED_MIME = {"image/jpeg": "jpg", "image/webp": "webp"}


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


Transport = Callable[[str, str, Mapping[str, str], bytes | None], HttpResponse]


class PreviewUnavailable(RuntimeError):
    """Immich accepted the asset but has not produced its lightweight preview yet."""


def default_transport(method: str, url: str, headers: Mapping[str, str], body: bytes | None) -> HttpResponse:
    request = Request(url, data=body, headers=dict(headers), method=method)
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - URLs are validated configuration
            payload = response.read(MAX_PREVIEW_BYTES + 1)
            return HttpResponse(response.status, dict(response.headers.items()), payload)
    except HTTPError as error:
        return HttpResponse(error.code, dict(error.headers.items()), error.read(64_000))


def request_with_retry(
    transport: Transport,
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: bytes | None = None,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> HttpResponse:
    for attempt in range(3):
        try:
            response = transport(method, url, headers, body)
        except (TimeoutError, URLError):
            if attempt == 2:
                raise
            sleep(float(2**attempt))
            continue
        if response.status not in {429, 502, 503, 504} or attempt == 2:
            return response
        retry_after = response.headers.get("Retry-After") or response.headers.get("retry-after")
        delay = min(float(retry_after), 10.0) if retry_after and retry_after.isdigit() else float(2**attempt)
        sleep(delay)
    raise AssertionError("unreachable")


def _valid_local_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return False
        if parsed.hostname.lower() == "localhost":
            return True
        address = ipaddress.ip_address(parsed.hostname)
        return address.is_loopback or address.is_private
    except ValueError:
        return False


def _safe_text(value: object, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    clean = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    return " ".join(clean.split())[:maximum]


def _iso_date(value: object) -> str:
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError("invalid asset date")
    datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def _mime_from_preview(body: bytes, content_type: str) -> str:
    declared = content_type.split(";", 1)[0].strip().lower()
    sniffed = ""
    if body.startswith(b"\xff\xd8\xff"):
        sniffed = "image/jpeg"
    elif len(body) >= 12 and body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        sniffed = "image/webp"
    if sniffed not in ALLOWED_MIME or (declared in ALLOWED_MIME and declared != sniffed):
        raise ValueError("unsupported preview content")
    return sniffed


def _searchable_path(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = unicodedata.normalize("NFD", value.replace("\\", "/"))
    return "".join(character for character in normalized if unicodedata.category(character) != "Mn").lower().replace("đ", "d")


def _album_for_asset(asset: Mapping[str, Any]) -> tuple[str, str, int]:
    """Map private source folders to stable family-facing chapters without publishing paths."""
    path = _searchable_path(asset.get("originalPath"))
    if "/sg 13.07.2025 _ nha gai/" in path:
        return "le-cuoi-nha-gai-2025", "Lễ cưới · Nhà gái · 13.07.2025", 10
    if "/anh pre-wedding/sg/" in path:
        return "pre-wedding-sai-gon", "Pre-wedding · Sài Gòn", 20
    if "/anh pre-wedding/nha trang/" in path:
        return "pre-wedding-nha-trang", "Pre-wedding · Nha Trang", 30
    if "/thailand 28.07.2025/" in path:
        return "thai-lan-2025", "Thái Lan · 28.07.2025", 40
    if "/da lat 23.12.2025/" in path:
        return "da-lat-2025", "Đà Lạt · 23.12.2025", 50
    return "gia-dinh", "Khoảnh khắc gia đình", 90


@dataclass(frozen=True)
class Config:
    enabled: bool
    immich_base_url: str
    immich_api_key: str
    album_ids: tuple[str, ...]
    supabase_url: str
    supabase_secret_key: str
    bucket: str = "embe-portal-previews"
    batch_size: int = 50

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        enabled = env.get("EMBE_MEDIA_PUBLISHER_ENABLED", "false").lower() == "true"
        if not enabled:
            return cls(False, "", "", (), "", "")
        immich_base_url = env.get("IMMICH_BASE_URL", "").rstrip("/")
        supabase_url = env.get("SUPABASE_URL", "").rstrip("/")
        album_ids = tuple(value.strip().lower() for value in env.get("IMMICH_ALBUM_IDS", "").split(",") if value.strip())
        batch_size_text = env.get("EMBE_MEDIA_PUBLISHER_BATCH_SIZE", "50")
        if not batch_size_text.isdigit() or not 1 <= int(batch_size_text) <= 500:
            raise ValueError("EMBE_MEDIA_PUBLISHER_BATCH_SIZE must be between 1 and 500")
        if not _valid_local_url(immich_base_url):
            raise ValueError("IMMICH_BASE_URL must be a local or private URL")
        if not supabase_url.startswith("https://") or urlparse(supabase_url).username:
            raise ValueError("SUPABASE_URL must use HTTPS")
        for album_id in album_ids:
            if str(uuid.UUID(album_id)) != album_id:
                raise ValueError("IMMICH_ALBUM_IDS must contain UUIDs")
        if not album_ids or not env.get("IMMICH_API_KEY") or not env.get("SUPABASE_SECRET_KEY"):
            raise ValueError("media publisher credentials and at least one album are required")
        return cls(
            True,
            immich_base_url,
            env["IMMICH_API_KEY"],
            album_ids,
            supabase_url,
            env["SUPABASE_SECRET_KEY"],
            batch_size=int(batch_size_text),
        )


class ImmichClient:
    def __init__(self, config: Config, transport: Transport = default_transport, sleep: Callable[[float], None] = time.sleep):
        self.config = config
        self.transport = transport
        self.sleep = sleep

    @property
    def headers(self) -> dict[str, str]:
        return {"Accept": "application/json", "x-api-key": self.config.immich_api_key}

    def list_assets(self, asset_type: str | None = "IMAGE") -> list[dict[str, Any]]:
        assets: dict[str, dict[str, Any]] = {}
        for album_id in self.config.album_ids:
            page = 1
            cursor: str | None = None
            while True:
                payload: dict[str, Any] = {
                    "albumIds": [album_id],
                    "size": 250,
                    "withExif": True,
                    "withPeople": False,
                    "withStacked": False,
                }
                if asset_type:
                    payload["type"] = asset_type
                if cursor:
                    payload["cursor"] = cursor
                else:
                    payload["page"] = page
                response = request_with_retry(
                    self.transport,
                    "POST",
                    f"{self.config.immich_base_url}/api/search/metadata",
                    {**self.headers, "Content-Type": "application/json"},
                    json.dumps(payload).encode(),
                    sleep=self.sleep,
                )
                if response.status != 200:
                    raise RuntimeError("Immich asset search failed")
                result = json.loads(response.body)
                page_result = result.get("assets", {}) if isinstance(result, dict) else {}
                items = page_result.get("items", []) if isinstance(page_result, dict) else []
                if not isinstance(items, list):
                    raise ValueError("invalid Immich search response")
                for item in items:
                    if isinstance(item, dict) and isinstance(item.get("id"), str):
                        assets[item["id"]] = item
                if len(assets) > MAX_ASSETS:
                    raise ValueError("curated albums exceed the safe asset limit")
                cursor_value = page_result.get("nextCursor")
                next_page = page_result.get("nextPage")
                if isinstance(cursor_value, str) and cursor_value:
                    cursor = cursor_value
                elif next_page not in (None, ""):
                    page = int(next_page)
                    cursor = None
                else:
                    break
        return list(assets.values())

    def download_original(
        self,
        asset_id: str,
        destination: Path,
        max_bytes: int,
        *,
        open_response=None,
    ) -> dict[str, str | int]:
        if str(uuid.UUID(asset_id)) != asset_id.lower():
            raise ValueError("invalid asset id")
        if max_bytes < 1:
            raise ValueError("invalid original size limit")
        opener = open_response or urlopen
        request = Request(
            f"{self.config.immich_base_url}/api/assets/{asset_id}/original",
            headers={"Accept": "application/octet-stream", "x-api-key": self.config.immich_api_key},
            method="GET",
        )
        digest = hashlib.sha256()
        size = 0
        try:
            with opener(request, timeout=120) as response:
                if int(getattr(response, "status", 0)) != 200:
                    raise RuntimeError("Immich original download failed")
                content_length = response.headers.get("Content-Length") or response.headers.get("content-length")
                if content_length and (not content_length.isdigit() or int(content_length) > max_bytes):
                    raise ValueError("Immich original exceeds the storage limit")
                mime_type = (response.headers.get("Content-Type") or response.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
                if not (mime_type.startswith("image/") or mime_type.startswith("video/") or mime_type == "application/octet-stream"):
                    raise ValueError("unsupported Immich original content")
                with destination.open("xb") as writer:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > max_bytes:
                            raise ValueError("Immich original exceeds the storage limit")
                        digest.update(chunk)
                        writer.write(chunk)
            if size == 0:
                raise ValueError("empty Immich original")
            return {"size": size, "sha256": digest.hexdigest(), "mime_type": mime_type}
        except Exception:
            destination.unlink(missing_ok=True)
            raise

    def download_preview(self, asset_id: str) -> tuple[bytes, str]:
        if str(uuid.UUID(asset_id)) != asset_id.lower():
            raise ValueError("invalid asset id")
        query = urlencode({"size": "preview"})
        response = request_with_retry(
            self.transport,
            "GET",
            f"{self.config.immich_base_url}/api/assets/{asset_id}/thumbnail?{query}",
            {"Accept": "image/webp,image/jpeg", "x-api-key": self.config.immich_api_key},
            sleep=self.sleep,
        )
        if response.status in {404, 425, 429, 502, 503, 504}:
            raise PreviewUnavailable("Immich preview is not ready")
        if response.status != 200 or not response.body or len(response.body) > MAX_PREVIEW_BYTES:
            raise RuntimeError("Immich preview download failed")
        content_type = response.headers.get("Content-Type") or response.headers.get("content-type") or ""
        return response.body, _mime_from_preview(response.body, content_type)


class SupabaseMediaStore:
    def __init__(self, config: Config, transport: Transport = default_transport, sleep: Callable[[float], None] = time.sleep):
        self.config = config
        self.transport = transport
        self.sleep = sleep

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "apikey": self.config.supabase_secret_key,
            "Authorization": f"Bearer {self.config.supabase_secret_key}",
        }

    def _json(self, method: str, url: str, body: dict[str, Any] | None = None) -> Any:
        encoded = json.dumps(body).encode() if body is not None else None
        response = request_with_retry(
            self.transport,
            method,
            url,
            {**self.headers, **({"Content-Type": "application/json"} if body is not None else {})},
            encoded,
            sleep=self.sleep,
        )
        if not 200 <= response.status < 300:
            raise RuntimeError("Supabase media operation failed")
        return json.loads(response.body) if response.body else None

    def existing(self) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        page_size = 1000
        for offset in range(0, MAX_ASSETS, page_size):
            query = urlencode({
                "select": "source_asset_id,source_updated_at,object_path,mime_type,checksum_sha256,width,height",
                "order": "source_asset_id.asc",
                "limit": str(page_size),
                "offset": str(offset),
            })
            rows = self._json("GET", f"{self.config.supabase_url}/rest/v1/embe_media_source_state?{query}")
            if not isinstance(rows, list):
                raise ValueError("invalid media source state")
            for row in rows:
                if isinstance(row, dict) and isinstance(row.get("source_asset_id"), str):
                    result[row["source_asset_id"]] = row
            if len(rows) < page_size:
                return result
        raise ValueError("media source state exceeds the safe asset limit")

    def upload(self, object_path: str, body: bytes, mime_type: str) -> None:
        path = "/".join(quote(part, safe="") for part in object_path.split("/"))
        response = request_with_retry(
            self.transport,
            "POST",
            f"{self.config.supabase_url}/storage/v1/object/{quote(self.config.bucket, safe='')}/{path}",
            {
                **self.headers,
                "Content-Type": mime_type,
                "Cache-Control": "max-age=31536000",
                "x-upsert": "true",
            },
            body,
            sleep=self.sleep,
        )
        if not 200 <= response.status < 300:
            raise RuntimeError("Supabase preview upload failed")

    def sync(self, items: list[dict[str, Any]]) -> dict[str, int]:
        sync_run_id = str(uuid.uuid4())
        for offset in range(0, len(items), 500):
            self._json(
                "POST",
                f"{self.config.supabase_url}/rest/v1/rpc/embe_stage_media_batch",
                {"p_sync_run_id": sync_run_id, "p_items": items[offset : offset + 500]},
            )
        result = self._json(
            "POST",
            f"{self.config.supabase_url}/rest/v1/rpc/embe_finalize_media_sync",
            {"p_sync_run_id": sync_run_id, "p_expected_count": len(items)},
        )
        return {"upserted": int(result["upserted"]), "unapproved": int(result["unapproved"])}


def _publication_item(asset: dict[str, Any], preview: dict[str, Any]) -> dict[str, Any]:
    asset_id = str(uuid.UUID(str(asset.get("id", "")))).lower()
    event_at = _iso_date(asset.get("localDateTime") or asset.get("fileCreatedAt"))
    source_updated_at = _iso_date(asset.get("updatedAt"))
    description = _safe_text(asset.get("description"), 500)
    title = _safe_text(description.split(".", 1)[0], 120) if description else "Khoảnh khắc gia đình"
    caption = description or "Một khoảnh khắc được gia đình chọn để lưu lại."
    exif = asset.get("exifInfo") if isinstance(asset.get("exifInfo"), dict) else {}
    album_key, album_title, album_order = _album_for_asset(asset)
    return {
        "source_asset_id": asset_id,
        "source_updated_at": source_updated_at,
        "event_at": event_at,
        "title": title,
        "caption": caption,
        "object_path": preview["object_path"],
        "mime_type": preview["mime_type"],
        "checksum_sha256": preview["checksum_sha256"],
        "width": preview.get("width"),
        "height": preview.get("height"),
        "place_city": _safe_text(exif.get("city"), 80) or None,
        "place_region": _safe_text(exif.get("state"), 80) or None,
        "place_country": _safe_text(exif.get("country"), 80) or None,
        "album_key": album_key,
        "album_title": album_title,
        "album_order": album_order,
    }


def publish(config: Config, transport: Transport = default_transport, sleep: Callable[[float], None] = time.sleep) -> dict[str, int | str]:
    if not config.enabled:
        return {"status": "disabled", "published": 0, "uploaded": 0, "reused": 0}
    immich = ImmichClient(config, transport, sleep)
    store = SupabaseMediaStore(config, transport, sleep)
    existing = store.existing()
    items: list[dict[str, Any]] = []
    uploaded = 0
    reused = 0
    deferred = 0
    for asset in immich.list_assets():
        asset_id = str(uuid.UUID(str(asset.get("id", "")))).lower()
        source_updated_at = _iso_date(asset.get("updatedAt"))
        state = existing.get(asset_id)
        if state:
            preview = state
            reused += 1
        elif "thumbhash" in asset and not asset.get("thumbhash"):
            deferred += 1
            continue
        elif uploaded >= config.batch_size:
            deferred += 1
            continue
        else:
            try:
                body, mime_type = immich.download_preview(asset_id)
            except (PreviewUnavailable, TimeoutError, URLError):
                deferred += 1
                continue
            checksum = hashlib.sha256(body).hexdigest()
            extension = ALLOWED_MIME[mime_type]
            object_path = f"assets/{asset_id}/{checksum}.{extension}"
            store.upload(object_path, body, mime_type)
            preview = {"object_path": object_path, "mime_type": mime_type, "checksum_sha256": checksum, "width": None, "height": None}
            uploaded += 1
        items.append(_publication_item(asset, preview))
    result = store.sync(items)
    return {"status": "ok", "published": len(items), "uploaded": uploaded, "reused": reused, "deferred": deferred, **result}


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish curated Immich previews to the private EmBe portal bucket.")
    parser.add_argument("--env", type=Path, default=Path(r"C:\EmBe\secrets\runtime\media-publisher.env"))
    parser.add_argument("--shared-env", type=Path, default=Path(r"C:\EmBe\secrets\runtime\portal-sync.env"))
    parser.add_argument("--status", type=Path, default=Path(r"C:\EmBe\data\status\media-publisher.json"))
    args = parser.parse_args()
    env = {**os.environ, **read_env(args.shared_env), **read_env(args.env)}
    attempted_at = datetime.now().astimezone().isoformat()
    try:
        result = publish(Config.from_env(env))
        write_status(args.status, {**result, "last_attempt_at": attempted_at, "last_success_at": attempted_at if result["status"] == "ok" else None})
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as error:
        failure = {"status": "error", "error_type": type(error).__name__, "last_attempt_at": attempted_at, "last_success_at": None}
        write_status(args.status, failure)
        print(json.dumps({"status": "error", "error_type": type(error).__name__}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
