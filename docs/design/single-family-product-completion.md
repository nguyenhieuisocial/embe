# EmBe — đặc tả hoàn thiện sản phẩm cho Hiếu và Ngân

**Phạm vi:** một gia đình, hai người dùng là Mẹ Ngân và Ba Hiếu. EmBe không mở
đăng ký công khai, không phục vụ nhiều gia đình và không thay thế tư vấn y tế.

## Mục tiêu

EmBe là web-app mobile-first dùng hằng ngày trên iPhone. Hai người chỉ cần nhớ
một địa chỉ và không phải học BabyBuddy, Memos, Grocy, Immich, Node-RED hay
Ollama. Các công cụ đó là nguồn dữ liệu hoặc worker phía sau, không quyết định
cấu trúc giao diện.

Một bản phát hành được xem là hoàn tất khi:

- Tác vụ thường dùng thực hiện được bằng một tay và không quá ba lần chạm.
- Từ Hôm nay có thể đi thẳng tới việc, lịch khám, ghi sức khỏe, bữa ăn hoặc kỷ
  niệm đang cần xử lý.
- Dữ liệu sức khỏe, nhật ký và ảnh không xuất hiện trong analytics, cache công
  khai hay URL của nhà cung cấp lưu trữ.
- Máy nhà hoặc một dịch vụ phụ tạm tắt không làm trang trắng và không làm mất
  nội dung đang nhập.
- iPhone 320–430 px, Android, iPad và desktop đều không tràn ngang; vùng chạm
  chính tối thiểu 44 px; bàn phím ảo không che nút hoàn tất.
- Test, typecheck, production build, mobile-shell gate và smoke test bản thật
  đều đạt.

## Kiến trúc thông tin

Thanh điều hướng chính có năm mục:

1. **Hôm nay** — ưu tiên hiện tại, tiến độ trong ngày và lối tắt theo ngữ cảnh.
2. **Kế hoạch** — to-do, lịch khám, nhắc việc và lịch âm/dương.
3. **Hành trình** — thai kỳ hiện tại; tự mở phần sau sinh khi gia đình chủ động
   chuyển giai đoạn.
4. **Kỷ niệm** — chụp nhanh, album theo folder, ngày tháng, chuyến đi và bản đồ.
5. **Nhà mình** — đồ dùng, trợ lý, hướng dẫn, kết nối ảnh và cài đặt riêng tư.

Nút **Làm nhanh** giữ các thao tác: thêm việc, ghi sức khỏe, chụp bữa ăn, chụp
ảnh và viết nhật ký. Không thêm một tác vụ vào hai vị trí nếu không giúp giảm
số lần chạm.

## Luồng chính

### Hôm nay

- Hiển thị tối đa ba ưu tiên: việc đến hạn, lịch khám gần nhất và checklist chăm
  Mẹ Ngân.
- Có tiến độ ngày, một kỷ niệm gần đây và trạng thái đồng bộ bằng ngôn ngữ đời
  thường.
- Nội dung sau sinh không xuất hiện trước khi gia đình chuyển giai đoạn.

### Hành trình thai kỳ

- Mặc định chỉ mở `Hôm nay`: tuần thai, checklist, ghi nhanh sức khỏe và bữa ăn.
- `Sức khỏe`, `Ăn uống`, `Cẩm nang` là các phần rõ ràng có deep link; không dồn
  toàn bộ nội dung dài lên màn hình đầu tiên.
- Biểu đồ chỉ thể hiện số do gia đình nhập, không tự đặt vùng bình thường và
  không chẩn đoán.
- Nhận diện món ăn luôn cần người dùng xác nhận; gợi ý dựa trên các bữa đã ghi,
  không suy diễn bữa chưa ghi là đã bỏ ăn.

### Kế hoạch và lịch

- Một việc có ngày, giờ tùy chọn, người thực hiện, lặp lại và liên kết tới đúng
  phần của EmBe.
- Lịch âm/dương hiển thị việc và kỷ niệm cùng ngày.
- Lịch khám được biểu diễn bằng task loại `appointment`; ghi chú dùng cho địa
  điểm và câu hỏi cần hỏi. Cho phép thêm sự kiện vào ứng dụng Calendar bằng tệp
  lịch tiêu chuẩn, không tự gửi lịch ra dịch vụ bên thứ ba.

### Kỷ niệm

- Folder trong `C:\Anh`/Immich là album gốc; EmBe không tự đổi cấu trúc album.
- Trình xem ảnh toàn màn hình hỗ trợ vuốt/chạm, safe area, tải ảnh phù hợp màn
  hình và trạng thái lỗi có thể thử lại.
- Chuyến đi và bản đồ chỉ dùng địa danh cấp thành phố/tỉnh; không đưa tọa độ hay
  EXIF chính xác lên Portal.

### Nhà mình

- Gom Đồ dùng, Trợ lý, Hướng dẫn và kết nối ảnh vào một nơi ít dùng hơn.
- Đồ dùng giữ bản xem gần nhất trên thiết bị để không thành trang trắng khi
  Grocy/máy nhà gián đoạn. Thay đổi chỉ báo thành công sau khi server chấp nhận.
- Trợ lý thai kỳ ưu tiên tóm tắt dữ liệu đã ghi và gợi ý câu hỏi cho lần khám;
  phần bú/ngủ/tã chỉ mở sau sinh.

## Dữ liệu và quyền riêng tư

- Giữ mô hình một session gia đình; không thêm multi-tenant hoặc đăng ký công
  khai.
- Trình duyệt chỉ gọi API cùng domain. Supabase service key, locator Immich,
  Telegram session, token và URL nhà cung cấp không xuất hiện ở client.
- GA4 chỉ được tải ở trang đăng nhập không chứa dữ liệu gia đình, hoặc được bỏ
  hẳn. Trang sau đăng nhập không gửi page view, chỉ số sức khỏe, tên ảnh, ngày
  dự sinh hoặc nội dung nhật ký cho analytics bên thứ ba.
- Telegram không là bản duy nhất của dữ liệu quan trọng và không chứa hồ sơ sức
  khỏe/danh tính ở dạng đọc được.

## Khả năng chịu lỗi

- Nhật ký giữ hàng chờ offline có giới hạn và tự gửi lại sau khi có mạng.
- Checklist và ngày dự sinh giữ bản cục bộ có đánh dấu chưa đồng bộ.
- Đồ dùng và timeline hiển thị snapshot gần nhất kèm thời điểm, không giả là dữ
  liệu mới.
- Upload ảnh/bữa ăn có retry rõ ràng; không báo đã lưu trước khi backend xác
  nhận.
- Service worker chỉ cache shell/tài nguyên công khai; không cache API, media,
  trang đăng nhập hoặc HTML riêng tư.

## Phạm vi triển khai

1. Điều hướng và trang Nhà mình.
2. Hành trình thai kỳ theo phần, deep link ổn định và ưu tiên hằng ngày.
3. Liên kết lịch khám–kế hoạch–lịch; xuất sự kiện Calendar.
4. Snapshot đồ dùng, trạng thái dịch vụ và ngôn ngữ lỗi dễ hiểu.
5. Kỷ niệm và trình xem ảnh trên iPhone.
6. Analytics riêng tư, PWA/offline, accessibility và performance.
7. Toàn bộ test, build, smoke bản thật và cập nhật hướng dẫn.

Ngoài phạm vi: mở đăng ký cho gia đình khác, thanh toán, chẩn đoán y tế, tự đặt
hàng, tự gửi dữ liệu cho bác sĩ, hoặc biến Telegram thành kho duy nhất.
