# EmBe local analytics ingest

Dịch vụ này chuẩn hóa dữ liệu cảm biến phòng em bé vào SQLite tại máy nhà. Nó
không gửi dữ liệu lên Supabase, Google Analytics hoặc LLM đám mây.

Phần đã sẵn sàng:

- Chỉ nhận entity Home Assistant nằm trong allowlist.
- Chuẩn hóa nhiệt độ về °C, độ ẩm về %RH và thời gian về UTC.
- Giữ giá trị/đơn vị gốc để đối soát; chống ghi trùng sau reconnect/backfill.
- Checkpoint, REST history backfill, kiểm tra count/hash và tổng hợp theo giờ.
- Schema đã dành chỗ cho ngủ, bú, tã, tăng trưởng, môi trường, media state,
  kho vật tư và milestone.
- BabyBuddy: đọc theo từng trang từ đúng năm nhóm API được phép (ngủ, bú,
  thay tã, cân nặng, chiều cao), đổi về UTC/mL/g/cm/seconds và ghi idempotent.
- Grocy: chụp danh sách stock transaction một lần rồi chia trang trong bộ nhớ,
  chỉ giữ movement của product đã được đặt trong allowlist.
- Child ID và product ID từ ứng dụng nguồn phải được ánh xạ sang alias nội bộ.
  Tên người, ghi chú, caregiver, username và toàn bộ payload gốc không được ghi
  vào SQLite. Token/API key chỉ nằm trong header của tiến trình, không nằm trong
  URL, database hoặc log kết quả ingest.
- API client chỉ chấp nhận loopback, địa chỉ mạng riêng, tên Docker service hoặc
  `.home.arpa`; trang kế tiếp của BabyBuddy phải cùng origin và đúng endpoint.
  Cursor lặp hoặc vượt giới hạn số trang làm job dừng để tránh chạy vô hạn.

Runtime thật đã hỗ trợ Home Assistant, BabyBuddy và Grocy. Tất cả nguồn mặc định
tắt; bộ kiểm thử dùng mock hoàn toàn, không gọi API và không dùng dữ liệu gia
đình. Chỉ bật từng nguồn sau khi có token chỉ đọc riêng và allowlist local. Với
Home Assistant, `entities` chỉ chấp nhận `sensor.*` được gắn loại `temperature`
hoặc `humidity`. Không đưa token, entity ID thật hoặc file local vào Git.

## Bật runtime cục bộ an toàn

1. Chạy provision để tái sử dụng khóa tích hợp BabyBuddy hiện có nhưng chỉ thực
   hiện lời gọi đọc. Provision gọi endpoint children trực tiếp trong bộ nhớ, terminal chỉ in số lượng và không
   tạo log chứa tên, ID, token hoặc payload. Nó chỉ bật BabyBuddy và đặt alias
   `child-primary` khi tìm thấy đúng một child; với 0 hoặc nhiều child, nguồn vẫn
   tắt để chờ lựa chọn thủ công. Grocy vẫn tắt khi chưa có API key/allowlist.

```powershell
python services/analytics-ingest/provision.py `
  --source-env secrets/runtime/babybuddy-memos-sync.env `
  --config services/analytics-ingest/config.local.json `
  --secrets services/analytics-ingest/secrets.local.env
```

2. Nếu provision báo `needs_child_selection`, đối chiếu ID trực tiếp trong ứng
   dụng nguồn và điền alias không định danh vào file local; không dán ID/tên vào
   issue hoặc log. Nếu báo `ready`, có thể chạy ingest một lần rồi cài lịch.
3. Cài lịch chạy 15 phút/lần bằng tài khoản Windows hiện tại, quyền `Limited`:

```powershell
pwsh -NoProfile -File services/analytics-ingest/install-scheduled.ps1
```

Nếu thiếu `config.local.json`, runner ghi trạng thái `skipped` và không tạo API
client. Installer cũng không chạy lần đầu khi thiếu config hoặc file credential.
Scheduled Task chỉ giữ đường dẫn file, không chứa token/API key; quyền đọc file
credential được giới hạn lại khi cài lịch.

Kiểm thử:

```powershell
python -m unittest discover -s tests -v
pwsh -NoProfile -File tests/runtime-scheduler.tests.ps1
```
