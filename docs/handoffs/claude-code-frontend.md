# Bàn giao Claude Code — EmBe frontend

## Cách bắt đầu

Đọc theo thứ tự:

1. `AGENTS.md`
2. `README.md`
3. `docs/design/mobile-first-standard.md`
4. `docs/architecture/backend-contract.md`
5. `docs/design/claude-design-embe-2026.md`
6. File này

Làm trực tiếp trong `C:\EmBe`. Worktree đang có thay đổi chưa commit của Codex;
đó là công việc hợp lệ đang làm, không được reset, checkout, stash hoặc ghi đè.

## Mục tiêu sản phẩm

EmBe là web-app gia đình riêng tư tại `https://embe.hieu.asia`, dùng để lưu hành
trình thai kỳ và sự phát triển của em bé. 99% lượt dùng là điện thoại, ưu tiên theo
thứ tự iPhone/iOS Safari → Android → iPad → desktop. Trải nghiệm phải gần native,
dùng tốt bằng một tay, không phụ thuộc hover, tôn trọng safe area/notch/Dynamic
Island/Home Indicator, bàn phím ảo và cỡ chữ tiếng Việt.

Người dùng chính:

- Mẹ Ngân — Trần Ngọc Quỳnh Ngân
- Ba Hiếu — Nguyễn Xuân Hiếu
- Ông bà hai bên chỉ xem nội dung gia đình được chia sẻ

Ngôn ngữ giao diện: tiếng Việt tự nhiên, ấm áp, ngắn gọn, không dùng thuật ngữ kỹ
thuật. Triển khai theo Claude Design EmBe 2026, tuyệt đối không lấy design system,
asset hoặc component từ iFan. Hệ mới là “sổ chăm sóc sống”, không phải dashboard.

## Phân chia trách nhiệm để không xung đột

Claude Code sở hữu phần frontend trong lượt làm song song này:

- `apps/portal/src/app/**`, trừ toàn bộ `apps/portal/src/app/api/**`
- `apps/portal/src/components/**`
- `apps/portal/src/app/globals.css`
- test giao diện tại `apps/portal/tests/**`

Codex đang sở hữu và có thể thay đổi song song:

- rà soát album `C:\Anh`, chọn ảnh và tạo derivative riêng tư
- `apps/portal/src/app/api/**`, media/data adapters và backend contract
- `services/**`, `infra/**`, `supabase/**`, script vận hành
- luồng import/sync ảnh riêng tư và kiểm tra hệ thống

Không sửa file ngoài phạm vi Claude Code. Nếu cần đổi API hoặc schema, ghi đề xuất
vào cuối file này dưới mục `Đề xuất cho Codex`, không tự sửa.

Không commit, push hoặc deploy. Codex sẽ tích hợp, chạy full gate và phát hành một
lần sau khi hai phần hoàn tất. Không chạy Docker, PowerShell task, migration hoặc
script hạ tầng.

## Trạng thái frontend hiện tại

Các thay đổi chưa commit đã có và cần được giữ/hoàn thiện:

- PWA service worker an toàn, trang offline và runtime báo mất mạng
- hàng đợi nhật ký cục bộ khi mạng yếu, replay bằng cùng idempotency key
- Web Vitals gửi số đo kỹ thuật tối thiểu qua Google Analytics
- nội dung chăm sóc thai kỳ theo giai đoạn và dấu hiệu cần liên hệ cơ sở y tế
- ảnh minh hoạ tạo riêng cho hero, trang thai kỳ và album trống
- skip link, privacy flags cho Google Analytics, public route `/offline` và `/sw.js`
- test mới cho PWA/offline, hàng đợi nhật ký, thai kỳ, analytics và mobile shell

Các file ảnh minh hoạ an toàn để commit:

- `apps/portal/public/illustrations/family-thread-hero.webp`
- `apps/portal/public/illustrations/memory-album-empty.webp`
- `apps/portal/public/illustrations/pregnancy-care.webp`

Ảnh thật của gia đình nằm ở `C:\Anh` và tuyệt đối không được copy vào `public/`,
Git hoặc gửi tới dịch vụ AI. Codex sẽ chọn/import vào media riêng tư. Frontend chỉ
được hiển thị ảnh thật qua route cùng origin `/api/media/:id`; không dùng đường dẫn
ổ đĩa, URL Telegram/Immich/Supabase hoặc provider locator.

## Công việc Claude Code cần hoàn thiện

0. Làm lại toàn bộ UI theo `docs/design/claude-design-embe-2026.md` và bản tương tác
   Claude Design được liên kết trong đó. Giữ business logic/API đã có; thay phần trình
   bày, navigation, interaction và trạng thái để khớp đặc tả.

1. Hoàn thiện CSS cho các class mới đang có trong page/component, bao gồm skip link,
   banner mất mạng, hero art, phần thai kỳ, prompt nhật ký, trạng thái chờ đồng bộ,
   album trống và trang offline.
2. Rà toàn bộ luồng mobile: trang chủ, Ghi lại, Mẹ bầu, Kỷ niệm, Trợ lý, Kho đồ,
   Hướng dẫn và đăng nhập. Mỗi tác vụ chính phải dùng được bằng một tay trên iPhone.
3. Hoàn thiện PWA: installability, standalone mode, safe area, dynamic viewport,
   loading/empty/error/offline state. Không cache API, HTML riêng tư hoặc dữ liệu gia
   đình trong service worker.
4. Hoàn thiện accessibility: landmark/heading, label, focus-visible, contrast,
   reduced motion, forced colors, screen reader live region vừa đủ và target 44px.
5. Hoàn thiện performance: tránh layout shift, ảnh có kích thước rõ, không thêm
   dependency, JavaScript tối thiểu, chuyển động chỉ dùng transform/opacity.
6. Analytics chỉ đo sự kiện sản phẩm không nhạy cảm. Không gửi tên, ghi chú, ảnh,
   tình trạng thai kỳ, URL media, nội dung journal hoặc định danh gia đình. GA ID hiện
   dùng là `G-PTX99GX5F9`; giữ `anonymize_ip`, tắt ad personalization và Google signals.
7. Bảo đảm mọi text là tiếng Việt tự nhiên và không hiển thị dữ liệu gia đình giả.
   Empty state trung thực khi chưa có dữ liệu.
8. Chạy `npm test`, `npm run typecheck`, `npm run build` trong `apps/portal`. Sửa lỗi
   thuộc phạm vi frontend; không nới test để che lỗi.

## Ràng buộc bảo mật và dữ liệu

- Browser chỉ gọi route same-origin. Không gọi trực tiếp Supabase, Immich, Memos,
  BabyBuddy, Grocy, Telegram hoặc Ollama.
- Mọi trang riêng tư dựa trên cookie HttpOnly; không đưa secret vào client bundle,
  `NEXT_PUBLIC_*`, HTML, log hoặc analytics.
- Raw health note, filename, EXIF/GPS, face data và provider locator không xuất hiện
  ở frontend.
- Telegram chỉ là replica mã hoá; không mô tả nó là nơi lưu duy nhất.
- Không thêm nội dung y tế mới nếu không có nguồn chính thống; luôn giữ ranh giới
  “tham khảo, không thay thế bác sĩ”.

## Tiêu chí hoàn tất

- Test/typecheck/build đều xanh.
- Kiểm tra portrait trước ở iPhone SE (375×667), iPhone 15 Pro (393×852), iPhone
  15 Pro Max (430×932), sau đó Android 412×915, iPad 768×1024 và desktop.
- Không có overflow ngang, nút bị che bởi Home Indicator, input bị zoom, modal/menu
  kẹt do bàn phím, hoặc hành vi chỉ hoạt động khi hover.
- Không có ảnh thật trong Git status.
- Cuối lượt, báo đúng ba phần: đã làm gì, kết quả kiểm tra, đề xuất cần Codex xử lý.

## Đề xuất cho Codex

Claude Code ghi các thay đổi backend/API/schema cần thiết tại đây, không tự thực hiện.

### 1. `/api/pregnancy` và `/api/inventory` trả 503 khi thiếu cấu hình

Khi chạy cục bộ không có backend, hai route trả `503 temporarily_unavailable`. Frontend
đã xử lý đúng (hiện trạng thái "sẽ đồng bộ khi có mạng" và thẻ lỗi có nút thử lại), nên
đây **không phải lỗi**. Chỉ ghi lại để Codex xác nhận rằng ở production hai route này
luôn có cấu hình, vì người dùng không phân biệt được "mất mạng" với "server chưa cấu hình".

### 2. Hàng đợi nhật ký — đã xử lý sau review

Vòng sửa P1 đã phân biệt ba trường hợp: ghi chú `400` bị loại riêng và luồng tiếp tục;
ghi chú `401` được giữ nguyên để gửi sau khi đăng nhập lại; lỗi mạng/5xx giữ nguyên phần
còn lại. Trang Ghi lại hiển thị đúng trạng thái cần đăng nhập và không đổi idempotency key.
Regression tests cho các nhánh này nằm trong bộ test Portal.

### 3. CSP thiếu `unsafe-eval` làm hỏng React ở chế độ `next dev`

`apps/portal/next.config.ts` (thuộc sở hữu Codex) áp cùng một CSP cho mọi môi trường.
Ở `next dev`, console báo `eval() is not supported in this environment`. Production
**không** bị ảnh hưởng, nhưng việc phát triển cục bộ bị suy giảm.

Đề xuất: chỉ thêm `'unsafe-eval'` khi `process.env.NODE_ENV !== "production"`. Claude không
tự sửa vì `next.config.ts` nằm ngoài phạm vi frontend được giao.

### 4. Ghi chú: `public/sw.js` đã được Claude sửa

Ngoài 4 nhóm file được giao, Claude có sửa `apps/portal/public/sw.js` vì mục 3 trong phần
"Công việc Claude Code cần hoàn thiện" giao rõ việc hoàn thiện PWA. Hai thay đổi:

- `caches.match("/offline")` có thể trả `undefined`, khiến `respondWith` bị reject và
  người dùng thấy trang lỗi trắng của trình duyệt thay vì trang `/offline`. Đã thêm fallback.
- `cache.addAll` có tính nguyên tử: chỉ cần một icon lỗi là service worker không cài được
  và **mất toàn bộ khả năng offline**. Đã tách `/offline` (bắt buộc) khỏi icon (tùy chọn).

Nếu Codex muốn giữ quyền sở hữu file này, báo lại để Claude hoàn nguyên.
