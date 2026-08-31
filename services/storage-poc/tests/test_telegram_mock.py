from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest

from embe_storage.manifest import encode_manifest
from embe_storage.provider import ByteRange, PutOptions
from embe_storage.providers.telegram_mtproto import TelegramMTProtoStorage


class FakeMessage:
    def __init__(self, message_id: int, payload: bytes, caption: str = ""):
        self.id = message_id
        self.payload = payload
        self.message = caption
        self.document = SimpleNamespace(id=100 + message_id, access_hash=200 + message_id, size=len(payload))


class FakeClient:
    def __init__(self):
        self.connected = True
        self.messages = {}

    def is_connected(self):
        return self.connected

    async def connect(self):
        self.connected = True

    async def is_user_authorized(self):
        return True

    async def get_me(self):
        return SimpleNamespace(premium=True, id=777)

    async def send_file(self, shard, source, caption, **kwargs):
        message = FakeMessage(1, Path(source).read_bytes(), caption)
        self.messages[(shard, 1)] = message
        return message

    async def get_messages(self, shard, ids):
        return self.messages.get((shard, ids))

    async def iter_download(self, document, offset, **kwargs):
        message = next(message for message in self.messages.values() if message.document.id == document.id)
        payload = message.payload[offset:]
        for index in range(0, len(payload), 1024 * 1024):
            yield payload[index : index + 1024 * 1024]

    async def delete_messages(self, shard, ids, revoke):
        for message_id in ids:
            self.messages.pop((shard, message_id), None)

    async def get_entity(self, shard):
        return SimpleNamespace(title="lab")

    async def iter_messages(self, shard, reverse):
        for (stored_shard, _), message in self.messages.items():
            if stored_shard == shard:
                yield message


class FileReferenceExpiredError(Exception):
    pass


class ExpiringDownloadClient(FakeClient):
    def __init__(self):
        super().__init__()
        self.download_calls = 0

    async def iter_download(self, document, offset, **kwargs):
        self.download_calls += 1
        message = next(message for message in self.messages.values() if message.document.id == document.id)
        if self.download_calls == 1:
            yield message.payload[offset : offset + 3]
            raise FileReferenceExpiredError("synthetic expiry")
        yield message.payload[offset:]


class StandardAccountClient(FakeClient):
    async def get_me(self):
        return SimpleNamespace(premium=False, id=777)


@pytest.mark.asyncio
async def test_standard_account_is_supported_with_two_gb_ceiling(settings, tmp_path: Path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path / "session",
        telegram_shards=(-1001,),
        dedicated_assertion="dedicated-telegram-account",
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
        telegram_account_tier="standard",
    )
    provider = TelegramMTProtoStorage(configured, b"s" * 32, StandardAccountClient())

    health = await provider.health()

    assert health["status"] == "ok"
    assert health["premium"] is False
    assert provider.max_object_bytes == 2_000_000_000
    assert provider.capabilities.max_object_bytes == 2_000_000_000


@pytest.mark.asyncio
async def test_mtproto_mock_upload_range_rebuild_and_delete(settings, tmp_path: Path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path / "session",
        telegram_shards=(-1001, -1002),
        dedicated_assertion="dedicated-premium-lab",
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
    )
    client = FakeClient()
    provider = TelegramMTProtoStorage(configured, b"s" * 32, client)
    payload = bytes(range(251)) * 5000
    source = tmp_path / "source.bin"
    source.write_bytes(payload)
    stored = await provider.put(
        source,
        PutOptions("tenant", "asset-a", "private.bin", "application/octet-stream", "a" * 64),
    )
    result = b"".join([chunk async for chunk in provider.open(stored.locator, ByteRange(123, 99999))])
    assert result == payload[123:100000]
    recovered = [item async for item in provider.scan_history()]
    assert recovered[0]["manifest"]["asset_id"] == "asset-a"
    await provider.delete(stored.locator)
    with pytest.raises(Exception):
        _ = b"".join([chunk async for chunk in provider.open(stored.locator)])


@pytest.mark.parametrize(
    ("error_name", "expected_code", "wait_seconds"),
    [
        ("FloodPremiumWaitError", "flood_wait", 19),
        ("SessionRevokedError", "session_revoked", None),
        ("ChannelPrivateError", "permission_denied", None),
        ("FileReferenceExpiredError", "file_reference_expired", None),
    ],
)
def test_mtproto_failure_mapping(error_name: str, expected_code: str, wait_seconds: int | None):
    error_type = type(error_name, (Exception,), {})
    error = error_type("synthetic failure")
    if wait_seconds is not None:
        error.seconds = wait_seconds

    mapped = TelegramMTProtoStorage._map_error(error)

    assert mapped.code == expected_code
    assert mapped.retry_after == wait_seconds


@pytest.mark.asyncio
async def test_file_reference_refresh_resumes_without_duplicate_bytes(settings, tmp_path: Path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path / "session",
        telegram_shards=(-1001,),
        dedicated_assertion="dedicated-premium-lab",
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
    )
    client = ExpiringDownloadClient()
    client.messages[(-1001, 1)] = FakeMessage(1, b"abcdefghij")
    provider = TelegramMTProtoStorage(configured, b"s" * 32, client)

    result = b"".join(
        [
            chunk
            async for chunk in provider.open(
                {"shard_ref": "-1001", "message_id": 1}, ByteRange(0, 9)
            )
        ]
    )

    assert result == b"abcdefghij"


@pytest.mark.asyncio
async def test_history_scan_skips_corrupt_manifest_and_continues(settings, tmp_path: Path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path / "session",
        telegram_shards=(-1001,),
        dedicated_assertion="dedicated-premium-lab",
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
    )
    client = FakeClient()
    client.messages[(-1001, 1)] = FakeMessage(1, b"bad", "embe-poc.v1.not-valid")
    valid = encode_manifest({"asset_id": "asset-valid", "metadata": {}}, b"s" * 32)
    client.messages[(-1001, 2)] = FakeMessage(2, b"good", valid)
    provider = TelegramMTProtoStorage(configured, b"s" * 32, client)

    recovered = [item async for item in provider.scan_history()]

    assert [item["manifest"]["asset_id"] for item in recovered] == ["asset-valid"]
