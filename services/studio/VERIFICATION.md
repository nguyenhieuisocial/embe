# Studio đã có trên web — 07/09/2026

## Kiểm tra trực tiếp trên tên miền chính

Đường dẫn: `https://embe.hieu.asia/studio`, đăng nhập bằng cơ chế gia đình hiện có. Có lối vào từ Hôm nay và Nhà mình. Bản ứng dụng kiểm tra: `b60a89fbf45542002a75f591cd75b218469694e9`.

- 8 kịch bản, 8 video, 22 ý tưởng hiện trên web; tìm kiếm không dấu và chuyển mục hoạt động.
- Cả 8 ảnh xem trước giải mã thành công; 8 video tải HTTP 200, kiểm tra SHA-256 khớp. Cả 8 hỗ trợ `Range: bytes=0-1` trả HTTP 206 đúng 2 byte; không redirect ra URL nhà cung cấp.
- Phát video và tua đến giây 15 trên trình duyệt thật đạt. Sao chép caption, tải kịch bản TXT, mở nguồn tham khảo đạt. Kiểm tra sao chép dùng clipboard giả trong trình duyệt cô lập, không ghi đè clipboard máy người dùng.
- Kiểm tra thư viện và trang chi tiết ở 375×667, 393×852, 430×932, 412×915, 768×1024 và 1280×900: không tràn ngang, không có control thuộc Studio thấp dưới 43px. Keyboard focus đạt. Ảnh chụp thư viện và chi tiết đã xem trực quan.
- API media chặn truy cập không đăng nhập; bucket `embe-studio-drafts` private, `storage.objects` bật RLS, không có policy public. Publisher đã kiểm tra checksum sau upload cho 16 object.
- Màn hình thiết lập quyền sức khỏe/vị trí không còn che Studio trên thiết bị mới; vẫn giữ cho trang chăm sóc sức khỏe.
- CI run `34117337888` đạt. Lượt kiểm tra web đăng nhập một phiên riêng, chỉ đọc nội dung và đăng xuất đúng phiên đó; không sửa dữ liệu sức khỏe hay tác động phiên của gia đình.

Bằng chứng cục bộ: `data/studio-web-verification/result.json`, `studio-iphone.png`, `studio-detail-iphone.png`. Script tái lập: `scripts/health/studio-live-smoke.mjs`. Dùng Cent Browser headless trong phiên cô lập với viewport mô phỏng; **chưa phải kiểm tra Safari/WebKit hoặc iPhone vật lý**. Không mở cửa sổ PowerShell, không khởi động lại Docker.

## Bản dựng nguồn trên máy

Campaign: `campaign-f6622f746066`, dưới `C:\EmBe\data\studio-editorial`. Không công khai, không dùng dữ liệu gia đình. 8 kịch bản, 22 ý tưởng nghiên cứu tiếp, 8 MP4 dựng thành công trong lần thử đầu tiên.

## Kết quả thực tế trên máy Windows hiện tại

| Chủ đề | Video | Frame | Dựng | Dung lượng |
| --- | ---: | ---: | ---: | ---: |
| Caffeine | 26 giây | 780 | 17,174 giây | 285.662 byte |
| Ốm nghén | 30 giây | 900 | 19,003 giây | 261.085 byte |
| Ăn cá | 32 giây | 960 | 20,448 giây | 312.969 byte |
| Bé ngủ an toàn | 28 giây | 840 | 18,661 giây | 252.137 byte |
| Giỏ đi sinh | 28 giây | 840 | 17,446 giây | 238.342 byte |
| Tinh thần của mẹ | 29 giây | 870 | 18,401 giây | 257.203 byte |
| Dấu hiệu cần trợ giúp | 31 giây | 930 | 21,592 giây | 256.506 byte |
| Vận động vừa sức | 27 giây | 810 | 18,729 giây | 245.173 byte |

Tất cả 1080×1920, 30 fps, H.264, **không có audio**. Đây là slideshow storyboard chữ/ảnh tĩnh, không phải video hoàn thiện với người dẫn, giọng đọc hoặc B-roll. Số đo trên một máy, một lượt chạy; không phải benchmark tải đồng thời hay cam kết tốc độ máy khác.

Đã giải mã toàn bộ 6.930 frame của cả 8 video: đủ frame, đúng kích thước, timestamp tăng đúng 1/30 giây. SHA-256 trùng báo cáo, MP4 faststart có `moov` trước `mdat`. Kiểm tra trực quan mẫu card tiếng Việt để phát hiện tràn chữ; không khẳng định đã xem trên iPhone thật.

## Kiểm tra phần mềm

`python -m pytest services/studio/tests -q`: **11 passed**, 1,12 giây trên Windows.

Phạm vi: idempotency/conflict, giới hạn queue, phục hồi job, khóa worker độc quyền, hủy không bị ghi đè, xác thực API và chặn request browser, giới hạn payload, từ chối locator tùy ý, checksum ảnh, dựng thật, tải `Range` 206, soft delete/GC, catalog quá hạn dừng biên dịch. `git diff --check` đạt. CI Linux được bổ sung riêng; kết quả tại GitHub Actions, không suy từ kết quả Windows.

## Không suy diễn thành đã hoàn tất phát hành

- Không có duyệt chuyên môn; tất cả card có nhãn bản nháp. Chủ đề vận động còn yêu cầu kiểm tra lại vì lịch review trên nguồn đã quá hạn.
- Không có đo retention, lượt chia sẻ hay bằng chứng viral. Mở đầu A/B mới là phương án biên tập, chưa chạy thử với người xem.
- Chưa có TTS/nhạc, tài khoản đăng bài, lịch đăng hay công cụ sửa/tạo video trực tiếp trên web. Giao diện xem/tải Studio đã lên web; 16 file đầu ra đã có bản trên Supabase private, không đồng nghĩa toàn bộ queue/campaign cục bộ có backup độc lập.
- Worker/API dựng video không được cài tự chạy, không đổi Docker, không đọc dữ liệu gia đình từ Supabase, Immich hoặc ảnh từ `C:\Anh`. Publisher chỉ ghi file biên tập vào bucket riêng.
- Giá trị hiện có: bộ nội dung có nguồn, artwork gốc, bản dựng xem thử và pipeline tái lập; không phải chứng nhận an toàn y khoa hay sản phẩm truyền thông production hoàn chỉnh.
