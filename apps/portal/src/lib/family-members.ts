import { dateKey, parseDateKey } from "./calendar";

export const MEMBER_ROLES = { mother: "Mẹ", father: "Ba", child: "Con", relative: "Người thân" } as const;
export type MemberRole = keyof typeof MEMBER_ROLES;
export type ProfileField = { key: string; label: string; type?: "date" | "email" | "tel" | "number"; options?: readonly string[]; max?: number; min?: number; integer?: boolean };
export const PROFILE_GROUPS: { title: string; role?: MemberRole; fields: ProfileField[] }[] = [
  { title: "Tiền sử sản khoa", role: "mother", fields: [
    { key: "pregnancyCount", label: "Số lần mang thai (kể cả lần hiện tại)", type: "number", min: 0, max: 40, integer: true },
    { key: "termBirthCount", label: "Số lần sinh đủ tháng", type: "number", min: 0, max: 40, integer: true },
    { key: "pretermBirthCount", label: "Số lần sinh non", type: "number", min: 0, max: 40, integer: true },
    { key: "miscarriageCount", label: "Số lần sảy thai", type: "number", min: 0, max: 40, integer: true },
    { key: "stillbirthCount", label: "Số lần thai lưu", type: "number", min: 0, max: 40, integer: true },
    { key: "terminationCount", label: "Số lần chấm dứt thai kỳ (nếu muốn ghi)", type: "number", min: 0, max: 40, integer: true },
    { key: "ectopicCount", label: "Số lần thai ngoài tử cung", type: "number", min: 0, max: 40, integer: true },
    { key: "livingChildrenCount", label: "Số con hiện sống", type: "number", min: 0, max: 40, integer: true },
    { key: "caesareanCount", label: "Số lần sinh mổ", type: "number", min: 0, max: 40, integer: true },
    { key: "previousPregnancyDetails", label: "Các lần mang thai trước: năm, tuổi thai, cách sinh, cân nặng bé" },
    { key: "previousPregnancyComplications", label: "Biến chứng thai kỳ / sau sinh trước đây do bác sĩ ghi nhận" },
    { key: "uterineCervicalProcedures", label: "Can thiệp tử cung / cổ tử cung: loại, thời điểm" },
  ] },
  { title: "Thông tin sản khoa bổ sung", role: "mother", fields: [
    { key: "conceptionMethod", label: "Hình thức thụ thai", options: ["Chưa rõ", "Tự nhiên", "IUI", "IVF / ICSI", "Khác"] },
    { key: "assistedConceptionDetails", label: "Hỗ trợ sinh sản: cơ sở, ngày chuyển phôi, tuổi phôi theo hồ sơ" },
    { key: "cycleHistory", label: "Chu kỳ trước mang thai: số ngày, đều / không đều" },
    { key: "multiplePregnancyDetails", label: "Đa thai: số thai, bánh nhau / buồng ối theo siêu âm" },
    { key: "obstetricRiskPlan", label: "Yếu tố nguy cơ và kế hoạch theo dõi do bác sĩ xác nhận" },
    { key: "paternalFamilyHistory", label: "Tiền sử bệnh / di truyền phía Ba liên quan đến thai kỳ" },
    { key: "geneticCounselling", label: "Tư vấn di truyền: cơ sở, ngày và kết luận đã nhận" },
  ] },
  { title: "Chăm sóc & chuẩn bị sinh", role: "mother", fields: [
    { key: "pregnancyCareTeam", label: "Bác sĩ sản khoa, nơi theo dõi và cách liên hệ" },
    { key: "birthHospital", label: "Cơ sở dự kiến sinh" },
    { key: "birthPreferences", label: "Mong muốn khi sinh để trao đổi với bác sĩ" },
    { key: "hospitalTransport", label: "Phương án đến viện & người đồng hành" },
    { key: "feedingPreferences", label: "Dự định nuôi dưỡng bé & hỗ trợ cần có" },
    { key: "postpartumSupport", label: "Người hỗ trợ và kế hoạch chăm sóc sau sinh" },
    { key: "mentalHealthHistory", label: "Tiền sử sức khỏe tinh thần & hỗ trợ đang nhận (tự nguyện)" },
    { key: "workExposure", label: "Công việc, hóa chất / khói bụi và điều cần trao đổi khi khám" },
    { key: "nonPrescriptionProducts", label: "Thuốc tự mua, thảo dược / sản phẩm bổ sung cần báo bác sĩ" },
    { key: "carePlanReviewedAt", label: "Ngày cập nhật kế hoạch chăm sóc", type: "date" },
  ] },
  { title: "Liên hệ & đời sống", fields: [
    { key: "phone", label: "Điện thoại", type: "tel" }, { key: "email", label: "Email", type: "email" },
    { key: "hometown", label: "Quê quán / nơi sống" }, { key: "languages", label: "Ngôn ngữ sử dụng" },
    { key: "occupation", label: "Công việc / trường học" }, { key: "interests", label: "Sở thích & điều giúp dễ chịu" },
  ] },
  { title: "Thông tin cần khi đi khám", fields: [
    { key: "bloodGroup", label: "Nhóm máu đã xét nghiệm", options: ["Chưa biết", "A", "B", "AB", "O"] },
    { key: "rhFactor", label: "Rh đã xét nghiệm", options: ["Chưa biết", "+", "−"] },
    { key: "allergyStatus", label: "Thông tin dị ứng", options: ["Chưa biết", "Chưa ghi nhận dị ứng", "Có dị ứng"] },
    { key: "allergies", label: "Chất / thuốc gây dị ứng và phản ứng" },
    { key: "conditions", label: "Bệnh / tình trạng đã được bác sĩ xác nhận" },
    { key: "procedures", label: "Phẫu thuật, nhập viện & năm thực hiện" },
    { key: "familyHistory", label: "Tiền sử bệnh trong gia đình" },
    { key: "medicines", label: "Thuốc / vi chất đang dùng theo hướng dẫn" },
    { key: "assistiveDevices", label: "Thiết bị y tế / hỗ trợ đang dùng" },
    { key: "clinician", label: "Bác sĩ / cơ sở khám thường xuyên" },
    { key: "insurance", label: "Đơn vị bảo hiểm (không cần số giấy tờ)" },
  ] },
  { title: "Liên hệ khẩn cấp & hỗ trợ", fields: [
    { key: "emergencyName", label: "Người liên hệ khẩn cấp" }, { key: "emergencyRelation", label: "Mối quan hệ" },
    { key: "emergencyPhone", label: "Số điện thoại khẩn cấp", type: "tel" },
    { key: "caregiver", label: "Người chăm sóc / người giám hộ" },
    { key: "careNeeds", label: "Nhu cầu hỗ trợ, vận động, nghe / nhìn, giao tiếp" },
    { key: "carePreferences", label: "Mong muốn khi được chăm sóc" },
  ] },
  { title: "Lúc chào đời", fields: [
    { key: "birthPlace", label: "Nơi sinh" }, { key: "gestationAtBirth", label: "Tuổi thai lúc sinh (tuần + ngày)" },
    { key: "birthMethod", label: "Cách sinh", options: ["Chưa biết", "Sinh thường", "Sinh mổ", "Khác"] },
    { key: "birthWeightG", label: "Cân nặng lúc sinh (g)", type: "number", max: 15000 },
    { key: "birthLengthCm", label: "Chiều dài lúc sinh (cm)", type: "number", max: 100 },
    { key: "birthHeadCm", label: "Vòng đầu lúc sinh (cm)", type: "number", max: 80 },
    { key: "newbornScreening", label: "Sàng lọc sơ sinh & thính lực" },
    { key: "birthNotes", label: "Điều cần nhớ lúc sinh" },
  ] },
  { title: "Thói quen & mục tiêu cá nhân", fields: [
    { key: "diet", label: "Chế độ ăn, món cần tránh / không dung nạp" },
    { key: "activity", label: "Vận động thường ngày" }, { key: "sleepRoutine", label: "Giờ ngủ & khó khăn khi ngủ" },
    { key: "tobacco", label: "Thuốc lá & tiếp xúc khói thuốc" }, { key: "alcohol", label: "Rượu bia (nếu muốn ghi)" },
    { key: "wellbeing", label: "Tinh thần & nguồn hỗ trợ" },
    { key: "clinicianGoals", label: "Mục tiêu / giới hạn do bác sĩ xác nhận" },
    { key: "personalGoals", label: "Điều đang muốn cải thiện" },
  ] },
];
const fields = new Map(PROFILE_GROUPS.flatMap(g => g.fields.map(f => [f.key, f] as const)));
const maternalSourceKeys = new Set(PROFILE_GROUPS.flatMap(group => group.role === 'mother' ? group.fields.map(field => `maternalSource_${field.key}`) : []).concat('maternalSource_bloodGroup'));
// Edited in the compact meal preference panel; still versioned with the person's profile.
for (const field of [
  { key: "foodAllergenCodes", label: "Dị ứng thực phẩm" }, { key: "foodAvoidTerms", label: "Món cần tránh" },
  { key: "nutritionContextHash", label: "Bản đối chiếu" },
  { key: "nutritionReviewed", label: "Đã rà soát", options: ["Đã đối chiếu"] },
  { key: "nutritionSpecialDiet", label: "Chế độ bác sĩ chỉ định", options: ["Có", "Không"] },
  { key: "nutritionDietPattern", label: "Chế độ ăn", options: ["Ăn đa dạng", "Chay có trứng / sữa", "Thuần chay"] },
  { key: "nutritionClinicianPlan", label: "Lời dặn về ăn uống" }
] satisfies ProfileField[]) fields.set(field.key, field);
export const PROFILE_HISTORY_FIELDS = [...fields.values()].filter(field => field.key !== "nutritionContextHash");

type Metric = { key: string; label: string; unit: string; min: number; max: number; secondary?: boolean };
// Broad input-error bounds, NOT clinical normal ranges or treatment targets.
export const FAMILY_METRICS: Metric[] = [
  { key: "height", label: "Chiều cao / chiều dài", unit: "cm", min: 10, max: 280 },
  { key: "weight", label: "Cân nặng", unit: "kg", min: .1, max: 600 },
  { key: "head", label: "Vòng đầu", unit: "cm", min: 10, max: 100 },
  { key: "waist", label: "Vòng eo", unit: "cm", min: 10, max: 300 },
  { key: "pressure", label: "Huyết áp (tâm thu / tâm trương)", unit: "mmHg", min: 10, max: 350, secondary: true },
  { key: "heartRate", label: "Nhịp tim", unit: "lần/phút", min: 10, max: 300 },
  { key: "restingHeartRate", label: "Nhịp tim nghỉ", unit: "lần/phút", min: 10, max: 300 },
  { key: "respiration", label: "Nhịp thở", unit: "lần/phút", min: 1, max: 150 },
  { key: "oxygen", label: "Độ bão hòa oxy SpO₂", unit: "%", min: 1, max: 100 },
  { key: "temperature", label: "Nhiệt độ cơ thể", unit: "°C", min: 25, max: 45 },
  { key: "wristTemperature", label: "Nhiệt độ cổ tay", unit: "°C", min: 20, max: 45 },
  { key: "hrv", label: "Biến thiên nhịp tim HRV", unit: "ms", min: 0, max: 1000 },
  { key: "sleep", label: "Thời gian ngủ", unit: "giờ", min: 0, max: 24 },
  { key: "steps", label: "Số bước", unit: "bước", min: 0, max: 150000 },
  { key: "distance", label: "Quãng đường", unit: "km", min: 0, max: 1000 },
  { key: "activeEnergy", label: "Năng lượng vận động", unit: "kcal", min: 0, max: 20000 },
  { key: "restingEnergy", label: "Năng lượng nghỉ", unit: "kcal", min: 0, max: 10000 },
  { key: "exercise", label: "Thời gian tập luyện", unit: "phút", min: 0, max: 1440 },
  { key: "mindfulness", label: "Thời gian thư giãn", unit: "phút", min: 0, max: 1440 },
  { key: "water", label: "Nước uống", unit: "ml", min: 0, max: 20000 },
  { key: "glucoseMg", label: "Đường huyết — mg/dL", unit: "mg/dL", min: 1, max: 1500 },
  { key: "glucoseMmol", label: "Đường huyết — mmol/L", unit: "mmol/L", min: .1, max: 85 },
  { key: "hba1c", label: "HbA1c", unit: "%", min: 1, max: 25 },
  { key: "cholesterol", label: "Cholesterol toàn phần", unit: "mmol/L", min: .1, max: 40 },
  { key: "ldl", label: "LDL cholesterol", unit: "mmol/L", min: .1, max: 30 },
  { key: "hdl", label: "HDL cholesterol", unit: "mmol/L", min: .1, max: 15 },
  { key: "triglycerides", label: "Triglyceride", unit: "mmol/L", min: .1, max: 100 },
  { key: "hemoglobin", label: "Hemoglobin", unit: "g/dL", min: .1, max: 30 },
  { key: "ferritin", label: "Ferritin", unit: "ng/mL", min: 0, max: 100000 },
  { key: "creatinine", label: "Creatinine", unit: "µmol/L", min: 1, max: 5000 },
  { key: "pain", label: "Mức độ đau tự ghi", unit: "/10", min: 0, max: 10 },
];
export const RECORD_KINDS = {
  measurement: "Số đo", visit: "Lần khám", lab: "Xét nghiệm", vaccination: "Tiêm chủng",
  medication: "Thuốc / vi chất", allergy: "Dị ứng", condition: "Tình trạng sức khỏe",
  procedure: "Phẫu thuật / nhập viện", dental: "Răng miệng", vision: "Mắt", hearing: "Thính lực",
  development: "Mốc phát triển", education: "Học tập", wellbeing: "Tinh thần", care: "Kế hoạch chăm sóc", other: "Ghi chú khác",
} as const;
export type RecordKind = keyof typeof RECORD_KINDS;
export const CLINICAL_FIELDS = [
  { key: "specialty", label: "Chuyên khoa", max: 120 },
  { key: "clinician", label: "Bác sĩ / người phụ trách", max: 160 },
  { key: "reference", label: "Mã hồ sơ / số phiếu", max: 120 },
  { key: "reason", label: "Triệu chứng / lý do khám", max: 600 },
  { key: "diagnosis", label: "Chẩn đoán được ghi trên hồ sơ", max: 800 },
  { key: "results", label: "Kết luận xét nghiệm / chẩn đoán hình ảnh", max: 800 },
  { key: "treatment", label: "Điều trị / thuốc và liều theo đơn", max: 800 },
  { key: "instructions", label: "Lời dặn / kế hoạch theo dõi", max: 600 },
] as const;
export const HEALTH_STATUSES = { unspecified: "Chưa ghi", monitoring: "Đang theo dõi", treatment: "Đang điều trị", resolved: "Đã kết thúc / hồi phục" } as const;
export const DOCUMENT_TYPES = { unspecified: "Chưa phân loại", medical_record: "Bệnh án / phiếu khám", prescription: "Đơn thuốc", lab: "Kết quả xét nghiệm", imaging: "Siêu âm / X-quang / CT / MRI", discharge: "Giấy ra viện", receipt: "Phiếu thu / hóa đơn", vaccination: "Phiếu tiêm chủng", other: "Giấy tờ khác" } as const;
export type ClinicalDetails = Partial<Record<typeof CLINICAL_FIELDS[number]["key"], string>> & {
  status?: keyof typeof HEALTH_STATUSES; documentType?: keyof typeof DOCUMENT_TYPES;
};
export type LabResult = { name: string; value: string; unit: string; referenceRange: string };
export const MEASUREMENT_CONTEXTS = { unspecified: "Chưa ghi bối cảnh", fasting: "Lúc đói", before_meal: "Trước ăn",
  after_meal_1h: "Sau ăn 1 giờ", after_meal_2h: "Sau ăn 2 giờ", resting: "Khi nghỉ", after_activity: "Sau vận động", other: "Khác — ghi thêm bên dưới" } as const;
export type FamilyMember = {
  id: string; role: MemberRole; fullName: string; preferredName: string; birthDate: string | null;
  sexAtBirth: "female" | "male" | "unknown"; details: Record<string, string>;
  revision: number; archived: boolean; updatedAt?: string;
};
export type MemberRecord = {
  id: string; memberId: string; kind: RecordKind; title: string; occurredAt: string;
  notes: string; source: string; nextDueDate: string | null;
  metric: string | null; value: number | null; secondaryValue: number | null; unit: string | null;
  measurementContext?: keyof typeof MEASUREMENT_CONTEXTS;
  pregnancyMemory?: { dueDate: string; week: number; mediaIds: string[] };
  clinical?: ClinicalDetails;
  labResults?: LabResult[];
  revision: number; deleted: boolean; updatedAt?: string;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function date(value: unknown, future = false): boolean { return value === null || typeof value === "string" && !!parseDateKey(value) && (future || value <= dateKey(new Date())); }
function revision(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 2147483647; }

export function validFamilyMember(value: unknown): value is FamilyMember {
  // Leave room for jsonb whitespace within the database's 48 KiB profile limit.
  if (new TextEncoder().encode(JSON.stringify(value) ?? "").length > 44000) return false;
  if (!object(value) || Object.keys(value).some(k => !["id","role","fullName","preferredName","birthDate","sexAtBirth","details","revision","archived","updatedAt"].includes(k))) return false;
  if (!text(value.id, 36) || !UUID.test(value.id) || !Object.hasOwn(MEMBER_ROLES, String(value.role))
    || !text(value.fullName, 160) || !value.fullName.trim() || !text(value.preferredName, 80)
    || !date(value.birthDate) || !["female", "male", "unknown"].includes(String(value.sexAtBirth))
    || !revision(value.revision) || typeof value.archived !== "boolean" || !object(value.details)) return false;
  // Existing parent birthday APIs intentionally accept dates from 1940 onward.
  if (["mother", "father"].includes(String(value.role)) && value.birthDate !== null && String(value.birthDate) < "1940-01-01") return false;
  return Object.entries(value.details).every(([key, entry]) => {
    if (maternalSourceKeys.has(key)) {
      if (!text(entry, 1000)) return false;
      try { const sources = JSON.parse(entry); return Array.isArray(sources) && sources.length > 0 && sources.length <= 4 && sources.every(source => object(source) && Object.keys(source).sort().join(',') === 'documentId,page' && typeof source.documentId === 'string' && UUID.test(source.documentId) && Number.isInteger(source.page) && Number(source.page) >= 1 && Number(source.page) <= 6); } catch { return false; }
    }
    const field = fields.get(key);
    if (!field || !text(entry, 1000)) return false;
    if (!entry) return true;
    if (key === "nutritionContextHash" && !/^[a-f0-9]{64}$/.test(entry)) return false;
    if (key === "foodAllergenCodes" && entry.split(",").some(code => !["milk","egg","fish","shellfish","peanut","tree_nut","soy","gluten","sesame"].includes(code))) return false;
    if (field.options && !field.options.includes(entry)) return false;
    if (field.type === "number" && (!/^\d+(\.\d+)?$/.test(entry) || Number(entry) < (field.min ?? .1) || Number(entry) > (field.max ?? 100000) || field.integer && !Number.isInteger(Number(entry)))) return false;
    if (field.type === "date" && !parseDateKey(entry)) return false;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) return false;
    return true;
  });
}

export function validMemberRecord(value: unknown): value is MemberRecord {
  if (!object(value) || Object.keys(value).some(k => !["id","memberId","kind","title","occurredAt","notes","source","nextDueDate","metric","value","secondaryValue","unit","measurementContext","pregnancyMemory","clinical","labResults","revision","deleted","updatedAt"].includes(k))) return false;
  // Leave room for jsonb formatting within the database's 16 KiB record limit.
  if (new TextEncoder().encode(JSON.stringify(value)).length > 15000) return false;
  if (value.clinical !== undefined) {
    if (!object(value.clinical) || !Object.entries(value.clinical).every(([key, entry]) => {
      if (key === "status") return typeof entry === "string" && Object.hasOwn(HEALTH_STATUSES, entry);
      if (key === "documentType") return typeof entry === "string" && Object.hasOwn(DOCUMENT_TYPES, entry);
      const field = CLINICAL_FIELDS.find(f => f.key === key);
      return !!field && text(entry, field.max);
    })) return false;
  }
  if (value.labResults !== undefined && (!Array.isArray(value.labResults) || value.labResults.length > 12 || !value.labResults.every(row =>
    object(row) && Object.keys(row).every(key => ["name", "value", "unit", "referenceRange"].includes(key))
    && text(row.name, 120) && !!row.name.trim() && text(row.value, 120) && !!row.value.trim()
    && text(row.unit, 40) && text(row.referenceRange, 120)))) return false;
  if (value.pregnancyMemory !== undefined) {
    const memory = value.pregnancyMemory;
    if (value.kind !== "development" || !object(memory) || Object.keys(memory).some(k => !["dueDate", "week", "mediaIds"].includes(k))
      || typeof memory.dueDate !== "string" || !parseDateKey(memory.dueDate) || !Number.isInteger(memory.week) || Number(memory.week) < 1 || Number(memory.week) > 42
      || !Array.isArray(memory.mediaIds) || memory.mediaIds.length < 1 || memory.mediaIds.length > 12
      || new Set(memory.mediaIds).size !== memory.mediaIds.length || memory.mediaIds.some(id => typeof id !== "string" || !UUID.test(id))) return false;
  }
  if (value.measurementContext !== undefined && (typeof value.measurementContext !== "string" || !Object.hasOwn(MEASUREMENT_CONTEXTS, value.measurementContext))) return false;
  if (value.kind !== "measurement" && value.measurementContext !== undefined && value.measurementContext !== "unspecified") return false;
  if (!text(value.id, 36) || !UUID.test(value.id) || !text(value.memberId, 36) || !UUID.test(value.memberId)
    || !Object.hasOwn(RECORD_KINDS, String(value.kind)) || !text(value.title, 160) || !value.title.trim()
    || !text(value.notes, 2000) || !text(value.source, 160) || !date(value.nextDueDate, true)
    || !revision(value.revision) || typeof value.deleted !== "boolean" || typeof value.occurredAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value.occurredAt)
    || !parseDateKey(value.occurredAt.slice(0, 10)) || !Number.isFinite(Date.parse(value.occurredAt))
    || Date.parse(value.occurredAt) > Date.now() + 300000) return false;
  if (value.kind !== "measurement") return [value.metric, value.value, value.secondaryValue, value.unit].every(v => v === null);
  const metric = FAMILY_METRICS.find(m => m.key === value.metric);
  if (!metric || metric.unit !== value.unit || typeof value.value !== "number" || !Number.isFinite(value.value)
    || value.value < metric.min || value.value > metric.max) return false;
  return metric.secondary ? typeof value.secondaryValue === "number" && Number.isFinite(value.secondaryValue)
    && value.secondaryValue >= metric.min && value.secondaryValue < value.value : value.secondaryValue === null;
}

export function memberAge(member: Pick<FamilyMember, "birthDate">, now = new Date()): string {
  if (!member.birthDate) return "Chưa có ngày sinh";
  const today = dateKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const [by, bm, bd] = member.birthDate.split("-").map(Number);
  const months = (y - by) * 12 + m - bm - (d < bd ? 1 : 0);
  if (months < 0) return "Chưa có ngày sinh";
  if (months < 1) return `${Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${member.birthDate}T00:00:00Z`)) / 86400000)} ngày tuổi`;
  return months < 24 ? `${months} tháng tuổi` : `${Math.floor(months / 12)} tuổi`;
}
