"""One-time interactive authorization for the dedicated lab account.

Run only in a trusted local console. Phone, OTP and 2FA are handled by
Telethon's interactive prompt and are never accepted as command-line arguments.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from telethon import TelegramClient


async def main() -> int:
    if os.getenv("EMBE_TELEGRAM_DEDICATED_ACCOUNT_ASSERTION") != "dedicated-premium-lab":
        raise RuntimeError("dedicated account assertion is required")
    if os.getenv("EMBE_TELEGRAM_SESSION_STORAGE_ASSERTION") != "bitlocker-and-restricted-acl":
        raise RuntimeError("confirm encrypted volume and restricted ACL before creating a session")
    api_id = int(os.environ["EMBE_TELEGRAM_API_ID"])
    api_hash = os.environ["EMBE_TELEGRAM_API_HASH"]
    data_dir = Path(os.getenv("EMBE_STORAGE_POC_DATA_DIR", r"C:\EmBe\data\storage-poc")).resolve()
    session = Path(os.environ["EMBE_TELEGRAM_SESSION_PATH"]).resolve()
    if not session.is_relative_to(data_dir):
        raise RuntimeError("session must stay below the PoC data directory")
    session.parent.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(str(session), api_id, api_hash)
    await client.start()
    me = await client.get_me()
    if not getattr(me, "premium", False):
        await client.disconnect()
        session.with_suffix(".session").unlink(missing_ok=True)
        raise RuntimeError("authorized account is not Premium; session removed")
    expected_raw = os.getenv("EMBE_TELEGRAM_EXPECTED_USER_ID", "")
    if not expected_raw:
        discovered_id = int(getattr(me, "id", 0))
        await client.disconnect()
        session.with_suffix(".session").unlink(missing_ok=True)
        print(
            f"Dedicated account numeric ID: {discovered_id}. "
            "Set EMBE_TELEGRAM_EXPECTED_USER_ID and run again; discovery session removed."
        )
        return 0
    expected_user_id = int(expected_raw)
    if int(getattr(me, "id", 0)) != expected_user_id:
        await client.disconnect()
        session.with_suffix(".session").unlink(missing_ok=True)
        raise RuntimeError("authorized account is not the pinned Premium lab identity; session removed")
    print("Dedicated Premium session authorized. Configure only private lab channel IDs.")
    await client.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
