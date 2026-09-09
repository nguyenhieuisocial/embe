/** Public product notes only. Never put family names, record values or document IDs here. */
export const APP_UPDATES = [
  { id: '2026-09-09-medication-intake', date: '2026-09-09', title: 'Tích thuốc đã dùng ngay trong checklist', items: [
    { title: 'Không còn bị chặn bởi trạng thái xác nhận', description: 'Thuốc đang theo dõi đều có nút tích từng lần đã dùng. Trạng thái đồng bộ giữa Hôm nay, checklist và Thuốc; chỉ báo thành công sau khi lưu. Giữ nguyên liều, lời dặn và xác nhận chuyên môn.', href: '/me-bau#viec-hom-nay', action: 'Mở checklist' },
  ] },
  { id: '2026-09-09-dose-checklist', date: '2026-09-09', title: 'Thuốc tự có trong checklist hôm nay', items: [
    { title: 'Không cần tạo việc uống thuốc bằng tay', description: 'Checklist Mẹ bầu lấy từng thuốc, liều và giờ từ lịch đang dùng, chung trạng thái với Hôm nay và trang Thuốc. Bỏ ô tích chung; mỗi lần uống được ghi riêng sau khi lưu thành công.', href: '/me-bau#viec-hom-nay', action: 'Mở checklist' },
  ] },
  { id: '2026-09-09-today-workspace', date: '2026-09-09', title: 'Hôm nay gọn hơn, dễ dùng hơn', items: [
    { title: 'Giai đoạn hiện tại và ghi nhanh ở đầu trang', description: 'Mở ngay bữa ăn, sức khỏe, thuốc và giấy tờ. Việc cần nhớ ưu tiên lịch khám, không để việc nhà quá hạn chiếm hết chỗ.', href: '/', action: 'Mở Hôm nay' },
    { title: 'Lịch thuốc dễ nhìn theo giờ', description: 'Giữ đủ các lần uống, liều và trạng thái. Cách dùng và công dụng mở khi cần; tích đã uống chỉ thành công sau khi lưu được.', href: '/', action: 'Xem lịch hôm nay' },
  ] },
  { id: '2026-09-09-mobile-design', date: '2026-09-09', title: 'Giao diện gọn hơn, thao tác rõ hơn', items: [
    { title: 'Đồng nhất chữ, nút và ô nhập', description: 'Chữ dễ đọc, vùng chạm rộng; ăn uống và kỷ niệm có màu phân nhóm. Hồ sơ bớt khung lồng nhau, giữ thông tin và nguồn trong các mục mở rộng.', href: '/me-bau/ho-so', action: 'Xem hồ sơ' },
    { title: 'Thuốc có lối vào riêng', description: 'Mở Thuốc & vi chất trực tiếp, không cần đi qua kết nối iPhone. Phân biệt thuốc đã lưu với lịch đủ điều kiện ghi nhận; nút đánh dấu khác rõ trạng thái đã uống.', href: '/me-bau/thuoc', action: 'Mở Thuốc' },
    { title: 'Kế hoạch dễ theo dõi', description: 'Việc trong ngày ở trước kế hoạch dài hạn. Sửa lỗi hiển thị tên thứ không khớp giữa máy chủ và trình duyệt.', href: '/ke-hoach', action: 'Xem kế hoạch' },
    { title: 'Album nhẹ hơn, nhật ký bớt thao tác', description: 'Mỗi album dùng một ảnh bìa lớn. Nhật ký nhớ người ghi trên thiết bị, vẫn đổi được khi cần. Khi tải thuốc lỗi, có nút thử lại thay vì báo lịch trống.', href: '/ky-niem', action: 'Xem kỷ niệm' },
  ] },
  { id: '2026-09-08-health-sync', date: '2026-09-08', title: 'Cập nhật hồ sơ và thuốc ngay sau khi lưu', items: [
    { title: 'Bớt chờ dữ liệu giữa các màn', description: 'Thêm giấy tờ, nhập bản đọc, lưu hoặc xóa hồ sơ và ghi thuốc sẽ báo các màn/tab đang mở cập nhật ngay, kể cả khi service worker chưa tiếp quản. Giữ bản nháp đang nhập; không tự kích hoạt thuốc hoặc xác nhận dữ liệu chưa rõ.', href: '/me-bau/ho-so', action: 'Mở hồ sơ' },
  ] },
  { id: '2026-09-08-health-workspace', date: '2026-09-08', title: 'Hồ sơ gọn theo việc cần làm', items: [
    { title: 'Tổng quan, giấy tờ và lịch khám tách riêng', description: 'Chuyển nhanh giữa ba mục, giữ nội dung đang nhập và mở đúng mục từ liên kết hồ sơ. Đồng nhất thêm tiêu đề ở Nhật ký, Mẹ, Bé; bỏ nút quay lại trùng và bổ sung đường về Cài đặt từ trang Cập nhật.', href: '/me-bau/ho-so', action: 'Mở hồ sơ' },
  ] },
  { id: '2026-09-08-reading-summary', date: '2026-09-08', title: 'Hồ sơ hiện đủ thông tin đã đọc', items: [
    { title: 'Thuốc, kết quả và lời dặn có ngay trong tổng quan', description: 'Tổng quan lấy cùng dữ liệu với danh sách hồ sơ, không tải lại từng bản đọc. Có thuốc, liều, cách dùng, kết quả và nguồn từng trang kể cả trước khi nhập chỉ số theo dõi. Tách rõ bản đọc chưa xác minh; không tự kích hoạt thuốc hay đánh dấu đã uống.', href: '/me-bau/ho-so', action: 'Xem hồ sơ' },
  ] },
  { id: '2026-09-08-pregnancy-summary', date: '2026-09-08', title: 'Tóm tắt thai kỳ từ hồ sơ', items: [
    { title: 'Xem tổng hợp ngay đầu Hồ sơ', description: 'Lần khám gần nhất, lịch sắp tới, kết luận và lời dặn trích từ giấy tờ, chỉ số đã lưu cùng lần trước, thuốc trong hồ sơ và tình trạng đồng bộ. Có nguồn cho từng mục; không tự kết luận sức khỏe bình thường hoặc coi đơn cũ là đang dùng.', href: '/me-bau/ho-so', action: 'Xem tóm tắt' },
  ] },
  { id: '2026-09-08-prescription-frequency', date: '2026-09-08', title: 'Bớt nhập lại cách dùng thuốc', items: [
    { title: 'Điền sẵn số lần từ đơn đã lưu', description: 'Khi chọn thuốc từ hồ sơ, cách dùng ghi rõ như “2 lần/ngày” sẽ điền sẵn số lần. Không suy ra từ số viên, không tự chọn giờ nhắc hoặc biến thuốc dùng khi cần thành lịch uống cố định.', href: '/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc', action: 'Mở Thuốc' },
  ] },
  { id: '2026-09-08-reuse-prescription', date: '2026-09-08', title: 'Dùng lại đơn thuốc đã lưu', items: [
    { title: 'Không phải chụp hoặc nhập lại đơn', description: 'Mục Thuốc có Lấy từ hồ sơ đã lưu: chọn thuốc để điền sẵn tên, liều và cách dùng từ hồ sơ hoặc bản đọc. Không nhận diện lại, không tự kích hoạt đơn cũ. Chọn số lần, giờ nhắc và kiểm tra phần bản đọc chưa chắc trước khi lưu lịch.', href: '/me-bau/suc-khoe-iphone?quick=medication#vi-chat-thuoc', action: 'Mở Thuốc' },
  ] },
  { id: '2026-09-08-semantic-groups', date: '2026-09-08', title: 'Gom thông tin hồ sơ gọn hơn', items: [
    { title: 'Nhận biết nhãn đồng nghĩa', description: 'Gom dòng cùng giá trị và ngữ cảnh trên cùng trang dù nhãn khác nhau, như Họ tên / Tên bệnh nhân hoặc Hb / Hemoglobin. Giữ nguồn đối chiếu; không gộp các lần khám, đơn vị, liều thuốc hay khoản thu khác nhau. Thêm phân nhóm cách dùng thuốc và chỉ số xét nghiệm.', href: '/me-bau/ho-so', action: 'Xem hồ sơ' },
  ] },
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
