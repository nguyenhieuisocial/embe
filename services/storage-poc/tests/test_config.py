from dataclasses import replace

import pytest

from embe_storage.api import _build_providers
from embe_storage.crypto import EncryptedProvider


def test_telegram_fails_closed_without_dedicated_assertion(settings, tmp_path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path / "session",
        telegram_shards=(-1001,),
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
    )
    with pytest.raises(RuntimeError, match="dedicated"):
        configured.require_telegram()


def test_telegram_session_must_stay_in_lab_data_dir(settings, tmp_path):
    configured = replace(
        settings,
        telegram_enabled=True,
        telegram_api_id=123,
        telegram_api_hash="hash",
        telegram_session=tmp_path.parent / "outside.session",
        telegram_shards=(-1001,),
        dedicated_assertion="dedicated-premium-lab",
        telegram_expected_user_id=777,
        session_storage_assertion="bitlocker-and-restricted-acl",
    )
    with pytest.raises(RuntimeError, match="below"):
        configured.require_telegram()


def test_r2_is_always_wrapped_with_client_side_encryption(settings, monkeypatch):
    monkeypatch.setenv("EMBE_R2_ACCOUNT_ID", "account")
    monkeypatch.setenv("EMBE_R2_POC_BUCKET", "bucket")
    monkeypatch.setenv("EMBE_R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("EMBE_R2_SECRET_ACCESS_KEY", "secret")

    assert isinstance(_build_providers(settings)["r2"], EncryptedProvider)


def test_r2_fails_closed_without_master_key(settings, monkeypatch):
    monkeypatch.setenv("EMBE_R2_ACCOUNT_ID", "account")
    monkeypatch.setenv("EMBE_R2_POC_BUCKET", "bucket")
    monkeypatch.setenv("EMBE_R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("EMBE_R2_SECRET_ACCESS_KEY", "secret")

    with pytest.raises(RuntimeError, match="R2 PoC requires"):
        _build_providers(replace(settings, master_key=None))


def test_s3_is_always_wrapped_with_client_side_encryption(settings, monkeypatch):
    monkeypatch.setenv("EMBE_S3_POC_BUCKET", "bucket")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")

    assert isinstance(_build_providers(settings)["s3"], EncryptedProvider)


def test_s3_fails_closed_without_master_key(settings, monkeypatch):
    monkeypatch.setenv("EMBE_S3_POC_BUCKET", "bucket")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")

    with pytest.raises(RuntimeError, match="S3 PoC requires"):
        _build_providers(replace(settings, master_key=None))
