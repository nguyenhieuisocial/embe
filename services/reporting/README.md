# Monthly family book

Pipeline dùng Typst để biến JSON đã được chọn lọc thành sách A5 có trang bìa,
mục lục tự động, đánh số mục đa cấp, phân trang, header/footer và bảng với cell
padding cố định `7pt x 5pt`. Mỗi lần xuất tạo thêm manifest SHA-256; trạng thái
luôn là `DRAFT` cho đến khi bố mẹ tự duyệt bản in.

```powershell
pwsh -NoProfile -File services\reporting\render-monthly.ps1 `
  -DataPath services\reporting\fixtures\2026-08.sample.json `
  -OutputPath output\pdf\embe-monthly-sample-2026-08.pdf
```

JSON đầu vào và PDF đầu ra phải nằm trong `C:\EmBe`. Bản mẫu chỉ dùng dữ liệu
minh họa bố cục, không chứa dữ liệu sức khỏe giả. Pipeline production nhận dữ
liệu curated từ exporter, không đọc trực tiếp database nguồn hoặc ảnh RAW.

Job production chạy ngày 1 hằng tháng lúc 06:15, lấy tháng trước theo múi giờ
Việt Nam. Chỉ Memos `PRIVATE` đã gắn `#portal` và không có tag nhạy cảm mới
được đưa vào snapshot; mỗi nguồn có ID và SHA-256 để tái tạo. PDF, manifest và
QA được lưu local, luôn ở trạng thái `DRAFT` cho đến khi bố mẹ duyệt.
Health chỉ công nhận `source_mode=curated_memos`; PDF tạo từ fixture hoặc snapshot
được truyền thủ công vẫn dùng được để kiểm tra bố cục nhưng không thể làm xanh
gate production.

```powershell
pwsh -NoProfile -File scripts\install-monthly-report-current-user.ps1
```

Chạy preflight và tạo báo cáo QA không chứa nội dung gia đình:

```powershell
C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe `
  services\reporting\preflight_monthly.py `
  --pdf output\pdf\embe-monthly-sample-2026-08.pdf `
  --output output\pdf\embe-monthly-sample-2026-08.qa.json
```

Kiểm thử tạo PDF thật, mở lại bằng thư viện PDF, kiểm tra số trang/nội dung và
render toàn bộ trang sang PNG để review trực quan:

```powershell
pwsh -NoProfile -File services\reporting\tests\render-monthly.tests.ps1
```
