from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from embe_storage.provider import ProviderError

T = TypeVar("T")


async def with_backoff(
    operation: Callable[[], Awaitable[T]],
    attempts: int = 5,
    base_seconds: float = 0.25,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    for attempt in range(attempts):
        try:
            return await operation()
        except ProviderError as error:
            if attempt == attempts - 1 or error.code not in {"flood_wait", "transient_unavailable"}:
                raise
            delay = error.retry_after if error.retry_after is not None else base_seconds * 2**attempt
            await sleep(float(delay) + random.uniform(0, min(0.25, float(delay) / 10)))
    raise AssertionError("unreachable")
