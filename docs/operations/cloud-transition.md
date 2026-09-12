# Chuyển EmBe sang vận hành online

## Đã áp dụng ngày 12/09/2026

- Nhật ký mới: `embe_submit_journal` ghi trực tiếp vào timeline riêng tư trên
  Supabase với nguồn `portal_journal`. Không cần Memos/Ollama/máy Windows để
  lưu hoặc xem. Khóa gửi lại giữ tính idempotent; gửi lại cùng khóa nhưng khác
  nội dung không được ghi đè. Các yêu cầu đã vào inbox cũ vẫn giữ cơ chế cũ.
- Memos chỉ tiếp tục đồng bộ dữ liệu nguồn Memos; không được làm ẩn các nhật ký
  cloud. Nhật ký cloud mới không tự tạo bản sao Memos/vault. Xuất dữ liệu gia
  đình lấy cả hai nguồn. Không di chuyển/xóa các nhật ký cũ trong lần này.
- Backup R2 đã được chạy lại sau khi cách ly bản staging cũ, giữ nguyên checksum.
  Restore snapshot đầu tiên ngày 12/09 đối chiếu 46/46 tệp. Đây là xác minh tệp,
  không phải khôi phục cả hệ thống ứng dụng vào một máy chủ mới.
- Export Supabase nay bao gồm `portal_read_model`, `embe_studio`, `public`
  (các bảng, hàm, view của ứng dụng), có kiểm tra đúng project EmBe. Giữ tên
  hai file SQL cũ để tương thích pipeline và manifest.
- Kho đồ dùng: tạo món đồ và đổi số lượng được lưu cùng biên nhận trực tiếp
  trong một giao dịch Supabase. Lưu nhóm đồ, số lượng trước khi đổi, thời điểm
  hoàn tất; gửi lại không nhân đôi hoặc kéo số lượng về một thay đổi cũ.
  Snapshot Grocy cũ không còn được ghi đè hay ẩn đồ dùng trên web. Dữ liệu Grocy
  vẫn giữ nguyên tại máy nhà; không phải bản sao đồng bộ của kho cloud mới.
- Trạng thái Nhật ký kiểm tra khả năng đọc timeline riêng tư trên cloud,
  không dùng lần chạy Memos gần nhất để kết luận nhật ký đang chậm/ngừng.
  Đây là kiểm tra kết nối đọc, không phải bằng chứng một lần ghi mới thành công.

## Ranh giới chưa được giải quyết

Backup SQL không bao gồm byte của Supabase Storage, schema do nền tảng quản lý
(`auth`, `storage`, `vault`) hoặc 365 GB ảnh/video gốc Immich. Backup vẫn được
khởi chạy từ máy nhà; lưu đích R2 không biến nó thành một tác vụ cloud.

| Nhóm | Đã online | Còn phụ thuộc local / việc tiếp theo |
|---|---|---|
| Web và dữ liệu nhập | Vercel + Supabase | Kết nối quản trị hiện không thấy dự án EmBe; Git deploy vẫn hoạt động |
| Ảnh món ăn, hồ sơ, previews | Supabase Storage private | Ảnh gốc Immich và nhập ảnh mới vào thư viện |
| Nhật ký | Ghi/xem/xuất mới trực tiếp Supabase | Memos/vault cũ là nguồn riêng, không phải backup nhật ký cloud mới |
| AI món ăn, tài liệu, trợ lý | Hàng đợi và kết quả Supabase | Ollama/worker local; cần provider cloud có quyền truy cập, thử chất lượng và giới hạn chi phí |
| Kho đồ dùng | Tạo/đổi số lượng/xem/nhắc sắp hết trực tiếp Supabase | Grocy và dự toán mua sắm local là nguồn riêng; không tự đặt mua |
| Chăm sóc bé | Dữ liệu web Supabase | Cầu nối BabyBuddy/Memos và analytics local |
| Studio | Kịch bản, hàng đợi, tệp đã dựng trên cloud | TTS/model/render local; chưa tự đăng social hoàn chỉnh |
| Thông báo | GitHub Actions → Vercel | Lịch Actions không bảo đảm nhắc chính xác từng phút; chưa thử iPhone thật |
| PDF tháng | Pipeline có sẵn | Export Memos + Typst local; cần nguồn cloud và runner riêng |
| Backup | R2 riêng tư, mã hóa restic | Cần tác vụ cloud riêng, credential giới hạn quyền và sao lưu byte tệp |
| Apple Health/cảm biến | API nhận dữ liệu online | iPhone/thiết bị nhà vẫn phải thu thập và cấp quyền |

## Quy tắc chuyển tiếp

1. Không tắt worker cũ trước khi có bản thay thế chạy thật và phương án quay lại.
2. Không đưa ảnh/giấy tờ gia đình vào Git, log CI, artifact công khai hay AI
   miễn phí khi chưa kiểm tra chính sách dữ liệu của provider.
3. Không tự nâng gói, mua GPU/VPS hay di chuyển toàn bộ kho Immich. Ưu tiên
   hạn mức miễn phí có giới hạn cứng; hết hạn mức phải báo rõ, không giả thành công.
4. Mỗi bước cần đối chiếu số lượng/checksum, chống ghi trùng, kiểm tra phân quyền,
   khôi phục và xác minh khi worker local không tham gia xử lý.

## Kiểm thử nhật ký

`supabase/tests/journal_cloud_primary.sql` chỉ chạy trên DB fixture cô lập.
Nạp role fixture, các migration timeline/inbox gốc, migration cloud mới rồi test.
Đã chạy PostgreSQL 16 trong container không mạng, 256 MB RAM, 0,5 CPU; khi nạp
DDL gốc PostgreSQL 17, chỉ bỏ quyền `MAINTAIN` không có ở PostgreSQL 16.
Không đưa dữ liệu gia đình vào fixture. 31 kiểm thử portal nhật ký liên quan đạt.

## Kiểm thử kho đồ dùng

`supabase/tests/inventory_cloud_primary.sql` chạy trong DB fixture không mạng,
không có dữ liệu gia đình. Kiểm tra lưu tức thì, gửi trùng/xung đột, bản gửi lại
cũ không làm lùi số lượng mới, không nhận snapshot Grocy cũ, dữ liệu không hợp lệ
không để lại biên nhận, và quyền truy cập riêng tư. Hai tiến trình gửi cùng khóa
đồng thời trả cùng biên nhận, chỉ tạo một món đồ. 8 kiểm thử worker và 21 kiểm thử
portal liên quan đạt; typecheck đạt. Cắt chuyển từ chối nếu còn lệnh cũ chưa
hoàn tất. Trước cắt chuyển, kho cloud có 0 món và 0 lệnh: không xóa dữ liệu cũ.

Tác vụ Windows `EmBe Inventory Worker` có thể tắt sau khi xác minh chế độ cloud;
không tắt container Grocy vì các công cụ local khác có thể còn dùng. Bật lại
tác vụ không khôi phục Grocy làm nguồn chính: muốn quay lại cần đối soát và
di chuyển dữ liệu cloud trước, không chỉ áp lại hàm SQL cũ.

## Nguồn giới hạn nền tảng

- [Vercel Functions](https://vercel.com/docs/functions/limitations)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions/limits)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/)

Các trang này cần đối chiếu lại khi chọn gói. Chưa coi AI/OCR cloud, render cloud,
backup cloud độc lập hoặc thay thế toàn bộ Immich là đã triển khai.
