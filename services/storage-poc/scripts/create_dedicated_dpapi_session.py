"""Authorize a dedicated Premium account without writing a plaintext session."""

from __future__ import annotations

import asyncio
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from telethon import TelegramClient
from telethon.sessions import StringSession

from embe_storage.dpapi_session import protect
from embe_storage.telegram_auth import complete_qr_login, confirmation_is_valid


async def authorize(client: TelegramClient, use_qr: bool):
    if not use_qr:
        await client.start()
        return
    import qrcode

    await client.connect()
    qr = await client.qr_login()
    image_path = Path(tempfile.gettempdir()) / "embe-telegram-login-qr.png"
    qrcode.make(qr.url).save(image_path)
    os.startfile(image_path)  # noqa: S606 - local PNG opened for the interactive operator
    print("Quét QR bằng Telegram: Cài đặt > Thiết bị > Liên kết thiết bị máy tính.")
    try:
        await complete_qr_login(qr, client)
    finally:
        image_path.unlink(missing_ok=True)


async def main(use_qr: bool = False) -> int:
    if os.name != "nt":
        raise RuntimeError("DPAPI session provisioning must run on Windows")
    if os.getenv("EMBE_TELEGRAM_DEDICATED_ACCOUNT_ASSERTION") not in {"dedicated-premium-lab", "dedicated-telegram-account"}:
        raise RuntimeError("dedicated account assertion is required")
    if os.getenv("EMBE_TELEGRAM_SESSION_STORAGE_ASSERTION") != "windows-dpapi-and-restricted-acl":
        raise RuntimeError("DPAPI and restricted ACL assertion is required")
    data_dir = Path(os.getenv("EMBE_STORAGE_POC_DATA_DIR", r"C:\EmBe\data\storage-poc")).resolve()
    target = Path(os.environ["EMBE_TELEGRAM_DPAPI_SESSION_PATH"]).resolve()
    if not target.is_relative_to(data_dir):
        raise RuntimeError("encrypted session must stay below the storage data directory")
    target.parent.mkdir(parents=True, exist_ok=True)

    client = TelegramClient(StringSession(), int(os.environ["EMBE_TELEGRAM_API_ID"]), os.environ["EMBE_TELEGRAM_API_HASH"])
    await authorize(client, use_qr)
    try:
        me = await client.get_me()
        account_tier = os.getenv("EMBE_TELEGRAM_ACCOUNT_TIER", "premium").strip().lower()
        if account_tier == "premium" and not getattr(me, "premium", False):
            raise RuntimeError("authorized account is not Premium")
        user_id = int(getattr(me, "id", 0))
        expected = os.getenv("EMBE_TELEGRAM_EXPECTED_USER_ID", "")
        if expected and user_id != int(expected):
            raise RuntimeError("authorized account does not match the pinned identity")
        confirmation = input(f"Telegram account ID {user_id}. Nhấn Enter để lưu phiên mã hóa: ")
        if not confirmation_is_valid(confirmation):
            raise RuntimeError("dedicated account confirmation was not provided")
        secret = client.session.save().encode("ascii")
        encrypted = protect(secret)
        secret = b""
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(encrypted)
        os.replace(temporary, target)
        metadata = target.with_suffix(target.suffix + ".json")
        metadata.write_text(json.dumps({"user_id": user_id, "premium": bool(getattr(me, "premium", False))}), encoding="utf-8")
        identity = os.environ.get("USERNAME", "")
        for path in (target, metadata):
            result = subprocess.run(
                ["icacls.exe", str(path), "/inheritance:r", "/grant:r", f"{identity}:(F)", "SYSTEM:(F)", "BUILTIN\\Administrators:(F)"],
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                path.unlink(missing_ok=True)
                raise RuntimeError("unable to restrict encrypted Telegram session")
        print(f"Dedicated Telegram identity pinned: {user_id}. Session encrypted with Windows DPAPI.")
        return 0
    finally:
        await client.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--qr", action="store_true", help="Authorize from an existing Telegram mobile session")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.qr)))
