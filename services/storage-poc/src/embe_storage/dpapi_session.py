from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

_ENTROPY = b"EmBe.Telegram.Storage.Session.v1"


class _DataBlob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def _blob(value: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(value)
    return _DataBlob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))), buffer


def _crypt(value: bytes, *, decrypt: bool) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Windows DPAPI is required")
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    input_blob, input_buffer = _blob(value)
    entropy_blob, entropy_buffer = _blob(_ENTROPY)
    output_blob = _DataBlob()
    if decrypt:
        function = crypt32.CryptUnprotectData
        arguments = (ctypes.byref(input_blob), None, ctypes.byref(entropy_blob), None, None, 0, ctypes.byref(output_blob))
    else:
        function = crypt32.CryptProtectData
        arguments = (ctypes.byref(input_blob), None, ctypes.byref(entropy_blob), None, None, 0, ctypes.byref(output_blob))
    if not function(*arguments):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(output_blob.data, output_blob.size)
    finally:
        kernel32.LocalFree(output_blob.data)
        del input_buffer, entropy_buffer


def protect(value: bytes) -> bytes:
    return _crypt(value, decrypt=False)


def unprotect(value: bytes) -> bytes:
    return _crypt(value, decrypt=True)
