# Em Bé — Cổng go-live

Chạy health audit trước, sau đó chạy `scripts\health\go-live-gate.ps1`. Gate mặc
định fail closed: thiếu bằng chứng được xem là chưa đạt, không được suy đoán là đạt.

## Bằng chứng bắt buộc

- Health report đạt toàn bộ.
- Bản sao thứ ba nằm trên USB HDD/NAS là thiết bị vật lý khác và đã restore đạt.
- Soak đủ 7 ngày, gồm restart host, mất mạng, token rotation, backup/restore mẫu
  và Cloudflare outage/LAN fallback drill.

R2 là bản offsite đã mã hóa nhưng không thay thế USB HDD/NAS. Cùng một ổ `C:` dù
khác thư mục cũng không phải bản sao thứ ba. Cho đến khi gate đạt, chỉ dùng dữ
liệu thử; không xóa ảnh gốc trên iPhone/thẻ nhớ.
