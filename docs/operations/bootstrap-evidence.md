# Em Bé — Bootstrap evidence

**Ngày xác minh gần nhất:** 2026-08-31

| Hạng mục | Kết quả |
|---|---|
| Cloudflare R2 private buckets | `embe-backup` và `embe-cache`, public domain tắt |
| Cache lifecycle | Xóa sau 30 ngày; multipart dang dở sau 7 ngày |
| R2 credential | Object Read/Write, chỉ đúng hai bucket |
| Storage PoC | Upload, download, Range, checksum, delete đạt; production tắt |
| Client-side encryption | AES-256-GCM theo chunk trước khi ghi R2 |
| DB snapshot | BabyBuddy, Memos, Grocy, Immich đạt |
| Restic R2 backup | Vòng backup mới nhất đạt, gồm 4 snapshot ứng dụng và 41 file, tag `embe-critical-r2` |
| Repository integrity | `restic check --read-data` không lỗi |
| Restore drill | 41/41 file đúng checksum; bản phục hồi tạm đã chuyển Recycle Bin |
| Immich | Các container đang healthy; media không nằm trong R2 backup nhỏ |
| Lịch sao lưu | Ba tác vụ backup, kiểm tra toàn vẹn và health audit đã cài bằng `EmBeBackupSvc`; lần chạy xác minh đạt |
| Tự phục hồi sau đăng nhập Windows | Tác vụ quyền giới hạn chờ 30 giây rồi phục hồi socket Docker bằng cách chuyển cả thư mục sang vùng cách ly, sau đó khởi động Docker và Ollama; lần chạy thật đạt, không xóa dữ liệu và không cần UAC |
| Uptime Kuma | Bảy monitor EmBe đều đang cập nhật và báo UP; health gate đọc SQLite ở chế độ chỉ đọc và chỉ ghi số lượng tổng hợp, không lưu URL hoặc nội dung gia đình |
| Grocy | Khóa tích hợp riêng đã kiểm tra; 10 danh mục nền tảng đã có, không tạo tồn kho giả |
| Home Assistant + MQTT | Tích hợp MQTT chính thức đã tạo và ở trạng thái `loaded`; chưa tạo cảm biến hoặc dữ liệu giả |
| Kho phân tích cục bộ | Lịch chạy 15 phút/lần đã cài bằng quyền giới hạn; hiện tắt an toàn vì BabyBuddy chưa có hồ sơ em bé và chưa có nguồn cảm biến/stock được phép, không tạo dữ liệu giả |
| MCP/AI chỉ đọc | Kho SQLite rỗng được khởi tạo ngay cả khi chưa có nguồn; health gate mở read-only và chạy truy vấn cố định thật, thay vì chỉ kiểm tra import module |
| Tailscale | Immich, Memos và BabyBuddy Serve đã bật ở chế độ tailnet-only; HTTPS trả 200 và Funnel tắt; probe quyền giới hạn chỉ lưu ba mã trạng thái vô danh để tác vụ health tài khoản dịch vụ xác minh |
| Chống dò mật khẩu Portal | Cloudflare Free WAF giới hạn `POST /api/auth/login` theo IP; production probe trả `303` rồi `429` cho hai lần thử sai liên tiếp |
| Mobile production audit | Khung iPhone 390×844 qua toàn bộ 5 màn hình chính: không tràn ngang, không lỗi console, form dùng cỡ chữ 16px; App Store links đạt vùng chạm 44px và Cloudflare beacon tải qua CSP |
| Mobile streaming | Trang chủ và album trả khung giao diện trước khi chờ dữ liệu riêng tư; ba lượt đo production sau warm-up ghi nhận trang chủ FCP 376–464 ms, album tốt nhất 368 ms, không tràn ngang và nội dung động vẫn tải đủ |
| Portal ảnh riêng tư | Kho preview Supabase private, RLS/server-only đạt; Portal proxy không lộ khóa hoặc locator |
| Immich media publisher | Đã nối vào tác vụ Portal bằng tài khoản dịch vụ, lỗi được cô lập và health gate fail-closed; vẫn tắt cho tới khi có album chọn lọc + API key chỉ đọc |
| Sức khỏe phần mềm | 20/20 kiểm tra đạt; gồm cổng freshness cho kho phân tích và trạng thái thật của 7 monitor; CI `main`, Vercel production và smoke test sau đăng nhập đạt |

## Go/no-go

**Chưa Go** cho nhập ảnh iPhone: máy hiện chỉ có ổ hệ thống. Dung lượng tạm thời
đã qua ngưỡng tối thiểu nhưng vẫn cần ổ media riêng, album Immich chọn lọc,
API key chỉ đọc và một lần nhập synthetic đạt trước khi dùng 10 ảnh thử.

**Chưa go-live đầy đủ** cho media thật cho đến khi có USB HDD/NAS làm bản sao
thứ ba và chạy restore drill trên chính thiết bị đó.

**Đã đạt gate vận hành nền:** backup, kiểm tra toàn vẹn và health audit chạy bằng
service account riêng; health gate hiện đạt toàn bộ và vẫn fail closed nếu một
dịch vụ, lịch đồng bộ hoặc bằng chứng an toàn bị thiếu.
