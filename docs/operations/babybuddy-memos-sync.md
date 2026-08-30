# BabyBuddy → Memos tự động

Tác vụ **EmBe BabyBuddy Memos Sync** kiểm tra mỗi phút khi Ba Hiếu đang đăng nhập Windows. Ghi chú BabyBuddy có tag `milestone` được đồng bộ sang Memos; tag `portal` là lựa chọn riêng để cho phép hiện trên cổng gia đình.

## Cài hoặc sửa lại tác vụ

1. Chạy `scripts\provision-babybuddy-sync.ps1` để tạo quyền đọc tối thiểu và tệp cấu hình riêng tư trong thư mục chỉ tài khoản hiện tại được đọc.
2. Chạy `scripts\install-babybuddy-memos-sync-current-user.ps1` trong PowerShell thường. Không cần **Run as administrator** và không có hộp thoại UAC.
3. Bộ cài tự chạy thử một lần. Kết quả `lastResult: 0` nghĩa là hoạt động bình thường.

Trạng thái an toàn nằm ở `data\status\babybuddy-memos-sync.json`. Nhật ký kỹ thuật đã lược bỏ nội dung gia đình và khóa truy cập nằm ở `data\logs\babybuddy-memos-sync.jsonl`. Hai thư mục này không được đưa lên GitHub.

Tác vụ hiện tại chỉ chạy khi người dùng đã đăng nhập. Bản chạy nền không cần đăng nhập chỉ nên cài sau khi UAC xuất hiện rõ ràng và tài khoản dịch vụ riêng đã được kiểm tra.
