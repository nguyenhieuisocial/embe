const guides = [
  { names: ['axit folic', 'acid folic', 'folic acid', 'vitamin b9'], purpose: 'Bổ sung folate; được dùng trong thai kỳ để hỗ trợ phát triển sớm của thai và trong điều trị thiếu folate.', caution: 'Liều bổ sung và liều điều trị có thể khác nhau. Không tự đổi sang liều cao.', source: 'https://www.nhs.uk/medicines/folic-acid/' },
  { names: ['vitamin d3', 'colecalciferol', 'cholecalciferol'], purpose: 'Giúp hấp thu canxi và phospho; dùng để phòng hoặc điều trị thiếu vitamin D.', caution: 'Không tự dùng liều điều trị cao hoặc cộng nhiều sản phẩm có vitamin D.', source: 'https://www.nhs.uk/medicines/colecalciferol/about-colecalciferol/' },
  { names: ['ferrous sulfate', 'ferrous sulphate'], purpose: 'Bổ sung sắt để phòng hoặc điều trị thiếu máu do thiếu sắt.', caution: 'Có thể gây buồn nôn, táo bón hoặc tiêu chảy. Hỏi dược sĩ về khoảng cách với thuốc khác, trà, cà phê và sữa.', source: 'https://www.nhs.uk/medicines/ferrous-sulfate/about-ferrous-sulfate/' },
];
export default function MedicationUseGuide({ name, dose, instructions, times }: { name: string; dose: string; instructions: string; times: string[] }) {
  // Exact ingredient only: never infer a combination product's formulation from a brand fragment.
  const guide = guides.find(g => g.names.includes(name.trim().toLowerCase()));
  return <details className="care-secondary-section"><summary>Công dụng, lưu ý & giờ nhắc</summary>
    <p><strong>Liều đã lưu:</strong> {dose || 'Chưa ghi liều; xem đơn hoặc hỏi người kê đơn.'}</p>
    <p><strong>Giờ đã đặt:</strong> {times.length ? times.map(t => t.slice(0, 5)).join(' · ') : 'Chưa đặt giờ nhắc.'}</p>
    {instructions ? <p><strong>Lời dặn đã lưu:</strong> {instructions}</p> : null}
    {guide ? <><p><strong>Công dụng chung:</strong> {guide.purpose}</p><p>{guide.caution}</p><a href={guide.source} target="_blank" rel="noreferrer">Nguồn thông tin thuốc · NHS</a></>
      : <p>Chưa có thông tin công dụng được xác minh cho đúng sản phẩm này. Cần đối chiếu hoạt chất, hàm lượng và dạng dùng trên hộp/đơn; không suy từ tên gần giống.</p>}
    <p>Thông tin chung không thay thế chỉ định riêng. Không tự tăng, giảm hoặc ngừng thuốc theo nội dung này.</p>
    <p>Giờ trong lịch chưa có nghĩa điện thoại đã nhận thông báo. Cần bật thông báo EmBe trên thiết bị.</p>
  </details>;
}
