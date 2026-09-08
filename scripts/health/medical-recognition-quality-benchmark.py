"""Actual local vision evaluation on invented documents, never family records.

Checks are scoped to known printed cells, not a claim of clinical accuracy.
"""
import io
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'services/media-ingest'), str(ROOT / 'services/media-ingest/tests')]
from medical_document_worker import MedicalDocumentWorker, image_bytes, ENGINE_REVISION
from medical_document_ocr import read_page_ocr
from meal_analysis_worker import Config
from test_medical_document_worker import dense_sheet
from PIL import Image, ImageDraw, ImageFont


def extra_sheet(kind):
    image = Image.new('RGB', (1800, 2600), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 34)
    lines = ['PHIẾU XÉT NGHIỆM MẪU' if kind == 'laboratory' else 'GIẤY RA VIỆN MẪU',
             'DỮ LIỆU GIẢ LẬP — KHÔNG DÙNG ĐỂ ĐIỀU TRỊ',
             'Bệnh viện: BV Mẫu EmBe', 'Họ và tên người bệnh: NGƯỜI MẪU',
             'Ngày sinh: 01/02/1990', 'Mã bệnh nhân: TEST-2026-0917']
    if kind == 'laboratory':
        lines += ['Ngày xét nghiệm: 07/09/2026', 'Loại mẫu: máu', 'Giờ lấy mẫu: 08:15',
                  'Tên xét nghiệm     Kết quả     Đơn vị     Khoảng tham chiếu',
                  'HGB                         11,2           g/dL              11,0 - 16,0',
                  'PLT                          234           10^9/L            150 - 400',
                  'TSH                        < 0,01        mIU/L             0,4 - 4,0',
                  'Glucose (lúc đói)          4,8           mmol/L',
                  'Glucose (sau 1 giờ)        7,1           mmol/L',
                  'Glucose (sau 2 giờ)        6,2           mmol/L',
                  'Bác sĩ: BS Mẫu']
    else:
        lines += ['Ngày vào viện: 05/09/2026', 'Ngày ra viện: 07/09/2026',
                  'Khoa: Sản', 'Chẩn đoán in trên giấy: THEO DÕI MẪU',
                  'Phương pháp điều trị: NỘI DUNG GIẢ LẬP',
                  'Tình trạng ra viện: NỘI DUNG MẪU',
                  'Lời dặn: Mang theo giấy tờ khi tái khám.',
                  'Ngày hẹn: 14/09/2026', 'Bác sĩ điều trị: BS Mẫu']
    for i, line in enumerate(lines):
        draw.text((65, 90 + i * 105), line, font=font, fill='black')
    return image_bytes(image, (4000, 6000))


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=['receipt', 'prescription', 'ultrasound', 'clinical', 'laboratory', 'discharge'])
    parser.add_argument('--single-view', action='store_true', help='Compare the original full-resolution reading without detail crops')
    parser.add_argument('--ocr', action='store_true', help='Include the independent local Vietnamese/English reading')
    args = parser.parse_args()
    output = ROOT / 'data/medical-recognition-verification'
    output.mkdir(parents=True, exist_ok=True)
    worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'))
    checks = {
        'receipt': [('charges', 'label', 'Khám mẫu A', {'amount': '250.000', 'quantity': '2', 'unitPrice': '125.000'}),
                    ('charges', 'label', 'Phải trả', {'amount': '550.000'})],
        'prescription': [('medicines', 'name', 'mẫu A', {'dose': '1 viên', 'quantity': '10 viên', 'duration': '5 ngày', 'route': 'uống'}),
                         ('medicines', 'name', 'mẫu B', {'dose': '2 viên', 'quantity': '14 viên', 'duration': '7 ngày', 'ingredients': '250 mcg'})],
        'ultrasound': [('fields', 'label', 'CRL', {'value': '45,6', 'unit': 'mm'}), ('fields', 'label', 'NT', {'value': '1,2', 'unit': 'mm'})],
        'clinical': [('fields', 'label', 'Huyết áp', {'value': '110/70', 'unit': 'mmHg'}), ('fields', 'label', 'Cân nặng', {'value': '54,5', 'unit': 'kg'})],
        'laboratory': [('fields', 'label', 'HGB', {'value': '11,2', 'unit': 'g/dL'}),
                       ('fields', 'label', 'TSH', {'value': '< 0,01', 'unit': 'mIU/L'}),
                       ('fields', 'label', 'Glucose', {'value': '4,8'}), ('fields', 'label', 'Glucose', {'value': '7,1'}), ('fields', 'label', 'Glucose', {'value': '6,2'})],
        'discharge': [('fields', 'label', 'Ngày ra viện', {'value': '07/09/2026'}), ('fields', 'label', 'Ngày hẹn', {'value': '14/09/2026'}),
                      ('fields', 'label', 'Chẩn đoán', {'value': 'THEO DÕI MẪU'})],
    }
    report = {'syntheticOnly': True, 'engineRevision': ENGINE_REVISION, 'singleView': args.single_view, 'ocr': args.ocr, 'cases': []}
    for kind, expected in checks.items():
        if args.kind and args.kind != kind:
            continue
        image = extra_sheet(kind) if kind in {'laboratory', 'discharge'} else dense_sheet(kind)
        (output / f'quality-{kind}.jpg').write_bytes(image)
        case = {'kind': kind}
        started = time.monotonic()
        try:
            reading = read_page_ocr(image) if args.ocr else None
            analysis = worker.analyze_page(image, '', detailed=not args.single_view, ocr=reading)
            if args.ocr:
                case['sourceRetained'] = bool(reading.text) and analysis.get('ocrText') == reading.text and analysis.get('ocrEngine') == 'tesseract-vie-eng'
            case['correctKind'] = analysis['kind'] == kind
            case['cells'] = {f'{group}:{label}:{key}:{list(values.values())}': any(label.casefold() in row[identity].casefold() and all((value.casefold() in row.get(k, '').casefold()) if k == 'ingredients' else (value.casefold() == row.get(k, '').casefold()) for k, value in values.items()) for row in analysis[group])
                             for group, identity, label, values in expected for key in [','.join(values)]}
            case['analysis'] = analysis
        except Exception as error:
            case['error'] = str(error)
        case['seconds'] = round(time.monotonic() - started, 2)
        report['cases'].append(case)
        (output / f'quality-benchmark{("-" + args.kind) if args.kind else ""}{"-single" if args.single_view else ""}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({k: v for k, v in case.items() if k != 'analysis'}, ensure_ascii=False), flush=True)
    # This is a diagnostic benchmark, not a silently passing accuracy gate.
    if any(case.get('error') or (args.ocr and not case.get('sourceRetained')) or not case.get('correctKind') or not all(case.get('cells', {}).values()) for case in report['cases']):
        raise SystemExit(1)


if __name__ == '__main__':
    run()
