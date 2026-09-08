"""Bounded local OCR, independent from generative reading; never a clinical truth."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class OcrReading:
    text: str = ''
    warnings: tuple[str, ...] = ()


def read_page_ocr(image: bytes) -> OcrReading:
    unavailable = OcrReading('', ('Chưa lấy được lớp chữ OCR độc lập; vẫn giữ bản gốc và bản đọc AI, cần đối chiếu phần còn thiếu.',))
    node = shutil.which('node')
    if not node or not image.startswith(b'\xff\xd8') or not 1 <= len(image) <= 15_000_000:
        return unavailable
    try:
        # Parent owns cleanup even when a timed-out Node child cannot run finally.
        # Only public language models enter this directory, never document bytes.
        with TemporaryDirectory(prefix='embe-ocr-run-') as workspace:
            result = subprocess.run(
                [node, '--max-old-space-size=256', str(Path(__file__).with_name('document_ocr.mjs'))],
                input=image, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25, check=False,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                # Never pass Supabase keys, NODE_OPTIONS/preloads or other credentials.
                env={**{key: os.environ[key] for key in ['SystemRoot', 'WINDIR', 'PATH'] if key in os.environ},
                     'TEMP': workspace, 'TMP': workspace, 'TMPDIR': workspace,
                     'OMP_THREAD_LIMIT': '1', 'UV_THREADPOOL_SIZE': '1', 'NODE_NO_WARNINGS': '1'},
            )
        if result.returncode or len(result.stdout) > 350000:
            return unavailable
        output = json.loads(result.stdout)
        if not isinstance(output, dict):
            return unavailable
        text = output.get('text')
        if output.get('engine') != 'tesseract-vie-eng' or not isinstance(text, str) or len(text) > 48000 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', text):
            return unavailable
        if not text.strip():
            return OcrReading('', ('OCR chưa tìm được chữ trên ảnh trang này; không có nghĩa là trang trống hoặc đã đọc đủ.',))
        notices = ('Chữ OCR có vùng chưa rõ; giữ nguyên để đối chiếu, không tự dùng làm chỉ số hoặc liều thuốc.',) if output.get('lowConfidence') is not False else ()
        return OcrReading(text, notices)
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
        return unavailable
