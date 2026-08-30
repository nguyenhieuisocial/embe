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

Chưa bật ingest thật cho Home Assistant, BabyBuddy hoặc Grocy. Bộ kiểm thử dùng
mock hoàn toàn, không gọi API và không dùng dữ liệu gia đình. Trước khi bật job,
cần tạo token chỉ đọc riêng, cấu hình allowlist/alias local và chạy thử vào một
SQLite tạm; tuyệt đối không đưa token vào Git.

Kiểm thử:

```powershell
python -m unittest discover -s tests -v
```
