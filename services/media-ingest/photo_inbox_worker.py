from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping
from urllib.error import HTTPError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

MAX_BYTES = 25_000_000
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


Transport = Callable[[str, str, Mapping[str, str], bytes | None], HttpResponse]


def default_transport(method: str, url: str, headers: Mapping[str, str], body: bytes | None = None) -> HttpResponse:
    request = Request(url, method=method, headers=dict(headers), data=body)
    try:
        with urlopen(request, timeout=120) as response:
            return HttpResponse(response.status, dict(response.headers.items()), response.read(MAX_BYTES + 1))
    except HTTPError as error:
        return HttpResponse(error.code, dict(error.headers.items()), error.read(4096))


def _private_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "http" or parsed.username or parsed.password or not parsed.hostname:
            return False
        if parsed.hostname == "localhost":
            return True
        return ipaddress.ip_address(parsed.hostname).is_private or ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        return False


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_secret_key: str
    immich_base_url: str
    immich_api_key: str
    immich_album_id: str
    bucket: str = "embe-photo-inbox"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        required = (
            "SUPABASE_URL", "SUPABASE_SECRET_KEY", "IMMICH_BASE_URL",
            "IMMICH_UPLOAD_API_KEY", "IMMICH_ALBUM_ID",
        )
        if any(not env.get(key) for key in required):
            raise ValueError("photo inbox worker configuration is incomplete")
        supabase = env["SUPABASE_URL"].rstrip("/")
        immich = env["IMMICH_BASE_URL"].rstrip("/")
        album = env["IMMICH_ALBUM_ID"].lower()
        if urlparse(supabase).scheme != "https" or urlparse(supabase).username:
            raise ValueError("Supabase must use HTTPS")
        if not _private_url(immich):
            raise ValueError("Immich must remain on a local or private address")
        if not UUID.match(album):
            raise ValueError("Immich album id is invalid")
        return cls(supabase, env["SUPABASE_SECRET_KEY"], immich, env["IMMICH_UPLOAD_API_KEY"], album)


class WorkerFailure(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_image(body: bytes, claimed_mime: str) -> str:
    if not 1 <= len(body) <= MAX_BYTES:
        raise ValueError("invalid_image_size")
    valid = False
    if claimed_mime == "image/jpeg":
        valid = body.startswith(b"\xff\xd8\xff")
    elif claimed_mime == "image/png":
        valid = body.startswith(b"\x89PNG\r\n\x1a\n")
    elif claimed_mime == "image/webp":
        valid = len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP"
    elif claimed_mime in {"image/heic", "image/heif"}:
        valid = len(body) >= 12 and body[4:8] == b"ftyp" and body[8:12] in {
            b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"
        }
    if not valid:
        raise ValueError("invalid_image_signature")
    return claimed_mime


def _multipart(fields: Mapping[str, str], filename: str, mime_type: str, body: bytes) -> tuple[bytes, str]:
    boundary = f"embe-{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        )
    safe_name = Path(filename).name.replace('"', "")[:180] or "photo.jpg"
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"assetData\"; filename=\"{safe_name}\"\r\nContent-Type: {mime_type}\r\n\r\n".encode()
        + body + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


class PhotoInboxWorker:
    def __init__(self, config: Config, transport: Transport = default_transport):
        self.config = config
        self.transport = transport

    @property
    def supabase_headers(self) -> dict[str, str]:
        return {
            "accept": "application/json",
            "apikey": self.config.supabase_secret_key,
            "authorization": f"Bearer {self.config.supabase_secret_key}",
        }

    def _rpc(self, name: str, payload: Mapping[str, object]) -> object:
        response = self.transport(
            "POST", f"{self.config.supabase_url}/rest/v1/rpc/{name}",
            {**self.supabase_headers, "content-type": "application/json"},
            json.dumps(payload).encode(),
        )
        if not 200 <= response.status < 300:
            raise RuntimeError("photo queue operation failed")
        return json.loads(response.body) if response.body else None

    def _claim(self) -> dict[str, object] | None:
        value = self._rpc("embe_claim_photo_upload", {})
        if value is None:
            return None
        if not isinstance(value, dict) or not UUID.match(str(value.get("id", ""))):
            raise RuntimeError("invalid photo queue response")
        return value

    def _download(self, item: Mapping[str, object]) -> bytes:
        storage_path = str(item["storage_path"])
        encoded = "/".join(quote(part, safe="") for part in storage_path.split("/"))
        response = self.transport(
            "GET",
            f"{self.config.supabase_url}/storage/v1/object/authenticated/{quote(self.config.bucket, safe='')}/{encoded}",
            self.supabase_headers,
        )
        if response.status != 200:
            raise WorkerFailure("staged_download_failed")
        if len(response.body) != int(item["byte_size"]):
            raise WorkerFailure("staged_size_mismatch")
        try:
            validate_image(response.body, str(item["mime_type"]))
        except ValueError as error:
            raise WorkerFailure(str(error)) from error
        return response.body

    def _upload_immich(self, item: Mapping[str, object], body: bytes) -> str:
        captured = str(item["captured_at"])
        multipart, content_type = _multipart(
            {"fileCreatedAt": captured, "fileModifiedAt": captured, "isFavorite": "false"},
            str(item["original_filename"]), str(item["mime_type"]), body,
        )
        response = self.transport(
            "POST", f"{self.config.immich_base_url}/api/assets",
            {"accept": "application/json", "content-type": content_type, "x-api-key": self.config.immich_api_key},
            multipart,
        )
        if response.status not in {200, 201}:
            raise WorkerFailure("immich_upload_failed")
        try:
            asset_id = str(json.loads(response.body)["id"]).lower()
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise WorkerFailure("immich_invalid_response") from error
        if not UUID.match(asset_id):
            raise WorkerFailure("immich_invalid_response")

        caption = str(item.get("caption", "")).strip()
        if caption:
            updated = self.transport(
                "PUT", f"{self.config.immich_base_url}/api/assets/{asset_id}",
                {"accept": "application/json", "content-type": "application/json", "x-api-key": self.config.immich_api_key},
                json.dumps({"description": caption}, ensure_ascii=False).encode(),
            )
            if not 200 <= updated.status < 300:
                raise WorkerFailure("immich_description_failed")

        album = self.transport(
            "PUT", f"{self.config.immich_base_url}/api/albums/{self.config.immich_album_id}/assets",
            {"accept": "application/json", "content-type": "application/json", "x-api-key": self.config.immich_api_key},
            json.dumps({"ids": [asset_id]}).encode(),
        )
        if not 200 <= album.status < 300:
            raise WorkerFailure("immich_album_failed")
        return asset_id

    def _cleanup(self, storage_path: str) -> None:
        encoded = "/".join(quote(part, safe="") for part in storage_path.split("/"))
        self.transport(
            "DELETE", f"{self.config.supabase_url}/storage/v1/object/{quote(self.config.bucket, safe='')}/{encoded}",
            self.supabase_headers,
        )

    def run_once(self) -> dict[str, str]:
        item = self._claim()
        if item is None:
            return {"status": "idle"}
        upload_id = str(item["id"])
        try:
            body = self._download(item)
            checksum = hashlib.sha256(body).hexdigest()
            asset_id = self._upload_immich(item, body)
            self._rpc("embe_finish_photo_import", {
                "p_upload_id": upload_id,
                "p_immich_asset_id": asset_id,
                "p_checksum_sha256": checksum,
            })
            self._cleanup(str(item["storage_path"]))
            return {"status": "ok", "upload_id": upload_id, "immich_asset_id": asset_id}
        except WorkerFailure as error:
            attempts = int(item.get("attempts", 1))
            retry_seconds = min(86_400, 60 * (2 ** min(attempts - 1, 10)))
            self._rpc("embe_fail_photo_import", {
                "p_upload_id": upload_id,
                "p_error_code": error.code,
                "p_retry_after_seconds": retry_seconds,
            })
            return {"status": "retry", "upload_id": upload_id, "error": error.code}


def _load_env(path: Path) -> dict[str, str]:
    values = dict(os.environ)
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def _write_status(path: Path, result: Mapping[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import EmBe camera inbox photos into private Immich.")
    parser.add_argument("--env", required=True, type=Path)
    parser.add_argument("--status", type=Path)
    args = parser.parse_args(argv)
    result = PhotoInboxWorker(Config.from_env(_load_env(args.env))).run_once()
    if args.status:
        _write_status(args.status, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
