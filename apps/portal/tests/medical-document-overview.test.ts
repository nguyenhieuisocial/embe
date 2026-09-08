import { describe, expect, it } from 'vitest';
import { buildDocumentOverview, DOCUMENT_OVERVIEW_LIMITS } from '../src/lib/medical-document-overview';
import { DOCUMENT_TYPES, type DocumentAnalysis, type DocumentPage, type ExtractedField } from '../src/lib/medical-document-scan';

const field = (label: string, value: string, extra: Partial<ExtractedField> = {}): ExtractedField => ({
  label, value, unit: '', reference: '', evidence: `${label}: ${value}`, unclear: false, ...extra
});
const page = (fields: ExtractedField[] = [], extra: Partial<DocumentPage> = {}): DocumentPage => ({
  page: 1, kind: 'clinical', title: 'Tài liệu mẫu', fields, medicines: [], charges: [], warnings: [], ...extra
});
const document = (...pages: DocumentPage[]): DocumentAnalysis => ({ version: 1, pages });
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('source-linked document overview', () => {
  it('counts every page, type, row group and warning without interpreting medicines or money', () => {
    const overview = buildDocumentOverview(document(
      page([field('Người bệnh', 'Người mẫu A', { unclear: true })], {
        kind: 'receipt', warnings: ['Chữ mờ'],
        medicines: [{ name: 'Mẫu', ingredients: '', dose: '', frequency: '', instructions: '', quantity: '10 viên', evidence: '', unclear: true }],
        charges: [{ label: 'Khoản mẫu', amount: '1.250.000', currency: 'VND', quantity: '2', unitPrice: '', evidence: '', unclear: false }]
      }),
      page([field('Ngày khám', '01/09/2026')], { page: 2, kind: 'clinical' }),
      page([], { page: 3, kind: 'receipt', warnings: ['Cần xem bản gốc'] })
    ));
    expect(overview.pageCount).toBe(3);
    expect(overview.documentTypes).toEqual([
      { kind: 'receipt', label: DOCUMENT_TYPES.receipt, pageCount: 2 },
      { kind: 'clinical', label: DOCUMENT_TYPES.clinical, pageCount: 1 }
    ]);
    expect(overview.counts).toEqual({ fields: 2, medicines: 1, charges: 1, items: 4, unclear: 2, warnings: 2, needsReview: 2 });
    expect(overview.reviewRefs).toEqual([
      { page: 1, group: 'fields', rowIndex: 0 }, { page: 1, group: 'medicines', rowIndex: 0 }
    ]);
    expect(overview.highlights.map(row => row.category)).toEqual(['patient', 'date']);
    expect(overview).not.toHaveProperty('totalAmount');
    expect(overview).not.toHaveProperty('recommendedDose');
  });

  it.each(Object.entries(DOCUMENT_TYPES))('uses the existing label for %s', (kind, label) => {
    expect(buildDocumentOverview(document(page([], { kind }))).documentTypes).toEqual([{ kind, label, pageCount: 1 }]);
  });

  it('copies only explicitly labelled essentials, preserving negation, newlines and source evidence', () => {
    const entries = [
      field('HỌ VÀ TÊN NGƯỜI BỆNH:', 'Người mẫu A'), field('Mã bệnh nhân', '00123'),
      field('Ngày khám', '01/09/2026 09:15'), field('Nơi khám', 'Phòng khám mẫu'),
      field('Kết luận', 'Không ghi nhận bất thường.\nĐối chiếu bản gốc.', { evidence: 'Dòng 1\nDòng 2' }),
      field('Lời dặn', 'Không tự đổi thuốc.\nHẹn theo giấy.', { context: 'Trang cuối', unclear: true }),
      field('Bác sĩ', 'Bác sĩ mẫu'), field('Tên người thân', 'Người mẫu B'), field('Tên', 'Không rõ chủ thể'),
      field('Người bệnh', '   '), field('Chỉ số', '5.2')
    ];
    const overview = buildDocumentOverview(document(page(entries, { page: 2, pdfText: 'Không dùng chữ toàn trang để suy diễn dữ liệu.' })));
    expect(overview.highlightCount).toBe(6);
    expect(overview.highlights.map(row => row.category)).toEqual(['patient', 'patient-id', 'date', 'facility', 'conclusion', 'instructions']);
    overview.highlights.forEach((row, rowIndex) => {
      expect(row).toMatchObject(entries[rowIndex]);
      expect(row.ref).toEqual({ page: 2, group: 'fields', rowIndex });
    });
    expect(overview.highlights[4].value).toBe(entries[4].value);
    expect(overview.highlights[5].context).toBe('Trang cuối');
    expect(overview.differences).toEqual([]);
    expect(overview.requiresSourceReview).toBe(true);
  });

  it('compares patient identities without conflating accent differences, leading zeros or separate rows', () => {
    const overview = buildDocumentOverview(document(
      page([field('Họ tên', 'Đỗ Mẫu'), field('Mã bệnh nhân', '001')]),
      page([field('Người bệnh', 'Do Mẫu'), field('Mã người bệnh', '1')], { page: 2 }),
      page([field('Tên bệnh nhân', 'Đỗ Mẫu')], { page: 3 })
    ));
    expect(overview.differences.map(row => row.kind)).toEqual(['patient-names', 'patient-ids']);
    expect(overview.differences[0].entries.map(row => row.value)).toEqual(['Đỗ Mẫu', 'Do Mẫu', 'Đỗ Mẫu']);
    expect(overview.differences[0].entries.map(row => row.ref.page)).toEqual([1, 2, 3]);
    expect(overview.counts.needsReview).toBe(5);
    expect(overview.differences[1].entries.map(row => row.value)).toEqual(['001', '1']);
  });

  it('ignores harmless name case/spacing differences but preserves their exact displayed values', () => {
    const overview = buildDocumentOverview(document(page([
      field('Họ tên', 'ĐỖ  MẪU'), field('Người bệnh', ' đỗ mẫu '),
      field('Bác sĩ', 'Bác sĩ A'), field('Bác sĩ', 'Bác sĩ B'),
      field('Mã hồ sơ', '100'), field('Mã hồ sơ', '200'),
      field('Số hóa đơn', '001'), field('Số hóa đơn', '002')
    ])));
    expect(overview.differences).toEqual([]);
    expect(overview.highlights.map(row => row.value)).toEqual(['ĐỖ  MẪU', ' đỗ mẫu ']);
    expect(overview.requiresSourceReview).toBe(true);
  });

  it('retains both PDF and edited versions; unclear=false is never approval', () => {
    const source = field('Ngày khám', '01/09/2026', { pdfValue: '07/09/2026', pdfEvidence: 'Ngày khám 07/09/2026', unclear: false });
    const overview = buildDocumentOverview(document(page([source])));
    expect(overview.differences[0]).toMatchObject({ kind: 'pdf-mismatch', entries: [source] });
    expect(overview.counts).toMatchObject({ unclear: 0, needsReview: 1 });
    expect(overview.requiresSourceReview).toBe(true);
    expect(overview).not.toHaveProperty('confirmed');
    expect(overview).not.toHaveProperty('clinicianVerified');
  });

  it('detects a cleared draft value and does not silently normalize a PDF discrepancy', () => {
    const overview = buildDocumentOverview(document(page([
      field('Kết luận', '', { pdfValue: 'Chép từ PDF', pdfEvidence: 'Kết luận: Chép từ PDF' }),
      field('Ngày khám', '01/09/2026 ', { pdfValue: '01/09/2026', pdfEvidence: 'Ngày khám: 01/09/2026' })
    ])));
    expect(overview.differenceCount).toBe(2);
    expect(overview.highlights).toHaveLength(1);
    expect(overview.differences[0].entries[0].value).toBe('');
    expect(overview.differences[0].entries[0].pdfValue).toBe('Chép từ PDF');
  });

  it.each([
    [field('CRL', '45,6', { unit: 'mm' }), field('CRL', '4,56', { unit: 'cm' })],
    [field('CRL', '45.6', { unit: 'mm' }), field('CRL', '45,6', { unit: 'mm' })],
    [field('Chỉ số mẫu', '1', { unit: 'mIU/L' }), field('Chỉ số mẫu', '1', { unit: 'MIU/L' })],
    [field('Nhịp tim', '150', { context: 'Thai A' }), field('Nhịp tim', '150', { context: 'Thai B' })],
    [field('Đường huyết', '5.2', { context: 'Lúc đói' }), field('Đường huyết', '5.2', { context: 'Sau ăn 2 giờ' })],
    [field('Cân nặng', '55', { context: '01/09 08:00' }), field('Cân nặng', '56', { context: '02/09 08:00' })]
  ])('keeps numeric variants separate without conversion or clinical interpretation (%#)', (first, second) => {
    const overview = buildDocumentOverview(document(page([first]), page([second], { page: 2 })));
    expect(overview.differenceCount).toBe(1);
    expect(overview.differences[0].kind).toBe('measurement-variants');
    expect(overview.differences[0].entries).toMatchObject([first, second]);
    expect(overview.differences[0].entries.map(row => row.ref)).toEqual([
      { page: 1, group: 'fields', rowIndex: 0 }, { page: 2, group: 'fields', rowIndex: 0 }
    ]);
    expect(overview.differences[0].label).toContain('giữ riêng từng dòng');
    expect(overview.counts.needsReview).toBe(2);
  });

  it('does not confuse different measurements, dates or textual findings with numeric conflicts', () => {
    const overview = buildDocumentOverview(document(page([
      field('BPD', '20'), field('HC', '50'), field('BPD', '20'),
      field('Ngày khám', '01/09/2026'), field('Ngày khám', '02/09/2026'),
      field('Kết luận', 'Thai 1'), field('Kết luận', 'Thai 2'),
      field('Ghi chú', 'Chữ một'), field('Ghi chú', 'Chữ hai')
    ])));
    expect(overview.differences).toEqual([]);
    expect(overview.counts.needsReview).toBe(0);
    expect(overview.requiresSourceReview).toBe(true);
  });

  it('does not exclude a measurement just because its label begins with Số lượng', () => {
    const overview = buildDocumentOverview(document(page([
      field('Số lượng hồng cầu', '4.5', { unit: 'T/L' }), field('Số lượng hồng cầu', '4.8', { unit: 'T/L' }),
      field('Số phiếu', '123'), field('Số phiếu', '456'),
      field('Invoice number', '123'), field('Invoice number', '456')
    ])));
    expect(overview.differenceCount).toBe(1);
    expect(overview.differences[0].entries.map(row => row.value)).toEqual(['4.5', '4.8']);
    expect(overview.counts.needsReview).toBe(2);
  });

  it('counts a row once when unclear, identity and PDF differences all point to it', () => {
    const overview = buildDocumentOverview(document(page([
      field('Họ tên', 'Người A', { unclear: true, pdfValue: 'Người B', pdfEvidence: 'Họ tên Người B' }),
      field('Họ tên', 'Người C', { unclear: true })
    ])));
    expect(overview.differenceCount).toBe(2);
    expect(overview.counts).toMatchObject({ unclear: 2, needsReview: 2 });
    expect(overview.reviewRefs).toHaveLength(2);
  });

  it('caps visible highlights and differences but preserves totals and every flagged row reference', () => {
    const count = DOCUMENT_OVERVIEW_LIMITS.highlights + DOCUMENT_OVERVIEW_LIMITS.differences + 1;
    const overview = buildDocumentOverview(document(page(Array.from({ length: count }, (_, index) =>
      field('Ngày khám', `Ngày ${index}`, { pdfValue: `Ngày gốc ${index}`, pdfEvidence: `Nguồn ${index}` })
    ))));
    expect(overview.highlights).toHaveLength(DOCUMENT_OVERVIEW_LIMITS.highlights);
    expect(overview.highlightCount).toBe(count);
    expect(overview.hiddenHighlightCount).toBe(count - DOCUMENT_OVERVIEW_LIMITS.highlights);
    expect(overview.differences).toHaveLength(DOCUMENT_OVERVIEW_LIMITS.differences);
    expect(overview.differenceCount).toBe(count);
    expect(overview.hiddenDifferenceCount).toBe(count - DOCUMENT_OVERVIEW_LIMITS.differences);
    expect(overview.counts.needsReview).toBe(count);
    expect(overview.reviewRefs.at(-1)).toEqual({ page: 1, group: 'fields', rowIndex: count - 1 });
  });

  it('never truncates or drops later-page evidence inside a displayed difference', () => {
    const overview = buildDocumentOverview(document(...Array.from({ length: 6 }, (_, index) =>
      page(Array.from({ length: 10 }, (_, rowIndex) => field('Họ tên', `Người ${index} ${rowIndex}`)), { page: index + 1 })
    )));
    expect(overview.differences[0].kind).toBe('patient-names');
    expect(overview.differences[0].entries).toHaveLength(60);
    expect(overview.counts.needsReview).toBe(60);
    expect(overview.differences[0].entries.at(-1)?.ref).toEqual({ page: 6, group: 'fields', rowIndex: 9 });
  });

  it('is pure, does not leak input object references and recalculates after draft edits', () => {
    const input = document(page([field('Họ tên', 'Người A'), field('Họ tên', 'Người B')]));
    const frozen = deepFreeze(structuredClone(input));
    const overview = buildDocumentOverview(frozen);
    expect(frozen).toEqual(input);
    overview.highlights[0].value = 'Sửa output';
    overview.differences[0].entries[0].value = 'Sửa khác';
    overview.reviewRefs[0].page = 99;
    expect(frozen).toEqual(input);
    const edited = structuredClone(input);
    edited.pages[0].fields[1].value = 'Người A';
    expect(buildDocumentOverview(edited).differenceCount).toBe(0);
    expect(buildDocumentOverview(input).differenceCount).toBe(1);
  });
});
