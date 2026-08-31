# Em Bé — Bootstrap evidence

**Ngày xác minh gần nhất:** 2026-08-31

| Hạng mục | Kết quả |
|---|---|
| Cloudflare R2 private buckets | `embe-backup` và `embe-cache`, public domain tắt |
| Cache lifecycle | Xóa sau 30 ngày; multipart dang dở sau 7 ngày |
| R2 credential | Object Read/Write, chỉ đúng hai bucket |
| Storage PoC | Upload, download, Range, checksum, delete đạt; production tắt |
| Client-side encryption | AES-256-GCM theo chunk trước khi ghi R2 |
| DB snapshot | BabyBuddy, Memos, Grocy, Immich đạt |
| Restic R2 backup | Vòng backup mới nhất đạt, gồm 4 snapshot ứng dụng và 41 file, tag `embe-critical-r2` |
| Repository integrity | `restic check --read-data` không lỗi |
| Restore drill | 41/41 file đúng checksum; bản phục hồi tạm đã chuyển Recycle Bin |
| Immich | Các container đang healthy; media không nằm trong R2 backup nhỏ |
| Lịch sao lưu | Ba tác vụ backup, kiểm tra toàn vẹn và health audit đã cài bằng `EmBeBackupSvc`; lần chạy xác minh đạt |
| Grocy | Khóa tích hợp riêng đã kiểm tra; 10 danh mục nền tảng đã có, không tạo tồn kho giả |
| Home Assistant + MQTT | Tích hợp MQTT chính thức đã tạo và ở trạng thái `loaded`; chưa tạo cảm biến hoặc dữ liệu giả |
| Tailscale | Immich, Memos và BabyBuddy Serve đã bật ở chế độ tailnet-only; HTTPS trả 200 và Funnel tắt |
| Portal ảnh riêng tư | Kho preview Supabase private, RLS/server-only đạt; Portal proxy không lộ khóa hoặc locator |
| Immich media publisher | Code, retry, checksum, dedupe và kiểm thử đạt; vẫn tắt cho tới khi có album chọn lọc + API key chỉ đọc |
| Sức khỏe phần mềm | 17/17 kiểm tra đạt; CI `main` và Vercel production đạt |

## Go/no-go

**Chưa Go** cho nhập ảnh iPhone: máy hiện chỉ có ổ hệ thống. Dung lượng tạm thời
đã qua ngưỡng tối thiểu nhưng vẫn cần ổ media riêng, album Immich chọn lọc,
API key chỉ đọc và một lần nhập synthetic đạt trước khi dùng 10 ảnh thử.

**Chưa go-live đầy đủ** cho media thật cho đến khi có USB HDD/NAS làm bản sao
thứ ba và chạy restore drill trên chính thiết bị đó.

**Đã đạt gate vận hành nền:** backup, kiểm tra toàn vẹn và health audit chạy bằng
service account riêng; health gate vẫn fail closed vì dung lượng ổ hệ thống.
