# EmBe — kế hoạch hoàn thiện hành trình Mẹ và Bé

## Mục tiêu

Hoàn thiện EmBe cho đúng hai người dùng là Mẹ Ngân và Ba Hiếu, ưu tiên iPhone,
không mở đăng ký công khai và không biến ứng dụng thành công cụ chẩn đoán. Mỗi
đợt phải tạo ra một luồng dùng được trọn vẹn, có dữ liệu bền vững, trạng thái
lưu rõ ràng và kiểm thử trước khi triển khai lên `main`.

## Nguyên tắc trải nghiệm

- Màn hình Hôm nay chỉ đưa tối đa ba việc thật sự đáng chú ý lên đầu.
- Các thao tác thường dùng hoàn tất trong tối đa ba lần chạm và vùng chạm tối
  thiểu 44 px.
- Nội dung theo đúng giai đoạn: mang thai, chuẩn bị sinh, sau sinh, chăm bé.
- Thông tin y tế chỉ tóm tắt dữ liệu đã nhập; không kết luận, kê thuốc hoặc đặt
  ngưỡng “bình thường” thay cho bác sĩ.
- Giao diện nhẹ, nữ tính, ít chữ, không dùng các khối lớn lặp lại; chi tiết ít
  dùng đặt trong disclosure hoặc trang con.

## Đợt 1 — Nền tảng chăm Mẹ

1. Tạo hồ sơ thai kỳ đầy đủ: ngày dự sinh/LMP, thai đơn hay đa thai, nhóm máu và
   Rh nếu gia đình biết, dị ứng, tiền sử cần nhắc, bác sĩ/cơ sở khám, người liên
   hệ khẩn.
2. Tạo snapshot “Hôm nay” ở server, hợp nhất việc đến hạn, lịch khám, thuốc/vi
   chất đến giờ, check-in sức khỏe và đồ dùng sắp hết.
3. Hiển thị tối đa ba ưu tiên với một hành động rõ ràng cho từng mục; không để
   lỗi một nguồn làm trắng toàn trang.
4. Tạo trang hồ sơ gọn trên mobile, có trạng thái lưu và xem lại thông tin đã
   lưu.

**Hoàn tất khi:** migration/RLS/index đạt; API validate dữ liệu; unit test, mobile
shell, typecheck và build đạt; bản production hiển thị đúng trên iPhone.

## Đợt 2 — Triệu chứng và sức khỏe tinh thần

1. Nhật ký triệu chứng có thời điểm, mức độ, ghi chú, trạng thái đang theo dõi/
   đã hết và lịch sử.
2. Khi chọn dấu hiệu khẩn, hiển thị ngay hành động gọi người thân/cơ sở y tế;
   không chỉ lưu thụ động.
3. Check-in cảm xúc trước sinh, xu hướng theo tuần và bộ câu hỏi sàng lọc chỉ khi
   người dùng chủ động mở; mọi kết quả đều dẫn về trao đổi chuyên môn.

## Đợt 3 — Hành trình theo tuần và lịch khám

1. Nội dung theo tuần thai dựa trên nguồn chính thức, ngắn và có nguồn.
2. Mỗi lần khám có câu hỏi chuẩn bị, hồ sơ đính kèm, kết quả, việc cần theo dõi
   và lần hẹn kế tiếp.
3. Hỗ trợ sửa, lưu lịch sử và liên kết lịch khám với Kế hoạch/Lịch.

## Đợt 4 — Thuốc, sức khỏe iPhone và dinh dưỡng

1. Thuốc/vi chất có sửa, tạm dừng, ngày bắt đầu/kết thúc, nhắc lịch, lý do bỏ lỡ
   và lịch sử dùng; không tự gợi ý liều.
2. Làm luồng Apple Health Shortcut dễ hiểu, có chẩn đoán kết nối, đồng bộ lại,
   thời điểm từng chỉ số và nhập tay khi không có dữ liệu.
3. Bữa ăn hỗ trợ ảnh hoặc chỉ ghi chú, xác nhận món nhận diện, lịch sử đầy đủ và
   tóm tắt theo dữ liệu đã ghi.

## Đợt 5 — Tài khoản và quyền kiểm soát dữ liệu

1. Passkey/Face ID cho từng thiết bị; mật khẩu gia đình chỉ là dự phòng.
2. Giới hạn thử sai, quản lý phiên đăng nhập và đăng xuất toàn bộ.
3. Xuất toàn bộ dữ liệu, audit trail, thùng rác và khôi phục thao tác xóa nhầm.
4. Backup Supabase mã hóa độc lập và restore drill.

## Đợt 6 — Sinh, sau sinh và em bé

1. Chuyển giai đoạn chủ động, chuẩn bị sinh và liên hệ nhanh.
2. Theo dõi phục hồi của Mẹ, chăm Bé, hồ sơ khám/tiêm và mốc phát triển.
3. Biểu đồ tăng trưởng dùng WHO như tham chiếu, lưu version nguồn và luôn ghi rõ
   đây không phải chẩn đoán.

## Cổng phát hành

- Không đưa dữ liệu thật vào Telegram Storage PoC.
- Không làm lộ khóa Supabase, locator Immich, Telegram session hoặc dữ liệu sức
  khỏe cho analytics/cache công khai.
- Test, typecheck, build, migration check, mobile shell và smoke production đều
  phải đạt trước khi công nhận hoàn tất.
