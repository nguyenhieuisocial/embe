# Bản đầu đã chạy — 07/09/2026

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
- Chưa có TTS/nhạc, tài khoản đăng bài, lịch đăng, giao diện Studio trong EmBe hoặc backup ngoài máy cho campaign.
- Worker/API không được cài tự chạy, không đổi Docker, không đọc Supabase, Immich hoặc ảnh từ `C:\Anh`.
- Giá trị hiện có: bộ nội dung có nguồn, artwork gốc, bản dựng xem thử và pipeline tái lập; không phải chứng nhận an toàn y khoa hay sản phẩm truyền thông production hoàn chỉnh.
