# Em Bé — Bootstrap evidence

**Ngày xác minh:** 2026-08-30

| Hạng mục | Kết quả |
|---|---|
| Cloudflare R2 private buckets | `embe-backup` và `embe-cache`, public domain tắt |
| Cache lifecycle | Xóa sau 30 ngày; multipart dang dở sau 7 ngày |
| R2 credential | Object Read/Write, chỉ đúng hai bucket |
| Storage PoC | Upload, download, Range, checksum, delete đạt; production tắt |
| Client-side encryption | AES-256-GCM theo chunk trước khi ghi R2 |
| DB snapshot | BabyBuddy, Memos, Grocy, Immich đạt |
| Restic R2 backup | 2 snapshot đã tạo, mỗi snapshot 18 file, tag `embe-critical-r2` |
| Repository integrity | `restic check --read-data` không lỗi |
| Restore drill | 18/18 file đúng checksum; bản phục hồi tạm đã chuyển Recycle Bin |
| Immich | Các container đang healthy; media không nằm trong R2 backup nhỏ |
| Lịch tự động | 03:00 hằng ngày, chạy bù khi máy bật lại |

## Go/no-go

**Chưa Go** cho nhập ảnh iPhone: máy hiện chỉ có ổ hệ thống và dung lượng trống
dưới ngưỡng an toàn. Cần ổ media riêng, đường LAN/VPN đã kiểm tra và một lần
nhập synthetic đạt trước khi dùng 10 ảnh thử.

**Chưa go-live đầy đủ** cho media thật cho đến khi có USB HDD/NAS làm bản sao
thứ ba và chạy restore drill trên chính thiết bị đó.
