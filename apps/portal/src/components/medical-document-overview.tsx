import { withPrintedUnit } from '../lib/medical-document-scan';
import type { DocumentOverview, DocumentOverviewRef, DocumentOverviewField } from '../lib/medical-document-overview';

export const documentSourceKey = (ref: DocumentOverviewRef) => `${ref.page}:${ref.group}:${ref.rowIndex}`;

/** Read-only navigation into the current draft. No clinical inference or automatic import. */
export default function MedicalDocumentOverview({ overview, onSource }: {
  overview: DocumentOverview;
  onSource: (ref: DocumentOverviewRef) => void;
}) {
  const source = (entry: DocumentOverviewField, showPdf = false) => <div className="document-overview-entry" key={documentSourceKey(entry.ref)}>
    <div><span>{entry.label}</span><p>{withPrintedUnit(entry.value, entry.unit) || 'Chưa đọc rõ'}</p>
      {entry.context ? <small>{entry.context}</small> : null}
      {showPdf ? <small>Chữ từ PDF: {entry.pdfValue || 'Chưa đọc rõ'}</small> : null}
    </div>
    <button type="button" aria-label={`Đối chiếu ${entry.label} · trang ${entry.ref.page}`} onClick={() => onSource(entry.ref)}>Trang {entry.ref.page} ↗</button>
  </div>;
  return <section className="document-overview" aria-label="Tổng quan tài liệu">
    <h2>Tổng quan tài liệu</h2>
    <p className="document-overview-meta">{overview.pageCount} trang · {overview.counts.fields} thông tin · {overview.counts.medicines} thuốc · {overview.counts.charges} khoản thu</p>
    <p className="document-overview-types">{overview.documentTypes.map(type => `${type.label} (${type.pageCount})`).join(' · ')}</p>
    {overview.differenceCount > 0 ? <details className="document-overview-differences">
      <summary>{overview.differenceCount} điểm khác nhau cần đối chiếu</summary>
      <p>Có thể là lần khám, thời điểm hoặc người khác nhau. Không tự gộp hay chọn giá trị đúng.</p>
      {overview.differences.map((difference, index) => <div className="document-overview-difference" key={`${difference.kind}:${index}`}>
        <h3>{difference.label}</h3>
        {difference.entries.map(entry => source(entry, difference.kind === 'pdf-mismatch'))}
      </div>)}
      {overview.hiddenDifferenceCount > 0 ? <p>Còn {overview.hiddenDifferenceCount} điểm khác nhau. Dùng “Chỉ xem mục cần kiểm tra” bên dưới để xem các dòng liên quan.</p> : null}
    </details> : null}
    {overview.highlightCount > 0 ? <details>
      <summary>Thông tin chính trên các trang</summary>
      <p>Trích từ bản đọc đang xem, không phải kết luận mới. Chạm số trang để xem và sửa tại nguồn.</p>
      {overview.highlights.map(entry => source(entry))}
      {overview.hiddenHighlightCount > 0 ? <p>Còn {overview.hiddenHighlightCount} thông tin chính trong các trang bên dưới.</p> : null}
    </details> : null}
    <small className="document-overview-note">Số liệu, tên thuốc và kết luận vẫn cần đối chiếu bản gốc, kể cả khi chưa có cảnh báo.</small>
  </section>;
}
