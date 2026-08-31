"""Interactive Telegram authorization helpers."""

from __future__ import annotations

import asyncio
import getpass
from collections.abc import Awaitable, Callable
from typing import Any

from telethon.errors import SessionPasswordNeededError


def confirmation_is_valid(value: str) -> bool:
    return value in {"", "DEDICATED"}


async def read_hidden_password(prompt: str = "Mật khẩu xác minh hai bước Telegram: ") -> str:
    return await asyncio.to_thread(getpass.getpass, prompt)


async def complete_qr_login(
    qr: Any,
    client: Any,
    password_reader: Callable[..., Awaitable[str]] = read_hidden_password,
) -> None:
    try:
        await qr.wait(timeout=120)
    except SessionPasswordNeededError:
        password = await password_reader()
        await client.sign_in(password=password)
