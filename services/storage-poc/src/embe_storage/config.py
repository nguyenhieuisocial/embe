from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path


def _enabled(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


@dataclass(frozen=True)
class Settings:
    enabled: bool
    telegram_enabled: bool
    api_key: str
    data_dir: Path
    master_key: bytes | None
    telegram_api_id: int | None
    telegram_api_hash: str | None
    telegram_session: Path | None
    telegram_shards: tuple[int, ...]
    dedicated_assertion: str
    telegram_expected_user_id: int | None = None
    lab_tenant_id: str = "storage-poc-lab"
    lab_owner_id: str = "storage-poc-operator"
    session_storage_assertion: str = ""

    @classmethod
    def from_env(cls) -> "Settings":
        master_raw = os.getenv("EMBE_STORAGE_POC_MASTER_KEY_B64", "")
        master_key = base64.b64decode(master_raw, validate=True) if master_raw else None
        if master_key is not None and len(master_key) != 32:
            raise ValueError("EMBE_STORAGE_POC_MASTER_KEY_B64 must decode to 32 bytes")
        shards = tuple(
            int(value.strip())
            for value in os.getenv("EMBE_TELEGRAM_SHARD_IDS", "").split(",")
            if value.strip()
        )
        session_raw = os.getenv("EMBE_TELEGRAM_SESSION_PATH", "")
        api_id_raw = os.getenv("EMBE_TELEGRAM_API_ID", "")
        return cls(
            enabled=_enabled("EMBE_STORAGE_POC_ENABLED"),
            telegram_enabled=_enabled("EMBE_TELEGRAM_POC_ENABLED"),
            api_key=os.getenv("EMBE_STORAGE_POC_API_KEY", ""),
            data_dir=Path(os.getenv("EMBE_STORAGE_POC_DATA_DIR", r"C:\EmBe\data\storage-poc")),
            master_key=master_key,
            telegram_api_id=int(api_id_raw) if api_id_raw else None,
            telegram_api_hash=os.getenv("EMBE_TELEGRAM_API_HASH") or None,
            telegram_session=Path(session_raw) if session_raw else None,
            telegram_shards=shards,
            dedicated_assertion=os.getenv("EMBE_TELEGRAM_DEDICATED_ACCOUNT_ASSERTION", ""),
            telegram_expected_user_id=(
                int(os.environ["EMBE_TELEGRAM_EXPECTED_USER_ID"])
                if os.getenv("EMBE_TELEGRAM_EXPECTED_USER_ID")
                else None
            ),
            lab_tenant_id=os.getenv("EMBE_STORAGE_POC_TENANT_ID", "storage-poc-lab"),
            lab_owner_id=os.getenv("EMBE_STORAGE_POC_OWNER_ID", "storage-poc-operator"),
            session_storage_assertion=os.getenv(
                "EMBE_TELEGRAM_SESSION_STORAGE_ASSERTION", ""
            ),
        )

    def require_lab(self) -> None:
        if not self.enabled:
            raise RuntimeError("storage PoC is disabled")
        if len(self.api_key) < 24:
            raise RuntimeError("lab API key must contain at least 24 characters")

    def require_telegram(self) -> None:
        self.require_lab()
        if not self.telegram_enabled:
            raise RuntimeError("Telegram PoC is disabled")
        if self.dedicated_assertion != "dedicated-premium-lab":
            raise RuntimeError("dedicated Premium lab account assertion is missing")
        if self.session_storage_assertion != "bitlocker-and-restricted-acl":
            raise RuntimeError("encrypted-volume and restricted-ACL assertion is missing")
        if not all(
            (
                self.telegram_api_id,
                self.telegram_api_hash,
                self.telegram_session,
                self.telegram_shards,
                self.telegram_expected_user_id,
            )
        ):
            raise RuntimeError("Telegram lab credentials, session or shard allowlist are incomplete")
        if self.telegram_session and not self.telegram_session.resolve().is_relative_to(self.data_dir.resolve()):
            raise RuntimeError("Telegram session must stay below the PoC data directory")
