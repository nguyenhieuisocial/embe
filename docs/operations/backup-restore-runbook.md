# Em Bé — Backup & Restore Drill (Bounded/Offline Mode)

Runbook này áp dụng cho bài test-drill trên máy local, KHÔNG chạy cloud.

## 1) Mục tiêu

- Backup 3 nhóm dữ liệu: `code-config`, `vault`, `appdata`.
- Tạo manifest JSON chứa file checksum để kiểm chứng restore.
- Kiểm tra restore drill bằng checksum (không dùng dữ liệu thật ngoài repo local tạm).
- Thất bại khi thiếu `PasswordFile` hoặc `Repository`/`RestoreRoot`.

## 2) Ràng buộc an toàn

- Chỉ cho phép repository local trong `run-restic.ps1` (chặn URI dạng `s3:`, `b2:`, `sftp:`...).
- `Repository` là thư mục local được truyền vào script; script có thể tạo mới thư mục repo khi chưa tồn tại.
- Không chạm dịch vụ/container/supabase/infra compose.
- Test chỉ tạo dữ liệu trong `TEMP` và dọn sạch sau khi chạy.
- Không truyền mật khẩu trực tiếp trên command line. `PasswordFile` phải là file
  cục bộ có ACL chỉ cho tài khoản vận hành đọc và không nằm trong Git/vùng backup.

## 3) Chạy backup test (local bounded)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup\run-restic.ps1 `
  -CodeConfigPath "C:\EmBe\app\code-config" `
  -VaultPath "C:\EmBe\embe" `
  -AppDataPath "C:\EmBe\data" `
  -Repository "C:\EmBe\temp\restic-repo" `
  -PasswordFile "C:\Users\Admin\AppData\Local\EmBe\restic-password.txt" `
  -Tag "monthly" `
  -ManifestPath "C:\EmBe\exports\monthly-manifest.json"
```

Kết quả tiêu chuẩn:

- Exit code `0`
- Console in JSON (`status: ok`)
- Manifest ghi `snapshot_id`, `repository`, `sources[]` và `file_count`.

## 4) Restore drill

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup\restore-drill.ps1 `
  -ManifestPath "C:\EmBe\exports\monthly-manifest.json" `
  -PasswordFile "C:\Users\Admin\AppData\Local\EmBe\restic-password.txt" `
  -RestoreRoot "C:\EmBe\temp\restore-drill"
```

Nhãn trả về: `status: pass` nếu tất cả file checksum khớp manifest.

## 5) Kiểm tra nhanh trong CI script

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\run-restic.tests.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\restore-drill.tests.ps1
```

Tín hiệu pass:

- Cả 2 test đều in `PASS`.
- Nếu fail, đọc lỗi theo từng test (đặc biệt `run-restic fails...` và `restore-drill fails...`).

## 6) File đã thêm

- `scripts\backup\run-restic.ps1`: script thực hiện backup + manifest.
- `scripts\backup\restore-drill.ps1`: script restore + verify checksum.
- `scripts\tests\run-restic.tests.ps1`: test backup fail-closed, manifest, snapshot.
- `scripts\tests\restore-drill.tests.ps1`: test restore pass/mismatch.
