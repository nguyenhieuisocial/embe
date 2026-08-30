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

Chưa bật ingest thật vì Home Assistant chưa được khởi tạo và chưa có entity cảm
biến thật. Khi có thiết bị, sao chép file mẫu trong `infra/iot`, điền entity ID,
tạo Long-Lived Access Token chỉ trong file secret local rồi mới cài lịch chạy.

Kiểm thử:

```powershell
python -m unittest discover -s tests -v
```
