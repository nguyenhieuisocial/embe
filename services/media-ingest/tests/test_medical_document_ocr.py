import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import medical_document_ocr as ocr


def test_bridge_is_hidden_bounded_and_does_not_inherit_secrets(monkeypatch):
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'do-not-pass')
    monkeypatch.setenv('NODE_OPTIONS', '--inspect')
    monkeypatch.setattr(ocr.shutil, 'which', lambda _: 'node')
    def run(command, **kwargs):
        assert kwargs['input'] == b'\xff\xd8synthetic'
        assert kwargs['timeout'] == 25 and kwargs['stderr'] == subprocess.DEVNULL
        assert 'SUPABASE_SECRET_KEY' not in kwargs['env'] and 'NODE_OPTIONS' not in kwargs['env']
        assert kwargs['env']['OMP_THREAD_LIMIT'] == '1'
        if sys.platform == 'win32':
            assert kwargs['creationflags'] == subprocess.CREATE_NO_WINDOW
        return SimpleNamespace(returncode=0, stdout=json.dumps({'text': 'Chữ cuối trang 0,005 mg', 'engine': 'tesseract-vie-eng', 'lowConfidence': True}).encode())
    monkeypatch.setattr(ocr.subprocess, 'run', run)
    result = ocr.read_page_ocr(b'\xff\xd8synthetic')
    assert result.text == 'Chữ cuối trang 0,005 mg' and result.warnings


@pytest.mark.parametrize('output', [None, [], 'not-json', {'text': 'bad', 'engine': 'unknown'},
    {'text': 'x' * 48001, 'engine': 'tesseract-vie-eng'}, {'text': '\x01', 'engine': 'tesseract-vie-eng'}])
def test_invalid_results_fail_closed_without_crashing(monkeypatch, output):
    monkeypatch.setattr(ocr.shutil, 'which', lambda _: 'node')
    monkeypatch.setattr(ocr.subprocess, 'run', lambda *a, **k: SimpleNamespace(returncode=0, stdout=json.dumps(output).encode()))
    result = ocr.read_page_ocr(b'\xff\xd8synthetic')
    assert not result.text and result.warnings


def test_timeout_is_not_success_and_does_not_echo_private_input(monkeypatch):
    monkeypatch.setattr(ocr.shutil, 'which', lambda _: 'node')
    workspaces = []
    def timeout(*args, **kwargs):
        workspaces.append(Path(kwargs['env']['TMP']))
        assert workspaces[-1].is_dir()
        raise subprocess.TimeoutExpired('PRIVATE INPUT', 25)
    monkeypatch.setattr(ocr.subprocess, 'run', timeout)
    result = ocr.read_page_ocr(b'\xff\xd8synthetic')
    assert not result.text and 'PRIVATE INPUT' not in str(result)
    assert workspaces and all(not path.exists() for path in workspaces)
    assert ocr.read_page_ocr(b'https://untrusted.invalid/image.jpg').text == ''


@pytest.mark.parametrize('angle', [0, -4, 4])
def test_actual_local_ocr_retains_source_from_synthetic_rendered_pdf(angle):
    # Reuses the committed invented fixture; no network, model API or real records.
    from medical_document_worker import document_pages
    body = (Path(__file__).parent / 'fixtures/synthetic-ruled-medical.pdf').read_bytes()
    image, _, _ = next(document_pages(body, 'application/pdf'))
    if angle:
        import io
        from PIL import Image
        with Image.open(io.BytesIO(image)) as source:
            rotated = source.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor='white')
            output = io.BytesIO()
            rotated.save(output, format='JPEG', quality=95)
            image = output.getvalue()
    result = ocr.read_page_ocr(image)
    assert result.text and 'HGB' in result.text and 'TSH' in result.text
    assert '11,2' in result.text and 'không phải hồ sơ người thật' in result.text
