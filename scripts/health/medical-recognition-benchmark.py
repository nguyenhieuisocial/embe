"""Synthetic-only local OCR check. No production records are read or written."""
import io
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'services/media-ingest'))
sys.path.insert(0, str(ROOT / 'services/media-ingest/tests'))
from medical_document_worker import MedicalDocumentWorker, document_pages
from meal_analysis_worker import Config
from test_medical_document_worker import synthetic_sheet
from PIL import Image

output = ROOT / 'data/medical-recognition-verification'
output.mkdir(parents=True, exist_ok=True)
worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'))
report = {'syntheticOnly': True, 'model': worker.config.ollama_model, 'cases': []}
checks = {'receipt': ['250.000', '350.000', '600.000'], 'ultrasound': ['45,6', '1,2', '160'],
          'prescription': ['0,5', '1 viên', '2 lần/ngày'], 'clinical': ['110/70', 'Mệt mỏi']}
for kind, terms in checks.items():
    image = synthetic_sheet(kind)
    (output / f'{kind}-synthetic.jpg').write_bytes(image)
    started = time.monotonic()
    try:
        result = worker.analyze_page(image, '')
        text = json.dumps(result, ensure_ascii=False)
        case = {'kind': kind, 'recognizedKind': result['kind'], 'seconds': round(time.monotonic() - started, 2),
                'expectedLiteralMatches': {term: term.casefold() in text.casefold() for term in terms},
                'patientNameExact': any(row['value'] == 'NGƯỜI DÙNG MẪU' for row in result['fields']), 'analysis': result}
    except Exception as error:
        case = {'kind': kind, 'seconds': round(time.monotonic() - started, 2), 'error': str(error)}
    report['cases'].append(case)
    (output / 'benchmark.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in case.items() if k != 'analysis'}, ensure_ascii=False), flush=True)
# Exercise raster multi-page PDF decoding; no final document artifact is published.
buffer = io.BytesIO()
images = [Image.open(io.BytesIO(synthetic_sheet(kind))) for kind in ['receipt', 'ultrasound']]
images[0].save(buffer, 'PDF', save_all=True, append_images=images[1:])
pages = list(document_pages(buffer.getvalue(), 'application/pdf'))
report['pdfPagesDecoded'] = len(pages)
report['pdfOriginalUnchanged'] = buffer.getvalue().startswith(b'%PDF')
(output / 'benchmark.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'pdfPagesDecoded': len(pages)}), flush=True)
