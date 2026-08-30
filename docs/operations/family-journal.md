# Nhật ký gia đình EmBe

## Cách ghi nhanh trên iPhone

1. Mở `https://embe.hieu.asia` và chọn **Ghi lại** ở thanh dưới cùng.
2. Chọn **Ba Hiếu** hoặc **Mẹ Ngân**, viết một kỷ niệm ngắn rồi bấm **Lưu vào nhật ký**.
3. Chờ tối đa 5 phút; ghi chú sẽ tự vào Memos, dòng thời gian và Obsidian.

Nội dung chỉ ở Supabase trong lúc chờ máy nhà nhận. Khi Memos xác nhận đã lưu,
nội dung tạm bị xóa, chỉ còn trạng thái vận hành không chứa câu chuyện gia đình.
Nếu thử lại nhiều lần vẫn thất bại, health gate tự báo thay vì bỏ quên ghi chú.

## Cách nâng cao trong Memos

Khi cần tiêu đề riêng hoặc đánh dấu cột mốc, mở Memos qua Tailscale, giữ ghi chú
ở chế độ `PRIVATE`, thêm `#portal`; thêm `#milestone` nếu là cột mốc.

Ghi chú đã duyệt được sao chép một chiều sang Obsidian tại `20-Timeline/Memos`. Bản sao này giúp gia đình vẫn đọc được nhật ký khi dịch vụ trực tuyến tạm thời không hoạt động.

## Quy tắc riêng tư

- Chỉ ghi chú vừa ở chế độ `PRIVATE` vừa có `#portal` mới xuất hiện trên trang gia đình. Ghi chú không cần công khai trong Memos.
- Ghi chú có một trong các thẻ `#private`, `#restricted`, `#medical`, `#health`, `#location` hoặc `#gps` luôn bị chặn, kể cả khi có `#portal`.
- Bộ lọc tự động loại các trường vị trí, tệp gốc và ghi chú có thẻ nhạy cảm. Nội dung chữ vẫn cần bố mẹ đọc lại trước khi thêm `#portal`; không ghi địa chỉ, số điện thoại, tọa độ hoặc kết quả khám vào ghi chú chia sẻ.
- Bỏ `#portal`, chuyển ghi chú sang riêng tư hoặc đưa vào thùng rác sẽ gỡ ghi chú khỏi Portal sau lần đồng bộ tiếp theo.

## Khi chưa thấy ghi chú

1. Chờ đủ 5 phút và tải lại trang.
2. Nếu ghi trực tiếp trong Memos, kiểm tra ghi chú đang là `PRIVATE` và có đúng thẻ `#portal`.
3. Trên máy EmBe, chạy `scripts\install-portal-sync.ps1 -VerifyNow` để kiểm tra tác vụ đồng bộ.
4. Không gửi file trong thư mục `secrets` hoặc chụp màn hình có token cho người khác.

## Khôi phục

- Supabase chỉ là bản đọc tối giản cho Portal; Memos vẫn là nguồn nhật ký chính.
- Có thể dựng lại toàn bộ timeline Portal bằng cách chạy lại `services\local-bff\src\sync_portal.py`.
- Obsidian là bản sao đọc một chiều, không được dùng để ghi ngược vào Memos.

## Mở ứng dụng chăm sóc trên điện thoại

- Memos dùng HTTPS cổng `8443`; BabyBuddy dùng HTTPS cổng `10000` trên cùng tên máy Tailscale.
- Hai địa chỉ chỉ hoạt động khi điện thoại đã kết nối Tailscale; không có Funnel hoặc cổng router công khai.
- Có thể dựng lại hai ánh xạ an toàn bằng `scripts\network\configure-care-apps-tailscale.ps1 -Apply`.
