# Supabase Read-Model Boundary

**Mục tiêu Task 6:** Supabase chỉ giữ dữ liệu `portal_read_model` đã duyệt, có thể rebuild từ nguồn nội bộ; không là hệ thống nguồn.

## Thành phần cho phép ghi vào Supabase

- `portal_read_model.timeline_event`: ingest service của local stack (ETL sync) ghi dữ liệu đã tiền xử lý.
- Dữ liệu chỉ gồm:
  - `source_system`, `source_event_id`
  - `event_at`, `portal_event_type`, `title`, `caption`
  - `album_cover_url`, `portal_role`, `approved`, `approved_at`

## Thành phần tuyệt đối KHÔNG cho phép vào Supabase

- Dữ liệu y tế dạng raw, GPS/location, token API, credentials.
- Tên file media gốc, SHA thông tin định danh media nhạy cảm, raw note private.
- Thông tin vận hành server/source secrets.

## Bảo vệ truy cập

- Dùng schema riêng: `portal_read_model`.
- Expose schema tối thiểu qua Data API (`config.toml`: `schemas = ["portal_read_model", "public"]`).
- `timeline_event` bật `RLS` + `FORCE RLS`.
- `anon`: có quyền đọc view nhưng policy trả về 0 bản ghi (`USING false`).
- `authenticated` không tự động được xem dữ liệu. JWT còn phải có
  `app_metadata.portal_role = family`, do server quản trị; khi đó chỉ đọc bản
  ghi `approved = true`.
- Viết từ role client bị khóa:
  - `INSERT`, `UPDATE`, `DELETE` đều `WITH CHECK (false)` / `USING false`.
- `timeline_event_public` là view `security_invoker = true`.

## Vai trò

- `anon`: public/unauthenticated query path.
- `authenticated`: chỉ trở thành family reader khi JWT có app metadata hợp lệ.
- `service_role`: chỉ ở server-side ingest; tuyệt đối không đưa vào browser.

## Kiểm thử bắt buộc

`supabase/tests/rls.sql` (pgTAP) kiểm chứng:

- Anonymous có đúng 0 rows.
- Family/Authenticated chỉ thấy rows đã được approved.
- Client không thể `INSERT` / `UPDATE` / `DELETE`.

Chạy local bằng CLI chính thức:

```powershell
npx -y supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor
npx -y supabase test db --local
npx -y supabase db advisors --local
npx -y supabase stop
```

## Cập nhật boundary khi mở rộng

- Không thay đổi mô hình này cho đến khi có yêu cầu rõ ràng.
- Mọi cột mới phải đi qua review:
  - Có thuộc tính PII/sensitivity? nếu có => từ chối hoặc pseudonymize trước sync.
  - Có thể tạo row-level policy tương ứng cho `approved`, role, timeline.
