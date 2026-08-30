# Nhật ký gia đình EmBe

## Cách đăng một ghi chú lên trang gia đình

1. Mở Memos trên máy EmBe.
2. Viết nội dung bằng tiếng Việt. Dòng tiêu đề có thể bắt đầu bằng `# `.
3. Giữ ghi chú ở chế độ `PRIVATE` và thêm thẻ `#portal`.
4. Nếu đây là một cột mốc, thêm thẻ `#milestone`.
5. Chờ tối đa 5 phút rồi mở `https://embe.hieu.asia`.

Ghi chú đã duyệt được sao chép một chiều sang Obsidian tại `20-Timeline/Memos`. Bản sao này giúp gia đình vẫn đọc được nhật ký khi dịch vụ trực tuyến tạm thời không hoạt động.

## Quy tắc riêng tư

- Chỉ ghi chú vừa ở chế độ `PRIVATE` vừa có `#portal` mới xuất hiện trên trang gia đình. Ghi chú không cần công khai trong Memos.
- Ghi chú có một trong các thẻ `#private`, `#restricted`, `#medical`, `#health`, `#location` hoặc `#gps` luôn bị chặn, kể cả khi có `#portal`.
- Bộ lọc tự động loại các trường vị trí, tệp gốc và ghi chú có thẻ nhạy cảm. Nội dung chữ vẫn cần bố mẹ đọc lại trước khi thêm `#portal`; không ghi địa chỉ, số điện thoại, tọa độ hoặc kết quả khám vào ghi chú chia sẻ.
- Bỏ `#portal`, chuyển ghi chú sang riêng tư hoặc đưa vào thùng rác sẽ gỡ ghi chú khỏi Portal sau lần đồng bộ tiếp theo.

## Khi chưa thấy ghi chú

1. Kiểm tra ghi chú đang là `PRIVATE` và có đúng thẻ `#portal`.
2. Chờ đủ 5 phút và tải lại trang.
3. Trên máy EmBe, chạy `scripts\install-portal-sync.ps1 -VerifyNow` để kiểm tra tác vụ đồng bộ.
4. Không gửi file trong thư mục `secrets` hoặc chụp màn hình có token cho người khác.

## Khôi phục

- Supabase chỉ là bản đọc tối giản cho Portal; Memos vẫn là nguồn nhật ký chính.
- Có thể dựng lại toàn bộ timeline Portal bằng cách chạy lại `services\local-bff\src\sync_portal.py`.
- Obsidian là bản sao đọc một chiều, không được dùng để ghi ngược vào Memos.
