"""Compare overview vs bounded detail views, using invented documents only."""
import argparse
import io
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'services/media-ingest'), str(ROOT / 'services/media-ingest/tests')]
from medical_document_worker import MedicalDocumentWorker, image_bytes
from meal_analysis_worker import Config
from test_medical_document_worker import dense_sheet
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--kind', choices=['receipt', 'ultrasound', 'prescription', 'clinical', 'receipt_long'])
args = parser.parse_args()

output = ROOT / 'data/medical-recognition-verification'
output.mkdir(parents=True, exist_ok=True)
worker = MedicalDocumentWorker(Config('https://unused.invalid', 'unused'))
expected = {
    'receipt': [('charges', 'amount', '250.000'), ('charges', 'amount', '350.000'), ('charges', 'amount', '550.000')],
    'ultrasound': [('fields', 'value', value) for value in ['45,6', '1,2', '18,7', '69,3', '58,2', '7,4']],
    'prescription': [('medicines', 'ingredients', '0,5 mg'), ('medicines', 'ingredients', '250 mcg'),
                     ('medicines', 'dose', '1 viên'), ('medicines', 'dose', '2 viên')],
    'clinical': [('fields', 'value', value) for value in ['110/70', '54,5', '78', '36,7']],
    'receipt_long': [('charges', 'amount', value) for value in ['251.000', '254.500', '279.000', '289.500', '3.200.000']],
}
report = {'syntheticOnly': True, 'model': worker.config.ollama_model, 'cases': []}
for kind, checks in expected.items():
    if args.kind and kind != args.kind:
        continue
    image = dense_sheet(kind)
    (output / f'{kind}-dense.jpg').write_bytes(image)
    for detailed in [False, True]:
        started = time.monotonic()
        case = {'kind': kind, 'detailViews': detailed}
        try:
            with Image.open(io.BytesIO(image)) as source:
                input_image = image if detailed else image_bytes(source)
            result = worker.analyze_page(input_image, '', detailed=detailed)
            case.update(recognizedKind=result['kind'],
                        matches={f'{group}.{field}:{term}': any(term in row[field] for row in result[group]) for group, field, term in checks},
                        analysis=result)
        except Exception as error:
            case['error'] = str(error)
        case['seconds'] = round(time.monotonic() - started, 2)
        report['cases'].append(case)
        (output / f'detail-benchmark{("-" + args.kind) if args.kind else ""}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({key: value for key, value in case.items() if key != 'analysis'}, ensure_ascii=False), flush=True)
