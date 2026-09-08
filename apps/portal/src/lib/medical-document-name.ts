import { DOCUMENT_TYPES, type DocumentAnalysis } from './medical-document-scan';
import { printedDate } from './medical-document-import';

const key = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dateLabels = new Set(['ngay', 'date', 'visit date', 'ngay kham', 'ngay kham benh', 'ngay sieu am', 'ngay xet nghiem', 'ngay lap', 'ngay lap phieu', 'ngay lap don', 'ngay ke don', 'ngay thu', 'ngay hoa don', 'ngay ra vien']);

/** A source-derived display name, not a confirmed clinical date or a renamed original file. */
export function medicalDocumentName(analyses: DocumentAnalysis[]): string {
  const pages = analyses.flatMap(a => a.pages);
  if (!pages.length) return '';
  const types = [...new Set(pages.map(p => DOCUMENT_TYPES[p.kind] ?? 'Tài liệu khác'))];
  const rows = pages.flatMap(p => p.fields).filter(f => dateLabels.has(key(f.label)));
  const dates = [...new Set(rows.filter(f => !f.unclear).map(f => printedDate(f.value)).filter(Boolean))];
  // Never select a birth/due/follow-up date, or silently ignore an ambiguous document date.
  const uncertain = rows.some(f => f.unclear || !printedDate(f.value));
  const day = dates.length > 1 ? 'Nhiều ngày' : dates.length === 1 && !uncertain ? dates[0].split('-').reverse().join('/') : 'Chưa rõ ngày';
  return `${types.join(' + ')} · ${day}`;
}
