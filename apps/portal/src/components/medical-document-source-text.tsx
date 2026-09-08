'use client';

import { useMemo, useState } from 'react';

const searchKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');

/** Independent source stays read-only, searchable and distinct from reviewed fields. */
export default function MedicalDocumentSourceText({ text, page, kind }: { text: string; page: number; kind: 'pdf' | 'ocr' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const label = kind === 'pdf' ? 'Chữ từ PDF' : 'Chữ đọc từ ảnh';
  const needle = searchKey(query.trim());
  const lines = useMemo(() => needle ? text.split(/\r?\n/).filter(line => searchKey(line).includes(needle)) : [], [text, needle]);
  return <details className="document-source-text" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{label} · trang {page}</summary>
    {open ? <>
      <p>{kind === 'pdf' ? 'Giữ cả phần chưa phân loại. Lớp chữ có thể sai thứ tự hoặc thiếu so với hình gốc.' : 'Bộ đọc tiếng Việt/Anh giữ cả chữ chưa phân loại. Có thể nhầm chữ, số hoặc dấu; chưa được xác nhận.'} Không tự dùng làm chỉ số hay liều thuốc.</p>
      <label>Tìm trong {kind === 'pdf' ? 'chữ PDF' : 'chữ đọc từ ảnh'} trang {page}
        <input type="search" value={query} maxLength={120} autoComplete="off" spellCheck={false} placeholder="Tên, số, mã phiếu…" onChange={event => setQuery(event.target.value)} />
      </label>
      {needle ? <p role="status">{lines.length ? `${lines.length} dòng khớp. Xóa từ tìm để xem toàn bộ.` : 'Không tìm thấy trong lớp chữ này. Kiểm tra thêm bản gốc.'}</p> : null}
      <pre tabIndex={0} aria-label={`${kind === 'pdf' ? 'Lớp chữ PDF' : 'Lớp chữ OCR'} trang ${page}`}>{needle ? lines.join('\n') : text}</pre>
    </> : null}
  </details>;
}
