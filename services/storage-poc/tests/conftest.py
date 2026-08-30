from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "src"))

from embe_storage.config import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        enabled=True,
        telegram_enabled=False,
        api_key="x" * 32,
        data_dir=tmp_path,
        master_key=b"m" * 32,
        telegram_api_id=None,
        telegram_api_hash=None,
        telegram_session=None,
        telegram_shards=(),
        dedicated_assertion="",
        lab_tenant_id="family-a",
        lab_owner_id="owner-a",
        session_storage_assertion="",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Embe-Poc-Key": "x" * 32, "X-Tenant-Id": "family-a", "X-Owner-Id": "owner-a"}
