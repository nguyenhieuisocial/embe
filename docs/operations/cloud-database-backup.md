# Backup cơ sở dữ liệu không phụ thuộc Windows

## Phạm vi

- Chỉ project EmBe; ba schema `public`, `portal_read_model`, `embe_studio`.
- Tài khoản `embe_cloud_backup` chỉ SELECT, không quản trị, không bỏ qua RLS,
  không sửa dữ liệu. Mỗi bảng phải có quyền và chính sách đọc rõ ràng.
- Bảng mới thiếu quyền/policy làm backup dừng, không im lặng bỏ qua dữ liệu.
- KHÔNG gồm byte tệp Storage, `auth`, `storage`, `vault`, ảnh/video Immich gốc.
  Backup này không thay thế restic-critical và không phải restore toàn nền tảng.

## Luồng đã triển khai

1. GitHub Actions trên `main`, 20:41 UTC (03:41 Việt Nam), và chạy tay khi cần.
2. Kết nối TLS `verify-full` tới session pooler; cùng snapshot cho số dòng và dump.
3. Khôi phục vào PostgreSQL 17 cô lập, không mạng/cổng; đối chiếu số dòng mọi bảng.
   Schema `auth` có hàm stub cho kiểm tra cấu trúc; không chạy nghiệp vụ Supabase.
4. Mã hóa CMS AES-256-GCM + RSA-OAEP bằng chứng thư công khai. Runner không giữ
   khóa giải mã. Không tải bản rõ hay artifact lên GitHub; lỗi không in SQL/rows.
5. Edge Function chỉ nhận ciphertext và kiểm tra SHA-256. R2 riêng tư, prefix
   `cloud-db-v1`, tối đa 35 slot × 16 MiB. Một bản/ngày; chỉ thay slot >=35 ngày,
   có điều kiện chống ghi đè đồng thời. Không có API tải/xóa/liệt kê kho backup.
   Khi có ngày bỏ lỡ, đây là 35 slot luân phiên, không hứa có đủ 35 bản liên tục.
6. HEAD đối chiếu checksum, dung lượng, ngày; trạng thái “Nhà mình” dùng thời
   điểm lưu thật, quá 36 giờ sẽ yêu cầu kiểm tra. HTTP upload thành công không
   thay cho phép thử tải về, giải mã và khôi phục định kỳ.

Lịch GitHub có thể trễ. Workflow lỗi phát thông báo theo cài đặt Actions của
chủ repo; chưa có cảnh báo Telegram cloud độc lập. Không bật runner trả phí.

## Khóa và khôi phục

- Chứng thư công khai: `scripts/backup/cloud-recipient.pem`.
- Khóa giải mã: `secrets/cloud-backup-recipient.pem` (ACL riêng tư, không Git).
  Có bản sao mã hóa trong restic-critical, tag `embe-cloud-recovery-key`;
  cần giữ mật khẩu restic an toàn ngoài máy để khôi phục khi mất máy.
- Credential vận hành: `secrets/cloud-backup.credential.xml`, mã hóa DPAPI.
- GitHub chỉ giữ mật khẩu DB chỉ đọc và token API upload. Không giữ khóa quản
  trị Supabase, R2, restic hoặc khóa giải mã.
- R2 credential chỉ ở Edge Secrets; tên bucket/prefix cố định trong server.
  Đừng mở API upload thành một proxy tùy ý tới R2.
- Root CA lấy qua HTTPS từ URL trong source chính thức Supabase Studio:
  `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
  Không đổi TLS sang `require` để bỏ qua lỗi chứng chỉ.
- Giải mã bằng `openssl cms -decrypt -binary -inform DER -in backup.cms
  -recip scripts/backup/cloud-recipient.pem -inkey secrets/cloud-backup-recipient.pem
  -out application.tar.gz`; kiểm tra checksum manifest và restore trên môi
  trường cô lập, không bao giờ áp thử vào DB thật.

## Dừng hoặc xoay khóa

- Tạm dừng workflow GitHub trước khi xoay mật khẩu/token; khóa role bằng
  `ALTER ROLE embe_cloud_backup NOLOGIN` nếu cần. Không xóa dữ liệu backup cũ.
- Giữ khóa giải mã cũ khi xoay chứng thư, đến khi hết toàn bộ bản mã dùng khóa cũ.
- Vault chứa khóa nhắc cloud riêng, nằm ngoài dump này. Disaster recovery phải
  tái cấp khóa và chỉ bật cron khi receiver mới đã xác minh thành công.

## Bằng chứng ngày 12/09/2026

- Bản do GitHub tạo có 67 bảng; đã tải chính ciphertext từ R2 và thử khôi phục
  vào container không mạng. SHA-256 dump và số dòng tất cả bảng khớp.
- Báo cáo riêng tư: `exports/restore-verification/cloud-database/latest.json`.
  Bản rõ trong thử khôi phục đã được dọn sau khi kiểm tra; không đưa vào Git.
- Lỗi cấp credential từ Windows và lỗi ghi trạng thái qua schema REST không
  công khai đã được xử lý: dùng dotenv UTF-8 không BOM và RPC service-only.
- Trạng thái giữ đúng thời điểm R2 lưu; kiểm tra lại không làm một backup cũ
  thành backup mới. Bản cùng ngày được giữ nguyên khi workflow chạy lại.
- Cổng riêng tư từ chối khi thiếu token (401). Security advisors không có lints.
- Chưa kiểm chứng lần chạy tự động đầu tiên theo lịch của ngày kế tiếp;
  đã kiểm chứng chạy workflow thật và khôi phục ngoài cloud. Chưa thử iPhone thật.
