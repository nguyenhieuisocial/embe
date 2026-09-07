import io
import json
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medical_document_worker import MedicalDocumentWorker, ScanFailure, document_pages, image_bytes, validate_page
from meal_analysis_worker import Config, HttpResponse


def sample_page():
    return {'kind': 'ultrasound', 'title': 'Phiếu siêu âm mẫu', 'fields': [
        {'label': 'CRL', 'value': '45,6', 'unit': 'mm', 'reference': '', 'evidence': 'CRL: 45,6 mm', 'unclear': False}],
        'medicines': [], 'charges': [], 'warnings': []}


def test_preserves_printed_decimal_units_and_ranges():
    page = sample_page()
    assert validate_page(page)['fields'][0]['value'] == '45,6'
    page['fields'][0].update(value='< 0,01', unit='mIU/L', reference='0,1 – 4,0', evidence='')
    result = validate_page(page)
    assert result['fields'][0]['value'] == '< 0,01'
    assert result['fields'][0]['unclear'] is True


@pytest.mark.parametrize('bad', [None, {'kind': 'diagnosis'}, {**sample_page(), 'advice': 'take pills'}, {**sample_page(), 'kind': 'cancer'}])
def test_rejects_untrusted_model_schema(bad):
    with pytest.raises(ScanFailure):
        validate_page(bad)


def test_pdf_all_pages_and_explicit_page_limit():
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument.new()
    for _ in range(2):
        doc.new_page(595, 842).close()
    data = io.BytesIO(); doc.save(data); doc.close()
    pages = list(document_pages(data.getvalue(), 'application/pdf'))
    assert len(pages) == 2 and all(total == 2 for _, _, total in pages)
    assert all(Image.open(io.BytesIO(image)).height <= 3200 for image, _, _ in pages)
    doc = pdfium.PdfDocument.new()
    for _ in range(7):
        doc.new_page(595, 842).close()
    data = io.BytesIO(); doc.save(data); doc.close()
    with pytest.raises(ScanFailure, match='too_many_pages'):
        list(document_pages(data.getvalue(), 'application/pdf'))


def test_validates_signatures_and_keeps_source_unchanged():
    body = image_bytes(Image.new('RGB', (1200, 1800), 'white'))
    before = body[:]
    assert len(list(document_pages(body, 'image/jpeg'))) == 1
    assert body == before
    with pytest.raises(ScanFailure, match='invalid_image'):
        list(document_pages(body, 'image/png'))
    with pytest.raises(ScanFailure, match='invalid_pdf'):
        list(document_pages(b'broken', 'application/pdf'))


def test_worker_fences_updates_and_never_writes_clinical_data():
    calls = []
    document_id = '11111111-1111-4111-8111-111111111111'
    body = image_bytes(Image.new('RGB', (800, 1100), 'white'))
    def rpc(name, data):
        calls.append((name, data))
        if name == 'embe_claim_document_scan':
            return {'document_id': document_id, 'claim_token': 'claim-one', 'storage_path': f'records/{document_id}/{document_id}.jpg', 'byte_size': len(body), 'mime_type': 'image/jpeg'}
    def transport(method, url, headers, data=None):
        if method == 'GET':
            return HttpResponse(200, {}, body)
        payload = json.loads(data)
        assert url == 'http://127.0.0.1:11434/api/chat'
        assert payload['format']['additionalProperties'] is False
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(sample_page())}}).encode())
    result = MedicalDocumentWorker(Config('https://example.supabase.co', 'private'), transport, rpc).run_once()
    assert result == {'status': 'review', 'pages': 1}
    assert [name for name, _ in calls] == ['embe_claim_document_scan', 'embe_progress_document_scan', 'embe_finish_document_scan']
    assert all(data['p_claim_token'] == 'claim-one' for _, data in calls[1:])


def synthetic_sheet(kind):
    """Only invented test records; no family health data."""
    fixtures = {
        'receipt': ['PHIẾU THU — DỮ LIỆU MẪU', 'Họ tên: NGƯỜI DÙNG MẪU', 'Ngày: 07/09/2026',
                    'Khám sản: 250.000 VND', 'Siêu âm: 350.000 VND', 'Đã thanh toán: 600.000 VND'],
        'ultrasound': ['PHIẾU SIÊU ÂM — DỮ LIỆU MẪU', 'Họ tên: NGƯỜI DÙNG MẪU', 'Ngày: 07/09/2026',
                       'CRL: 45,6 mm', 'NT: 1,2 mm', 'Nhịp tim thai: 160 lần/phút', 'KHÔNG PHẢI KẾT QUẢ KHÁM THẬT'],
        'prescription': ['ĐƠN THUỐC — DỮ LIỆU MẪU', 'Họ tên: NGƯỜI DÙNG MẪU', 'Ngày: 07/09/2026',
                         'Sản phẩm mẫu A (không phải thuốc thật)', 'Thành phần: chất mẫu 0,5 mg', 'Liều: 1 viên',
                         'Số lần dùng: 2 lần/ngày', 'Cách dùng: sau ăn', 'KHÔNG DÙNG ĐƠN MẪU NÀY ĐỂ UỐNG THUỐC'],
        'clinical': ['BỆNH ÁN — DỮ LIỆU MẪU', 'Họ tên: NGƯỜI DÙNG MẪU', 'Ngày khám: 07/09/2026',
                     'Lý do khám: Mệt mỏi', 'Huyết áp: 110/70 mmHg', 'Lời dặn trên phiếu: Hẹn tái khám', 'KHÔNG PHẢI BỆNH ÁN THẬT'],
    }
    image = Image.new('RGB', (1400, 1600), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 32)
    for index, line in enumerate(fixtures[kind]):
        draw.text((70, 90 + index * 115), line, font=font, fill='black')
    return image_bytes(image)
