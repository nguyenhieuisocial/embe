"""Conservative PDF text-layer anchors. Text is untrusted, not clinical truth.

Only explicit labelled cells and tables with unambiguous printed headers are matched.
Wrapped paragraphs and ambiguous/multiple cells remain in the page text for review.
No fuzzy names, accent correction, arithmetic or medication inference.
"""
import re
import unicodedata


def text_key(value: str) -> str:
    return ' '.join(unicodedata.normalize('NFC', value).casefold().strip(' :：').split())


LABELS = {
    'họ tên', 'họ và tên', 'họ tên người bệnh', 'họ và tên người bệnh',
    'họ tên bệnh nhân', 'tên bệnh nhân', 'người bệnh', 'bệnh nhân', 'ngày sinh',
    'mã bệnh nhân', 'mã người bệnh', 'mã hồ sơ', 'mã phiếu', 'số hồ sơ', 'số hóa đơn',
    'mã số bhyt', 'số thẻ bhyt', 'bảo hiểm y tế',
    'bệnh viện', 'tên bệnh viện', 'phòng khám', 'cơ sở khám', 'cơ sở y tế', 'nơi khám',
    'địa chỉ cơ sở', 'khoa', 'bác sĩ', 'bác sĩ khám', 'bác sĩ điều trị',
    'ngày khám', 'ngày khám bệnh', 'ngày xét nghiệm', 'ngày siêu âm', 'ngày lập',
    'ngày thu', 'ngày kê đơn', 'ngày vào viện', 'ngày ra viện', 'ngày hẹn', 'ngày',
    'ngày tái khám', 'giờ lấy mẫu', 'ngày giờ lấy mẫu', 'ngày trả kết quả', 'loại mẫu',
    'tuổi thai', 'tuần thai', 'ngày dự sinh',
    'chẩn đoán', 'chẩn đoán in trên giấy', 'chẩn đoán ra viện', 'kết luận',
    'phương pháp điều trị', 'tình trạng ra viện', 'lời dặn', 'mã icd',
}
# These may wrap to the following line. A single-line match is allowed only if
# the following line clearly starts another cell, is blank, or this is the end.
NARRATIVE = {'chẩn đoán', 'chẩn đoán in trên giấy', 'chẩn đoán ra viện', 'kết luận',
             'phương pháp điều trị', 'tình trạng ra viện', 'lời dặn'}


def narrative_cell(lines: list[str], index: int, value: str) -> tuple[str, str] | None:
    """Keep a wrapped block only up to an explicit next labelled field.

    A blank, footer, table, ambiguous label or page end is not proof that a
    paragraph belongs to this field. Never join across pages or silently clip it.
    """
    parts = [value]
    source = [lines[index].strip()]
    for following in lines[index + 1:index + 17]:
        line = following.strip()
        boundary = re.fullmatch(r'([^:：]{1,120})[:：]\s*(\S.*)', line)
        if boundary:
            if (text_key(boundary[1]) not in LABELS
                    or re.search(r'(?<!\d)[:：]|[:：](?!\d)|[\t|]', boundary[2])):
                return None
            joined, evidence = '\n'.join(parts), '\n'.join(source)
            return (joined, evidence) if len(joined) <= 1600 and len(evidence) <= 1800 else None
        if not line or len(line) > 500 or re.search(r'[:：\t|\x00-\x1f\ufffd]', line):
            return None
        parts.append(line)
        source.append(line)
    return None


def pdf_field_candidates(printed: str) -> list[dict[str, str]]:
    lines = unicodedata.normalize('NFC', printed).splitlines()
    candidates = []
    for index, raw in enumerate(lines):
        line = raw.strip()
        if not line or len(line) > 500 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]', line):
            continue
        match = re.fullmatch(r'([^:：]{1,120})[:：]\s*(\S.*)', line)
        if not match or text_key(match[1]) not in LABELS:
            continue
        label, value = match[1].strip(), match[2].strip()
        # Don't merge another column/label into this one, including unknown labels.
        # Colons in a clock time are permitted; pipe/tab cells are not.
        if re.search(r'(?<!\d)[:：]|[:：](?!\d)|[\t|]', value):
            continue
        evidence = line
        if text_key(label) in NARRATIVE and index + 1 < len(lines):
            following = lines[index + 1].strip()
            if following and not re.match(r'[^:：]{1,120}[:：]\s*\S', following):
                block = narrative_cell(lines, index, value)
                if not block:
                    continue
                value, evidence = block
        candidates.append({'label': label, 'value': value, 'evidence': evidence})
    # Repeated headings (even identical) can belong to different visits/people.
    # Do not infer their association from one value alone.
    counts = {}
    for cell in candidates:
        key = text_key(cell['label'])
        counts[key] = counts.get(key, 0) + 1
    return [cell for cell in candidates if counts[text_key(cell['label'])] == 1]


def reconcile_pdf_fields(page: dict, printed: str, capacity: int) -> None:
    """Expose independent candidate text; never overwrite a model/user value."""
    if not printed.strip():
        return
    added = different = 0
    for cell in pdf_field_candidates(printed):
        matches = [row for row in page['fields'] if text_key(row['label']) == text_key(cell['label'])]
        if not matches:
            if len(page['fields']) >= capacity:
                page['warnings'] = ['Còn mục có chữ trong PDF nhưng bản đọc đã hết chỗ; đối chiếu bản gốc.', *page['warnings']][:8]
                break
            page['fields'].append({**cell, 'evidence': cell['evidence'][:500], 'unit': '', 'reference': '', 'context': '',
                                   'unclear': True, 'pdfValue': cell['value'], 'pdfEvidence': cell['evidence']})
            added += 1
        elif len(matches) == 1:
            row = matches[0]
            if row['unit'] or row['reference'] or row.get('context'):
                continue
            row.update(pdfValue=cell['value'], pdfEvidence=cell['evidence'])
            if text_key(row['value']) != text_key(cell['value']):
                row['unclear'] = True
                different += 1
    notices = []
    if added:
        notices.append(f'Bổ sung {added} mục từ lớp chữ PDF mà AI chưa chép. Cần đối chiếu hình trang gốc trước khi dùng.')
    if different:
        notices.append(f'{different} mục khác giữa AI và chữ PDF. Đã giữ cả hai để chọn; chưa tự thay kết quả.')
    page['warnings'] = list(dict.fromkeys([*notices, *page['warnings']]))[:8]


# No whitespace-based column guessing: PDF reading order may mix adjacent cells.
# Only a literal tab/pipe table with a recognized header and equal column counts
# can supply independent cells. Unmatched text is still preserved as pdfText.
TABLE_HEADERS = {
    'stt': 'index', 'no.': 'index',
    'tên xét nghiệm': 'label', 'xét nghiệm': 'label', 'chỉ số': 'label', 'test': 'label',
    'tên dịch vụ': 'label', 'nội dung thu': 'label', 'dịch vụ': 'label',
    'kết quả': 'value', 'result': 'value',
    'đơn vị': 'unit', 'unit': 'unit',
    'khoảng tham chiếu': 'reference', 'giá trị tham chiếu': 'reference',
    'trị số tham chiếu': 'reference', 'reference': 'reference',
    'thời điểm': 'context', 'mẫu': 'context',
    'số lượng': 'quantity', 'sl': 'quantity', 'đơn giá': 'unitPrice',
    'thành tiền': 'amount', 'tiền tệ': 'currency',
    'tên thuốc': 'name', 'thuốc': 'name', 'tên thuốc / hàm lượng': 'name',
    'thành phần': 'ingredients', 'thành phần / hàm lượng': 'ingredients', 'hàm lượng': 'ingredients',
    'liều mỗi lần': 'dose', 'liều dùng mỗi lần': 'dose',
    'số lần dùng': 'frequency', 'tần suất': 'frequency',
    'cách dùng': 'instructions', 'đường dùng': 'route',
    'thời gian dùng': 'duration', 'số ngày dùng': 'duration',
    'số lượng cấp': 'quantity', 'số lượng cấp phát': 'quantity',
}
MEDICINE_COLUMNS = {'name': 100, 'ingredients': 1200, 'dose': 80, 'frequency': 80,
                    'instructions': 200, 'route': 80, 'duration': 80, 'quantity': 80}


def pdf_table_candidates(printed: str) -> list[tuple[str, dict]]:
    candidates = []
    header = None
    delimiter = None
    for raw in unicodedata.normalize('NFC', printed).splitlines():
        line = raw.strip(' \r\n')
        separator = '\t' if '\t' in line else '|' if '|' in line else None
        if not separator or len(line) > 500 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]', line):
            header = None
            continue
        content = line[1:-1] if line.startswith('|') and line.endswith('|') else line
        cells = [cell.strip() for cell in content.split(separator)]
        keys = [TABLE_HEADERS.get(text_key(cell)) for cell in cells]
        if (all(keys) and len(set(keys)) == len(keys)
                and (('label' in keys and (('value' in keys) != ('amount' in keys)))
                     or ('name' in keys and len(keys) >= 3))):
            allowed = ({'index', *MEDICINE_COLUMNS} if 'name' in keys else
                       {'index', 'label', 'value', 'unit', 'reference', 'context'} if 'value' in keys else
                       {'index', 'label', 'amount', 'currency', 'quantity', 'unitPrice'})
            header = keys if set(keys) <= allowed else None
            delimiter = separator
            continue
        if not header or separator != delimiter or len(cells) != len(header):
            header = None
            continue
        data = dict(zip(header, cells))
        if 'index' in data and not re.fullmatch(r'\d{1,3}', data.pop('index')):
            header = None
            continue
        identity = 'name' if 'name' in data else 'label'
        if not data[identity] or text_key(data[identity]) in TABLE_HEADERS:
            continue
        group = 'medicines' if identity == 'name' else 'fields' if 'value' in data else 'charges'
        limits = (MEDICINE_COLUMNS if group == 'medicines' else
                  {'label': 120, 'value': 1600, 'unit': 40, 'reference': 160, 'context': 160}
                  if group == 'fields' else {'label': 160, 'amount': 80, 'currency': 20, 'quantity': 80, 'unitPrice': 80})
        required = 'name' if group == 'medicines' else 'value' if group == 'fields' else 'amount'
        if not data.get(required) or any(len(v) > limits[k] for k, v in data.items()):
            continue
        row = {key: data.get(key, '') for key in limits}
        row.update(evidence=line, unclear=True)
        if group == 'fields':
            row.update(pdfValue=row['value'], pdfEvidence=line)
        candidates.append((group, row))
    # Repeated labels without a distinguishing printed context are ambiguous.
    identities = [(group, text_key(row.get('name', row.get('label', ''))), text_key(row.get('context', ''))) for group, row in candidates]
    return [entry for index, entry in enumerate(candidates) if identities.count(identities[index]) == 1]


def reconcile_pdf_tables(page: dict, printed: str, limits: dict[str, int]) -> None:
    added = conflicts = 0
    for group, candidate in pdf_table_candidates(printed):
        keys = (tuple(MEDICINE_COLUMNS) if group == 'medicines' else
                ('value', 'unit', 'reference', 'context') if group == 'fields' else ('amount', 'currency', 'quantity', 'unitPrice'))
        identity = 'name' if group == 'medicines' else 'label'
        matches = [row for row in page[group] if text_key(row[identity]) == text_key(candidate[identity])
                   and text_key(row.get('context', '')) == text_key(candidate.get('context', ''))]
        if any(all(text_key(row.get(k, '')) == text_key(candidate.get(k, '')) for k in keys) for row in matches):
            continue
        if len(page[group]) >= limits[group]:
            page['warnings'] = ['Bảng PDF còn dòng chưa đưa vào bản đọc; xem lớp chữ và trang gốc.', *page['warnings']][:8]
            break
        for row in matches:
            row['unclear'] = True
        conflicts += bool(matches)
        page[group].append(candidate)
        added += 1
    notices = []
    if added:
        notices.append(f'Giữ thêm {added} dòng bảng từ chữ PDF; giữ nguyên dấu, đơn vị và các cột. Cần đối chiếu trang gốc.')
    if conflicts:
        notices.append(f'{conflicts} dòng bảng khác bản đọc AI: giữ hai bản, chưa tự chọn số liệu đúng.')
    page['warnings'] = list(dict.fromkeys([*notices, *page['warnings']]))[:8]
