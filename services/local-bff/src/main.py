"""Local BFF helpers and a tiny stdlib HTTP interface for tests and demos.

Scope:
- Expose a narrow read-only API over local Memos/Immich fixtures.
- Enforce policy: unknown routes are rejected, no GPS data, no original asset access.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple
from urllib.parse import parse_qs, urlparse

RouteResponse = Tuple[int, Dict[str, str], Dict[str, Any]]


def _trim_gps_fields(payload: Any) -> Any:
    """Recursively remove known GPS-related fields from payloads."""

    if isinstance(payload, dict):
        sanitized: Dict[str, Any] = {}
        deny_keys = {"gps", "latitude", "longitude", "lat", "lon", "lng", "altitude", "location"}
        for key, value in payload.items():
            if key.lower() in deny_keys:
                continue
            if isinstance(value, (dict, list)):
                sanitized[key] = _trim_gps_fields(value)
            else:
                sanitized[key] = value
        return sanitized
    if isinstance(payload, list):
        return [_trim_gps_fields(value) for value in payload]
    return payload


def _filter_payload_for_timeline(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    keep = {"id", "visibility", "tags", "title", "content", "created_at", "updated_at"}
    sanitized = []
    for item in items:
        entry = {key: item[key] for key in keep if key in item}
        sanitized.append(entry)
    return sanitized


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _album_allowlist(configured: Sequence[str]) -> List[str]:
    return sorted({album.strip() for album in configured if str(album).strip()})


@dataclass(frozen=True)
class BFFConfig:
    album_allowlist: Tuple[str, ...]
    memos_fixture: Tuple[Dict[str, Any], ...]
    media_fixture: Tuple[Dict[str, Any], ...]

    @classmethod
    def from_raw(
        cls,
        album_allowlist: Sequence[str],
        memos: Sequence[Dict[str, Any]],
        media: Sequence[Dict[str, Any]],
    ) -> "BFFConfig":
        return cls(
            album_allowlist=tuple(_album_allowlist(album_allowlist)),
            memos_fixture=tuple(memos),
            media_fixture=tuple(media),
        )

    @classmethod
    def from_fixture_files(cls, memos_path: Path, media_path: Path, album_allowlist: Sequence[str]) -> "BFFConfig":
        memos_raw = _load_json(memos_path)
        media_raw = _load_json(media_path)
        return cls.from_raw(
            album_allowlist=album_allowlist,
            memos=tuple(memos_raw),
            media=tuple(media_raw),
        )


def _find_media_asset(media_fixture: Sequence[Dict[str, Any]], asset_id: str) -> Dict[str, Any] | None:
    for item in media_fixture:
        if str(item.get("id")) == str(asset_id):
            return dict(item)
    return None


def _sanitize_media(asset: Dict[str, Any], allowed_albums: Sequence[str]) -> Dict[str, Any] | None:
    if str(asset.get("album_id")) not in set(allowed_albums):
        return None

    sanitized = _trim_gps_fields(dict(asset))
    sanitized.pop("original_url", None)
    sanitized.pop("original_download_url", None)
    # Keep only minimal safe keys for portal playback paths.
    keep = {"id", "filename", "album_id", "thumbnail_url", "encoded_video_url", "media_type"}
    return {key: sanitized.get(key) for key in keep if key in sanitized}

def _timeline_payload(config: BFFConfig, allow_tags: Sequence[str] | None = None) -> Dict[str, Any]:
    allow_tags_set = {tag.lower() for tag in (allow_tags or ())}
    visible: List[Dict[str, Any]] = []

    for item in config.memos_fixture:
        tags = {str(tag).lower() for tag in item.get("tags", [])}
        visibility = str(item.get("visibility", "")).lower()
        if visibility != "public":
            continue
        if allow_tags_set and not tags.intersection(allow_tags_set):
            continue
        visible.append(item)

    return {
        "items": _filter_payload_for_timeline(visible),
    }


def route_request(
    method: str,
    path: str,
    config: BFFConfig,
    query_allow_tags: Sequence[str] | None = None,
) -> RouteResponse:
    if method.upper() != "GET":
        return 405, {"Content-Type": "application/json"}, {"error": "method_not_allowed"}

    parsed = urlparse(path)
    if parsed.path == "/api/v1/health":
        return 200, {"Content-Type": "application/json"}, {"status": "ok"}

    if parsed.path == "/api/v1/timeline":
        params = parse_qs(parsed.query)
        allow_tags = query_allow_tags or tuple()
        if not allow_tags:
            raw_tags = params.get("tag", [])
            allow_tags = tuple(tag for tag in raw_tags if tag)
        return 200, {"Content-Type": "application/json"}, _timeline_payload(config, allow_tags=allow_tags)

    media_thumb_pattern = re.compile(r"^/api/v1/media/([^/]+)/thumbnail/?$")
    media_video_pattern = re.compile(r"^/api/v1/media/([^/]+)/video/?$")
    media_original_pattern = re.compile(r"^/api/v1/media/([^/]+)/original/?$")

    if media_original_pattern.match(parsed.path):
        return 404, {"Content-Type": "application/json"}, {"error": "not_found"}

    thumb_match = media_thumb_pattern.match(parsed.path)
    if thumb_match:
        asset_id = thumb_match.group(1)
        asset = _find_media_asset(config.media_fixture, asset_id)
        if not asset:
            return 404, {"Content-Type": "application/json"}, {"error": "not_found"}
        sanitized = _sanitize_media(asset, config.album_allowlist)
        if sanitized is None:
            return 404, {"Content-Type": "application/json"}, {"error": "not_found"}
        return 200, {"Content-Type": "application/json"}, sanitized

    video_match = media_video_pattern.match(parsed.path)
    if video_match:
        asset_id = video_match.group(1)
        asset = _find_media_asset(config.media_fixture, asset_id)
        if not asset:
            return 404, {"Content-Type": "application/json"}, {"error": "not_found"}
        sanitized = _sanitize_media(asset, config.album_allowlist)
        if sanitized is None:
            return 404, {"Content-Type": "application/json"}, {"error": "not_found"}
        if not sanitized.get("encoded_video_url"):
            return 404, {"Content-Type": "application/json"}, {"error": "not_found"}
        return 200, {"Content-Type": "application/json"}, {"id": sanitized["id"], "encoded_video_url": sanitized["encoded_video_url"]}

    return 404, {"Content-Type": "application/json"}, {"error": "not_found"}


class _RequestHandler(BaseHTTPRequestHandler):
    config: BFFConfig

    def do_GET(self) -> None:  # pragma: no cover - exercised via integration tests.
        status, headers, payload = route_request(self.command, self.path, self.config)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str, port: int, config: BFFConfig) -> None:
    handler = type("Handler", (_RequestHandler,), {"config": config})
    server = HTTPServer((host, port), handler)
    server.serve_forever()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local BFF demo server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--memos-fixture", required=True)
    parser.add_argument("--media-fixture", required=True)
    parser.add_argument("--album-allowlist", nargs="+", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = BFFConfig.from_fixture_files(
        Path(args.memos_fixture),
        Path(args.media_fixture),
        args.album_allowlist,
    )
    run_server(args.host, args.port, config)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
