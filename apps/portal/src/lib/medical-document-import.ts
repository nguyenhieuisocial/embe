import { DOCUMENT_TYPES, type DocumentAnalysis } from './medical-document-scan';
import { MEDICAL_MEASUREMENTS, validMedicalMeasurements } from './medical-measurements';
import type { MedicalMedicine, MedicalRecord } from './pregnancy-medical';

export type DocumentImportDetails = {
  kind: string; title: string; occurredOn: string; provider: string; clinician: string;
  gestationalWeek: number | null; linkedRecordId: string | null;
  measurements: Record<string, number>; medicines: MedicalMedicine[];
};
export type DocumentImportContext = {
  recordUpdatedAt: string; intake: boolean; imported: boolean; records: MedicalRecord[];
};
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
export const providerKey = (text: string) => fold(text).replace(/\bbenh vien\b/g, 'bv').replace(/\bphong kham\b/g, 'pk').replace(/[^a-z0-9]/g, '');
const unitKey = (text: string) => fold(text).replace(/\s/g, '').replace(/⁹/g, '9').replace(/\^/g, '');
const aliases: Record<string, string[]> = {
  weightKg: ['cân nặng mẹ', 'cân nặng', 'weight'], systolic: ['huyết áp tâm thu', 'systolic'], diastolic: ['huyết áp tâm trương', 'diastolic'],
  fetalHeartRate: ['nhịp tim thai', 'tim thai', 'fhr'], crlMm: ['crl', 'chiều dài đầu mông'], ntMm: ['nt', 'độ mờ da gáy'],
  bpdMm: ['bpd', 'đường kính lưỡng đỉnh'], hcMm: ['hc', 'chu vi đầu'], acMm: ['ac', 'chu vi bụng'], flMm: ['fl', 'chiều dài xương đùi'],
  efwG: ['efw', 'cân nặng thai', 'cân nặng ước tính'], afiCm: ['afi', 'chỉ số ối'], cervixMm: ['chiều dài cổ tử cung'],
  hemoglobinGdl: ['hemoglobin', 'hgb', 'hb'], ferritinNgml: ['ferritin'], platelet109l: ['tiểu cầu', 'plt', 'platelet'],
  glucoseMgdl: ['glucose', 'đường huyết'], glucoseMmoll: ['glucose', 'đường huyết'], hba1cPercent: ['hba1c'],
  tshMiuL: ['tsh'], ft4PmolL: ['ft4'], astUL: ['ast', 'sgot'], altUL: ['alt', 'sgpt'],
};
export function printedDate(text: string): string {
  const clean = text.trim();
  const vn = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s.*)?$/.exec(clean);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(clean);
  if (!vn && !iso) return '';
  const [y, m, d] = vn ? [Number(vn[3]), Number(vn[2]), Number(vn[1])] : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
  if (y < 1900 || y > 2100) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : '';
}
export function medicalDay(at: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

// A proposal, never an autonomous medical decision. Unknown units, ranges and conflicting
// observations stay in the complete transcription, not in numeric health charts.
export function proposeDocumentImport(analysis: DocumentAnalysis, records: MedicalRecord[], recordId: string) {
  const fields = analysis.pages.flatMap(page => page.fields);
  const warnings: string[] = [];
  function one(labels: string[], max: number): string {
    const values = [...new Set(fields.filter(row => labels.map(fold).includes(fold(row.label).replace(/:$/, ''))).map(row => row.value.trim()).filter(Boolean))];
    if (values.length > 1) { warnings.push(`Nhiều giá trị cho ${labels[0]}; cần chọn lại.`); return ''; }
    if ((values[0]?.length ?? 0) > max) { warnings.push(`${labels[0]} quá dài; giữ nguyên trong bản đọc.`); return ''; }
    return values[0] ?? '';
  }
  const provider = one(['Cơ sở khám', 'Tên cơ sở', 'Bệnh viện', 'Tên bệnh viện', 'Phòng khám', 'Cơ sở y tế', 'Nơi khám', 'Hospital', 'Clinic', 'Provider'], 120);
  const occurredOn = printedDate(one(['Ngày khám', 'Ngày khám bệnh', 'Ngày xét nghiệm', 'Ngày siêu âm', 'Ngày lập', 'Ngày thu', 'Ngày ra viện', 'Ngày kê đơn', 'Ngày', 'Visit date', 'Date'], 100));
  const clinician = one(['Bác sĩ', 'Bác sĩ khám', 'Bác sĩ điều trị', 'Doctor', 'Clinician'], 100);
  const patients = [...new Set(fields.filter(row => ['ho ten', 'ho va ten', 'ten benh nhan', 'ho ten benh nhan', 'benh nhan', 'patient name'].includes(fold(row.label))).map(row => row.value).filter(Boolean))];
  const weekText = one(['Tuổi thai', 'Tuần thai', 'Gestational age'], 80);
  const week = /^(\d{1,2})\s*(?:tuần|weeks?|w)(?:\s*\d\s*(?:ngày|days?|d))?$/i.exec(weekText);
  const gestationalWeek = week && Number(week[1]) >= 1 && Number(week[1]) <= 42 ? Number(week[1]) : null;
  const measurements: Record<string, number> = {};
  const conflicted = new Set<string>();
  for (const row of fields) {
    if (row.unclear) continue;
    const label = fold(row.label).replace(/:$/, '');
    const metric = MEDICAL_MEASUREMENTS.find(item => (aliases[item.key] ?? []).some(alias => fold(alias) === label)
      && (unitKey(item.unit) === unitKey(row.unit) || item.key === 'fetalHeartRate' && ['bpm', 'beats/min'].includes(unitKey(row.unit))));
    if (!metric) continue;
    const raw = row.value.trim().replace(/\s+/g, ' ');
    const numberText = row.unit && raw.toLowerCase().endsWith(row.unit.toLowerCase()) ? raw.slice(0, -row.unit.length).trim() : raw;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(numberText)) { warnings.push(`${row.label}: giữ nguyên văn vì số có khoảng, dấu so sánh hoặc chưa rõ.`); continue; }
    const value = Number(numberText.replace(',', '.'));
    if (value > metric.max) { warnings.push(`${row.label}: cần kiểm tra số và đơn vị.`); continue; }
    if (metric.key in measurements && measurements[metric.key] !== value) conflicted.add(metric.key);
    measurements[metric.key] = value;
  }
  for (const key of conflicted) { delete measurements[key]; warnings.push(`Có nhiều kết quả ${key}; chưa đưa vào biểu đồ.`); }
  const medicines = analysis.pages.flatMap(page => page.medicines).filter(row => !row.unclear && row.name.trim()).map(({ name, ingredients, dose, frequency, instructions }) => ({ name, ingredients, dose, frequency, instructions }));
  const uniqueMedicines = medicines.filter((item, i) => medicines.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === i);
  const drugConflicts = new Set(uniqueMedicines.filter((item, i) => uniqueMedicines.some((other, j) => i !== j && fold(other.name) === fold(item.name))).map(item => fold(item.name)));
  if (drugConflicts.size) warnings.push('Thuốc cùng tên có cách dùng khác nhau: giữ trong bản đọc để kiểm tra.');
  const sameProvider = records.filter(r => r.id !== recordId && !r.documentIntake && providerKey(provider).length >= 5 && providerKey(r.provider) === providerKey(provider));
  const candidates = sameProvider.filter(r => occurredOn && medicalDay(r.occurredAt) === occurredOn);
  const kinds = [...new Set(analysis.pages.map(page => page.kind))];
  return {
    details: {
      kind: kinds.length === 1 ? kinds[0] : 'other', title: (analysis.pages[0]?.title || 'Tài liệu khám thai').slice(0, 100), occurredOn,
      provider: sameProvider[0]?.provider ?? provider, clinician, gestationalWeek,
      linkedRecordId: candidates.length === 1 ? candidates[0].id : null,
      measurements, medicines: uniqueMedicines.filter(item => !drugConflicts.has(fold(item.name))).slice(0, 12),
    } satisfies DocumentImportDetails,
    patients, warnings, candidates,
    unresolved: fields.filter(row => row.unclear).length + analysis.pages.flatMap(page => page.medicines).filter(row => row.unclear).length,
  };
}

export function validImportDetails(value: unknown): value is DocumentImportDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as DocumentImportDetails;
  const text = (v: unknown, n: number) => typeof v === 'string' && v.length <= n && !/[\u0000-\u001f]/.test(v);
  return Object.keys(d).sort().join(',') === 'clinician,gestationalWeek,kind,linkedRecordId,measurements,medicines,occurredOn,provider,title'
    && Object.hasOwn(DOCUMENT_TYPES, d.kind) && text(d.title, 100) && Boolean(d.title.trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(d.occurredOn) && printedDate(d.occurredOn) === d.occurredOn
    && text(d.provider, 120) && text(d.clinician, 100)
    && (d.gestationalWeek === null || Number.isInteger(d.gestationalWeek) && d.gestationalWeek >= 1 && d.gestationalWeek <= 42)
    && (d.linkedRecordId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(d.linkedRecordId))
    && validMedicalMeasurements(d.measurements) && Object.keys(d.measurements).every(key => MEDICAL_MEASUREMENTS.some(m => m.key === key))
    && Array.isArray(d.medicines) && d.medicines.length <= 12 && d.medicines.every(m => m && typeof m === 'object'
      && text(m.name, 100) && Boolean(m.name.trim()) && text(m.ingredients ?? '', 1200) && text(m.dose, 80) && text(m.frequency, 80) && text(m.instructions, 200));
}
