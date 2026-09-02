# Em Bé — Backup và phục hồi

## Phạm vi hiện hành

- Vault thực tế: `C:\\EmBe\\embe` (`C:\\EmBe\\vault` chỉ là junction tương thích cho lịch cũ).
- Snapshot nhất quán: BabyBuddy, Memos, Grocy bằng SQLite Backup API; Immich bằng `pg_dump`;
  schema và data của Supabase `portal_read_model` bằng Supabase CLI.
- R2 chỉ nhận vault, cấu hình và snapshot DB đã được Restic mã hóa.
- Không backup model Ollama, cache ML, RAW hoặc video vào R2 Free.
- Repository R2 duy nhất được script chấp nhận là prefix `embe-backup/restic-critical`.

## Tạo snapshot ứng dụng

Chạy `scripts\install-toolchain.ps1` để cài bản Supabase CLI đã pin và kiểm tra
SHA-256. Tạo `secrets\supabase-backup.env` từ password manager với ba khóa được
ghi trong `secrets\README.md`, sau đó bỏ quyền kế thừa và chỉ giữ Administrators,
SYSTEM, người vận hành. Không đặt token hoặc mật khẩu trong Scheduled Task hay
profile PowerShell. Chạy lại `install-scheduled-backup.ps1` để cấp riêng quyền đọc
cho tài khoản `EmBeBackupSvc` và kiểm chứng tác vụ non-interactive.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\backup\\prepare-snapshots.ps1
```

Script phải trả `status: ok` và sáu artifact, gồm
`supabase-portal-schema.sql` và `supabase-portal-data.sql`. Không copy trực tiếp database đang
chạy vì có thể bỏ sót WAL hoặc tạo bản PostgreSQL không nhất quán.

## Backup Restic

Mặc định `run-restic.ps1` chỉ cho repository local. R2 phải có cờ
`-AllowR2Repository`; mọi host hoặc bucket ngoài prefix được duyệt đều bị chặn.
Credential lấy từ file local bị Git bỏ qua, còn mật khẩu Restic nằm tại
`secrets/restic-r2-password.txt` với ACL riêng. Bản mã hóa phục hồi là
`secrets/restic-r2-password.enc.txt`.

Các nguồn đưa vào backup R2:

1. `C:\\EmBe\\infra`
2. `C:\\EmBe\\embe`
3. thư mục snapshot mới nhất dưới `C:\\EmBe\\exports\\backup-staging`

`run-critical-r2.ps1` coi hai dump Supabase là artifact bắt buộc. Thiếu hoặc rỗng
thì dừng trước khi gọi Restic. Manifest Restic lưu danh sách bắt buộc và checksum;
thư mục staging plaintext được xóa sau cả thành công lẫn thất bại.

## Restore drill

`restore-drill.ps1` phục hồi vào thư mục sạch và so checksum của từng file với
manifest. R2 cũng cần cờ `-AllowR2Repository`. Sau khi đạt, giữ báo cáo bằng chứng
và chuyển thư mục phục hồi tạm vào Recycle Bin vì bên trong có dữ liệu đã giải mã.
Với manifest mới, drill phải thất bại nếu thiếu một trong hai dump Supabase, ngay
cả khi các file còn lại đều đúng checksum.

## Kiểm thử

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\tests\\prepare-snapshots.tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\tests\\supabase-backup.tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\tests\\run-restic.tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\tests\\restore-drill.tests.ps1
```

## Trạng thái ngày 2026-08-30

- Snapshot ứng dụng: đạt, 4 artifact.
- Backup R2: đạt, mỗi snapshot 18 file, tag `embe-critical-r2`.
- `restic check --read-data`: đạt, không có lỗi.
- Restore drill từ R2: đạt, 18/18 file đúng checksum.
- RAW/video/model AI: không được đưa lên R2.
- Các tác vụ nền cô lập đã được cài và health gate xác nhận: backup chạy mỗi 6
  giờ, kiểm tra toàn vẹn hằng tuần và tự chạy bù khi máy ngủ đúng lịch.

## Mức bảo vệ được chấp nhận

Nguồn ứng dụng, snapshot cục bộ và repository R2 mã hóa là ba bản logic; R2 là
bản off-site. Theo quyết định vận hành ngày 2026-08-31, không bắt buộc thêm USB
HDD/NAS. Rủi ro còn lại là nguồn và snapshot cùng chung một máy, vì vậy freshness,
`restic check --read-data` và restore drill R2 luôn là gate bắt buộc.
