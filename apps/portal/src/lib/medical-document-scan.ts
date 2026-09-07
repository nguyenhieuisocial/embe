export const DOCUMENT_TYPES: Record<string, string> = {
  receipt: 'Phiếu thu / hóa đơn', prescription: 'Đơn thuốc', ultrasound: 'Siêu âm',
  laboratory: 'Xét nghiệm', clinical: 'Bệnh án / phiếu khám', discharge: 'Giấy ra viện', other: 'Tài liệu khác'
};
export type ExtractedField = { label: string; value: string; unit: string; reference: string; context?: string; evidence: string; unclear: boolean };
export type ExtractedMedicine = { name: string; ingredients: string; dose: string; frequency: string; instructions: string; route?: string; duration?: string; quantity?: string; evidence: string; unclear: boolean };
export type ExtractedCharge = { label: string; amount: string; currency: string; quantity?: string; unitPrice?: string; evidence: string; unclear: boolean };
export const DOCUMENT_ROW_LIMITS = { fields: 64, medicines: 24, charges: 80 };
export const DOCUMENT_DETAIL_DEFAULTS = { fields: { context: '' }, medicines: { route: '', duration: '', quantity: '' }, charges: { quantity: '', unitPrice: '' } };
export type DocumentPage = {
  page: number; kind: string; title: string; fields: ExtractedField[]; medicines: ExtractedMedicine[];
  charges: ExtractedCharge[]; warnings: string[];
};
export type DocumentAnalysis = { version: 1; pages: DocumentPage[] };
export type DocumentScan = {
  documentId: string; recordId: string; filename: string; mimeType: string;
  status: 'idle' | 'queued' | 'processing' | 'review' | 'confirmed' | 'failed'; revision: number;
  completedPages: number; pageCount: number | null; error: string | null;
  analysis: DocumentAnalysis | null; confirmedAt: string | null;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function rows(value: unknown, limits: Record<string, number>, max: number, optional: Record<string, number> = {}): boolean {
  return Array.isArray(value) && value.length <= max && value.every(row => object(row)
    && Object.keys(row).every(key => key === 'unclear' || Object.hasOwn(limits, key) || Object.hasOwn(optional, key)) && typeof row.unclear === 'boolean'
    && Object.entries(limits).every(([key, size]) => text(row[key], size))
    && Object.entries(optional).every(([key, size]) => !Object.hasOwn(row, key) || text(row[key], size)));
}
export function validDocumentAnalysis(value: unknown): value is DocumentAnalysis {
  if (!object(value) || !exact(value, ['version', 'pages']) || value.version !== 1 || !Array.isArray(value.pages)
    || value.pages.length < 1 || value.pages.length > 6 || new TextEncoder().encode(JSON.stringify(value)).length > 60_000) return false;
  return value.pages.every((page, index) => object(page) && exact(page, ['page', 'kind', 'title', 'fields', 'medicines', 'charges', 'warnings'])
    && page.page === index + 1 && typeof page.kind === 'string' && Object.hasOwn(DOCUMENT_TYPES, page.kind) && text(page.title, 160)
    && rows(page.fields, { label: 120, value: 1600, unit: 40, reference: 160, evidence: 500 }, DOCUMENT_ROW_LIMITS.fields, { context: 160 })
    && rows(page.medicines, { name: 100, ingredients: 1200, dose: 80, frequency: 80, instructions: 200, evidence: 500 }, DOCUMENT_ROW_LIMITS.medicines, { route: 80, duration: 80, quantity: 80 })
    && rows(page.charges, { label: 160, amount: 80, currency: 20, evidence: 500 }, DOCUMENT_ROW_LIMITS.charges, { quantity: 80, unitPrice: 80 })
    && Array.isArray(page.warnings) && page.warnings.length <= 8 && page.warnings.every(warning => text(warning, 240)));
}

export const SCAN_ERROR_TEXT: Record<string, string> = {
  too_many_pages: 'PDF quá 6 trang. Tách thành các file tối đa 6 trang rồi tải lại; chưa trang nào bị âm thầm bỏ qua.',
  invalid_pdf: 'PDF hỏng hoặc có mật khẩu. Dùng bản PDF mở được hoặc chụp từng trang.',
  invalid_image: 'Không mở được ảnh. Hãy chụp lại đủ sáng, thẳng trang và thấy đủ bốn góc.',
  image_too_large: 'Ảnh có kích thước điểm ảnh quá lớn. Chụp riêng từng trang.',
  local_ai_unavailable: 'Máy xử lý AI tại nhà chưa sẵn sàng. Tài liệu vẫn được lưu; có thể đọc lại sau.',
  unreadable_output: 'Chưa đọc được kết quả đáng tin cậy. Hãy chụp rõ chữ hơn hoặc nhập lại khi đối chiếu.',
  worker_timeout: 'Lượt đọc bị gián đoạn. Bấm Đọc lại để tiếp tục.',
  storage_unavailable: 'Chưa tải được bản gốc để đọc. Thử lại khi kết nối ổn định.'
};

export function withPrintedUnit(value: string, unit: string): string {
  return !unit || value.trim().toLocaleLowerCase('vi').endsWith(unit.trim().toLocaleLowerCase('vi')) ? value : `${value} ${unit}`.trim();
}

export function documentAnalysisText(value: DocumentAnalysis, confirmed = false): string {
  const mark = (unclear: boolean) => unclear ? ' [Cần kiểm tra lại với bản gốc]' : '';
  return `${confirmed ? 'Bản chép đã được người dùng đối chiếu' : 'Bản nháp — chưa xác nhận toàn bộ với bản gốc'}. Không thay thế tài liệu y tế gốc.\n\n` + value.pages.map(page => [
    `Trang ${page.page} — ${DOCUMENT_TYPES[page.kind]}: ${page.title}`,
    ...page.fields.map(row => `${row.label}: ${withPrintedUnit(row.value, row.unit)}${row.context ? ` | Ngữ cảnh trên phiếu: ${row.context}` : ''}${row.reference ? ` | Khoảng tham chiếu trên phiếu: ${row.reference}` : ''}${mark(row.unclear)}`),
    ...page.medicines.map(row => [row.name, row.ingredients, row.dose, row.frequency, row.route && `Đường dùng: ${row.route}`, row.duration && `Thời gian: ${row.duration}`, row.quantity && `Số lượng cấp: ${row.quantity}`, row.instructions].filter(Boolean).join(' | ') + mark(row.unclear)),
    ...page.charges.map(row => `${row.label}: ${withPrintedUnit(row.amount, row.currency)}${row.quantity ? ` | Số lượng: ${row.quantity}` : ''}${row.unitPrice ? ` | Đơn giá: ${row.unitPrice}` : ''}${mark(row.unclear)}`),
    ...page.warnings
  ].join('\n')).join('\n\n');
}
