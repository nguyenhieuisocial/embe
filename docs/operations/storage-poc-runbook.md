# Runbook — Free-First Hybrid Storage PoC

## Safety boundary

- Lab only; không kết nối Portal, Immich, Local BFF hoặc Supabase production.
- Chỉ dùng file synthetic. Không dùng ảnh gia đình, hồ sơ sức khỏe hay vault.
- Không dùng tài khoản Telegram cá nhân. Dedicated account phải bật 2FA và có
  Premium nếu test file trên 2 GB.
- Không dùng nhiều account/session/proxy để né `FLOOD_WAIT`.
- Hai feature flag mặc định `false`; Compose profile không tự chạy.

## Chạy offline

```powershell
cd C:\EmBe
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .\services\storage-poc[test]
.\.venv\Scripts\python -m pytest .\services\storage-poc\tests -q
```

## Chuẩn bị dedicated Telegram lab account

Đây là bước người sở hữu tài khoản phải tự thực hiện vì Telegram yêu cầu số điện
thoại, OTP và có thể yêu cầu mật khẩu 2FA. Không gửi các giá trị đó vào chat,
Git, command line hoặc file env cleartext.

1. Tạo một tài khoản chỉ dành cho lab, bật 2FA và Premium.
2. Tạo `api_id`/`api_hash` riêng tại `my.telegram.org`.
3. Tạo 2–3 private channel lab; không thêm dữ liệu hoặc thành viên khác.
4. Trong local console, đặt API ID/hash và session path
   `C:\EmBe\data\storage-poc\telegram-lab`, rồi chạy
   `C:\EmBe\.venv\Scripts\python.exe C:\EmBe\services\storage-poc\scripts\create_dedicated_session.py`.
   Script nhận OTP/2FA bằng prompt, kiểm tra Premium và tự xóa session nếu sai
   account. Không gửi OTP/2FA vào chat. Khi chạy Compose, session path tương ứng
   là `/data/storage-poc/telegram-lab`.
5. Pin numeric user ID của account lab bằng `EMBE_TELEGRAM_EXPECTED_USER_ID`,
   đặt allowlist shard IDs và xác nhận account chuyên dụng bằng biến chính xác
   `dedicated-premium-lab`. Service từ chối session Premium khác user ID đã pin.
   Nếu chưa biết numeric ID, để biến này trống và chạy script một lần; script chỉ
   in ID rồi xóa discovery session. Đặt ID đó và chạy lại để tạo session chính thức.
6. Session Telethon là credential toàn quyền và không được app-layer encrypt khi
   đang sử dụng. Chỉ đặt trên volume có BitLocker/NTFS ACL giới hạn cho tài khoản
   vận hành; backup session phải được SOPS/age encrypt. Không copy sang cloud drive.
   Sau khi tự kiểm tra hai điều kiện này, đặt assertion chính xác
   `EMBE_TELEGRAM_SESSION_STORAGE_ASSERTION=bitlocker-and-restricted-acl`; thiếu
   assertion thì cả script login và provider đều fail-closed.

## Chuẩn bị R2 lab bucket

Cloudflare hiện có hai bucket riêng tư: `embe-backup` cho replica quan trọng và
`embe-cache` cho thumbnail/file nóng. `embe-cache` tự xóa object sau 30 ngày và
abort multipart dang dở sau 7 ngày. Key `EmBe Storage PoC` chỉ có Object
Read/Write trên đúng hai bucket, không có quyền quản trị bucket. File được mã hóa
AES-256-GCM theo chunk phía EmBe trước khi lên R2. Credential và master key nằm
trong file env local bị Git bỏ qua; không dùng Global API Key.

Chạy smoke test sau khi service local đã lên:

```powershell
.\services\storage-poc\scripts\r2_e2e_smoke.py
```

Smoke test chỉ tạo file ngẫu nhiên 1 MiB, kiểm full download/Range/checksum rồi
xóa ngay. Không dùng dữ liệu gia đình. S3 dùng cùng nguyên tắc scoped credential.

## Cổng bật live test

Chỉ sau khi kiểm tra session và channel:

```text
EMBE_STORAGE_POC_ENABLED=true
EMBE_TELEGRAM_POC_ENABLED=true
EMBE_TELEGRAM_DEDICATED_ACCOUNT_ASSERTION=dedicated-premium-lab
EMBE_TELEGRAM_LIVE_BENCHMARK=I_UNDERSTAND_LAB_ONLY
```

Service bind `127.0.0.1:8099`. API key tối thiểu 24 ký tự; request phải có
`X-Embe-Poc-Key`, `X-Tenant-Id`, `X-Owner-Id`. Không đưa service qua Cloudflare
Tunnel/Vercel hoặc DNS public.

## Thứ tự benchmark live

1. Health + Premium + quyền shard.
2. 1 MB, 20 MB, 100 MB.
3. 500 MB, 1 GB.
4. 2 GB.
5. Chỉ khi tất cả ổn và không có warning/flood bất thường: 3.0 GB rồi 3.9 GB.
6. Concurrency tăng 1 → 2 → 4; dừng ngay khi Telegram trả wait hoặc warning.

Ghi `FLOOD_WAIT_X`/`FLOOD_PREMIUM_WAIT_X` nguyên giá trị X và chờ đúng thời
gian cộng jitter. Dừng lab nếu có `AUTH_KEY_DUPLICATED`, session revoked,
account frozen, channel permission loss hoặc thông báo abuse.

Benchmark dùng module `embe_storage.benchmark --provider <provider> --output
<json>`. Các provider mạng không được phép fallback sang local khi thiếu credential;
lệnh phải fail để tránh báo cáo nhầm kết quả.

## Failure drills

- Network interruption: ngắt adapter lab, bảo đảm outbox/retry không tạo duplicate.
- Permission loss: gỡ quyền ở một shard, health phải `degraded` và không chọn shard đó.
- Expired file reference: đọc lại message bằng shard + message ID trước khi retry.
- Mapping loss: backup SQLite, tạo DB trống, gọi rebuild scan. Chỉ manifest có
  AEAD tag hợp lệ mới được import.
- Delete: chỉ message do PoC tạo; dry-run danh sách trước, batch nhỏ, audit local.

## Cleanup

1. Tắt cả hai flag và dừng Compose profile.
2. Xóa message/channel lab bằng account có quyền, sau khi export benchmark.
3. Revoke Telegram session/API app nếu kết thúc nghiên cứu.
4. Revoke scoped R2/S3 key khi kết thúc toàn bộ PoC; không xóa `embe-backup` hoặc
   `embe-cache` nếu chúng còn được giữ cho giai đoạn hybrid storage kế tiếp.
5. Xóa `C:\EmBe\data\storage-poc` bằng thao tác có kiểm tra target; dữ liệu lab
   không có trong Git.
