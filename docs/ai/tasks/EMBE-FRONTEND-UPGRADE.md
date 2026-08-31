# EMBE-FRONTEND-UPGRADE

## Goal

Hoàn thiện Family Portal thành mobile web-app gần native, ưu tiên iPhone/iOS Safari,
đồng thời hoàn tất PWA, mạng yếu/offline, nội dung thai kỳ, nhật ký gia đình,
accessibility, hiệu năng, privacy analytics và trạng thái giao diện đầy đủ.

## Context

- Production: `https://embe.hieu.asia`
- Project root: `C:\EmBe`
- Người dùng chính: Mẹ Ngân (Trần Ngọc Quỳnh Ngân), Ba Hiếu (Nguyễn Xuân Hiếu)
- 99% lượt dùng bằng điện thoại; thứ tự: iPhone → Android → iPad → desktop
- Repository công khai nhưng dữ liệu gia đình luôn riêng tư
- Album nguồn `C:\Anh` chứa ảnh thật; Codex chịu trách nhiệm chọn/import riêng tư
- Đọc thêm: `AGENTS.md`, `README.md`, `docs/design/mobile-first-standard.md`,
  `docs/architecture/backend-contract.md`, `docs/design/claude-design-embe-2026.md`,
  `docs/handoffs/claude-code-frontend.md`

## Current behavior

Portal đã có trang chủ, Ghi lại, Mẹ bầu, Kỷ niệm, Trợ lý, Kho đồ, Hướng dẫn và
đăng nhập. Worktree có các thay đổi hợp lệ chưa commit về service worker, offline
page, journal queue, Web Vitals, nội dung thai kỳ, ảnh minh hoạ và tests.

## Desired behavior

- Luồng hằng ngày ngắn, rõ, dùng một tay trên iPhone
- Cài được như PWA và hoạt động đúng ở standalone mode
- Khi mất mạng, không làm mất nội dung nhật ký; phản hồi rõ và tự đồng bộ lại
- Không cache hoặc rò rỉ dữ liệu gia đình qua service worker/analytics/client bundle
- Mọi trang có loading, empty, error và success state phù hợp
- Ảnh thật chỉ đi qua `/api/media/:id`, không nằm trong Git/public assets

## Business rules

- Không hiển thị dữ liệu gia đình giả như dữ liệu thật
- Nội dung y tế chỉ tham khảo, có nguồn chính thống và không thay bác sĩ
- Mutation giữ UUID v4 idempotency; retry không tạo bản ghi trùng
- Trạng thái quan trọng không được optimistic nếu rollback không an toàn

## Data model

Không thay schema trong task này. Frontend dùng stable Portal APIs hiện tại. Mọi
đề xuất schema/API mới phải ghi lại cho Codex, không tự triển khai.

## API contract

Theo `docs/architecture/backend-contract.md` và `docs/api/openapi.json`. Browser chỉ
gọi same-origin. Không gọi trực tiếp provider hoặc dịch vụ nội bộ.

## Permission rules

- Trang riêng tư dựa trên cookie HttpOnly `embe_session`
- Không dựa vào ẩn nút ở UI để thay thế authorization server
- `/offline`, `/sw.js` và health có thể public nhưng không chứa dữ liệu gia đình

## Security considerations

- Không đưa secret, raw note, filename, EXIF/GPS, face data, provider locator hoặc
  nội dung journal vào HTML public, client log hay analytics
- Service worker không cache API, login hoặc navigation response riêng tư
- GA chỉ nhận số đo kỹ thuật/sự kiện không nhạy cảm; giữ privacy flags hiện có
- Không copy bất kỳ ảnh nào từ `C:\Anh` vào repository

## UX behavior

- Giao diện như “sổ chăm sóc sống”, ấm áp, không mang dáng dashboard doanh nghiệp
- Áp dụng hệ thiết kế EmBe 2026 độc lập: paper/jade/indigo/sun/coral và motif “sợi chỉ”
- Không kế thừa, tham chiếu hoặc tái sử dụng bất kỳ design system/asset nào của iFan
- Không hover-only; touch target tối thiểu 44×44 px
- CTA chính trong vùng ngón cái; trạng thái mạng/đồng bộ dễ hiểu, không kỹ thuật

## Mobile/iOS considerations

- Safe area cho notch, Dynamic Island và Home Indicator
- Dynamic viewport; không dùng 100vh gây giật Safari
- Input ít nhất 16 px; bàn phím không che CTA/focus/error
- Bottom navigation không đè nội dung và hoạt động ở standalone mode
- Kiểm tra resume, orientation, double submit, slow network và overscroll

## Edge cases

- Offline trước khi mở app; rớt mạng giữa submit; online lại nhiều lần
- Queue cũ/hỏng/trùng; request 401/400/503; double tap
- Không có dữ liệu, không có ảnh, ảnh tải lỗi, session hết hạn
- Reduced motion, high contrast, forced colors, keyboard-only

## Performance considerations

- Không thêm dependency nếu không thật cần
- Tránh layout shift; ảnh có kích thước rõ; JS client tối thiểu
- Animation chỉ transform/opacity và tắt theo reduced motion
- Không prefetch/download dữ liệu gia đình không cần thiết

## Implementation constraints

- Claude Code là implementation owner cho phạm vi frontend ghi trong
  `docs/handoffs/claude-code-frontend.md`
- Không reset/stash/checkout thay đổi hiện có; không commit/push/deploy
- Không sửa API, backend, schema, infra hoặc album
- Inspect và lập plan ngắn trước khi implement; ưu tiên reuse pattern hiện có

## Acceptance criteria

- PWA/offline/journal flow đáp ứng hành vi mô tả trên
- Không có overflow ngang hoặc vùng chạm dưới 44 px ở luồng chính
- Không có CTA bị Home Indicator hoặc bàn phím che
- Focus, contrast, screen reader landmark và reduced motion đạt mức cơ bản
- Không có dữ liệu/ảnh thật trong Git diff
- Không còn P0/P1 sau review độc lập của Codex

## Test requirements

- `npm test`
- `npm run typecheck`
- `npm run build`
- Kiểm tra iPhone SE 375×667, iPhone 15 Pro 393×852, iPhone 15 Pro Max 430×932,
  Android 412×915, iPad 768×1024 và desktop
- Thêm regression test cho lỗi được phát hiện; không nới assertion để che lỗi

## Out of scope

- Thay đổi business logic/backend/schema
- Đưa Telegram Storage thành primary
- Upload ảnh thật vào Git/public asset
- Thêm framework UI mới
- Deploy production trước khi Codex review và chấp nhận

## Review protocol

Claude implement → Codex review độc lập theo P0/P1/P2/P3 → Claude sửa P0/P1 và thêm
regression test → Codex verify compiler/tests/build/runtime/mobile → final acceptance.
