# EmBe Mobile Family Journal 2026

Nguồn thiết kế tương tác: https://claude.ai/design/p/abc909c0-47e2-4be6-845d-7df603727dd7

Đây là hệ thiết kế riêng của EmBe, dựng từ trang trắng bằng Claude Design Opus 5.
Không liên quan và không được kế thừa bất kỳ thiết kế, asset hay component nào từ iFan.

## Hướng thị giác — cập nhật theo người dùng chính

- Người dùng chính là Mẹ Ngân đang mang thai: giao diện cần nhẹ nhàng, nữ tính và bình tĩnh, không trẻ con hóa.
- Nền phấn hồng: `#FFF7FA`; surface trắng ấm: `#FFFEFE`; viền hồng tro: `#EBD9E0`
- Chữ mận đen: `#33272B`; chữ phụ: `#75656B`
- Rose chính: `#96405F`; rose dịu: `#F8E8EE`; mauve: `#67566F`
- Sun `#B5811A` chỉ dùng chờ/offline; coral `#AE3F2C` chỉ dùng cảnh báo y tế hoặc sắp hết đồ
- Be Vietnam Pro cho UI/body; Noto Serif cho tiêu đề cảm xúc
- Motif duy nhất: một “sợi chỉ gia đình” mảnh nối mốc trong ngày và timeline
- Dùng sentence case; hạn chế chữ in hoa và giãn chữ rộng vì tạo cảm giác nặng.
- Không glassmorphism, không dashboard KPI, không emoji, không gradient hồng/xanh kiểu trẻ em

## Quy tắc mobile

- Lề màn hình 18px; nhịp gọn 4/8/12/16/24px; nội dung quan trọng xuất hiện sớm, không dùng khối trang trí quá lớn
- Tiêu đề vừa phải, thẻ 16px padding, nút chính cao 48–52px; vùng chạm luôn tối thiểu 44px
- Target tối thiểu 44×44px; input tối thiểu 16px
- `100dvh`, safe-area đầy đủ; CTA form dùng sticky trong vùng cuộn khi bàn phím mở
- Một vùng cuộn trên mỗi màn hình; không phụ thuộc hover
- Bottom nav 5 mục trên mobile; từ 768px chuyển thành rail trái, nội dung tối đa 560px
- Chuyển trang fade 160ms; bottom sheet 220ms; tắt transform khi reduced motion

## Cấu trúc trang

1. Login chỉ có mật khẩu gia đình; ẩn navigation trước đăng nhập.
2. Hôm nay có một việc chính, nhịp ba mốc, độ mới dữ liệu và các lối tắt vừa đủ.
3. Mẹ bầu chỉ hiện tuần thai sau khi có ngày dự sinh; checklist, đồng bộ, bữa ăn, nguồn và ranh giới cảnh báo.
4. Ghi lại chọn Mẹ Ngân/Ba Hiếu, nháp tự lưu, queue offline, giữ nội dung khi hết phiên.
5. Kỷ niệm chỉ hiện preview đã duyệt; có loading/empty/content/error và timeline.
6. Đồ dùng ưu tiên món gần hết; cập nhật bằng bottom sheet; không tự mua.
7. Trợ lý chỉ tổng hợp dữ liệu có thật, không chẩn đoán.
8. Hướng dẫn viết cho người không rành kỹ thuật và ông bà.
9. Offline/error/reconnected là trạng thái sản phẩm đầy đủ, không phải trang kỹ thuật.

## Visual assets

Tất cả logo và illustration đặc trưng do ChatGPT ImageGen tạo. Claude Design chỉ là
nguồn bố cục/interaction. Ảnh thật trong `C:\Anh` không được gửi tới dịch vụ AI hoặc
đưa vào Git; production chỉ xem qua `/api/media/:id` sau khi ba mẹ duyệt.
