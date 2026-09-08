import { DOCUMENT_TYPES, type DocumentAnalysis } from './medical-document-scan';
import { printedDate } from './medical-document-import';

const key = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dateLabels = new Set(['ngay', 'date', 'visit date', 'ngay kham', 'ngay kham benh', 'ngay sieu am', 'ngay xet nghiem', 'ngay lap', 'ngay lap phieu', 'ngay lap don', 'ngay ke don', 'ngay thu', 'ngay hoa don', 'ngay ra vien', 'ngay thuc hien', 'dia diem va ngay', 'dia chi va ngay']);

/** Display-only date evidence. Does not grant permission to import a clinical date. */
export function documentDateEvidence(analyses: DocumentAnalysis[]) {
  const rows = analyses.flatMap(a => a.pages.flatMap(p => p.fields)).filter(f => dateLabels.has(key(f.label)));
  const dates = [...new Set(rows.map(f => printedDate(f.value)).filter(Boolean))];
  const conflictingPdf = rows.some(f => f.pdfValue && printedDate(f.pdfValue) && printedDate(f.pdfValue) !== printedDate(f.value));
  return { dates, conflicting: dates.length > 1 || conflictingPdf,
    tentative: rows.some(f => f.unclear || !printedDate(f.value)) };
}

/** A source-derived display name, not a confirmed clinical date or a renamed original file. */
export function medicalDocumentName(analyses: DocumentAnalysis[]): string {
  const pages = analyses.flatMap(a => a.pages);
  if (!pages.length) return '';
  const types = [...new Set(pages.map(p => {
    const headings = [...new Set(p.fields.filter(f => !f.unclear && ['tieu de', 'ten phieu', 'ten giay to', 'ten tai lieu'].includes(key(f.label))).map(f => f.value.trim()).filter(Boolean))];
    const title = headings.length === 1 ? headings[0] : p.title.trim();
    // Prefer the actual document heading over a broad classification. Reject upload placeholders.
    const usable = title && title.length <= 160 && !/\.(?:jpe?g|png|webp|heic|pdf)$/i.test(title)
      && !/^(?:chờ đọc|tài liệu cần đối chiếu|tài liệu khác|ảnh chụp|image|sample|mẫu)(?:\s|$)/i.test(title);
    return usable ? title : DOCUMENT_TYPES[p.kind] ?? 'Tài liệu khác';
  }))];
  const { dates, conflicting, tentative } = documentDateEvidence(analyses);
  // Never select a birth/due/follow-up date, or silently ignore an ambiguous document date.
  const day = conflicting ? 'Nhiều ngày' : dates.length === 1 ? `${dates[0].split('-').reverse().join('/')}${tentative ? ' (bản đọc)' : ''}` : 'Chưa rõ ngày';
  return `${types.join(' + ')} · ${day}`;
}
