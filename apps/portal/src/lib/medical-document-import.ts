import { DOCUMENT_TYPES, type DocumentAnalysis } from './medical-document-scan';
import { MEDICAL_MEASUREMENTS, validMedicalMeasurements } from './medical-measurements';
import type { MedicalMedicine, MedicalRecord } from './pregnancy-medical';
import { buildDocumentOverview, documentFieldCategory } from './medical-document-overview';

export type DocumentImportDetails = {
  kind: string; title: string; occurredOn: string; provider: string; clinician: string;
  gestationalWeek: number | null; linkedRecordId: string | null;
  measurements: Record<string, number>; medicines: MedicalMedicine[];
  /** Only a printed/confirmed date AND time; never manufacture an hour from a date. */
  nextAppointmentAt?: string | null;
};
export type DocumentImportContext = {
  recordUpdatedAt: string; intake: boolean; imported: boolean; records: MedicalRecord[];
};
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const labelKey = (text: string) => fold(text).replace(/\s*[:：]\s*$/, '');
export const providerKey = (text: string) => fold(text).replace(/\bbenh vien\b/g, 'bv').replace(/\bphong kham\b/g, 'pk').replace(/[^a-z0-9]/g, '');
const unitKey = (text: string) => fold(text).replace(/\s/g, '').replace(/⁹/g, '9').replace(/¹²/g, '12').replace(/μ/g, 'µ').replace(/\^/g, '');
const aliases: Record<string, string[]> = {
  heightCm: ['chiều cao mẹ', 'chiều cao', 'height'], maternalHeartRate: ['mạch', 'mạch mẹ', 'nhịp tim mẹ', 'maternal heart rate', 'pulse'],
  temperatureC: ['nhiệt độ', 'nhiệt độ cơ thể', 'temperature'], oxygenPercent: ['spo2', 'sp o2', 'độ bão hòa oxy'],
  respiratoryRate: ['nhịp thở', 'respiratory rate'], wbc109l: ['wbc', 'bạch cầu', 'số lượng bạch cầu'],
  rbc1012l: ['rbc', 'hồng cầu', 'số lượng hồng cầu'], hematocritPercent: ['hct', 'hematocrit'],
  mcvFl: ['mcv'], mchPg: ['mch'], creatinineUmolL: ['creatinine', 'creatinin'], ureaMmolL: ['urê', 'urea', 'ure'],
  weightKg: ['cân nặng mẹ', 'cân nặng', 'weight'], systolic: ['huyết áp tâm thu', 'systolic'], diastolic: ['huyết áp tâm trương', 'diastolic'],
  fetalHeartRate: ['nhịp tim thai', 'tim thai', 'fhr'], crlMm: ['crl', 'chiều dài đầu mông'], ntMm: ['nt', 'độ mờ da gáy'],
  bpdMm: ['bpd', 'đường kính lưỡng đỉnh'], hcMm: ['hc', 'chu vi đầu'], acMm: ['ac', 'chu vi bụng'], flMm: ['fl', 'chiều dài xương đùi'],
  efwG: ['efw', 'cân nặng thai', 'cân nặng ước tính'], afiCm: ['afi', 'chỉ số ối'], cervixMm: ['chiều dài cổ tử cung'],
  hemoglobinGdl: ['hemoglobin', 'hgb', 'hb'], ferritinNgml: ['ferritin'], platelet109l: ['tiểu cầu', 'plt', 'platelet'],
  glucoseMgdl: ['glucose', 'đường huyết'], glucoseMmoll: ['glucose', 'đường huyết'], hba1cPercent: ['hba1c'],
  tshMiuL: ['tsh'], ft4PmolL: ['ft4'], astUL: ['ast', 'sgot'], altUL: ['alt', 'sgpt'],
};
export function printedDate(text: string): string {
  // Permit a printed location prefix only before an explicit Vietnamese date.
  const clean = text.trim().replace(/^(?:[\p{L} .\-]+,\s*)?(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})$/iu, '$1/$2/$3');
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

export function printedAppointment(text: string): string | null {
  const match = /^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{2}-\d{2})[T\s]+([01]?\d|2[0-3])[:h]([0-5]\d)(?:\s*giờ)?$/i.exec(text.trim());
  const day = match ? printedDate(match[1]) : '';
  if (!day || !match) return null;
  return new Date(`${day}T${match[2].padStart(2, '0')}:${match[3]}:00+07:00`).toISOString();
}

// A proposal, never an autonomous medical decision. Unknown units, ranges and conflicting
// observations stay in the complete transcription, not in numeric health charts.
export function proposeDocumentImport(analysis: DocumentAnalysis, records: MedicalRecord[], recordId: string) {
  const fields = analysis.pages.flatMap(page => page.fields);
  const overview = buildDocumentOverview(analysis);
  const identityConflict = overview.differences.some(d => d.kind === 'patient-names' || d.kind === 'patient-ids');
  const warnings: string[] = [];
  function one(labels: string[], max: number, numericUnit = false): string {
    const values = [...new Set(fields.filter(row => !row.unclear && labels.map(fold).includes(labelKey(row.label))).map(row => {
      const value = row.value.trim();
      return numericUnit && /^\d{1,2}$/.test(value) && row.unit.trim() ? `${value} ${row.unit.trim()}` : value;
    }).filter(Boolean))];
    if (values.length > 1) { warnings.push(`Nhiều giá trị cho ${labels[0]}; cần chọn lại.`); return ''; }
    if ((values[0]?.length ?? 0) > max) { warnings.push(`${labels[0]} quá dài; giữ nguyên trong bản đọc.`); return ''; }
    return values[0] ?? '';
  }
  const provider = one(['Cơ sở khám', 'Tên cơ sở', 'Bệnh viện', 'Tên bệnh viện', 'Phòng khám', 'Cơ sở y tế', 'Nơi khám', 'Hospital', 'Clinic', 'Provider'], 120);
  // Multiple representations of one date are equivalent. Birth/appointment/sample
  // dates are not visit dates; don't silently choose between different visits.
  const dateLabels = ['Ngày khám', 'Ngày khám bệnh', 'Ngày xét nghiệm', 'Ngày siêu âm', 'Ngày lập', 'Ngày lập phiếu', 'Ngày thực hiện', 'Địa điểm và ngày', 'Địa chỉ và ngày', 'Ngày thu', 'Ngày ra viện', 'Ngày kê đơn', 'Ngày', 'Visit date', 'Date'].map(fold);
  const dates = [...new Set(fields.filter(row => !row.unclear && dateLabels.includes(labelKey(row.label))).map(row => printedDate(row.value)).filter(Boolean))];
  const occurredOn = dates.length === 1 ? dates[0] : '';
  const multipleVisits = dates.length > 1;
  const facilities = new Set(fields.filter(row => documentFieldCategory(row.label) === 'facility' && row.value.trim()).map(row => providerKey(row.value)));
  const ambiguousScope = multipleVisits || facilities.size > 1;
  if (facilities.size > 1) warnings.push('Nhiều cơ sở khám trên tài liệu: giữ kết quả riêng theo trang, chưa gộp chỉ số hoặc thuốc.');
  if (dates.length > 1) warnings.push('Nhiều ngày trên tài liệu; chọn đúng ngày của hồ sơ trước khi liên kết.');
  const clinician = one(['Bác sĩ', 'Bác sĩ khám', 'Bác sĩ điều trị', 'Doctor', 'Clinician'], 100);
  const patientFields = fields.filter(row => ['ho ten', 'ho va ten', 'ten benh nhan', 'ho ten benh nhan', 'ho ten nguoi benh', 'ho va ten nguoi benh', 'nguoi benh', 'benh nhan', 'patient name'].includes(labelKey(row.label)));
  // Ignore case/spacing differences across pages, not spelling/diacritic differences.
  const patients = [...new Map(patientFields.map(row => [row.value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim(), row.value.trim()] as const).filter(([key]) => key)).values()];
  const weekText = one(['Tuổi thai', 'Tuần thai', 'Gestational age'], 80, true);
  const week = /^(\d{1,2})\s*(?:tuần|weeks?|w)(?:\s*\d\s*(?:ngày|days?|d))?$/i.exec(weekText);
  const gestationalWeek = week && Number(week[1]) >= 1 && Number(week[1]) <= 42 ? Number(week[1]) : null;
  const followups = fields.filter(row => ['ngay hen tai kham', 'ngay tai kham', 'hen tai kham', 'lich tai kham', 'ngay hen', 'follow-up date', 'next appointment'].includes(labelKey(row.label)) && row.value.trim());
  const followupValues = [...new Set(followups.map(row => row.unclear ? null : printedAppointment(row.value)))];
  let nextAppointmentAt = followupValues.length === 1 ? followupValues[0] : null;
  if (nextAppointmentAt && (!occurredOn || medicalDay(nextAppointmentAt) < occurredOn)) nextAppointmentAt = null;
  const owningRecord = records.find(record => record.id === recordId);
  if (nextAppointmentAt && owningRecord && !owningRecord.documentIntake && medicalDay(nextAppointmentAt) < medicalDay(owningRecord.occurredAt)) nextAppointmentAt = null;
  if (followups.length && !nextAppointmentAt) warnings.push('Lịch tái khám chưa rõ cả ngày và giờ, hoặc có nhiều mốc: giữ nguyên trong hồ sơ, chưa tự đặt giờ nhắc.');
  const measurements: Record<string, number> = {};
  const conflicted = new Set<string>();
  for (const row of fields) {
    if (row.unclear) continue;
    if (row.context?.trim()) { warnings.push(`${row.label}: có ngữ cảnh riêng (${row.context}); giữ từng kết quả trong bản đọc, chưa gộp vào biểu đồ.`); continue; }
    const label = labelKey(row.label);
    if (['huyet ap', 'blood pressure', 'bp'].includes(label) && unitKey(row.unit) === 'mmhg') {
      const bp = /^(\d{2,3})\s*\/\s*(\d{2,3})(?:\s*mmHg)?$/i.exec(row.value.trim());
      if (bp && Number(bp[1]) <= 350 && Number(bp[2]) <= 250 && Number(bp[1]) >= Number(bp[2])) {
        for (const [key, value] of [['systolic', Number(bp[1])], ['diastolic', Number(bp[2])]] as const) {
          if (key in measurements && measurements[key] !== value) conflicted.add(key);
          measurements[key] = value;
        }
      } else warnings.push('Huyết áp: cần kiểm tra cặp số và đơn vị trên phiếu.');
      continue;
    }
    if (['can nang', 'weight'].includes(label) && analysis.pages.some(page => page.kind === 'ultrasound')) {
      warnings.push('Cân nặng trên siêu âm chưa rõ của Mẹ hay thai; chưa đưa vào biểu đồ của Mẹ.'); continue;
    }
    const metric = MEDICAL_MEASUREMENTS.find(item => (aliases[item.key] ?? []).some(alias => fold(alias) === label)
      && (unitKey(item.unit) === unitKey(row.unit) || ['fetalHeartRate', 'maternalHeartRate'].includes(item.key) && ['bpm', 'beats/min'].includes(unitKey(row.unit))));
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
  const medicines = analysis.pages.flatMap(page => page.medicines).filter(row => !row.unclear && row.name.trim()).flatMap(row => {
    const { name, ingredients, dose, frequency } = row;
    const instructions = [row.instructions, row.route && `Đường dùng: ${row.route}`, row.duration && `Thời gian: ${row.duration}`, row.quantity && `Số lượng cấp: ${row.quantity}`].filter(Boolean).join(' · ');
    if (instructions.length > 200) { warnings.push(`${name}: lời dặn dài; giữ đầy đủ trong bản đọc, chưa rút gọn để nhập thuốc.`); return []; }
    return [{ name, ingredients, dose, frequency, instructions }];
  });
  const medicineKey = (item: MedicalMedicine) => JSON.stringify([item.name,item.ingredients??'',item.dose,item.frequency,item.instructions].map(value=>value.normalize('NFC').trim().replace(/\s+/g,' ')));
  const uniqueMedicines = medicines.filter((item, i) => medicines.findIndex(other => medicineKey(other) === medicineKey(item)) === i);
  const drugConflicts = new Set(uniqueMedicines.filter((item, i) => uniqueMedicines.some((other, j) => i !== j && fold(other.name) === fold(item.name))).map(item => fold(item.name)));
  if (drugConflicts.size) warnings.push('Thuốc cùng tên có cách dùng khác nhau: giữ trong bản đọc để kiểm tra.');
  const sameProvider = records.filter(r => r.id !== recordId && !r.documentIntake && providerKey(provider).length >= 5 && providerKey(r.provider) === providerKey(provider));
  const candidates = sameProvider.filter(r => occurredOn && medicalDay(r.occurredAt) === occurredOn);
  const kinds = [...new Set(analysis.pages.map(page => page.kind))];
  if (uniqueMedicines.length > 12) warnings.push('Hơn 12 thuốc: hồ sơ chỉ nhận tối đa 12; toàn bộ thuốc còn lại vẫn giữ trong bản đọc.');
  if (patients.length > 1) warnings.push('Có nhiều người bệnh: chưa đề xuất chỉ số hoặc thuốc vào cùng hồ sơ.');
  return {
    details: {
      kind: kinds.length === 1 ? kinds[0] : 'other', title: (analysis.pages[0]?.title || 'Tài liệu khám thai').slice(0, 100), occurredOn,
      provider: sameProvider[0]?.provider ?? provider, clinician, gestationalWeek: identityConflict || ambiguousScope ? null : gestationalWeek,
      linkedRecordId: !identityConflict && candidates.length === 1 ? candidates[0].id : null,
      nextAppointmentAt: identityConflict || ambiguousScope ? null : nextAppointmentAt,
      measurements: identityConflict || ambiguousScope ? {} : measurements, medicines: identityConflict || ambiguousScope ? [] : uniqueMedicines.filter(item => !drugConflicts.has(fold(item.name))).slice(0, 12),
    } satisfies DocumentImportDetails,
    patients, warnings, candidates, identityConflict, multipleVisits, ambiguousScope, followups,
    unresolved: fields.filter(row => row.unclear).length + analysis.pages.flatMap(page => page.medicines).filter(row => row.unclear).length,
  };
}

export function validImportDetails(value: unknown): value is DocumentImportDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as DocumentImportDetails;
  const text = (v: unknown, n: number) => typeof v === 'string' && v.length <= n && !/[\u0000-\u001f]/.test(v);
  return Object.keys(d).filter(key => key !== 'nextAppointmentAt').sort().join(',') === 'clinician,gestationalWeek,kind,linkedRecordId,measurements,medicines,occurredOn,provider,title'
    && Object.hasOwn(DOCUMENT_TYPES, d.kind) && text(d.title, 100) && Boolean(d.title.trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(d.occurredOn) && printedDate(d.occurredOn) === d.occurredOn
    && text(d.provider, 120) && text(d.clinician, 100)
    && (!Object.hasOwn(d, 'nextAppointmentAt') || d.nextAppointmentAt === null || typeof d.nextAppointmentAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(d.nextAppointmentAt)
      && Number.isFinite(Date.parse(d.nextAppointmentAt)) && new Date(d.nextAppointmentAt).toISOString() === d.nextAppointmentAt
      && medicalDay(d.nextAppointmentAt) >= d.occurredOn && Number(d.nextAppointmentAt.slice(0, 4)) <= 2100)
    && (d.gestationalWeek === null || Number.isInteger(d.gestationalWeek) && d.gestationalWeek >= 1 && d.gestationalWeek <= 42)
    && (d.linkedRecordId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(d.linkedRecordId))
    && validMedicalMeasurements(d.measurements) && Object.keys(d.measurements).every(key => MEDICAL_MEASUREMENTS.some(m => m.key === key))
    && Array.isArray(d.medicines) && d.medicines.length <= 12 && d.medicines.every(m => m && typeof m === 'object'
      && text(m.name, 100) && Boolean(m.name.trim()) && text(m.ingredients ?? '', 1200) && text(m.dose, 80) && text(m.frequency, 80) && text(m.instructions, 200));
}
