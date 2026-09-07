# Chỉ mục mã nguồn GitNexus của EmBe

## Mục đích và phạm vi

GitNexus giúp tìm quan hệ giữa component, API, hàm xử lý và nơi gọi hàm.
Đây là công cụ đọc mã nguồn, không phải tính năng trên website và không thay thế
kiểm tra luồng thực tế trên iPhone. Quan hệ gọi động, HTTP và SQL có thể không được
nhận diện đầy đủ; luôn đối chiếu kết quả với mã nguồn hiện tại.

- CLI cài riêng: `C:\EmBe\tools\bin\gitnexus`, phiên bản `1.6.11`.
- Chỉ mục: `C:\EmBe\.gitnexus` (không đưa lên Git).
- Registry riêng: `C:\EmBe\tools\bin\gitnexus\state`.
- Chỉ quét mã nguồn trong `apps/portal/src`, `apps/portal/tests`, `services`,
  `supabase`, `infra`, `scripts`; xem `.gitnexusignore` để biết loại trừ cụ thể.
- Không quét vault Obsidian, ảnh, bản sao lưu, dữ liệu vận hành, `.env`, khóa,
  session Telegram hoặc tài liệu gia đình. Chỉ mục vẫn chứa mã nguồn nên phải giữ riêng tư.
- Không tạo embeddings, không gọi LLM để xử lý mã nguồn, không cần API token.
- Không chạy watcher, Scheduled Task hoặc dịch vụ tự khởi động; không tự commit/push.
- `indexOnly` bảo toàn `AGENTS.md`, `CLAUDE.md`, hooks và các skills hiện có.

## Sử dụng

Chạy từ `C:\EmBe` bằng Node.js 22.18+ (hoặc 24.11+):

```sh
node scripts/gitnexus.mjs analyze
node scripts/gitnexus.mjs status
node scripts/gitnexus.mjs query "suggestCurrentMealMenus" --repo embe
node scripts/gitnexus.mjs context suggestCurrentMealMenus --repo embe
```

Wrapper dùng Node trực tiếp, ẩn cửa sổ tiến trình con trên Windows và chọn registry
riêng của EmBe. Phân tích dùng hai worker; giới hạn heap Node là 4 GiB và bộ đệm
LadybugDB là 512 MiB. Đây không phải giới hạn RAM tổng của mọi tiến trình.

Chỉ cập nhật chỉ mục khi cần phân tích mã vừa thay đổi, không chạy lại liên tục.
Chỉ mục bao gồm mã chưa commit; trạng thái chỉ mục không chứng minh website đã triển khai.

## Giới hạn đã quan sát khi lập chỉ mục

Lần đầu ngày 07/09/2026 đã quét 708 tệp và tìm được 513 luồng. Truy vấn
`suggestCurrentMealMenus` tìm được định nghĩa, nơi gọi trong `MealPhotoTracker`
và bài kiểm tra liên quan. Công cụ có cảnh báo một số liên kết khác ngôn ngữ
không được nối và một số nhánh/điểm bắt đầu vượt ngân sách phân tích luồng.
Vì vậy, kết quả không có một luồng KHÔNG đồng nghĩa chức năng đó chưa tồn tại.
Không tăng giới hạn hoặc cài thêm mô hình chỉ để làm đẹp số lượng kết quả.

## Cài lại công cụ (Windows x64)

Không cần thay package dependencies của portal hoặc công cụ dùng chung:

```sh
npm install --prefix tools/bin/gitnexus --save-exact gitnexus@1.6.11 @ladybugdb/core-win32-x64@0.19.1 --omit=optional --ignore-scripts --no-audit --no-fund
node tools/bin/gitnexus/node_modules/@ladybugdb/core/install.js
node scripts/gitnexus.mjs analyze
```

Chỉ chạy `install.js` sau khi xác nhận tệp
`tools/bin/gitnexus/node_modules/@ladybugdb/core-win32-x64/lbugjs.node` tồn tại,
và không đặt `npm_config_build_from_source`. Script sẽ chép binary có sẵn;
không cần build C++ hoặc tải mô hình embeddings. Việc cài package cần mạng;
các truy vấn mã nguồn không cần dịch vụ AI bên ngoài.

## MCP khi cần

CLI đã dùng được mà không cần cấu hình MCP. Nếu kết nối với một phiên Codex/Claude
khác, server stdio là `node C:\EmBe\scripts\gitnexus.mjs mcp` (không cần token).
Dùng Node đúng phiên bản và đăng ký theo cấu hình được runtime đó hỗ trợ.
Không tự ghi đè MCP toàn máy hoặc registry của dự án khác. Phiên đã mở có thể
cần nạp lại cấu hình mới; không được giả định tool đã xuất hiện trước khi kiểm tra.

Tài liệu gốc: [GitNexus CLI](https://github.com/abhigyanpatwari/GitNexus/blob/main/gitnexus/README.md).
