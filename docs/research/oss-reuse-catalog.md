# Danh mục tái sử dụng mã nguồn mở và dịch vụ miễn phí

Ngày rà soát: 2026-08-30. Nguyên tắc: một công cụ cho một trách nhiệm, dữ liệu gia đình không bị khóa vào một nhà cung cấp, và không công khai các dịch vụ quản trị.

## Dùng làm nền tảng chính

| Nhu cầu | Tái sử dụng | Cách áp dụng cho EmBe |
|---|---|---|
| Ảnh/video từ iPhone | [Immich mobile backup](https://docs.immich.app/features/mobile-backup/) + [Tailscale iOS](https://tailscale.com/docs/install/ios) | Đồng bộ qua mạng riêng; không public Immich. |
| Nhật ký và số liệu | Memos, BabyBuddy, Grocy | Giữ mỗi loại dữ liệu đúng một nguồn chính. |
| IoT | [Home Assistant](https://github.com/home-assistant/core), [Mosquitto](https://github.com/eclipse-mosquitto/mosquitto), [Node-RED](https://github.com/node-red/node-red) | HA giữ trạng thái/cảm biến; Node-RED chỉ nối các dịch vụ và gửi cảnh báo. |
| Sách gia đình | Playwright/Chromium + pypdf | Giữ pipeline hiện tại; không thêm renderer thứ hai. |
| Backup | [restic](https://github.com/restic/restic) + R2 + ổ cứng rời | R2 chỉ chứa dữ liệu quan trọng đã mã hóa; media gốc cần ổ vật lý thứ hai. |
| Theo dõi | [Uptime Kuma](https://github.com/louislam/uptime-kuma) + [Healthchecks.io](https://healthchecks.io/pricing/) | Kuma theo dõi nội bộ; heartbeat bên ngoài chỉ gửi trạng thái, không gửi dữ liệu gia đình. |
| Sơ đồ | [Archify](https://github.com/tt-a1i/archify) | Giữ một công cụ sơ đồ duy nhất. |

## PoC cô lập trước khi dùng thật

- [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync): thử trên bản sao vault và prefix R2 riêng; không chạy đồng thời với công cụ sync vault khác.
- [immich-go](https://github.com/simulot/immich-go): nhập một lần từ iCloud/export folder, giữ nguyên nguồn và kiểm tra trùng lặp.
- [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) và [Open Food Facts](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md): chỉ hỗ trợ tra cứu dinh dưỡng/mã vạch; không dùng làm tư vấn y tế.
- [Serwist](https://github.com/serwist/serwist): chỉ cache phần giao diện không nhạy cảm nếu thực sự cần offline.
- [Backrest](https://github.com/garethgeorge/backrest): chỉ dùng nếu thay hoàn toàn lịch backup hiện tại, không chạy song song.

## Nguồn nội dung thai kỳ

- [WHO Antenatal Care](https://www.who.int/publications/i/item/9789241549912/) và [WHO SMART ANC](https://www.who.int/publications/i/item/9789240020306).
- [WHO Healthy Diet Vietnam](https://www.who.int/vietnam/news/fact-sheets/detail/healthy-diet) và [WHO Việt Nam – sức khỏe bà mẹ](https://www.who.int/vietnam/vi/health-topics/maternal-health).
- [NHS – foods to avoid](https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/) và [CDC – folic acid](https://www.cdc.gov/folic-acid/about/intake-and-sources.html).
- [Bộ Y tế – thực đơn cân bằng cho mẹ và bé](https://moh.gov.vn/home?_101_struts_action=%2Fasset_publisher%2Fview_content&_101_type=content&_101_urlTitle=bo-y-te-cong-bo-phan-mem-xay-dung-thuc-on-can-bang-dinh-duong-cho-phu-nu-mang-thai-ba-me-cho-con-bu-va-tre-em-tu-7-thang-en-60-thang-tuoi-&p_p_id=101&p_p_lifecycle=0&p_p_mode=view&p_p_state=maximized).

Nội dung hiển thị phải lưu URL nguồn và ngày rà soát. Không sao chép hàng loạt nội dung khi quyền tái sử dụng chưa rõ và không biến checklist thành công cụ chẩn đoán.

## Không đưa vào stack

- n8n, Mealie, Vikunja, Yuvomi: trùng Node-RED hoặc Grocy.
- OpenMRS/OpenSRP, Prometheus/Grafana: quá nặng so với nhu cầu gia đình hiện tại.
- MinIO, Headscale, renderer PDF và công cụ diagram thứ hai: trùng trách nhiệm đã có.
- Telegram hoặc Supabase làm kho duy nhất cho ảnh/video gốc.
- Public tunnel tới Immich, Home Assistant hoặc Node-RED.

Không có kho miễn phí và không giới hạn đủ tin cậy. [R2 Free](https://developers.cloudflare.com/r2/pricing/) và Supabase Free là lớp bổ trợ, không thay thế bản gốc trên ổ riêng và bản sao vật lý thứ hai.
