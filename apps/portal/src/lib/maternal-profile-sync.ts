import { PROFILE_GROUPS, validFamilyMember, type FamilyMember } from './family-members';
import { documentFieldCategory } from './medical-document-overview';
import type { DocumentScan } from './medical-document-scan';

const key = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const identity = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const aliases: Record<string, string[]> = {
  pregnancyCount: ['số lần mang thai', 'gravida'], termBirthCount: ['số lần sinh đủ tháng'],
  pretermBirthCount: ['số lần sinh non'], miscarriageCount: ['số lần sảy thai'],
  stillbirthCount: ['số lần thai lưu'], terminationCount: ['số lần chấm dứt thai kỳ'],
  ectopicCount: ['số lần thai ngoài tử cung'], livingChildrenCount: ['số con hiện sống'],
  caesareanCount: ['số lần sinh mổ'], bloodGroup: ['nhóm máu', 'ABO'],
};
const fields = PROFILE_GROUPS.flatMap(group => group.role === 'mother' ? group.fields : group.fields.filter(field => field.key === 'bloodGroup'));
export type MaternalSyncResult = { member: FamilyMember; added: string[]; conflicts: string[]; skipped: number };
/** Only explicit, reviewed, patient-matched facts. No diagnosis, dose or inferred parity. */
export function mergeMaternalSources(member: FamilyMember, scans: DocumentScan[]): MaternalSyncResult {
  const candidates = new Map<string, { value: string; documentId: string; page: number }[]>();
  let skipped = 0;
  if (member.role !== 'mother') return { member, added: [], conflicts: [], skipped: scans.length };
  for (const scan of scans) {
    if (scan.status !== 'confirmed' || !scan.analysis) { skipped++; continue; }
    for (const page of scan.analysis.pages) {
      const names = page.fields.filter(row => documentFieldCategory(row.label) === 'patient');
      if (!names.length || names.some(row => row.unclear || identity(row.value) !== identity(member.fullName))) { skipped++; continue; }
      for (const row of page.fields) {
        const field = fields.find(field => [field.label, ...(aliases[field.key] ?? [])].some(label => key(label) === key(row.label)));
        if (!field || row.unclear || !row.evidence.trim() || row.pdfValue && row.pdfValue !== row.value) continue;
        const value = row.value.trim();
        if (!value || !validFamilyMember({ ...member, details: { ...member.details, [field.key]: value } })) continue;
        candidates.set(field.key, [...(candidates.get(field.key) ?? []), { value, documentId: scan.documentId, page: page.page }]);
      }
    }
  }
  const details = { ...member.details }, added: string[] = [], conflicts: string[] = [];
  for (const [field, rows] of candidates) {
    const values = [...new Set(rows.map(row => row.value))];
    const existing = details[field]?.trim();
    if (values.length !== 1 || existing && existing !== values[0]) { conflicts.push(field); continue; }
    // Explicitly cleared fields stay cleared; do not repopulate after the user removes a value.
    if (Object.hasOwn(details, field)) continue;
    const source = JSON.stringify(rows.slice(0, 4).map(row => ({ documentId: row.documentId, page: row.page })));
    details[field] = values[0]; details[`maternalSource_${field}`] = source; added.push(field);
  }
  const merged = { ...member, details };
  return validFamilyMember(merged) ? { member: merged, added, conflicts, skipped } : { member, added: [], conflicts, skipped: skipped + added.length };
}
