"""Conservative PDF text-layer anchors. Text is untrusted, not clinical truth.

Only explicit, single-line labelled administrative/narrative cells are matched.
Tables, wrapped paragraphs and ambiguous/multiple cells need visual review.
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
        if text_key(label) in NARRATIVE and index + 1 < len(lines):
            following = lines[index + 1].strip()
            if following and not re.match(r'[^:：]{1,120}[:：]\s*\S', following):
                continue
        candidates.append({'label': label, 'value': value, 'evidence': line})
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
            page['fields'].append({**cell, 'unit': '', 'reference': '', 'context': '',
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
