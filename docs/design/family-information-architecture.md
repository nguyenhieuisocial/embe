# EmBe: từ danh sách công cụ đến nhịp sống gia đình

## Phạm vi

Sắp xếp lại giao diện và các lối vào hiện có, không đổi dữ liệu, API, quyền truy cập hoặc chức năng y tế. Giữ URL và liên kết cũ. Studio là một không gian sáng tạo riêng, không phải việc chăm sóc mẹ hằng ngày.

## Hướng thiết kế đã chọn

- Nền kem `#FCF9F7`, mặt giấy `#FFFEFD`, hồng phấn `#FBE6EF`, hồng mận `#A54A6A`, chữ `#35282E`, chữ phụ `#746269`. Màu cảnh báo và thành công hiện có vẫn giữ ý nghĩa riêng.
- Be Vietnam Pro cho nội dung và thao tác; Noto Serif chỉ cho tiêu đề trang/điểm nhấn. Không tải thêm font. Chữ phụ tối thiểu 13px ở các vùng thiết kế lại, chữ nhập 16px, vùng chạm từ 44px.
- Nhịp khoảng cách 8/12/16/24px. Dòng danh sách có phân nhóm thay vì nhiều hộp lồng nhau; hình/icon chỉ giúp nhận biết tác vụ, không thêm ảnh trang trí.
- Một hành động nổi bật trong mỗi vùng. Giảm nội dung hiển thị mặc định, không giảm khả năng đọc. Dữ liệu chưa có không được thay bằng số mẫu.
- Điều hướng 4 tab quen thuộc. Màn hình sâu có đường về nhóm rõ ràng. Giữ sheet, zoom ảnh, trạng thái lưu và cảnh báo hiện có.

```text
Hôm nay                Mẹ bầu                     Nhà mình
ngày + tên trang       tuần thai / ngày dự sinh   tên trang + tìm công cụ
3 việc cần để ý        4 công cụ hằng ngày        lịch & việc chung
4 lối tắt              checklist hôm nay          hồ sơ từng người
giai đoạn hiện tại     tâm trạng / triệu chứng    ảnh, nhật ký & bản in
3 nhật ký gần nhất     hồ sơ & lịch khám          đồ dùng & ngân sách
                       kiến thức mở khi cần        cài đặt & kết nối
                       chuẩn bị theo tuần          Studio (không gian riêng)

[Hôm nay] [Mẹ bầu] [+ Ghi nhanh] [Kỷ niệm] [Nhà mình]
Studio: [Video] [Bản nháp] [Duyệt & đăng] + nguồn ý tưởng
        nút về Nhà mình; không có Ghi nhanh thai kỳ
```

## Phân loại chức năng

1. Hôm nay: ưu tiên thật từ dữ liệu; lối tắt theo giai đoạn; lịch sử chỉ xem trước 3 mục.
2. Mẹ bầu/Mẹ: bữa ăn, số đo, thuốc & vi chất, hồ sơ & lịch khám; sau đó tâm trạng, triệu chứng, tuần thai, kiến thức. Kế hoạch sinh không đứng đầu khi mới mang thai, vẫn truy cập được khi cần.
3. Kỷ niệm: ảnh theo album/ngày/chuyến đi/bản đồ, nhật ký, ảnh thai kỳ, tìm kiếm và xuất sổ. Không đổi luồng xem ảnh đã dùng chung.
4. Nhà mình: lịch, kế hoạch, đồ dùng, ngân sách; hồ sơ các thành viên; thư viện; thiết lập, hướng dẫn, trạng thái hệ thống. Có tìm công cụ theo tên tiếng Việt không dấu.
5. Studio: video tự động, bản nháp, duyệt & đăng là công việc chính; khám phá/nghiên cứu là nguồn. Không diễn giải hàng chờ duyệt thành đã đăng hoặc đã được chuyên môn duyệt.

## Phản biện trước khi làm

Đã lấy đề xuất trực tiếp từ Claude Opus 5 (session `31d5ef0a-76a5-47d3-b6d6-3020f6707aa0`) và đối chiếu kiểm kê 44 route. Không áp dụng các phần chưa phù hợp: chữ in hoa, màu chữ phụ quá nhạt, chỉ số mẫu, khóa hẳn kế hoạch sinh trước tuần 28, thêm báo cáo chưa có, hay tuyên bố mọi nội dung vừa một màn hình. Chọn ba nhật ký thay vì năm. Không nhập thiết kế qua công cụ Vercel vì công cụ đó tạo bản triển khai riêng, không chỉnh dự án hiện tại.

## Kiểm chứng

Kiểm tra route ownership, truy cập công cụ, giai đoạn trước/sau sinh, đóng sheet/khôi phục focus, CSS mobile bắt buộc, biên dịch; sau push kiểm tra bản live qua Cent riêng trên các kích thước iPhone/Android/tablet/desktop. Chỉ đọc dữ liệu, không lưu hồ sơ hoặc bật thông báo. Đây không thay cho kiểm tra trên iPhone thật.
