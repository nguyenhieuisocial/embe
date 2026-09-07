# Nghiên cứu Rednote và lựa chọn công cụ cho EmBe

Ngày: 07/09/2026. Bản đọc trong ứng dụng: `/studio/nghien-cuu`. Nội dung chọn lọc và link nguồn được quản lý một chỗ tại `apps/portal/src/content/studio-research.ts`.

## Phạm vi và cách kiểm tra

Đọc kênh `5837955482ec397a4e05478e` bằng đúng phiên Rednote người dùng đã kết nối trong trình duyệt Codex. Chỉ đọc giao diện và DOM đang hiển thị, cuộn danh sách công khai, chống trùng theo note ID; không gọi API ẩn, sao chép cookie hoặc truy cập mục Save riêng tư. Danh sách dùng cuộn ảo nên rà ngược để bù các thẻ bị bỏ khỏi DOM khi cuộn nhanh. Số đếm là bài đã thấy, không bảo đảm bài ẩn/xóa/bị giới hạn đều xuất hiện.

Đọc tiêu đề không đồng nghĩa xem đầy đủ nội dung. Hai bài mẫu được mở xem các ảnh đầu; số trang và phạm vi đã ghi trong `studio-rednote-review.md`. Không dịch/rehost toàn bộ kênh và không dùng nội dung tác giả làm cơ sở dữ liệu y khoa. Dữ liệu người bình luận/người theo dõi không nằm trong nghiên cứu.

Kết quả chỉ mục: 210 note ID duy nhất. Đã cuộn đến cuối giao diện (scrollHeight 54413 px, viewport 1538 px, scrollY 52874,67 px), rồi rà ngược từng hai màn hình về scrollY 0; tìm thêm 4 bài bị bỏ qua do virtual scrolling. Danh sách ID không kèm token hoặc nguyên văn bài ở `rednote-index-evidence.json`. Không coi đó là số toàn bộ bài tác giả từng đăng.

Mẫu bổ sung [lịch khám 2026](https://www.rednote.com/discovery/item/6a8cfdc7000000002b00129e): giao diện ghi 16 ảnh; đã đọc mô tả và ảnh đầu là bảng số lần khám / tuần thai / nội dung. Mô tả có quảng cáo bình sữa. Chỉ học cách tổ chức lịch, không sao chép lịch xét nghiệm hoặc kết luận hiệu quả sản phẩm.

GitHub được đối chiếu qua README, LICENSE, extractor và metadata repository tại thời điểm nghiên cứu. Repo 404 được ghi là không tìm thấy công khai ở địa chỉ đó, không suy ra chưa từng tồn tại. `pushed_at` chỉ là tín hiệu bảo trì, không chứng minh chất lượng hoặc an toàn. Không chạy mã crawler, tải media tác giả, mua proxy, gửi file lên AI khác hoặc tự đăng bài.

## Quyết định kiến trúc

Giữ SQLite và một worker hữu hạn của Studio, PyAV/FFmpeg, Pillow, Piper tiếng Việt. Không thêm Docker hay dịch vụ nền. PaddleOCR và faster-whisper là ứng viên cho đầu vào có quyền sử dụng, chưa cài/tích hợp. Nếu cần pipeline dịch độc lập, học cách chia bước của pyVideoTrans, không nhập nguyên GUI vào web.

Trước khi bổ sung nhập nội dung ngoài: phải có bản ghi nguồn (`source_id`, canonical URL, thời điểm quan sát, loại nội dung), phạm vi đã xem, quyền sử dụng và bằng chứng cấp phép; tách hoàn toàn ảnh/bệnh án gia đình. Không lưu query token trong catalog phát hành. OCR cần lưu box, trang, văn bản, confidence và xác nhận số/đơn vị. Bản nháp Việt phải gắn từng khẳng định với nguồn đáng tin, phạm vi áp dụng, ngày cần xem lại. Một claim chưa có nguồn không được âm thầm chuyển sang `reviewed`.

Với bản dựng: giữ script revision, prompt/model, artwork/voice licenses, subtitle timeline, checksum và kết quả kiểm tra. Retry có giới hạn, lỗi quyền/captcha/rate limit không đổi IP để tiếp tục. File tạm có giới hạn dung lượng và TTL xác định; không dùng RAM-disk làm kho duy nhất. Khi render xong chỉ hiện trạng thái `draft`. Duyệt nội dung, quyền sử dụng và khả năng phát hành là các bước riêng, không dùng kiểm tra kỹ thuật để thay thế.

Đăng bài là adapter riêng: mỗi tài khoản cần quyền chính thức, phạm vi cho phép, quota, idempotency key và kết quả đối soát. Không gắn một chuỗi tự đăng với thao tác xem video. TikTok Direct Post có điều kiện không phù hợp mặc định với tiện ích chỉ dùng cho tài khoản nội bộ; giữ tải bản nháp là phương án hiện tại. Không tích hợp auto-comment affiliate, fake engagement hoặc phán đoán shadowban chỉ từ 0 lượt xem.

## Những giả định kỹ thuật bị loại

- Đổi hash, lật ảnh, thêm avatar không phải giấy phép sử dụng hoặc bảo đảm được bật kiếm tiền.
- Giấy phép thư viện, trọng số mô hình, dịch vụ online và media gốc là các quyền riêng biệt.
- Faster-whisper dùng CTranslate2; NVENC/NVDEC xử lý codec, không chạy ASR. Không có cam kết giảm CPU 100% hay mọi video một phút đều nhận diện trong 2–3 giây.
- GPU thuê, điện máy nhà, lưu trữ, băng thông, API và thời gian biên tập không có chi phí bằng 0 chỉ vì dùng mã mở.
- Chưa có căn cứ đo retention/viral/thu nhập/hiệu quả A/B cho EmBe. Thứ tự 12 tuyến là ưu tiên biên tập, không phải dự báo thuật toán.
- Ngày khám, giấy tờ, liều thuốc và gợi ý ăn dặm của một kênh Trung Quốc không tự áp dụng cho gia đình tại Việt Nam.

## Giao diện kết quả

Tái sử dụng hướng Studio đã có, không thiết kế lại hệ thống: nền `#FFF8FB`, mặt `#FFFEFD`, chữ `#35282E`, chữ phụ `#746269`, nhấn `#A54A6A`; Be Vietnam Pro cho nội dung và Noto Serif cho tiêu đề. Một cột, căn trái, đoạn ngắn; đề cương mở sẵn, repo/giới hạn/quy trình nằm trong disclosure. Không đưa bảng hàng chục cột lên iPhone, không thêm motion. Liên kết và summary tối thiểu 44 px, có keyboard focus. Độ phủ nghiên cứu và phân biệt đã dùng/chưa tích hợp phải nhìn thấy rõ.

## Kiểm tra bản video trước nghiên cứu mở rộng

Commit `86b21e0280797b486e7d9b549b8f581d7c9b3e12` đã live, GitHub CI thành công. `studio-live-smoke.mjs`: 11 poster giải mã, 11 video checksum/Range 206, phát/tua/AAC, copy/download/navigate/keyboard và 6 kích thước màn hình đều đạt. Phiên kiểm tra riêng đã thu hồi. Đây là Cent headless, không thay bằng chứng nghe giọng người thật hoặc dùng iPhone vật lý. Báo cáo cục bộ ở `data/studio-web-verification/result.json`.
