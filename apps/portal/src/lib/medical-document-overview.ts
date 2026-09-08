import { DOCUMENT_TYPES, type DocumentAnalysis, type ExtractedField } from './medical-document-scan';

export const DOCUMENT_OVERVIEW_LIMITS = { highlights: 12, differences: 8 } as const;
export type DocumentOverviewRef = {
  /** Printed/source page number (1-based), not the page array index. */
  page: number;
  group: 'fields' | 'medicines' | 'charges';
  /** Index within that page's group (0-based). */
  rowIndex: number;
};
export type DocumentOverviewCategory = 'patient' | 'patient-id' | 'date' | 'facility' | 'conclusion' | 'instructions';
export type DocumentOverviewField = ExtractedField & { ref: DocumentOverviewRef };
export type DocumentOverviewHighlight = DocumentOverviewField & { category: DocumentOverviewCategory };
export type DocumentOverviewDifference = {
  kind: 'patient-names' | 'patient-ids' | 'pdf-mismatch' | 'measurement-variants';
  label: string;
  /** Every involved source row is retained, including repeated values on different pages. */
  entries: DocumentOverviewField[];
};
export type DocumentOverview = {
  pageCount: number;
  documentTypes: { kind: string; label: string; pageCount: number }[];
  counts: {
    fields: number; medicines: number; charges: number; items: number;
    unclear: number; warnings: number;
    /** Unique rows flagged by unclear or a detected difference; not all unverified rows. */
    needsReview: number;
  };
  /** An analysis has no clinician-verification status, even when every unclear flag is false. */
  requiresSourceReview: true;
  highlights: DocumentOverviewHighlight[];
  highlightCount: number;
  hiddenHighlightCount: number;
  differences: DocumentOverviewDifference[];
  differenceCount: number;
  hiddenDifferenceCount: number;
  /** Includes rows from differences beyond the display limit. Does not merge patient records. */
  reviewRefs: DocumentOverviewRef[];
};

const labels: Record<DocumentOverviewCategory, Set<string>> = {
  patient: new Set(['ho ten', 'ho va ten', 'ho ten nguoi benh', 'ho va ten nguoi benh',
    'ho ten benh nhan', 'ho va ten benh nhan', 'ten benh nhan', 'ten nguoi benh',
    'nguoi benh', 'benh nhan', 'patient name', 'patient full name']),
  'patient-id': new Set(['ma benh nhan', 'ma nguoi benh', 'so benh nhan', 'patient id', 'patient identifier']),
  date: new Set(['ngay', 'ngay sinh', 'ngay kham', 'ngay kham benh', 'ngay sieu am',
    'ngay xet nghiem', 'ngay lay mau', 'ngay tra ket qua', 'ngay co ket qua', 'ngay nhap vien',
    'ngay ra vien', 'ngay hen', 'ngay hen tai kham', 'ngay tai kham', 'ngay du sinh',
    'ngay lap', 'ngay lap phieu', 'ngay lap don', 'ngay ke don', 'ngay thu', 'ngay hoa don',
    'date', 'date of birth', 'visit date', 'admission date', 'discharge date']),
  facility: new Set(['co so kham', 'co so kham benh', 'noi kham', 'noi kham benh', 'co so y te',
    'ten co so y te', 'benh vien', 'ten benh vien', 'phong kham', 'ten phong kham',
    'don vi kham', 'don vi kham benh', 'hospital', 'clinic', 'facility']),
  conclusion: new Set(['ket luan', 'ket luan in tren giay', 'chan doan', 'chan doan in tren giay',
    'chan doan ra vien', 'tinh trang ra vien', 'conclusion', 'diagnosis', 'impression']),
  instructions: new Set(['loi dan', 'loi dan in tren giay', 'loi dan bac si', 'dan do',
    'huong dan', 'huong dan sau kham', 'huong dan ra vien', 'instructions', 'discharge instructions'])
};

// Normalize labels for matching only. Displayed text and all numbers/units remain untouched.
function labelKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

function categoryOf(label: string): DocumentOverviewCategory | undefined {
  const key = labelKey(label);
  return (Object.keys(labels) as DocumentOverviewCategory[]).find(category => labels[category].has(key));
}

// Do not fold accents or parse IDs as numbers: Đỗ/Do and 001/1 can identify different people.
const identityKey = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const literalKey = (value: string) => value.normalize('NFC').trim();
const copyField = (field: DocumentOverviewField): DocumentOverviewField => ({ ...field, ref: { ...field.ref } });

/** A source-linked summary of the current draft, not a diagnosis or medical validation. */
export function buildDocumentOverview(analysis: DocumentAnalysis): DocumentOverview {
  const counts = { fields: 0, medicines: 0, charges: 0, items: 0, unclear: 0, warnings: 0, needsReview: 0 };
  const types = new Map<string, { kind: string; label: string; pageCount: number }>();
  const highlights: DocumentOverviewHighlight[] = [];
  const differences: DocumentOverviewDifference[] = [];
  const fields: DocumentOverviewField[] = [];
  const reviewRefs = new Map<string, DocumentOverviewRef>();
  const mark = (ref: DocumentOverviewRef) => reviewRefs.set(`${ref.page}:${ref.group}:${ref.rowIndex}`, { ...ref });
  const addDifference = (difference: DocumentOverviewDifference) => {
    differences.push(difference);
    difference.entries.forEach(entry => mark(entry.ref));
  };

  for (const page of analysis.pages) {
    const type = types.get(page.kind);
    if (type) type.pageCount += 1;
    else types.set(page.kind, { kind: page.kind, label: DOCUMENT_TYPES[page.kind] ?? page.kind, pageCount: 1 });
    counts.warnings += page.warnings.length;
    for (const group of ['fields', 'medicines', 'charges'] as const) {
      counts[group] += page[group].length;
      page[group].forEach((row, rowIndex) => {
        if (!row.unclear) return;
        counts.unclear += 1;
        mark({ page: page.page, group, rowIndex });
      });
    }
    page.fields.forEach((field, rowIndex) => {
      const entry = { ...field, ref: { page: page.page, group: 'fields' as const, rowIndex } };
      fields.push(entry);
      const category = categoryOf(field.label);
      if (category && field.value.trim()) highlights.push({ ...copyField(entry), category });
      // Both independent versions remain available, even when the draft currently has a blank value.
      if (typeof field.pdfValue === 'string' && field.pdfValue !== field.value) addDifference({
        kind: 'pdf-mismatch', label: 'Bản nhập khác chữ trích từ PDF — đối chiếu trang gốc', entries: [copyField(entry)]
      });
    });
  }

  for (const [category, kind, label] of [
    ['patient', 'patient-names', 'Có nhiều tên người bệnh — đối chiếu từng trang'],
    ['patient-id', 'patient-ids', 'Có nhiều mã người bệnh — đối chiếu từng trang']
  ] as const) {
    const entries = fields.filter(field => categoryOf(field.label) === category && field.value.trim());
    if (new Set(entries.map(field => identityKey(field.value))).size > 1) addDifference({ kind, label, entries: entries.map(copyField) });
  }

  const measurements = new Map<string, DocumentOverviewField[]>();
  for (const field of fields) {
    const key = labelKey(field.label);
    // Dates, names, record/invoice numbers and narrative conclusions are not measurements.
    if (!key || !field.value.trim() || categoryOf(field.label)
      || /^ma\b/.test(key) || /^so (?:ho so|phieu|hoa don|bien lai|benh an|the|bao hiem|dinh danh|thu tu|don)\b/.test(key)
      || /\b(?:id|code|date|ngay|ho so|hoa don)\b/.test(key)
      || /^(?:record|invoice|receipt|prescription|patient) (?:no|number)\b/.test(key)) continue;
    const entries = measurements.get(key) ?? [];
    entries.push(field);
    measurements.set(key, entries);
  }
  for (const entries of measurements.values()) {
    if (!entries.some(field => /[0-9]/.test(field.value))) continue;
    const variants = new Set(entries.map(field => JSON.stringify([
      literalKey(field.value), literalKey(field.unit), literalKey(field.context ?? '')
    ])));
    if (variants.size > 1) addDifference({
      kind: 'measurement-variants',
      label: 'Cùng nhãn, khác giá trị / đơn vị / ngữ cảnh — giữ riêng từng dòng',
      entries: entries.map(copyField)
    });
  }

  counts.items = counts.fields + counts.medicines + counts.charges;
  counts.needsReview = reviewRefs.size;
  // Surface identity differences before other comparisons, without dropping evidence beyond the cap.
  const order = { 'patient-names': 0, 'patient-ids': 1, 'pdf-mismatch': 2, 'measurement-variants': 3 };
  differences.sort((a, b) => order[a.kind] - order[b.kind]);
  return {
    pageCount: analysis.pages.length, documentTypes: [...types.values()], counts, requiresSourceReview: true,
    highlights: highlights.slice(0, DOCUMENT_OVERVIEW_LIMITS.highlights), highlightCount: highlights.length,
    hiddenHighlightCount: Math.max(0, highlights.length - DOCUMENT_OVERVIEW_LIMITS.highlights),
    differences: differences.slice(0, DOCUMENT_OVERVIEW_LIMITS.differences), differenceCount: differences.length,
    hiddenDifferenceCount: Math.max(0, differences.length - DOCUMENT_OVERVIEW_LIMITS.differences),
    reviewRefs: [...reviewRefs.values()]
  };
}
