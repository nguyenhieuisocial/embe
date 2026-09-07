import io
import json
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medical_document_worker import MedicalDocumentWorker, ScanFailure, document_pages, image_bytes, validate_page, page_views, check_evidence
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
    assert all(Image.open(io.BytesIO(image)).height <= 4200 for image, _, _ in pages)
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


@pytest.mark.parametrize('value,unit', [('456', 'mm'), ('45.6', 'mm'), ('45,6', 'cm')])
def test_conflicting_number_or_unit_is_flagged_without_correction(value, unit):
    page = sample_page()
    page['fields'][0].update(value=value, unit=unit)
    row = validate_page(page)['fields'][0]
    assert row['unclear'] is True
    assert (row['value'], row['unit']) == (value, unit)


def test_matching_evidence_is_not_marked_as_independent_verification():
    page = sample_page()
    assert not validate_page(page)['fields'][0]['unclear']
    check_evidence(page, 'CRL: 46,1 mm')
    assert page['fields'][0]['unclear']
    assert page['fields'][0]['value'] == '45,6'


@pytest.mark.parametrize('value,evidence', [('> 0,01', '< 0,01'), ('0,5', '-0,5'), ('-0,5', '0,5')])
def test_lab_sign_or_comparator_disagreement_needs_review(value, evidence):
    page = sample_page()
    page['fields'][0].update(value=value, unit='', evidence=evidence)
    assert validate_page(page)['fields'][0]['unclear']


def test_duplicate_labels_with_distinct_results_are_retained_and_flagged():
    page = sample_page()
    page['fields'].append({**page['fields'][0], 'value': '46,1', 'evidence': 'CRL: 46,1 mm'})
    rows = validate_page(page)['fields']
    assert len(rows) == 2 and all(row['unclear'] for row in rows)


def test_medicine_requires_review_even_with_matching_model_quote():
    page = sample_page()
    page['medicines'] = [{'name': 'Sản phẩm giả A', 'ingredients': 'chất mẫu 0,5 mg', 'dose': '1 viên',
                         'frequency': '', 'instructions': '', 'evidence': 'Sản phẩm giả A chất mẫu 0,5 mg 1 viên', 'unclear': False}]
    assert validate_page(page)['medicines'][0]['unclear']


def test_english_identity_labels_cannot_bypass_review_and_saturated_output_is_visible():
    page = sample_page()
    page['fields'] = [{**page['fields'][0], 'label': 'name', 'value': 'NGƯỜI DÙNG MẪU', 'unit': '', 'evidence': 'Họ tên: NGƯỜI DÙNG MẪU'}] * 32
    result = validate_page(page)
    assert all(row['unclear'] for row in result['fields'])
    assert any('giới hạn' in warning for warning in result['warnings'])


def test_discards_empty_model_templates_not_partial_values():
    page = sample_page()
    page['fields'] += [dict(label='BPD', value='', unit='', reference='', evidence='Không thấy', unclear=True),
                       dict(label='Mục có số không', value='0', unit='', reference='', evidence='0', unclear=False)]
    page['medicines'] = [dict(name='', ingredients='', dose='', frequency='', instructions='', evidence='', unclear=True)]
    result = validate_page(page)
    assert [row['label'] for row in result['fields']] == ['CRL', 'Mục có số không']
    assert result['medicines'] == []


def test_detail_views_bounded_and_do_not_change_source():
    source = Image.new('RGB', (1200, 5500), 'white')
    body = image_bytes(source, (4000, 6000))
    before = body[:]
    views = page_views(body)
    assert 2 <= len(views) <= 4
    assert all(max(Image.open(io.BytesIO(view)).size) <= 1800 for view in views)
    assert body == before and source.size == (1200, 5500)
    small = image_bytes(Image.new('RGB', (1400, 1600), 'white'))
    assert page_views(small) == [small]


def dense_sheet(kind):
    """Challenging synthetic transcription fixture, NOT clinical reference data."""
    if kind == 'receipt_long':
        image = Image.new('RGB', (1800, 5900), 'white')
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 26)
        lines = ['PHIẾU THU — DỮ LIỆU GIẢ LẬP', 'KHÔNG PHẢI HỒ SƠ NGƯỜI THẬT', 'Họ tên: NGƯỜI DÙNG MẪU',
                 'Ngày: 07/09/2026', 'Dịch vụ                     Số lượng    Đơn giá    Thành tiền (VND)']
        for i in range(12):
            lines.append(f'Dịch vụ mẫu {chr(65 + i)}                    2             {125500 + i * 1750:,}'.replace(',', '.') + f'          {251000 + i * 3500:,}'.replace(',', '.'))
        lines += ['Tổng cộng: 3.243.000 VND', 'Giảm giá: 43.000 VND', 'Phải trả: 3.200.000 VND']
        for i, line in enumerate(lines):
            draw.text((65, 120 + i * 255), line, font=font, fill='black')
        return image_bytes(image, (4000, 6000))
    image = Image.new('RGB', (1800, 3600), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)
    title = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 42)
    heading = {'receipt': 'PHIẾU THU', 'ultrasound': 'PHIẾU SIÊU ÂM', 'prescription': 'ĐƠN THUỐC', 'clinical': 'BỆNH ÁN'}[kind]
    draw.text((70, 60), heading + ' — MẪU KIỂM TRA', font=title, fill='black')
    common = ['DỮ LIỆU GIẢ LẬP — KHÔNG DÙNG ĐỂ KHÁM HOẶC ĐIỀU TRỊ', 'Họ tên: NGƯỜI DÙNG MẪU', 'Ngày: 07/09/2026']
    content = {
        'receipt': ['Dịch vụ                    Số lượng     Đơn giá         Thành tiền (VND)',
                    'Khám mẫu A                   2            125.000            250.000',
                    'Siêu âm mẫu B                1            350.000            350.000',
                    'Tổng cộng: 600.000 VND', 'Giảm giá: 50.000 VND', 'Phải trả: 550.000 VND'],
        'ultrasound': ['CRL: 45,6 mm', 'NT: 1,2 mm', 'BPD: 18,7 mm', 'HC: 69,3 mm', 'AC: 58,2 mm',
                       'FL: 7,4 mm', 'Nhịp tim thai: 160 lần/phút'],
        'prescription': ['Sản phẩm mẫu A (KHÔNG PHẢI THUỐC THẬT)', 'Thành phần: chất giả A 0,5 mg',
                         'Liều mỗi lần: 1 viên. Số lần: 2 lần/ngày.', 'Cách dùng: sau ăn. Thời gian dùng: 5 ngày.',
                         'Số lượng cấp: 10 viên.', 'Sản phẩm mẫu B (KHÔNG PHẢI THUỐC THẬT)',
                         'Thành phần: chất giả B 250 mcg', 'Liều mỗi lần: 2 viên. Số lần: 1 lần/ngày.',
                         'Cách dùng: sáng. Thời gian dùng: 7 ngày. Số lượng cấp: 14 viên.'],
        'clinical': ['Lý do khám: Mệt mỏi', 'Huyết áp: 110/70 mmHg', 'Cân nặng: 54,5 kg',
                     'Nhịp tim: 78 lần/phút', 'Nhiệt độ: 36,7 °C', 'Lời dặn: Hẹn tái khám', 'Ngày hẹn: 14/09/2026'],
    }[kind]
    for i, line in enumerate(common + content):
        draw.text((70, 190 + i * 70), line, font=font, fill='black')
    draw.text((70, 3170), 'Mã hồ sơ: TEST-2026-0917', font=font, fill='black')
    draw.text((70, 3300), 'BẢN MẪU — KHÔNG PHẢI HỒ SƠ NGƯỜI THẬT', font=font, fill='black')
    return image_bytes(image, (4000, 6000))
