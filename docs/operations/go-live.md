# Em Bé — Cổng go-live

Chạy health audit trước, sau đó chạy `scripts\health\go-live-gate.ps1`. Gate mặc
định fail closed: thiếu bằng chứng được xem là chưa đạt, không được suy đoán là đạt.

## Bằng chứng bắt buộc

- Health report đạt toàn bộ.
- Backup R2 mã hóa còn mới, `restic check` và restore drill đều đạt.
- Soak đủ 7 ngày, gồm restart host, mất mạng, token rotation, backup/restore mẫu
  và Cloudflare outage/LAN fallback drill.

Theo quyết định vận hành ngày 2026-08-31, USB HDD/NAS không còn là điều kiện
go-live. Hệ thống chấp nhận nguồn ứng dụng + snapshot cục bộ + bản R2 off-site
đã mã hóa, với rủi ro còn lại là hai bản đầu cùng chung máy. Không xóa ảnh gốc
trên iPhone/thẻ nhớ cho đến khi bản R2 tương ứng đã được phục hồi kiểm chứng.
