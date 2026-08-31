from unittest.mock import AsyncMock

import pytest
from telethon.errors import SessionPasswordNeededError

from embe_storage.telegram_auth import complete_qr_login, confirmation_is_valid


@pytest.mark.asyncio
async def test_complete_qr_login_prompts_for_two_step_password():
    qr = AsyncMock()
    qr.wait.side_effect = SessionPasswordNeededError(request=None)
    client = AsyncMock()
    password_reader = AsyncMock(return_value="new-secret")

    await complete_qr_login(qr, client, password_reader=password_reader)

    password_reader.assert_awaited_once()
    client.sign_in.assert_awaited_once_with(password="new-secret")


def test_confirmation_accepts_enter_or_explicit_word():
    assert confirmation_is_valid("")
    assert confirmation_is_valid("DEDICATED")
    assert not confirmation_is_valid("anything else")
