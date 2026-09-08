import { describe, expect, it } from 'vitest';
import { medicalDocumentName } from '../src/lib/medical-document-name';
import type { DocumentAnalysis } from '../src/lib/medical-document-scan';
const sheet = (kind: string, dates: [string, string, boolean?][]): DocumentAnalysis => ({ version: 1, pages: [{ page: 1, kind, title: 'image.jpg', medicines: [], charges: [], warnings: [], fields: dates.map(([label, value, unclear = false]) => ({ label, value, unclear, evidence: value, unit: '', reference: '' })) }] });
describe('automatic document names', () => {
  it('names the type and printed date, ignoring birth and follow-up dates', () => {
    expect(medicalDocumentName([sheet('prescription', [['Ngày kê đơn', '08/09/2026'], ['Ngày sinh', '01/01/1990'], ['Ngày tái khám', '20/09/2026']])])).toBe('Đơn thuốc · 08/09/2026');
  });
  it('does not guess missing, invalid or ambiguous dates', () => {
    for (const dates of [[], [['Ngày', '31/02/2026']], [['Ngày', '08/09/2026', true]]] as [string, string, boolean?][][]) expect(medicalDocumentName([sheet('ultrasound', dates)])).toBe('Siêu âm · Chưa rõ ngày');
  });
  it('retains mixed types and multiple dates', () => {
    expect(medicalDocumentName([sheet('prescription', [['Ngày', '08/09/2026']]), sheet('ultrasound', [['Ngày', '09/09/2026']])])).toBe('Đơn thuốc + Siêu âm · Nhiều ngày');
  });
  it('normalizes equivalent dates and deduplicates page types', () => {
    expect(medicalDocumentName([sheet('prescription', [['Ngày', '08/09/2026']]), sheet('prescription', [['Ngày', '2026-09-08']])])).toBe('Đơn thuốc · 08/09/2026');
  });
});
