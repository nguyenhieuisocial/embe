# Hồ sơ từng người

## Phạm vi

Đường dẫn: `/nha-minh/ho-so`, từ mục đầu tiên trong Nhà mình hoặc liên kết ở phần ngày sinh hiện có.

- Hồ sơ là **người được ghi nhận**, không phải tài khoản đăng nhập mới. Hai người đang được phép vào EmBe cùng xem và sửa các hồ sơ này; không có đăng ký công khai.
- Hai hồ sơ Ba/Mẹ được tạo từ tên đã cấu hình và ngày sinh đã nhập. Không tạo sẵn con, ngày sinh hoặc số đo giả.
- Có thể thêm nhiều con/người thân, kể cả chưa rõ ngày sinh. Các trường đều tùy chọn ngoài tên.
- 39 mục chi tiết trong 5 nhóm, 31 loại số đo có đơn vị cố định và 16 nhóm bản ghi theo thời gian.
- Số đo gần nhất được chọn riêng cho từng chỉ số từ toàn bộ lịch sử còn hiệu lực, không chỉ trang đầu. Lịch sử phân trang 40 bản ghi.
- Có sửa, xóa mềm/khôi phục bản ghi và lưu trữ/mở lại hồ sơ con/người thân. Lưu trữ không xóa dữ liệu.
- Lịch sử chỉnh sửa hiển thị 50 bản trước khi sửa gần nhất; đây không phải bảng xác định ai đã sửa vì cơ chế đăng nhập gia đình hiện vẫn dùng chung.

## Dữ liệu và bảo vệ

Migration: `supabase/migrations/20260907090148_add_lifetime_family_members.sql`.

Ba bảng mới trong `portal_read_model`: `family_member`, `family_member_record`, `family_member_change`. Mỗi bản ghi có `member_id`, thời điểm, nguồn, đơn vị và phiên bản. Bản trước khi sửa được giữ qua trigger, không cấp quyền UPDATE/DELETE bảng lịch sử cho `service_role`.

API `/api/family/members`, `/api/family/members/[id]/records`, `/api/family/members/[id]/history` dùng phiên đăng nhập hiện có và kiểm tra phiên đã bị thu hồi. Yêu cầu ghi phải cùng origin; nội dung JSON tối đa 64 KiB. Dữ liệu riêng tư dùng `no-store`, không lưu bản nháp vào localStorage.

Database bật và buộc RLS, không cấp đọc/ghi trực tiếp cho `anon`/`authenticated`. Chỉ backend với service credential gọi được RPC. Credential không xuất ra trình duyệt. Lưu dựa trên UUID và revision, có khóa dòng và xử lý xung đột; không âm thầm ghi đè phiên bản mới hơn trên điện thoại khác.

Ngày sinh Ba/Mẹ được nối hai chiều với bảng ngày sinh cũ; ngày sinh Mẹ tiếp tục cập nhật hồ sơ thai kỳ. **Các số đo thai kỳ, Apple Health và BabyBuddy hiện có không tự sao chép sang người khác.**

## Ranh giới cần giữ

- Đây là sổ ghi chép, không phải chẩn đoán, kế hoạch điều trị hoặc bệnh án được chứng nhận. Giới hạn nhập chỉ chặn số bất hợp lý, không phải khoảng bình thường. Không dùng BMI người lớn để đánh giá trẻ em.
- Thuốc, bệnh, dị ứng và chỉ tiêu xét nghiệm cần ghi theo thông tin thực tế; không tự suy đoán. Nhãn "chưa biết" khác "chưa ghi nhận dị ứng".
- Ngày theo dõi lại hiện chỉ lưu trong bản ghi; chưa tự tạo thông báo/lịch hẹn.
- Đồng bộ Apple Health riêng từng thành viên, kết nối số đo với biểu đồ tuổi tương ứng, file đính kèm và xuất hồ sơ/PDF theo người chưa thuộc module này.
- Không mở rộng endpoint xuất toàn bộ dữ liệu trong lần thay đổi này. Ba bảng mới **chưa có trong bản xuất JSON độc lập hiện có**; cần bổ sung vào cơ chế backup được duyệt trước khi coi backup của module này là đầy đủ. Lịch sử trong cùng database không thay thế backup độc lập.

## Kiểm tra và triển khai 07/09/2026

Theo yêu cầu triển khai gọn trên main: kiểm tra TypeScript, quyền database và RPC chỉ đọc. Migration đã áp dụng vào đúng Supabase của EmBe, tạo hai hồ sơ phụ huynh, chưa tạo số đo thử trong dữ liệu thật. Không chạy bộ test dài, trình diễn local hoặc khởi động lại Docker. Chưa xác minh thao tác trên iPhone thật; không coi kiểm tra biên dịch là kiểm thử trải nghiệm thiết bị.

## Nâng cấp chăm sóc hằng ngày

- Bữa ăn có bộ lọc dị ứng, món tránh và cách ăn được lưu theo phiên bản hồ sơ Mẹ. Thay đổi dị ứng / lời dặn nguồn yêu cầu đối chiếu lại; không tự chọn món khi có chỉ định chế độ ăn riêng hoặc bệnh đã ghi. Gợi ý chỉ từ các món có thành phần đã khai báo, không khẳng định mọi biến thể ngoài hàng đều an toàn. Nguồn định hướng: [NHS: healthy diet](https://www.nhs.uk/pregnancy/keeping-well/have-a-healthy-diet/), [NICE: diabetes in pregnancy](https://www.nice.org.uk/guidance/ng3/chapter/Recommendations).
- Số đo có thời điểm và bối cảnh (đói, trước ăn, sau ăn 1/2 giờ, nghỉ / vận động); mỗi lần đo là một bản ghi riêng. Trang Sức khỏe liên kết trực tiếp tới hồ sơ Mẹ, không âm thầm chuyển dữ liệu ngày cũ.
- Hồ sơ khám nhập được 23 chỉ số có đơn vị rõ ràng, bắt buộc đối chiếu trước khi lưu; diễn biến chỉ ghép cùng chỉ số/đơn vị từ buổi khám đã hoàn thành. Chưa có OCR xét nghiệm / siêu âm tự động trong thay đổi này, không đánh dấu dữ liệu cũ là đã được xác nhận.
- Kế hoạch có 8 bước chuẩn bị sinh / phục hồi với người phụ trách và nơi liên quan; người dùng chọn ngày rồi lưu. Không tự tạo lịch y tế.
- Lưu kế hoạch và hồ sơ khám giữ định danh khi thử lại sau mất phản hồi. Không lưu bản nháp y tế vào localStorage; đóng tab có thể mất nội dung chưa gửi. Chưa chứng minh push trên hai iPhone thật hoặc đồng bộ nền hoàn chỉnh khi ứng dụng đã đóng.
- Đã chạy các kiểm tra cô lập liên quan cho mobile shell, biểu mẫu, xác nhận chỉ số, bộ lọc dinh dưỡng, retry và nhận diện ghi chú; không ghi dữ liệu thử vào Supabase thật.
- Kỷ niệm thai kỳ ở `/ky-niem/thai-ky`: chọn ảnh đã có hoặc tải qua luồng ảnh hiện hữu, gắn ngày / tuần và ngày dự sinh của hành trình; các lượt chọn cùng tuần được gom thành một album hiển thị. Đây là bộ sưu tập trong EmBe, không tự tạo hoặc di chuyển album gốc trong Immich. Mỗi lượt tối đa 12 ảnh, được thêm lượt khác vào cùng tuần.
- Có xem ảnh / so sánh hai mốc, sửa chú thích, tải và chia sẻ thiệp PNG tạo ngay trên thiết bị. Không tự công khai ảnh; không phân loại ảnh y tế và không suy luận sức khỏe từ hình bụng bầu. Xóa / khôi phục chỉ tác động bản ghi tuyển chọn, giữ nguyên ảnh gốc.
- Bộ sưu tập dùng lại bản ghi có revision / lịch sử. Migration `pregnancy_memory_collection` chỉ thêm chỉ mục và RPC đọc riêng có quyền service_role; không sửa dữ liệu gia đình đã nhập. Mất kho ảnh trả lỗi để thử lại, không coi là album rỗng. Phần này cũng chịu giới hạn backup độc lập của bảng bản ghi đã nêu ở trên.
