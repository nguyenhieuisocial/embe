/** Public product notes only. Never put family names, record values or document IDs here. */
export const APP_UPDATES = [
  { id: '2026-09-08-auto-import', date: '2026-09-08', title: 'Bớt xác nhận lặp khi nhập hồ sơ', items: [
    { title: 'Tự khớp bản đã đối chiếu', description: 'Khi mở bản đọc đã xác nhận, EmBe tự thêm dữ liệu nếu khớp đúng Mẹ, rõ ngày và không mâu thuẫn. Không cần xác nhận thêm lần nữa. Bản chưa đối chiếu hoặc chưa rõ vẫn được giữ riêng, không tự ghi đè số đo hay thuốc.', href: '/me-bau/ho-so', action: 'Mở hồ sơ' },
  ] },
  { id: '2026-09-08-medical-fields', date: '2026-09-08', title: 'Bổ sung chỉ số và khớp dữ liệu hồ sơ', items: [
    { title: 'Thêm 12 chỉ số khám và xét nghiệm', description: 'Bổ sung chiều cao Mẹ, mạch, nhiệt độ, SpO₂, nhịp thở, WBC, RBC, HCT, MCV, MCH, creatinine và urê. Có ô nhập, lịch sử và quy tắc khớp từ bản đọc đúng đơn vị. Dữ liệu chưa rõ hoặc mâu thuẫn không được tự đưa vào biểu đồ.', href: '/me-bau/ho-so', action: 'Mở hồ sơ y tế' },
    { title: 'Đọc được thêm định dạng ngày trên giấy tờ', description: 'Nhận ngày viết bằng chữ, có tiền tố địa điểm như “TP. HCM, ngày … tháng … năm …”, và nhãn ngày lập phiếu / ngày thực hiện. Không lấy ngày sinh hay ngày tái khám làm ngày của lần khám.', href: '/me-bau/ho-so', action: 'Xem giấy tờ' },
  ] },
  { id: '2026-09-08-today-medicines', date: '2026-09-08', title: 'Lịch thuốc đầy đủ trên Hôm nay', items: [
    { title: 'Xem từng thuốc và từng giờ uống', description: 'Hôm nay hiển thị toàn bộ lần dùng của các thuốc đang theo dõi, liều đã lưu và trạng thái đã uống / bỏ qua / hoãn. Lần dùng chưa đặt giờ vẫn được liệt kê riêng. Không tự đặt liều hoặc giờ từ ảnh đơn thuốc.', href: '/', action: 'Mở Hôm nay' },
  ] },
  { id: '2026-09-08-update-details', date: '2026-09-08', title: 'Thông báo cập nhật rõ nội dung', items: [
    { title: 'Xem cụ thể EmBe vừa thay đổi gì', description: 'Banner phiên bản mới có mô tả ngắn và liên kết Có gì mới. Lịch sử cập nhật luôn mở lại được trong Cài đặt.', href: '/cai-dat', action: 'Mở Cài đặt' },
  ] },
  { id: '2026-09-08-maternal-profile', date: '2026-09-08', title: 'Hồ sơ Mẹ & dữ liệu giấy tờ', items: [
    { title: 'Thêm 29 trường hồ sơ Mẹ', description: 'Bổ sung tiền sử sản khoa, thông tin hỗ trợ sinh sản và kế hoạch chăm sóc–chuẩn bị sinh. Các nhóm mặc định thu gọn, lưu được lịch sử chỉnh sửa.', href: '/nha-minh/ho-so?role=mother', action: 'Mở hồ sơ Mẹ' },
    { title: 'Tổng hợp giấy tờ thành 7 nhóm', description: 'Xem người khám, lịch hẹn, kết luận, chỉ số, thuốc, chi phí và thông tin khác cùng nguồn tài liệu. Chưa đọc xong hoặc tải lỗi được báo riêng; không cần tải ảnh gốc để xem tổng hợp.', href: '/nha-minh/ho-so?role=mother', action: 'Xem tổng hợp' },
    { title: 'Tự khớp dữ liệu có kiểm soát', description: 'Khi mở hồ sơ Mẹ, EmBe thử thêm dữ liệu rõ ràng từ bản đọc đã đối chiếu và đúng họ tên vào trường chưa từng nhập. Không ghi đè dữ liệu đã sửa hoặc xóa. Giá trị mâu thuẫn không được tự chọn; nguồn chưa đủ điều kiện chưa được tự điền.', href: '/nha-minh/ho-so?role=mother', action: 'Xem trạng thái tự khớp' },
  ] },
  { id: '2026-09-08-medical-view', date: '2026-09-08', title: 'Xem hồ sơ và ảnh gốc thuận tiện hơn', items: [
    { title: 'Thông tin trước, ảnh gốc khi cần', description: 'Mở tài liệu để xem thông tin và tổng hợp trước. Xem ảnh gốc hoặc PDF là thao tác riêng; máy chủ truyền ảnh trực tiếp thay vì chờ tải toàn bộ rồi mới trả về.', href: '/me-bau/ho-so', action: 'Mở hồ sơ thai kỳ' },
  ] },
] as const;
export const LATEST_APP_UPDATE = { id: APP_UPDATES[0].id, title: APP_UPDATES[0].title, summary: APP_UPDATES[0].items[0].description };
