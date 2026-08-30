# Tiêu chuẩn mobile-first của EmBe

EmBe được xây dựng như một ứng dụng web dùng hằng ngày trên điện thoại. Thiết bị chuẩn để ra quyết định là iPhone chạy iOS Safari; desktop chỉ mở rộng từ trải nghiệm di động đã hoàn chỉnh.

## Thứ tự thiết kế và kiểm thử

1. iPhone/iOS Safari.
2. Android mobile.
3. Tablet/iPad.
4. Desktop.

## Điều kiện chấp nhận

- Tác vụ chính dùng thoải mái bằng một tay, không cần hover và không có vùng chạm nhỏ hơn 44 × 44 CSS pixel.
- Nội dung, thanh điều hướng, modal và nút cố định không đè notch, Dynamic Island hoặc Home Indicator.
- Bàn phím ảo không che trường nhập hay nút hoàn tất; focus và cuộn về trường lỗi hoạt động đúng.
- Chiều cao màn hình dùng dynamic viewport; bottom navigation và full-screen flow không giật khi thanh địa chỉ Safari thay đổi.
- Form là một cột trên điện thoại. Bảng được chuyển thành card/list hoặc vùng cuộn có chủ đích.
- Mọi trạng thái tải, trống, lỗi và thành công đều có phản hồi rõ ràng; thao tác lặp hằng ngày cần ít chạm nhất có thể.
- Portal vẫn cài được bằng Add to Home Screen và hoạt động ở standalone mode.
- Font hỗ trợ đầy đủ tiếng Việt, cỡ chữ trường nhập tối thiểu 16 px để Safari không tự phóng to.
- Hiệu ứng chuyển động nhẹ, không cản thao tác và tôn trọng `prefers-reduced-motion`.

## Cổng tự kiểm

Trước khi duyệt một thay đổi frontend, phải trả lời được: “Giải pháp này có thực sự tốt khi dùng bằng một tay trên iPhone chưa?”. Nếu chưa, thay đổi chưa hoàn tất.
