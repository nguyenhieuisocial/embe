# Home Assistant cho EmBe

Home Assistant và MQTT chạy dưới profile `iot`, chỉ mở trên máy local. Tài khoản
quản trị và MQTT được tạo bằng mật khẩu ngẫu nhiên, lưu bằng Windows DPAPI dưới
`secrets/runtime`; script `scripts/iot/provision-mqtt.ps1` có thể xoay khóa và
khởi động lại broker mà không đưa mật khẩu lên command line.

Khi có cảm biến nhiệt độ/độ ẩm:

1. Ghép cảm biến vào Home Assistant và đổi tên entity rõ ràng cho phòng em bé.
2. Tạo Long-Lived Access Token trong Home Assistant.
3. Sao chép `home-assistant-analytics.example.env` thành
   `C:\EmBe\secrets\runtime\home-assistant-analytics.env`, điền đúng hai entity
   và token. File secret không được commit.
4. Chạy kiểm thử ingest bằng dữ liệu giả trước, rồi mới cài lịch backfill.

Không gắn nhãn “tần số âm thanh” từ trạng thái media player. Hệ thống chỉ lưu
tên track, âm lượng và khoảng phát; muốn phân tích tần số phải có cảm biến âm học
riêng.
