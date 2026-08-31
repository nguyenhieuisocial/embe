from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Any, AsyncIterator

from embe_storage.config import Settings
from embe_storage.manifest import PREFIXES, decode_manifest, encode_manifest
from embe_storage.provider import ByteRange, Capabilities, ObjectStat, ProviderError, PutOptions, StoredObject
from embe_storage.retry import with_backoff


class TelegramMTProtoStorage:
    """Lab-only MTProto adapter.

    The durable locator is shard + message ID. File references are deliberately
    not persisted as authority because Telegram documents that they expire.
    A fresh message fetch is performed before every read.
    """

    name = "telegram_mtproto_lab"
    capabilities = Capabilities(True, True, False, False, 4_194_304_000)

    def __init__(self, settings: Settings, signing_key: bytes, client: Any | None = None):
        settings.require_telegram()
        self.settings = settings
        self.signing_key = signing_key
        self._client = client
        self.max_object_bytes = 4_000_000_000 if settings.telegram_account_tier == "premium" else 2_000_000_000
        self.capabilities = Capabilities(True, True, False, False, self.max_object_bytes)

    async def _client_instance(self):
        if self._client is None:
            from telethon import TelegramClient
            from telethon.sessions import StringSession

            session: object = str(self.settings.telegram_session)
            if self.settings.telegram_dpapi_session:
                from embe_storage.dpapi_session import unprotect

                encrypted = self.settings.telegram_dpapi_session.read_bytes()
                plaintext = unprotect(encrypted)
                try:
                    session = StringSession(plaintext.decode("ascii"))
                finally:
                    plaintext = b""
            self._client = TelegramClient(session, self.settings.telegram_api_id, self.settings.telegram_api_hash)
        if not self._client.is_connected():
            await self._client.connect()
        if not await self._client.is_user_authorized():
            raise ProviderError("session_revoked", "dedicated Telegram session is not authorized")
        return self._client

    async def _verified_identity(self):
        client = await self._client_instance()
        me = await client.get_me()
        if self.settings.telegram_account_tier == "premium" and not getattr(me, "premium", False):
            raise ProviderError("account_not_premium", "configured Telegram account is not Premium")
        if int(getattr(me, "id", 0)) != self.settings.telegram_expected_user_id:
            raise ProviderError("identity_mismatch", "Telegram session does not match the pinned lab account")
        return client, me

    def _shard_for(self, asset_id: str) -> int:
        digest = int.from_bytes(hashlib.sha256(asset_id.encode()).digest()[:8], "big")
        return self.settings.telegram_shards[digest % len(self.settings.telegram_shards)]

    @staticmethod
    def _map_error(error: Exception) -> ProviderError:
        name = type(error).__name__
        seconds = getattr(error, "seconds", None) or getattr(error, "value", None)
        if name in {"FloodWaitError", "FloodPremiumWaitError", "FloodWait"}:
            return ProviderError("flood_wait", name, int(seconds) if seconds else None)
        if name in {"AuthKeyUnregisteredError", "SessionRevokedError", "AuthKeyDuplicatedError"}:
            return ProviderError("session_revoked", name)
        if name in {"ChatAdminRequiredError", "ChannelPrivateError", "UserBannedInChannelError"}:
            return ProviderError("permission_denied", name)
        if name in {"FileReferenceExpiredError", "FileReferenceEmptyError"}:
            return ProviderError("file_reference_expired", name)
        return ProviderError("telegram_error", f"{name}: {error}")

    async def put(self, source: Path, options: PutOptions) -> StoredObject:
        if source.stat().st_size > self.max_object_bytes:
            raise ProviderError("object_too_large", "object exceeds the configured Telegram account ceiling")
        client, _ = await self._verified_identity()
        shard = self._shard_for(options.asset_id)
        manifest = encode_manifest(
            {
                "asset_id": options.asset_id,
                "tenant_hash": hashlib.sha256(options.tenant_id.encode()).hexdigest()[:16],
                "name_hash": hashlib.sha256(options.logical_name.encode()).hexdigest()[:16],
                "size": source.stat().st_size,
                "sha256": options.sha256,
                "encrypted": options.metadata.get("encrypted", "false") == "true",
                "tenant_id": options.tenant_id,
                "logical_name": options.logical_name,
                "media_type": options.media_type,
                "metadata": options.metadata,
                "version": 1,
            },
            self.signing_key,
        )

        async def send():
            try:
                return await client.send_file(
                    shard,
                    str(source),
                    caption=manifest,
                    force_document=True,
                    supports_streaming=False,
                )
            except Exception as error:  # Telethon generates RPC error subclasses dynamically.
                raise self._map_error(error) from error

        message = await with_backoff(send)
        document = message.document
        if document is None:
            raise ProviderError("invalid_response", "Telegram response has no document")
        return StoredObject(
            locator={
                "shard_ref": str(shard),
                "message_id": int(message.id),
                "document_id": str(document.id),
                "access_hash": str(document.access_hash),
            },
            size=int(document.size),
            sha256=options.sha256,
        )

    async def _fresh_message(self, locator: dict[str, object]):
        client = await self._client_instance()
        try:
            message = await client.get_messages(int(str(locator["shard_ref"])), ids=int(locator["message_id"]))
        except Exception as error:
            raise self._map_error(error) from error
        if not message or not message.document:
            raise ProviderError("object_missing", "Telegram message or document is unavailable")
        return client, message

    async def open(self, locator: dict[str, object], byte_range: ByteRange | None = None) -> AsyncIterator[bytes]:
        client, message = await self._fresh_message(locator)
        size = int(message.document.size)
        start, remaining = 0, size
        if byte_range:
            byte_range.validate(size)
            start = byte_range.start
            remaining = min(byte_range.end_inclusive, size - 1) - start + 1
        current_offset = start
        try:
            async for chunk in client.iter_download(
                message.document,
                offset=start,
                request_size=1024 * 1024,
                chunk_size=1024 * 1024,
            ):
                if remaining <= 0:
                    break
                output = chunk[:remaining]
                remaining -= len(output)
                current_offset += len(output)
                yield output
        except Exception as error:
            mapped = self._map_error(error)
            if mapped.code == "file_reference_expired":
                _, refreshed = await self._fresh_message(locator)
                async for chunk in client.iter_download(
                    refreshed.document,
                    offset=current_offset,
                    request_size=1024 * 1024,
                    chunk_size=1024 * 1024,
                ):
                    if remaining <= 0:
                        break
                    output = chunk[:remaining]
                    remaining -= len(output)
                    current_offset += len(output)
                    yield output
                return
            raise mapped from error

    async def stat(self, locator: dict[str, object]) -> ObjectStat:
        _, message = await self._fresh_message(locator)
        return ObjectStat(size=int(message.document.size), sha256=None)

    async def delete(self, locator: dict[str, object]) -> None:
        client = await self._client_instance()
        try:
            await client.delete_messages(int(str(locator["shard_ref"])), [int(locator["message_id"])], revoke=True)
        except Exception as error:
            raise self._map_error(error) from error

    async def health(self) -> dict[str, object]:
        client, me = await self._verified_identity()
        shard_health = []
        for shard in self.settings.telegram_shards:
            try:
                entity = await client.get_entity(shard)
                shard_health.append({"shard_hash": hashlib.sha256(str(shard).encode()).hexdigest()[:12], "ok": True, "title": bool(getattr(entity, "title", None))})
            except Exception:
                shard_health.append({"shard_hash": hashlib.sha256(str(shard).encode()).hexdigest()[:12], "ok": False})
        return {
            "provider": self.name,
            "status": "ok" if all(item["ok"] for item in shard_health) else "degraded",
            "premium": bool(getattr(me, "premium", False)),
            "shards": shard_health,
        }

    async def scan_history(self) -> AsyncIterator[dict[str, object]]:
        client = await self._client_instance()
        for shard in self.settings.telegram_shards:
            try:
                async for message in client.iter_messages(shard, reverse=True):
                    caption = getattr(message, "message", "") or ""
                    if not any(caption.startswith(f"{prefix}.") for prefix in PREFIXES) or not message.document:
                        continue
                    try:
                        manifest = decode_manifest(caption, self.signing_key)
                    except (KeyError, TypeError, ValueError):
                        continue
                    yield {
                        "manifest": manifest,
                        "locator": {
                            "shard_ref": str(shard),
                            "message_id": int(message.id),
                            "document_id": str(message.document.id),
                            "access_hash": str(message.document.access_hash),
                        },
                    }
            except Exception as error:
                raise self._map_error(error) from error
