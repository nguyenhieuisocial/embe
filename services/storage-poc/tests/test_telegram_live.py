import os

import pytest


@pytest.mark.skipif(
    os.getenv("EMBE_TELEGRAM_LIVE_BENCHMARK") != "I_UNDERSTAND_LAB_ONLY",
    reason="dedicated Premium Telegram live lab is not explicitly enabled",
)
def test_live_benchmark_gate_requires_external_lab_credentials():
    required = [
        "EMBE_TELEGRAM_API_ID",
        "EMBE_TELEGRAM_API_HASH",
        "EMBE_TELEGRAM_SESSION_PATH",
        "EMBE_TELEGRAM_SHARD_IDS",
    ]
    assert all(os.getenv(name) for name in required)
