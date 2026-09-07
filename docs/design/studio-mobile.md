# Studio EmBe Mẹ Bầu trên web

Ngày 07/09/2026. Phạm vi: xem 8 kịch bản, 8 video và 22 ý tưởng đã tạo trên `embe.hieu.asia`; không tự đăng mạng xã hội, không lấy ảnh gia đình.

## Thiết kế và rà soát trước khi dựng

Dùng hệ Claude Design EmBe hiện có tại `docs/design/claude-design-embe-2026.md`, kết hợp góp ý qua Claude Code, model trả về **claude-opus-5**, effort high. Không mở hay khẳng định đã tạo dự án Claude Design online mới.

- Nền #FFF8FB, surface #FFFEFD, chữ #35282E, chữ phụ #746269, rose #A54A6A. Dùng token đang có.
- Be Vietnam Pro cho thao tác, Noto Serif cho tiêu đề. Không font mới, không viết hoa nhãn hàng loạt.
- Trang thư viện một cột, poster nhỏ bên trái, tiêu đề và thời lượng bên phải; lọc trước danh sách, không hero lớn.
- Trang chi tiết riêng thay bottom sheet: Back của Safari rõ ràng, không hai vùng cuộn hoặc thanh hành động đè bàn phím.
- Giữ navigation EmBe; Studio thuộc Nhà mình, có thêm lối tắt ở Hôm nay.

```text
EmBe              Xưởng nội dung riêng
Studio
Bản nháp, chưa duyệt chuyên môn
[Kịch bản & video] [Ý tưởng]
Tìm chủ đề ______
Nhóm: tất cả
[poster] Tên chủ đề                 ›
[poster] Tên chủ đề                 ›
```

Đã điều chỉnh góp ý Opus: không dùng grid hai video trên điện thoại vì người dùng từng báo khó xem; không dùng ví dụ thuốc/liều trong bản góp ý vì không thuộc catalog đã nghiên cứu; không drag-to-close là cách đóng duy nhất. Target ≥44px, input 16px, ảnh có kích thước, video preload none/playsInline, không autoplay. Không gắn nút tạo/duyệt/đăng giả khi chưa có chức năng.

## Cung cấp nội dung

Video/poster lên bucket riêng `embe-studio-drafts`, private; không thay bucket ảnh gia đình. Manifest build chỉ chứa metadata không bí mật và locator content-addressed. Các trang/route dùng đăng nhập hiện có; route tải kiểm tra cả trạng thái phiên. Frontend chỉ thấy `/api/studio/<slug>/<kind>`, không nhận khóa hoặc URL nhà cung cấp.

Publisher kiểm tra hash trước và sau upload, chỉ ghi manifest sau khi đủ 8 video. Khoảng 2 MB video của bộ đầu, cộng poster. Giới hạn 4 MB/file trong bản này; không được dùng nguyên route buffer nhỏ này cho video lớn tương lai.

Trên web có thể xem, tìm, lọc, chép kịch bản/caption, tải MP4/VTT/TXT và đọc nguồn. Màn hình này không bổ sung TTS, công cụ chỉnh sửa/tạo video hay lịch đăng tự động. Nhãn bản nháp luôn hiện, không đồng nghĩa đã duyệt chuyên môn.
