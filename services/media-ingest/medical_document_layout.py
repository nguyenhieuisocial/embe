"""Read explicit PDF table cells locally; never infer missing columns or doses.

pdfplumber is used only on machine-readable, ruled tables. Scans and unruled
tables keep the existing vision path. All cell candidates still require review.
"""
from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass

from medical_document_text import pdf_table_candidates


@dataclass(frozen=True)
class LayoutReading:
    table_text: str = ''
    warnings: tuple[str, ...] = ()


def table_source(tables: list) -> LayoutReading:
    blocks, notices = [], []
    for table in tables[:12]:
        # A missing cell may be a merged cell. Do not copy its neighbour or a
        # header from another page. Unknown tables remain visible in the image.
        if not table or len(table) < 2 or not 2 <= len(table[0]) <= 12:
            if table:
                notices.append('Một bảng chưa đủ hàng hoặc có quá nhiều cột để khớp an toàn; cần xem hình trang gốc.')
            continue
        lines = []
        for row in table[:129]:
            if len(row) != len(table[0]) or any(not isinstance(cell, str) for cell in row):
                notices.append('Bảng có ô ghép hoặc ô chưa đọc rõ; không tự ghép dữ liệu từ hàng bên cạnh.')
                lines.append('')
                continue
            cells = [' '.join(unicodedata.normalize('NFC', cell).split()) for cell in row]
            if len(' | '.join(cells)) > 500 or any(len(cell) > 1600 for cell in cells) or any(re.search(r'[|\x00-\x09\x0b\x0c\x0e-\x1f\ufffd]', cell) for cell in row):
                notices.append('Một ô bảng quá dài hoặc chữ chưa rõ; xem hình trang gốc, chưa tự đưa ô này vào kết quả.')
                lines.append('')
                continue
            lines.append(' | '.join(cells))
        if len(table) > 129:
            notices.append('Bảng có quá nhiều hàng để đọc theo ô trong một lượt; phần còn lại vẫn có trên trang gốc.')
        block = '\n'.join(lines)
        # Reuse the same strict header/cell contract used by the existing
        # independent-source reconciler. No whitespace-based column guessing.
        if pdf_table_candidates(block, warnings=notices):
            blocks.append(block)
        else:
            notices.append('Nhận ra bảng nhưng chưa khớp chắc các cột; cần đối chiếu hình trang gốc.')
    if len(tables) > 12:
        notices.append('Trang có nhiều bảng; chỉ đối chiếu theo ô 12 bảng đầu, không coi là đã đủ toàn trang.')
    combined = '\n\n'.join(blocks)
    if len(combined) > 24000:
        return LayoutReading('', ('Bố cục bảng vượt giới hạn đối chiếu; vẫn giữ luồng đọc ảnh và chữ trang gốc.',))
    return LayoutReading(combined, tuple(dict.fromkeys(notices)))


def extract_pdf_layout(body: bytes, page_number: int) -> LayoutReading:
    if not body.startswith(b'%PDF-') or not 1 <= len(body) <= 15_000_000 or not 1 <= page_number <= 6:
        return LayoutReading('', ('Không đọc thêm được bố cục bảng từ PDF.',))
    try:
        import pdfplumber
        # Only load the requested page; release its cached geometry immediately.
        with pdfplumber.open(io.BytesIO(body), pages=[page_number], unicode_norm='NFC') as doc:
            if len(doc.pages) != 1:
                return LayoutReading('', ('Không xác định được đúng trang để đối chiếu bảng.',))
            page = doc.pages[0]
            if len(page.chars) > 48000 or len(page.edges) > 2000:
                return LayoutReading('', ('Trang có bố cục quá phức tạp; chưa đối chiếu bảng theo ô, vẫn đọc ảnh và chữ gốc.',))
            tables = page.extract_tables({
                'vertical_strategy': 'lines', 'horizontal_strategy': 'lines',
                'snap_tolerance': 2, 'join_tolerance': 2, 'intersection_tolerance': 2,
                'text_x_tolerance': 2, 'text_y_tolerance': 2,
            })
            return table_source(tables)
    except Exception:
        # Optional layout failure must neither lose the original nor turn a
        # partially readable PDF into a failed upload. Never log private text.
        return LayoutReading('', ('Chưa đọc được bố cục bảng; kết quả dựa trên ảnh và lớp chữ, cần đối chiếu các cột.',))
