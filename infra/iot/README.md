# Home Assistant cho EmBe

Home Assistant và MQTT đã có sẵn dưới profile `iot`, chỉ mở trên máy local.
Chúng chưa được bật vì chưa có cảm biến/entity thật để cấu hình an toàn.

Khi có cảm biến nhiệt độ/độ ẩm:

1. Bật profile `iot` và hoàn tất màn hình tạo tài khoản Home Assistant.
2. Đổi tên entity rõ ràng cho phòng em bé.
3. Tạo Long-Lived Access Token trong Home Assistant.
4. Sao chép `home-assistant-analytics.example.env` thành
   `C:\EmBe\secrets\runtime\home-assistant-analytics.env`, điền đúng hai entity
   và token. File secret không được commit.
5. Chạy kiểm thử ingest bằng dữ liệu giả trước, rồi mới cài lịch backfill.

Không gắn nhãn “tần số âm thanh” từ trạng thái media player. Hệ thống chỉ lưu
tên track, âm lượng và khoảng phát; muốn phân tích tần số phải có cảm biến âm học
riêng.
