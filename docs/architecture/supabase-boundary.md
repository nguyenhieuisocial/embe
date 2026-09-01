# Supabase Read-Model Boundary

**Mục tiêu hiện tại:** Supabase là kho riêng tư cho trạng thái web-app cần đồng bộ
giữa iPhone của Hiếu và Ngân. Media gốc và nhật ký dài hạn vẫn thuộc Immich,
Memos/BabyBuddy hoặc vault tại máy nhà.

## Thành phần cho phép ghi vào Supabase

- `portal_read_model.timeline_event`: ingest service của local stack (ETL sync) ghi dữ liệu đã tiền xử lý.
- Dữ liệu chỉ gồm:
  - `source_system`, `source_event_id`
  - `event_at`, `portal_event_type`, `title`, `caption`
  - `album_cover_url`, `portal_role`, `approved`, `approved_at`
- Các bảng kế hoạch, thai kỳ và sức khỏe thai kỳ giữ dữ liệu nhập trực tiếp từ
  portal để hai điện thoại thấy cùng một trạng thái. Chúng chỉ được gọi qua API
  server đã xác thực; browser không có quyền đọc/ghi trực tiếp.
- `photo_upload` và `meal_analysis` giữ metadata hàng đợi. File ảnh trong
  Supabase Storage chỉ là bản tạm để worker máy nhà nhập vào Immich hoặc phân
  tích; worker xóa object sau khi hoàn tất.

## Thành phần tuyệt đối KHÔNG cho phép vào Supabase

- Hồ sơ bệnh án, ảnh giấy khám, kết quả xét nghiệm dạng file/raw, tọa độ GPS
  chính xác, token API, credentials.
- Tên file media gốc, SHA thông tin định danh media nhạy cảm, raw note private.
- Thông tin vận hành server/source secrets.

## Ngoại lệ địa danh an toàn cho Kỷ niệm

- `media_item` chỉ được nhận `place_city`, `place_region`, `place_country` do
  Immich reverse-geocode ngay trên máy nhà.
- Không đồng bộ `latitude`, `longitude`, địa chỉ, tên file gốc hoặc toàn bộ
  EXIF. Frontend chỉ nhận địa danh cấp thành phố/tỉnh để gom Chuyến đi và tô
  Bản đồ ký ức.
- Ba trường địa danh đều không bắt buộc, giới hạn 80 ký tự và có thể rebuild
  từ album Immich đã duyệt.

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

- Không mở thêm dữ liệu nhạy cảm ngoài các ngoại lệ vận hành đã ghi ở trên nếu
  chưa có yêu cầu rõ ràng và kiểm thử quyền truy cập tương ứng.
- Mọi cột mới phải đi qua review:
  - Có thuộc tính PII/sensitivity? nếu có => từ chối hoặc pseudonymize trước sync.
  - Có thể tạo row-level policy tương ứng cho `approved`, role, timeline.
