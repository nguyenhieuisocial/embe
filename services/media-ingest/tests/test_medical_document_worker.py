import io
import json
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medical_document_worker import MedicalDocumentWorker, ScanFailure, document_pages, image_bytes, validate_page, page_views, check_evidence, merge_page_readings, needs_detail_read, attach_pdf_source
from meal_analysis_worker import Config, HttpResponse
from medical_document_text import pdf_field_candidates, reconcile_pdf_fields, pdf_table_candidates, reconcile_pdf_tables
from medical_document_ocr import OcrReading


def sample_page():
    return {'kind': 'ultrasound', 'title': 'Phiếu siêu âm mẫu', 'fields': [
        {'label': 'CRL', 'value': '45,6', 'unit': 'mm', 'reference': '', 'evidence': 'CRL: 45,6 mm', 'unclear': False}],
        'medicines': [], 'charges': [], 'warnings': []}


def test_invalid_ai_keeps_ocr_as_source_only_without_inventing_fields():
    def transport(*args):
        return HttpResponse(200, {}, b'{"message":{"content":"invalid response"}}')
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport)
    result = worker.analyze_page(image_bytes(Image.new('RGB', (300, 400), 'white')), '', ocr=OcrReading('Chữ cần giữ 0,005 mg'))
    assert result['ocrText'] == 'Chữ cần giữ 0,005 mg' and result['kind'] == 'other'
    assert not result['fields'] and not result['medicines'] and not result['charges']
    assert any(warning.startswith('Chưa phân loại đầy đủ:') for warning in result['warnings'])
    with pytest.raises(ScanFailure, match='unreadable_output'):
        worker.analyze_page(image_bytes(Image.new('RGB', (300, 400), 'white')), '')


def test_ai_unavailability_keeps_existing_retry_instead_of_marking_it_complete():
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), lambda *args: HttpResponse(503, {}, b''))
    with pytest.raises(ScanFailure, match='local_ai_unavailable'):
        worker.analyze_page(image_bytes(Image.new('RGB', (300, 400), 'white')), '', ocr=OcrReading('Chữ nguồn'))


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
    result = MedicalDocumentWorker(Config('https://example.supabase.co', 'private'), transport, rpc, ocr_reader=lambda _: OcrReading('Mã ngoài biểu mẫu: TEST-TAIL')).run_once()
    assert result == {'status': 'review', 'pages': 1}
    assert [name for name, _ in calls] == ['embe_claim_document_scan', 'embe_progress_document_scan', 'embe_finish_document_scan']
    assert all(data['p_claim_token'] == 'claim-one' for _, data in calls[1:])
    page = calls[-1][1]['p_analysis']['pages'][0]
    assert page['ocrText'] == 'Mã ngoài biểu mẫu: TEST-TAIL' and page['ocrEngine'] == 'tesseract-vie-eng'
    assert 'pdfText' not in page and all('pdfValue' not in row for row in page['fields'])


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
                         'Liều mỗi lần: 1 viên. Số lần: 2 lần/ngày.', 'Cách dùng: sau ăn. Thời gian dùng: 5 ngày. Đường dùng: uống.',
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


def test_extended_columns_preserve_original_text_and_reject_unknown_fields():
    page = sample_page()
    page['fields'][0]['context'] = 'Thai A'
    page['medicines'] = [dict(name='MẪU', ingredients='', dose='1 viên', frequency='', instructions='', route='uống', duration='5 ngày', quantity='10 viên', evidence='MẪU 1 viên uống 5 ngày 10 viên', unclear=False)]
    page['charges'] = [dict(label='Dịch vụ mẫu', amount='250.000', currency='VND', quantity='2', unitPrice='125.000', evidence='Dịch vụ mẫu 2 125.000 250.000 VND', unclear=False)]
    checked = validate_page(page)
    assert checked['medicines'][0]['quantity'] == '10 viên'
    assert checked['charges'][0]['unitPrice'] == '125.000'
    checked['charges'][0]['guessedTotal'] = '250000'
    with pytest.raises(ScanFailure):
        validate_page(checked)


def test_receipt_mismatch_is_flagged_but_never_recalculated():
    page = sample_page()
    page['charges'] = [dict(label='Dịch vụ mẫu', amount='240.000', currency='VND', quantity='2', unitPrice='125.000', evidence='Dịch vụ mẫu 2 125.000 240.000 VND', unclear=False)]
    result = validate_page(page)
    assert result['charges'][0]['amount'] == '240.000'
    assert result['charges'][0]['unclear']
    assert any('đơn giá' in text for text in result['warnings'])


def test_detail_merge_keeps_conflicts_and_qualifiers_not_just_last_value():
    first, second = sample_page(), sample_page()
    second['fields'].append({**first['fields'][0], 'value': '46,1', 'evidence': 'CRL: 46,1 mm', 'context': 'Thai B'})
    result = merge_page_readings([first, second], incomplete=True)
    assert len(result['fields']) == 2
    assert all(row['unclear'] for row in result['fields'])
    assert result['fields'][1]['context'] == 'Thai B'
    assert 'Chưa đọc hết' in result['warnings'][0]


def test_truncated_generation_recovers_by_bounded_detail_reads_and_refreshes_claim():
    calls, progress = [], []
    def transport(method, url, headers, data=None):
        payload = json.loads(data)
        calls.append(payload)
        if len(calls) == 1:
            return HttpResponse(200, {}, json.dumps({'done_reason': 'length', 'message': {'content': '{'}}).encode())
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(sample_page())}}).encode())
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport)
    result = worker.analyze_page(image_bytes(Image.new('RGB', (1800, 3600), 'white'), (4000, 6000)), '', progress=lambda: progress.append(True))
    assert len(calls) == 3 and len(progress) == 2
    assert len(result['fields']) == 1
    assert all(len(call['messages'][1]['images']) == 1 for call in calls[1:])


def test_one_failed_detail_region_is_explicit_not_silent_complete():
    calls = []
    def transport(method, url, headers, data=None):
        calls.append(1)
        if len(calls) == 1:
            return HttpResponse(200, {}, b'{"done_reason":"length"}')
        if len(calls) == 2:
            return HttpResponse(503, {}, b'')
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(sample_page())}}).encode())
    result = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport).analyze_page(image_bytes(Image.new('RGB', (1800, 3600), 'white'), (4000, 6000)), '')
    assert any('Chưa đọc hết' in w for w in result['warnings'])


def test_repairs_only_exact_table_column_mappings_and_preserves_lab_context():
    page = sample_page()
    page['fields'] = [dict(label='Tên xét nghiệm', value='TSH', unit='mIU/L', reference='0,4 - 4,0', context='', evidence='TSH < 0,01 mIU/L 0,4 - 4,0', unclear=False),
                      dict(label='Tên xét nghiệm', value='Glucose (sau 1 giờ)', unit='mmol/L', reference='', context='sau 1 giờ', evidence='Glucose (sau 1 giờ) 7,1 mmol/L', unclear=False)]
    rows = validate_page(page)['fields']
    assert rows[0]['label'] == 'TSH' and rows[0]['value'] == '< 0,01' and rows[0]['unclear']
    assert rows[1]['label'] == 'Glucose (sau 1 giờ)' and rows[1]['value'] == '7,1' and rows[1]['context'] == 'sau 1 giờ'


def test_ambiguous_evidence_does_not_repair_or_invent_lab_results():
    page = sample_page()
    page['fields'] = [dict(label='Tên xét nghiệm', value='TSH', unit='mIU/L', reference='', evidence='TSH 0,1 0,2 mIU/L', unclear=True)]
    assert validate_page(page)['fields'][0]['value'] == 'TSH'


def test_receipt_totals_and_generic_service_labels_keep_all_printed_money():
    page = sample_page(); page['kind'] = 'receipt'
    page['charges'] = [dict(label='Dịch vụ', amount='250.000', currency='VND', quantity='2', unitPrice='125.000', evidence='Khám mẫu A 2 125.000 250.000', unclear=False)]
    page['fields'] = [dict(label='Phải trả', value='550.000 VND', unit='', reference='', evidence='Phải trả: 550.000 VND', unclear=False)]
    result = validate_page(page)
    assert [(r['label'], r['amount']) for r in result['charges']] == [('Khám mẫu A', '250.000'), ('Phải trả', '550.000')]
    assert result['fields'] == []


def test_merge_never_silently_drops_rows_above_page_capacity():
    readings = []
    for start in [0, 32, 64]:
        page = sample_page()
        page['fields'] = [{**page['fields'][0], 'label': f'Mục mẫu {i}'} for i in range(start, start + 32)]
        readings.append(page)
    merged = merge_page_readings(readings)
    assert len(merged['fields']) == 64
    assert 'vượt số mục' in merged['warnings'][0]


def test_model_explanation_cannot_become_confident_printed_context():
    page = sample_page()
    page['fields'][0]['context'] = 'Thai A: phát triển bình thường'
    result = validate_page(page)
    assert result['fields'][0]['unclear']
    assert any('diễn giải thêm' in w for w in result['warnings'])


def test_explicit_quoted_quantity_can_be_retained_without_computing_dose():
    page = sample_page()
    page['charges'] = [dict(label='Dịch vụ mẫu', amount='250.000', currency='VND', evidence='Dịch vụ mẫu, Số lượng: 2, Đơn giá: 125.000, Thành tiền: 250.000 VND', unclear=False)]
    row = validate_page(page)['charges'][0]
    assert row['quantity'] == '2' and row['unitPrice'] == '125.000' and row['unclear']


def test_clinical_conclusions_and_text_disagreements_always_require_review():
    page = sample_page()
    page['fields'] = [dict(label='Chẩn đoán in trên giấy', value='NỘI DUNG MẪU', unit='', reference='', evidence='Chẩn đoán: NỘI DUNG MẪU', unclear=False),
                      dict(label='Khoa', value='Sản', unit='', reference='', evidence='Khoa: Sán', unclear=False)]
    assert all(row['unclear'] for row in validate_page(page)['fields'])


def test_pdf_anchors_preserve_diacritics_without_overwriting_ai_value():
    page = sample_page()
    page['fields'] = [dict(label='Khoa', value='Sán', unit='', reference='', evidence='Khoa: Sán', unclear=False)]
    printed = 'Khoa: Sản\nNgày ra viện: 07/09/2026\nChẩn đoán: THEO DÕI MẪU'
    reconcile_pdf_fields(page, printed, 64)
    row = page['fields'][0]
    assert row['value'] == 'Sán' and row['evidence'] == 'Khoa: Sán'
    assert row['pdfValue'] == 'Sản' and row['pdfEvidence'] == 'Khoa: Sản' and row['unclear']
    assert [(r['label'], r['value']) for r in page['fields'][1:]] == [('Ngày ra viện', '07/09/2026'), ('Chẩn đoán', 'THEO DÕI MẪU')]
    assert all(r['unclear'] for r in validate_page(page)['fields'])


def test_pdf_anchors_never_guess_tables_wrapped_narratives_or_multiple_patients():
    printed = ('Họ tên: NGƯỜI A\nHọ tên: NGƯỜI B\nHGB: 11,2 g/dL\n'
               'Kết luận: phần đầu\nphần còn lại trên dòng sau\n'
               'Ngày khám: 07/09/2026  Bác sĩ: BS MẪU\n'
               'Số hóa đơn: INV-TEST\nGiờ lấy mẫu: 08:15\n'
               'Tên thuốc: Sản phẩm A 5 mg\nBác sĩ: BS MẪU')
    cells = pdf_field_candidates(printed)
    assert [c['label'] for c in cells] == ['Số hóa đơn', 'Giờ lấy mẫu', 'Bác sĩ']
    assert cells[1]['value'] == '08:15'


def test_pdf_context_or_conflicting_rows_do_not_get_automatic_source_alignment():
    page = sample_page()
    page['fields'] = [dict(label='Ngày khám', value='07/09/2026', unit='', reference='', context='Lần 1', evidence='', unclear=True)]
    reconcile_pdf_fields(page, 'Ngày khám: 08/09/2026', 64)
    assert 'pdfValue' not in page['fields'][0]
    page['fields'][0]['context'] = ''
    page['fields'].append(dict(page['fields'][0]))
    reconcile_pdf_fields(page, 'Ngày khám: 08/09/2026', 64)
    assert all('pdfValue' not in r for r in page['fields'])


def test_pdf_source_metadata_is_paired_bounded_and_not_model_controlled():
    page = sample_page(); page['fields'][0]['pdfValue'] = '46,1'
    with pytest.raises(ScanFailure):
        validate_page(page)
    page['fields'][0]['pdfEvidence'] = 'x' * 1801
    with pytest.raises(ScanFailure):
        validate_page(page)
    page['fields'][0]['pdfEvidence'] = 'CRL: 46,1 mm'
    def transport(*args):
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(page)}}).encode())
    result = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport).analyze_page(image_bytes(Image.new('RGB', (500, 500))), '')
    assert 'pdfValue' not in result['fields'][0] and 'pdfEvidence' not in result['fields'][0]


def test_pdf_full_text_checked_even_beyond_model_context_without_claiming_complete():
    page = sample_page()
    captured = []
    def transport(method, url, headers, data=None):
        captured.append(json.loads(data))
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(page)}}).encode())
    printed = 'x' * 12010 + '\nSố hóa đơn: INV-TEST-TAIL'
    result = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport).analyze_page(image_bytes(Image.new('RGB', (500, 500))), printed)
    assert 'INV-TEST-TAIL' not in captured[0]['messages'][1]['content']
    assert any(r['value'] == 'INV-TEST-TAIL' for r in result['fields'])
    assert any('chỉ nhận một phần' in w for w in result['warnings'])
    assert result['pdfText'] == printed


def test_pdf_metadata_capacity_has_visible_coverage_warning():
    page = sample_page()
    reconcile_pdf_fields(page, 'Bác sĩ: BS Mẫu', 1)
    assert len(page['fields']) == 1
    assert any('hết chỗ' in w for w in page['warnings'])


@pytest.mark.parametrize('value,unit,want', [('45,6 mm', 'mm', '45,6'), ('< 0,01 mIU/L', 'mIU/L', '< 0,01'),
                                         ('110/70 mmHg', 'mmHg', '110/70'), ('45,6 cm', 'mm', '45,6 cm'),
                                         ('12 - 15 mm', 'mm', '12 - 15 mm')])
def test_exact_duplicate_unit_is_split_without_reinterpreting_results(value, unit, want):
    page = sample_page(); page['fields'][0].update(value=value, unit=unit, evidence=f'Mục mẫu: {value}')
    row = validate_page(page)['fields'][0]
    assert row['value'] == want and row['unit'] == unit and row['evidence'] == f'Mục mẫu: {value}'


def test_normal_page_uses_full_detail_first_long_receipts_use_strips():
    calls = []
    def transport(method, url, headers, data=None):
        calls.append(json.loads(data))
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(sample_page())}}).encode())
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport)
    worker.analyze_page(image_bytes(Image.new('RGB', (1400, 2600), 'white')), '')
    worker.analyze_page(image_bytes(Image.new('RGB', (1200, 4800), 'white'), (4000, 6000)), '')
    assert len(calls[0]['messages'][1]['images']) == 1
    assert len(calls[1]['messages'][1]['images']) > 1


def test_oversized_pdf_text_fails_before_allocating_text_or_render(monkeypatch):
    import pypdfium2 as pdfium
    class TextPage:
        def count_chars(self): return 48001
        def get_text_bounded(self): raise AssertionError('must not allocate oversized text')
        def close(self): pass
    class Page:
        def get_size(self): return (595, 842)
        def get_textpage(self): return TextPage()
        def render(self, **kwargs): raise AssertionError('must not render oversized layer')
        def close(self): pass
    class Document:
        def __len__(self): return 1
        def __getitem__(self, index): return Page()
        def close(self): pass
    monkeypatch.setattr(pdfium, 'PdfDocument', lambda body: Document())
    with pytest.raises(ScanFailure, match='text_layer_too_large'):
        list(document_pages(b'%PDF-synthetic', 'application/pdf'))


@pytest.mark.parametrize('kind', ['receipt', 'prescription', 'ultrasound', 'laboratory', 'clinical', 'discharge', 'other'])
def test_empty_or_administrative_only_scan_gets_bounded_detail_retry(kind):
    calls = []
    first = sample_page(); first.update(kind=kind, fields=[])
    def transport(method, url, headers, data=None):
        calls.append(json.loads(data))
        page = first if len(calls) == 1 else sample_page()
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(page)}}).encode())
    result = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport).analyze_page(
        image_bytes(Image.new('RGB', (1800, 3600)), (4000, 6000)), '')
    assert len(calls) == 3
    assert any(row['label'] == 'CRL' for row in result['fields'])
    if kind != 'other':
        first['fields'] = [dict(label='Họ tên', value='NGƯỜI MẪU', unit='', reference='', evidence='', unclear=True)]
        assert needs_detail_read(first)


def test_clear_ultrasound_does_not_trigger_unnecessary_extra_model_calls():
    assert not needs_detail_read(sample_page())
    page = sample_page(); page['fields'][0]['value'] = '46,1'
    assert needs_detail_read(validate_page(page))


def test_pdf_tables_keep_comparators_units_context_and_money_columns():
    printed = ('Xét nghiệm\tKết quả\tĐơn vị\tKhoảng tham chiếu\tThời điểm\n'
               'TSH\t< 0,01\tmIU/L\t0,4 - 4,0\t\n'
               'Glucose\t4,8\tmmol/L\t\tlúc đói\n'
               'Glucose\t7,1\tmmol/L\t\tsau 1 giờ\n\n'
               'Tên dịch vụ | Số lượng | Đơn giá | Thành tiền | Tiền tệ\n'
               'Khám mẫu | 2 | 125.000 | 250.000 | VND')
    candidates = pdf_table_candidates(printed)
    assert len(candidates) == 4
    tsh = candidates[0][1]
    assert tsh['value'] == '< 0,01' and tsh['unit'] == 'mIU/L' and tsh['reference'] == '0,4 - 4,0'
    assert [row['context'] for group, row in candidates[1:3]] == ['lúc đói', 'sau 1 giờ']
    assert candidates[3][1]['amount'] == '250.000' and candidates[3][1]['unitPrice'] == '125.000'
    assert all(row['unclear'] for _, row in candidates)


def test_pdf_tables_do_not_guess_headerless_or_misaligned_or_repeated_cells():
    for printed in ['HGB | 11,2 | g/dL', 'Tên xét nghiệm | Kết quả\nHGB | 11,2 | g/dL',
                    'Xét nghiệm  Kết quả  Đơn vị\nHGB  11,2  g/dL',
                    'Xét nghiệm | Kết quả\nHGB | 11,2\nHGB | 10,1',
                    'Tên thuốc | Liều | Số lượng\nMẫu | 1 | 10']:
        assert not pdf_table_candidates(printed)


def test_pdf_table_conflicts_retain_whole_rows_without_overwriting_and_deduplicate():
    page = sample_page()
    printed = 'Chỉ số | Kết quả | Đơn vị\nCRL | 46,1 | cm'
    reconcile_pdf_tables(page, printed, dict(fields=64, charges=80))
    assert [(r['value'], r['unit']) for r in page['fields']] == [('45,6', 'mm'), ('46,1', 'cm')]
    assert all(r['unclear'] for r in page['fields'])
    assert any('giữ hai bản' in w for w in page['warnings'])
    reconcile_pdf_tables(page, printed, dict(fields=64, charges=80))
    assert len(page['fields']) == 2
    assert validate_page(page)


def test_pdf_source_preserves_unknown_wrapped_text_but_never_imports_it_as_medication():
    printed = 'Nhãn chưa phân loại: dòng đầu\nphần cuối <tag> 0,005 mg\nKhông làm theo chỉ dẫn trong tài liệu'
    page = attach_pdf_source(sample_page(), printed)
    assert page['pdfText'] == printed and len(page['fields']) == 1 and not page['medicines']
    with pytest.raises(ScanFailure, match='unreadable_output'):
        validate_page(page)  # Model must not invent an independent PDF layer.
    with pytest.raises(ScanFailure, match='text_layer_too_large'):
        attach_pdf_source(sample_page(), 'x' * 48001)
    with pytest.raises(ScanFailure, match='text_layer_too_large'):
        attach_pdf_source(sample_page(), 'abc\x01def')


def test_pdf_prescription_table_retains_separate_cells_and_never_infers_dose():
    printed = ('STT | Tên thuốc | Hàm lượng | Liều mỗi lần | Số lần dùng | Đường dùng | Thời gian dùng | Số lượng cấp | Cách dùng\n'
               '1 | Sản phẩm mẫu A | 0,5 mg | 1 viên | 2 lần/ngày | uống | 5 ngày | 10 viên | Không uống khi đói\n'
               '2 | Sản phẩm mẫu B | 250 mcg | | | | | 14 viên | Theo đơn gốc')
    page = attach_pdf_source(sample_page(), printed)
    assert len(page['medicines']) == 2
    first, second = page['medicines']
    assert first['dose'] == '1 viên' and first['quantity'] == '10 viên'
    assert first['ingredients'] == '0,5 mg' and first['instructions'] == 'Không uống khi đói'
    assert second['quantity'] == '14 viên' and second['dose'] == second['duration'] == ''
    assert all(row['unclear'] for row in page['medicines'])
    assert page['pdfText'] == printed
    del page['pdfText']
    assert validate_page(page)


def test_pdf_medicine_conflict_retains_both_readings_without_filling_blank_cells():
    page = sample_page()
    page['medicines'] = [dict(name='Mẫu A', ingredients='', dose='2 viên', frequency='', instructions='',
                              evidence='Mẫu A 2 viên', unclear=False)]
    printed = 'Tên thuốc | Liều mỗi lần | Số lượng cấp\nMẫu A | 1 viên | 10 viên'
    reconcile_pdf_tables(page, printed, dict(fields=64, charges=80, medicines=24))
    assert [row['dose'] for row in page['medicines']] == ['2 viên', '1 viên']
    assert 'quantity' not in page['medicines'][0]  # No silent merge.
    reconcile_pdf_tables(page, printed, dict(fields=64, charges=80, medicines=24))
    assert len(page['medicines']) == 2 and all(row['unclear'] for row in page['medicines'])
    assert any('giữ hai bản' in warning for warning in page['warnings'])


@pytest.mark.parametrize('printed', [
    'Tên thuốc | Liều | Số lượng\nMẫu A | 1 | 10',  # Ambiguous dose header.
    'Tên thuốc | Liều mỗi lần | Số lượng cấp\nMẫu A | 1 viên | 10 viên | extra',
    'Tên thuốc | Liều mỗi lần | Số lượng cấp\nMẫu A | 1 viên | 10 viên\nMẫu A | 2 viên | 20 viên',
    'Tên thuốc | Liều mỗi lần | Số lượng cấp\nMẫu A | ' + 'x' * 81 + ' | 10 viên',
    'Tên thuốc | Thành tiền | Số lượng\nMẫu A | 200.000 | 10',
])
def test_ambiguous_medicine_pdf_table_is_not_imported(printed):
    assert not pdf_table_candidates(printed)


def test_wrapped_narrative_keeps_full_text_only_between_known_boundaries():
    printed = 'Lời dặn: Mang theo giấy tờ\nkhi tái khám.\nKhông tự thay đổi nội dung mẫu.\nNgày hẹn: 14/09/2026'
    page = attach_pdf_source(sample_page(), printed)
    row = next(row for row in page['fields'] if row['label'] == 'Lời dặn')
    assert row['value'] == 'Mang theo giấy tờ\nkhi tái khám.\nKhông tự thay đổi nội dung mẫu.'
    assert row['pdfEvidence'] == printed.split('\nNgày hẹn')[0] and row['unclear']
    for uncertain in ['Lời dặn: phần đầu\nphần sau', 'Lời dặn: phần đầu\nphần sau\nNgười khác: giá trị',
                      'Lời dặn: phần đầu\nA | B\nBác sĩ: BS Mẫu']:
        assert not any(c['label'] == 'Lời dặn' for c in pdf_field_candidates(uncertain))


def test_wrapped_narrative_bounds_preserve_full_source_without_schema_overflow():
    printed = 'Lời dặn: ' + 'a' * 490 + '\n' + 'b' * 480 + '\nBác sĩ: BS Mẫu'
    page = attach_pdf_source(sample_page(), printed)
    row = next(row for row in page['fields'] if row['label'] == 'Lời dặn')
    assert len(row['evidence']) == 500 and len(row['pdfEvidence']) > 500
    assert len(row['value']) > 900 and page['pdfText'] == printed
    del page['pdfText']
    assert validate_page(page)
    too_long = 'Lời dặn: ' + 'a' * 480 + '\n' + ('b' * 480 + '\n') * 3 + 'Bác sĩ: BS Mẫu'
    assert not any(c['label'] == 'Lời dặn' for c in pdf_field_candidates(too_long))


@pytest.mark.parametrize('key,value', [('name', 'Mẫu B'), ('ingredients', '0,5 mcg'),
                                       ('dose', '1 ống'), ('instructions', 'trước ăn')])
def test_medicine_text_mismatch_gets_second_look_not_just_digit_check(key, value):
    page = sample_page()
    row = dict(name='Mẫu A', ingredients='0,5 mg', dose='1 viên', frequency='', instructions='sau ăn',
               evidence='Mẫu A 0,5 mg 1 viên sau ăn', unclear=False)
    row[key] = value
    page['medicines'] = [row]
    validate_page(page)
    assert needs_detail_read(page) and row[key] == value and row['unclear']
    assert any(warning.startswith('Tên hoặc cách dùng thuốc') for warning in page['warnings'])


def test_missing_medication_negation_cannot_be_confident_even_if_substring_matches():
    page = sample_page()
    page['medicines'] = [dict(name='Mẫu A', ingredients='', dose='', frequency='', instructions='uống khi đói',
                              evidence='Mẫu A: không uống khi đói', unclear=False)]
    validate_page(page)
    assert needs_detail_read(page)
    assert any(w.startswith('Lời dặn có từ phủ định') for w in page['warnings'])


def test_general_document_disclaimer_does_not_trigger_medication_retry():
    from medical_document_worker import page_schema
    assert next(iter(page_schema('prescription')['properties']['medicines']['items']['properties'])) == 'evidence'
    page = sample_page()
    page['medicines'] = [dict(name='Mẫu A', ingredients='', dose='1 viên', frequency='', instructions='sau ăn',
                              evidence='Mẫu A (không phải thuốc thật) 1 viên sau ăn', unclear=False)]
    validate_page(page)
    assert not needs_detail_read(page)


def test_deficient_small_scan_gets_bounded_retry_without_upsampling_or_clear_page_penalty():
    calls = []
    def transport(method, url, headers, data=None):
        calls.append(json.loads(data))
        result = sample_page()
        if len(calls) == 1:
            result['fields'] = []
        return HttpResponse(200, {}, json.dumps({'message': {'content': json.dumps(result)}}).encode())
    body = image_bytes(Image.new('RGB', (1000, 1600), 'white'))
    views = page_views(body, retry_small=True)
    assert len(views) == 3 and max(Image.open(io.BytesIO(views[1])).size) <= 1000
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport)
    assert worker.analyze_page(body, '')['fields']
    assert len(calls) == 3
    worker.analyze_page(body, '')  # Clear reading does not need detail requests.
    assert len(calls) == 4
    assert len(page_views(image_bytes(Image.new('RGB', (400, 700))), retry_small=True)) == 1


def test_small_truncated_scan_recovers_and_single_view_mode_does_not_crash():
    calls = []
    def transport(method, url, headers, data=None):
        calls.append(1)
        return HttpResponse(200, {}, json.dumps({'done_reason': 'length'} if len(calls) == 1 else
                            {'message': {'content': json.dumps(sample_page())}}).encode())
    body = image_bytes(Image.new('RGB', (1000, 1600), 'white'))
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'), transport)
    assert worker.analyze_page(body, '')['fields'] and len(calls) == 3
    calls.clear()
    with pytest.raises(ScanFailure, match='unreadable_output'):
        worker.analyze_page(body, '', detailed=False)
