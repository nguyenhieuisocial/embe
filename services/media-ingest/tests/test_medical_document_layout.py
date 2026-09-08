import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medical_document_layout import extract_pdf_layout, table_source
from medical_document_text import pdf_table_candidates
from medical_document_worker import attach_pdf_source, page_schema


def empty_page(kind='laboratory'):
    return dict(kind=kind, title='Mẫu', fields=[], medicines=[], charges=[], warnings=[])


def test_medical_model_rows_quote_evidence_before_values():
    for group in ['fields', 'medicines']:
        assert next(iter(page_schema()['properties'][group]['items']['properties'])) == 'evidence'
    assert next(iter(page_schema()['properties']['charges']['items']['properties'])) == 'label'


def test_real_pdf_geometry_preserves_columns_units_negation_and_quantities():
    body = (Path(__file__).parent / 'fixtures/synthetic-ruled-medical.pdf').read_bytes()
    readings = [extract_pdf_layout(body, number) for number in [1, 2, 3]]
    assert all(reading.table_text and not reading.warnings for reading in readings)
    fields = [row for group, row in pdf_table_candidates(readings[0].table_text) if group == 'fields']
    assert len(fields) == 5
    assert next(row for row in fields if row['label'] == 'TSH')['value'] == '< 0,01'
    assert next(row for row in fields if row['label'] == 'HGB')['reference'] == '11,0 - 16,0'
    meds = [row for group, row in pdf_table_candidates(readings[1].table_text) if group == 'medicines']
    assert len(meds) == 2
    assert meds[0]['dose'] == '1 viên' and meds[0]['quantity'] == '10 viên' and meds[0]['duration'] == '5 ngày'
    assert 'không uống khi đói' in meds[0]['instructions']
    assert meds[1]['ingredients'] == ''  # Never infer an ingredient from a brand.
    charges = [row for group, row in pdf_table_candidates(readings[2].table_text) if group == 'charges']
    assert len(charges) == 4
    assert charges[0]['amount'] == '250.000' and charges[0]['unitPrice'] == '125.000'
    assert charges[-1]['label'] == 'Phải trả' and charges[-1]['quantity'] == ''
    assert all(row['unclear'] for row in [*fields, *meds, *charges])


def test_ambiguous_merged_cells_and_delimiter_injection_do_not_become_rows():
    for row in [[None, '10', 'mg'], ['TSH | 999', '10', 'mg'], ['TSH', '9\x00', 'mg']]:
        result = table_source([[['Tên xét nghiệm', 'Kết quả', 'Đơn vị'], row]])
        assert not result.table_text and result.warnings


def test_wrapped_headers_are_read_but_unknown_columns_are_not_guessed():
    result = table_source([[['Tên xét\nnghiệm', 'Kết quả', 'Đơn vị'], ['HGB', '11,2', 'g/dL']]])
    assert pdf_table_candidates(result.table_text)[0][1]['value'] == '11,2'
    unknown = table_source([[['Tên xét nghiệm', 'Bình thường?', 'Đơn vị'], ['HGB', '11,2', 'g/dL']]])
    assert not unknown.table_text and unknown.warnings


def test_no_model_value_is_overwritten_and_source_text_is_preserved():
    page = empty_page()
    page['fields'] = [dict(label='HGB', value='112', unit='g/dL', reference='', context='', evidence='HGB 112 g/dL', unclear=False)]
    result = attach_pdf_source(page, 'Original PDF reading order', 'Tên xét nghiệm | Kết quả | Đơn vị\nHGB | 11,2 | g/dL')
    assert result['pdfText'] == 'Original PDF reading order'
    assert [row['value'] for row in result['fields']] == ['112', '11,2']
    assert all(row['unclear'] for row in result['fields'])
    assert result['fields'][1]['pdfEvidence'] == 'HGB | 11,2 | g/dL'


def test_optional_layout_failure_is_visible_without_discarding_other_reading():
    layout = extract_pdf_layout(b'%PDF-broken', 1)
    assert not layout.table_text and layout.warnings
    page = attach_pdf_source(empty_page(), 'Chữ còn đọc được', '', layout.warnings)
    assert page['pdfText'] == 'Chữ còn đọc được' and page['warnings']


def test_partial_table_never_hides_skipped_ambiguous_or_oversized_rows():
    for rows in [
        [['Glucose', '5,2', 'mmol/L'], ['Glucose', '7,1', 'mmol/L']],
        [['N' * 121, '5,2', 'mmol/L']],
        [['TSH', '\x1f0,01', 'mIU/L']],
    ]:
        reading = table_source([[['Tên xét nghiệm', 'Kết quả', 'Đơn vị'], *rows, ['HGB', '11,2', 'g/dL']]])
        assert reading.warnings
        assert all(row['label'] == 'HGB' for _, row in pdf_table_candidates(reading.table_text))
    assert table_source([[['x'] * 13, ['y'] * 13]]).warnings


def test_case_sensitive_unit_prefixes_are_never_deduplicated_as_identical():
    page = empty_page()
    page['fields'] = [dict(label='TSH', value='1', unit='MIU/L', reference='', context='', evidence='TSH 1 MIU/L', unclear=False)]
    result = attach_pdf_source(page, '', 'Tên xét nghiệm | Kết quả | Đơn vị\nTSH | 1 | mIU/L')
    assert [row['unit'] for row in result['fields']] == ['MIU/L', 'mIU/L']
    assert all(row['unclear'] for row in result['fields']) and result['warnings']


def test_conflicting_existing_pdf_source_is_not_overwritten_by_table_reading():
    page = empty_page()
    page['fields'] = [dict(label='Ngày khám', value='02/09/2026', unit='', reference='', context='', evidence='Ngày khám 02/09/2026', unclear=False)]
    result = attach_pdf_source(page, 'Ngày khám: 01/09/2026', 'Chỉ số | Kết quả\nNgày khám | 02/09/2026')
    assert [row['pdfValue'] for row in result['fields']] == ['01/09/2026', '02/09/2026']
    assert result['fields'][0]['pdfEvidence'] == 'Ngày khám: 01/09/2026'
    assert all(row['unclear'] for row in result['fields']) and result['warnings']


def test_extra_layout_notices_never_clear_partial_coverage_or_negation_warning():
    page = empty_page()
    coverage = 'Chưa đọc hết một số vùng trên trang. Phần đọc được đã giữ lại; bổ sung từ bản gốc trước khi xác nhận.'
    negation = 'Lời dặn có từ phủ định chưa được giữ trong bản đọc thuốc. Phải đối chiếu nguyên câu trên đơn.'
    page['warnings'] = [coverage, negation, *[f'Ghi chú cũ {i}' for i in range(6)]]
    result = attach_pdf_source(page, 'Ngày khám: 08/09/2026', '', tuple(f'Bảng cần xem {i}' for i in range(8)))
    assert coverage in result['warnings'] and negation in result['warnings']
    assert any('Còn cảnh báo' in item for item in result['warnings'])
    assert len(result['warnings']) == 8 and all(len(item) <= 240 for item in result['warnings'])
