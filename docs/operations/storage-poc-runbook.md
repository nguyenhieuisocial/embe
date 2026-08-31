# Runbook — Free-First Hybrid Storage PoC

## Safety boundary

- Telegram chỉ là bản sao phụ; bản chính vẫn ở local/R2/Immich và lỗi Telegram
  không được chặn Portal hay quá trình upload chính.
- Không lưu hồ sơ sức khỏe, vault, credential hoặc dữ liệu `restricted` lên Telegram.
- Tài khoản chuyên dụng phải bật 2FA. Tài khoản thường giới hạn 2 GB/file;
  Premium mới được thử nghiệm đến 4 GB/file.
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

1. Tạo một tài khoản chuyên dụng, bật 2FA; Premium là tùy chọn.
2. Tạo `api_id`/`api_hash` riêng tại `my.telegram.org`.
3. Tạo 2 private channel; không thêm thành viên và không chia sẻ liên kết.
4. Chạy `scripts/start-telegram-storage-login.ps1`. Phiên chỉ được lưu sau khi
   ghim user ID và được Windows DPAPI mã hóa.
5. Pin numeric user ID của account lab bằng `EMBE_TELEGRAM_EXPECTED_USER_ID`,
   đặt allowlist shard IDs và xác nhận account chuyên dụng bằng biến chính xác
   `dedicated-telegram-account`. Service từ chối mọi session khác user ID đã pin.
   Nếu chưa biết numeric ID, để biến này trống và chạy script một lần; script chỉ
   in ID rồi xóa discovery session. Đặt ID đó và chạy lại để tạo session chính thức.
6. Session Telethon là credential toàn quyền. Chỉ Windows identity đã tạo phiên,
   SYSTEM và Administrators được đọc file DPAPI; không mount file này vào Linux,
   không copy sang cloud drive và không đưa vào Git.

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

## Chế độ secondary hiện hành

Chỉ sau khi kiểm tra session và channel:

```text
EMBE_STORAGE_POC_ENABLED=true
EMBE_TELEGRAM_REPLICATION_ENABLED=true
EMBE_TELEGRAM_POC_ENABLED=false  # Linux API không được đọc session DPAPI
```

Service bind `127.0.0.1:8099`. Linux API giữ bản chính local và xếp hàng.
`scripts/run-telegram-secondary.ps1` chạy trên Windows, bật provider chỉ trong
tiến trình đó, mã hóa AES-256-GCM theo chunk rồi sao chép sang Telegram.
`scripts/install-telegram-secondary-task.ps1` cài task chạy mỗi 10 phút bằng
Windows identity sở hữu session DPAPI. API key tối thiểu 24 ký tự; request phải có
`X-Embe-Poc-Key`, `X-Tenant-Id`, `X-Owner-Id`. Không đưa service qua Cloudflare
Tunnel/Vercel hoặc DNS public.

Runner hiện quét thêm đúng album Immich nằm trong allowlist của media publisher.
Ảnh/video mới được tải tạm, kiểm checksum, đổi sang tên opaque, mã hóa rồi gửi đến
shard; file tạm luôn bị xóa. Mapping nguồn chống gửi trùng nằm trong SQLite local.
Ảnh/video ngoài album không được đọc. Với tài khoản thường, file chạm trần 2 GB
phải báo lỗi và giữ nguyên trong Immich; không tự chunk để lách giới hạn.

## Thứ tự benchmark live

1. Health + Premium + quyền shard.
2. 1 MB, 20 MB, 100 MB.
3. 500 MB, 1 GB.
4. Tài khoản thường dừng dưới 2 GB. Chỉ Premium mới thử 2–3.9 GB.
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
