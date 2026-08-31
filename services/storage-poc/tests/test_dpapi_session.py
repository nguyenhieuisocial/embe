import os

import pytest


@pytest.mark.skipif(os.name != "nt", reason="Windows DPAPI is only available on Windows")
def test_dpapi_round_trip_never_returns_plaintext_blob():
    from embe_storage.dpapi_session import protect, unprotect

    plaintext = b"telegram-session-test-secret"
    encrypted = protect(plaintext)

    assert encrypted != plaintext
    assert plaintext not in encrypted
    assert unprotect(encrypted) == plaintext
