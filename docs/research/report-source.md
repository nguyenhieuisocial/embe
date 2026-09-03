# Nghiên cứu kiến trúc nền tảng dữ liệu gia đình `embe.hieu.asia`

**Ngày:** 2026-08-30  
**Đối tượng:** Chủ hệ thống và kỹ sư triển khai self-hosting  
**Phạm vi:** Lưu trữ hành trình thai kỳ, chăm sóc em bé, media dung lượng lớn, IoT, AI/MCP, portal gia đình, xuất sách PDF và logistics vật tư.

## Giả định

- Một máy chủ Linux tại nhà, một người vận hành chính, người thân chỉ xem qua điện thoại.
- `hieu.asia` đang dùng Cloudflare DNS hoặc có thể cấu hình CNAME phù hợp.
- Chỉ `embe.hieu.asia` cần truy cập công khai; màn hình quản trị dùng LAN/VPN.
- Dữ liệu sức khỏe và ảnh trẻ em không được gửi tới LLM đám mây nếu chưa có đồng ý rõ ràng.
- Mục tiêu ban đầu là một node tin cậy, khôi phục được; không giả lập high availability bằng cách tăng thêm container trên cùng một máy.

## Kết luận trực tiếp

1. BabyBuddy phù hợp làm nguồn dữ liệu sau sinh, nhưng danh sách API được tài liệu hóa không có mô hình `milestone`, webhook hay dữ liệu thai kỳ. Quy ước khả thi là `BabyBuddy Note + tag milestone`, đồng bộ bằng polling có watermark, overlap window và reconciliation hằng ngày.
2. Không cho MCP/LLM nối thẳng database production. Memos đã có MCP tích hợp; BabyBuddy có MCP dùng REST API. Một MCP riêng chỉ đọc kho `family_analytics`, còn Grocy và Home Assistant đi qua API. Cách này giảm rủi ro bỏ qua authorization và gãy khi schema ứng dụng thay đổi.
3. Immich phải giữ database trên SSD cục bộ; original media ở filesystem tương thích Unix. Import RAW/video từ LAN, dùng preview/HLS cho portal. Luôn giữ original và, với ảnh đã hậu kỳ, giữ thêm JPEG xuất từ phần mềm xử lý RAW.
4. Một hostname công khai đi theo đường Cloudflare Access -> Tunnel -> Caddy -> Portal/BFF. Token Memos và Immich chỉ tồn tại ở server; trình duyệt không gọi API nguồn trực tiếp.
5. Backup phải được đưa vào trước khi import thư viện lớn: dữ liệu ứng dụng + cấu hình + media, ba bản sao, hai loại thiết bị, một bản ngoài nhà; có kiểm tra integrity và restore drill định kỳ.
6. Grocy là nguồn sự thật cho tồn kho. Một schema procurement riêng chỉ giữ supplier SKU, báo giá, lead time và landed cost. Tự động hóa dừng ở đề xuất mua; checkout cần người duyệt.
7. Home Assistant giữ raw state trong thời gian hữu hạn (mặc định recorder là 10 ngày), còn long-term statistics là aggregate theo giờ. Vì vậy phải copy các sensor phòng ngủ cần độ phân giải cao sang kho phân tích trước khi purge.
8. Typst phù hợp pipeline sách vì hỗ trợ đánh số heading đa cấp, outline/mục lục, page numbering và padding từng cell bằng `table.inset`.

## Khoảng trống và giới hạn

- “Lượng sữa chuẩn WHO” không phải một ngưỡng chung áp dụng cho mọi trẻ khỏe mạnh. WHO cung cấp growth standards/z-score và khuyến nghị nuôi dưỡng theo lứa tuổi; mọi cảnh báo lượng sữa phải dựa trên ngưỡng do bác sĩ cấu hình, không do LLM tự suy ra.
- Tương quan nhiệt độ/độ ẩm/âm thanh với giấc ngủ chỉ là quan sát, không chứng minh nguyên nhân. Trạng thái media player chỉ cho biết track/volume/chạy-dừng, không đo được dBA hay phổ tần thực tế trong phòng.
- RAW support phụ thuộc model camera/codec. Cần test file thật từ từng máy trước khi nhập toàn bộ thư viện.
- Một máy chủ vẫn là single point of failure; RAID/ZFS mirror chỉ tăng availability, không thay thế backup.

## Claim-to-source ledger

| Claim | Nguồn chính | Truy cập | Độ tin cậy |
|---|---|---:|---|
| BabyBuddy có các REST endpoint notes/tags/sleep/feedings nhưng không liệt kê milestone/webhook | [BabyBuddy API](https://docs.baby-buddy.net/api/) | 2026-08-30 | Cao |
| BabyBuddy MCP gọi API và có nhóm tool notes/tags | [babybuddy-mcp](https://github.com/babybuddy/babybuddy-mcp) | 2026-08-30 | Cao |
| Memos REST dùng `/api/v1`, Bearer PAT; Memos có MCP `/mcp` | [Memos API](https://usememos.com/docs/api/latest), [Memos MCP](https://github.com/usememos/memos/blob/main/server/router/mcp/README.md) | 2026-08-30 | Cao |
| Memos webhook có HMAC signature, timestamp và ID chống replay | [Memos Webhooks](https://usememos.com/docs/integrations/webhooks) | 2026-08-30 | Cao |
| Immich cần local SSD cho Postgres, cần tối thiểu 6 GB RAM; thumbnail/transcode tăng dung lượng trung bình 10–20% | [Immich Requirements](https://docs.immich.app/install/requirements/) | 2026-08-30 | Cao |
| Immich hỗ trợ RAW/video phổ biến, hardware ML và transcoding | [Supported formats](https://docs.immich.app/features/supported-formats/), [ML acceleration](https://docs.immich.app/features/ml-hardware-acceleration/), [Hardware transcoding](https://docs.immich.app/features/hardware-transcoding/) | 2026-08-30 | Cao |
| Immich cần backup cả DB lẫn assets và khuyến nghị 3-2-1 | [Immich Backup and Restore](https://docs.immich.app/administration/backup-and-restore/) | 2026-08-30 | Cao |
| Grocy có OpenAPI và auth bằng `GROCY-API-KEY` | [Grocy OpenAPI](https://github.com/grocy/grocy/blob/master/grocy.openapi.json) | 2026-08-30 | Cao |
| Home Assistant REST/WebSocket hỗ trợ history/state stream; recorder raw mặc định 10 ngày, hourly statistics không purge | [HA REST API](https://developers.home-assistant.io/docs/api/rest/), [HA WebSocket](https://developers.home-assistant.io/docs/api/websocket/), [Recorder](https://www.home-assistant.io/integrations/recorder), [Statistics](https://data.home-assistant.io/docs/statistics/) | 2026-08-30 | Cao |
| MCP HTTP cần authorization đúng audience, không token passthrough; tool nhạy cảm cần human control | [MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), [MCP Tools](https://modelcontextprotocol.io/specification/draft/server/tools) | 2026-08-30 | Cao |
| Cloudflare Tunnel dùng kết nối outbound-only; Access bảo vệ self-hosted app và hỗ trợ OTP allowlist | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/), [Self-hosted Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) | 2026-08-30 | Cao |
| Docker user-defined bridge cô lập network; Compose secrets mount riêng theo service | [Docker bridge](https://docs.docker.com/engine/network/drivers/bridge/), [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) | 2026-08-30 | Cao |
| WHO cung cấp z-score/growth indicators, khuyến nghị exclusive breastfeeding 6 tháng | [WHO growth tools](https://www.who.int/tools/child-growth-standards/software), [WHO feeding facts](https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding) | 2026-08-30 | Cao |
| Typst hỗ trợ heading numbering, outline, page numbering, table cell inset | [Heading](https://typst.app/docs/reference/model/heading/), [Table](https://typst.app/docs/reference/model/table/), [Page](https://typst.app/docs/reference/layout/page/) | 2026-08-30 | Cao |
| Restic hỗ trợ snapshot/restore và kiểm tra toàn bộ dữ liệu repository | [Restic quickstart](https://restic.readthedocs.io/en/stable/010_introduction.html), [Repository check](https://restic.readthedocs.io/en/stable/045_working_with_repos.html) | 2026-08-30 | Cao |

## Bổ sung 03-09-2026 — Mẹo và quan niệm dân gian trong thai kỳ

**Đối tượng:** Mẹ Ngân và Ba Hiếu; nội dung tra nhanh trên iPhone, không phải
phác đồ điều trị. **Phạm vi:** những lời truyền miệng và cách giảm khó chịu hay
gặp trong gia đình Việt. Không đưa vào mẹo không thể tìm được nguồn y khoa đủ
tin cậy, không ghi liều thuốc/thảo dược và không thay chỉ dẫn của nơi khám.

Kết luận triển khai là tách “mẹo có thể thử” khỏi “lời truyền miệng”, sau đó gắn
mỗi nội dung với một trong bốn mức an toàn. Các bổ sung có đủ căn cứ gồm: chia
nhỏ bữa khi ợ nóng; chất xơ, nước và vận động nhẹ khi táo bón; kê chân và đi lại
nhẹ khi phù tăng từ từ; tư thế và chườm ấm mức thấp khi đau lưng; không dùng
Doppler tại nhà để tự trấn an; không tự dùng dầu thầu dầu, thảo dược, tắm nóng
hoặc quan hệ để giục sinh; giảm khói nhang/trầm trong nhà; và không gán màu da,
màu tóc của Bé cho một món ăn riêng.

| Tuyên bố | Nguồn chính | Truy cập | Độ tin cậy / giới hạn |
|---|---|---:|---|
| Bữa nhỏ, ngồi thẳng và không ăn sát giờ ngủ có thể giảm ợ nóng | [NHS — Indigestion and heartburn](https://www.nhs.uk/pregnancy/common-symptoms/indigestion-and-heartburn/) | 2026-09-03 | Cao; thuốc vẫn phải hỏi nơi khám/dược sĩ |
| Chất xơ, nước và vận động nhẹ là bước đầu hỗ trợ táo bón | [NHS — Common health problems](https://www.nhs.uk/pregnancy/common-symptoms/common-health-problems/) | 2026-09-03 | Cao; không tự dừng sắt |
| Phù tăng từ từ có thể hỗ trợ bằng kê chân, giày thoải mái và đi lại nhẹ | [NHS — Swelling in pregnancy](https://www.nhs.uk/pregnancy/common-symptoms/swollen-ankles-feet-and-fingers/) | 2026-09-03 | Cao; phù đột ngột có thể là dấu hiệu cần đánh giá ngay |
| Tư thế, cách nhấc đồ và chườm ấm mức thấp có thể giúp đau lưng | [ACOG — Back Pain During Pregnancy](https://www.acog.org/womens-health/faqs/back-pain-during-pregnancy) | 2026-09-03 | Cao; đau nặng hoặc triệu chứng kèm cần khám |
| Doppler tại nhà không đánh giá được thai có đang khỏe | [NHS — Your baby's movements](https://www.nhs.uk/pregnancy/keeping-well/your-babys-movements/) | 2026-09-03 | Cao |
| Siêu âm thai được thực hiện trong chăm sóc y tế không có nguy cơ đã biết | [NHS — Ultrasound scans](https://www.nhs.uk/pregnancy/your-pregnancy-care/ultrasound-scans/) | 2026-09-03 | Cao; không phát hiện được mọi vấn đề |
| Không có đủ bằng chứng ủng hộ các mẹo tự giục sinh | [NICE NG207](https://www.nice.org.uk/guidance/ng207/chapter/Recommendations) | 2026-09-03 | Cao |
| Nhang là nguồn ô nhiễm không khí trong nhà | [WHO — Air pollution Q&A](https://www.who.int/news-room/questions-and-answers/item/air-pollution-personal-interventions-and-risk-communication) | 2026-09-03 | Cao về nguồn phơi nhiễm; không định lượng nguy cơ cá nhân |
| Màu da và tóc chịu ảnh hưởng di truyền, không do một món Mẹ ăn | [MedlinePlus — Genetics](https://www.medlineplus.gov/ency/article/002048.htm) | 2026-09-03 | Cao về vai trò gene |

Không bổ sung các lời đồn về dây rốn quấn cổ, hình dạng bụng hoặc những nghi lễ
cụ thể khi không tìm được nguồn chính thống đủ trực tiếp để phát biểu chắc chắn.
Điểm dừng đạt được khi mọi nội dung mới đều có nguồn chính, hành động cụ thể và
giới hạn an toàn rõ ràng; tìm thêm các bài lặp lại không làm thay đổi kết luận.

## Dừng nghiên cứu

Các quyết định ảnh hưởng lớn đã có tài liệu chính thức hoặc source repository hỗ trợ; những phần còn phụ thuộc phần cứng, router, camera, ISP và nhà cung cấp e-commerce cụ thể được chuyển thành discovery/benchmark trong roadmap thay vì đoán cấu hình.
