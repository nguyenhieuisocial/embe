# Em Bé — Xử lý sự cố

## Nguyên tắc

1. Không xóa dữ liệu, reset database hoặc chạy nâng cấp khi health gate đang đỏ.
2. Không đưa nội dung nhật ký, ảnh, token hoặc URL có query vào ticket/cảnh báo.
3. Giữ nguyên thẻ nhớ và bản gốc cho đến khi có ít nhất hai bản sao đã kiểm checksum.

## Kiểm tra nhanh

Chạy `scripts\health\health-audit.ps1`. Báo cáo an toàn nằm tại
`data\status\system-health.json` và chỉ chứa tên dịch vụ, số lượng, thời gian và
trạng thái.

- `disk_headroom`: ngừng import media dưới 15%; lên kế hoạch mở rộng dưới 25%.
- `backup_freshness` hoặc `restore_drill`: dừng nâng cấp và chạy lại backup/restore.
- `sync_deadletters`: không tự xóa ledger; xử lý lỗi nguồn/sink trước.
- `containers`: luôn phục hồi bằng `scripts\start-local-runtime.ps1`; không mở
  `Docker Desktop.exe` trực tiếp. Bộ khởi động sẽ chờ lần khởi động hợp lệ, cách
  ly các socket Windows bị kẹt mà không xóa chúng, rồi chỉ báo sẵn sàng khi cả
  Docker engine và Ollama đã phản hồi thật.

Sau sự cố, ghi thời điểm, tác động, nguyên nhân và bằng chứng phục hồi; không ghi
nội dung gia đình vào báo cáo vận hành.
