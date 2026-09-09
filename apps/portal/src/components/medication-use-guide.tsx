import type { ReactNode } from 'react';

const guides = [
  { names: ['duphaston', 'duphaston 10mg', 'duphaston 10 mg', 'dydrogesterone', 'dydrogesterone 10mg', 'dydrogesterone 10 mg'], purpose: 'Dydrogesterone là thuốc nội tiết có tác dụng tương tự progesterone, dùng theo chỉ định trong một số tình trạng liên quan đến hormone này.', caution: 'Không suy ra lý do kê riêng từ tên thuốc. Không tự thay bằng progesterone, đổi liều hoặc ngừng thuốc; hỏi nơi kê đơn nếu lời dặn chưa rõ.', source: 'https://assets.hpra.ie/products/Human/30031/4d7f0046-dc41-4d1b-97a4-f9c913fbdbce.pdf' },
  { names: ['utrogestan', 'utrogestan 200mg', 'utrogestan 200 mg', 'utrogestan vaginal 200mg', 'utrogestan vaginal 200 mg'], purpose: 'Chứa progesterone, hormone hỗ trợ niêm mạc tử cung. Một số dạng dùng được bác sĩ chỉ định hỗ trợ thai kỳ trong những tình huống cụ thể.', caution: 'Phải đối chiếu đúng dạng thuốc và đường dùng trên đơn/hộp. Nguồn dưới đây dành cho dạng đặt âm đạo tại Anh, không tự áp liều hoặc đường dùng đó cho thuốc của bạn. Không tự chuyển uống sang đặt hoặc ngược lại.', source: 'https://www.medicines.org.uk/emc/product/3244/pil' },
  { names: ['axit folic', 'acid folic', 'folic acid', 'vitamin b9'], purpose: 'Bổ sung folate; được dùng trong thai kỳ để hỗ trợ phát triển sớm của thai và trong điều trị thiếu folate.', caution: 'Liều bổ sung và liều điều trị có thể khác nhau. Không tự đổi sang liều cao.', source: 'https://www.nhs.uk/medicines/folic-acid/' },
  { names: ['vitamin d3', 'colecalciferol', 'cholecalciferol'], purpose: 'Giúp hấp thu canxi và phospho; dùng để phòng hoặc điều trị thiếu vitamin D.', caution: 'Không tự dùng liều điều trị cao hoặc cộng nhiều sản phẩm có vitamin D.', source: 'https://www.nhs.uk/medicines/colecalciferol/about-colecalciferol/' },
  { names: ['ferrous sulfate', 'ferrous sulphate'], purpose: 'Bổ sung sắt để phòng hoặc điều trị thiếu máu do thiếu sắt.', caution: 'Có thể gây buồn nôn, táo bón hoặc tiêu chảy. Hỏi dược sĩ về khoảng cách với thuốc khác, trà, cà phê và sữa.', source: 'https://www.nhs.uk/medicines/ferrous-sulfate/about-ferrous-sulfate/' },
];
export function medicationGuide(name: string) {
  return guides.find(g => g.names.includes(name.trim().replace(/\s+/g, ' ').toLowerCase()));
}
export function MedicationPurpose({name}: {name:string}) {
  const guide=medicationGuide(name);
  return <small className="medication-purpose">{guide ? guide.purpose : 'Công dụng: chưa khớp nguồn xác minh cho sản phẩm này.'}</small>;
}
export default function MedicationUseGuide({ name, dose, instructions, times, children, summaryLabel = 'Cách dùng & thông tin thuốc' }: { name: string; dose: string; instructions: string; times: string[]; children?: ReactNode; summaryLabel?: string }) {
  // Exact ingredient only: never infer a combination product's formulation from a brand fragment.
  const guide = medicationGuide(name);
  return <details className="care-secondary-section medication-guide"><summary>{summaryLabel} <span aria-hidden="true">⌄</span></summary>
    <p><strong>Liều đã lưu:</strong> {dose || 'Chưa ghi liều; xem đơn hoặc hỏi người kê đơn.'}</p>
    <p><strong>Giờ đã đặt:</strong> {times.length ? times.map(t => t.slice(0, 5)).join(' · ') : 'Chưa đặt giờ nhắc.'}</p>
    {instructions ? <p><strong>Lời dặn đã lưu:</strong> {instructions}</p> : null}
    {guide ? <><p><strong>Công dụng chung:</strong> {guide.purpose}</p><p>{guide.caution}</p><a href={guide.source} target="_blank" rel="noreferrer">Nguồn thông tin thuốc ↗</a></>
      : <p>Chưa có thông tin công dụng được xác minh cho đúng sản phẩm này. Cần đối chiếu hoạt chất, hàm lượng và dạng dùng trên hộp/đơn; không suy từ tên gần giống.</p>}
    <p>Thông tin chung không thay thế chỉ định riêng. Không tự tăng, giảm hoặc ngừng thuốc theo nội dung này.</p>
    <p>Giờ trong lịch chưa có nghĩa điện thoại đã nhận thông báo. Cần bật thông báo EmBe trên thiết bị.</p>
    {children}
  </details>;
}
