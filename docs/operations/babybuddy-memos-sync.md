# BabyBuddy → Memos tự động

Tác vụ **EmBe BabyBuddy Memos Sync** kiểm tra mỗi phút bằng tài khoản hệ thống riêng, kể cả khi Ba Hiếu đã đăng xuất Windows. Ghi chú BabyBuddy có tag `milestone` được đồng bộ sang Memos; tag `portal` là lựa chọn riêng để cho phép hiện trên cổng gia đình.

## Cài hoặc sửa lại tác vụ

1. Chạy `scripts\provision-babybuddy-sync.ps1` để tạo quyền đọc tối thiểu và tệp cấu hình riêng tư trong thư mục chỉ tài khoản hiện tại được đọc.
2. Chạy `scripts\install-portal-sync.ps1 -VerifyNow` một lần bằng quyền quản trị để cài tài khoản chạy nền riêng cho Portal, BabyBuddy và xoay khóa.
3. Bộ cài tự chạy thử một lần. Kết quả `lastResult: 0` nghĩa là hoạt động bình thường.

Trạng thái an toàn nằm ở `data\status\babybuddy-memos-sync.json`. Nhật ký kỹ thuật đã lược bỏ nội dung gia đình và khóa truy cập nằm ở `data\logs\babybuddy-memos-sync.jsonl`. Hai thư mục này không được đưa lên GitHub.

Hai khóa Memos riêng biệt được dùng cho ghi và đọc Portal, tự xoay trước hạn. Khóa cũ chỉ bị thu hồi sau khi khóa mới đã được ghi và xác minh.
