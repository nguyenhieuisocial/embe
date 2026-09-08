# Kết nối mạng xã hội — 08/09/2026

## Đã triển khai

- Studio → Bàn làm việc → Tài khoản mạng xã hội → Kiểm tra kết nối.
- `GET /api/studio/connections` yêu cầu phiên gia đình, trả dữ liệu không cache.
- Bộ đọc API Postiz hosted; chỉ lấy tên, nền tảng và trạng thái disabled. Không đọc nội dung bài hay gửi media.
- Có nút mở OAuth qua Postiz cho TikTok, Instagram, Facebook và YouTube; yêu cầu chủ tài khoản đăng nhập/cấp quyền trên nền tảng. `POST /api/studio/connections` kiểm tra phiên và nguồn yêu cầu, chỉ nhận provider cho phép, không nhận URL tùy ý; khóa API chỉ ở máy chủ. URL trả về phải là HTTPS đúng máy chủ nền tảng. Postiz quản lý state và callback.
- Chưa triển khai tạo/lên lịch bài, theo dõi kết quả đăng, analytics hoặc giỏ hàng. Có tài khoản trong danh sách không chứng minh có quyền đăng. Chưa xác minh OAuth đầu-cuối nếu thiếu tài khoản/khóa Postiz và lần cấp quyền thật.

## Cấu hình cần thiết

1. Chọn tổ chức Postiz dành riêng cho EmBe và kiểm tra gói/quyền API. Không tự mua gói.
2. Chủ tài khoản đăng nhập và cấp quyền các kênh trong Postiz.
3. Cấu hình bí mật `EMBE_POSTIZ_API_KEY` trên máy chủ portal. Không dùng `NEXT_PUBLIC_*`, không nhập khóa vào chat hoặc commit.
4. Triển khai lại rồi bấm kiểm tra. Không tự đăng bài kiểm thử để xác minh.

Hiện chỉ hỗ trợ đích cố định `https://api.postiz.com/public/v1/integrations`, không hỗ trợ URL self-host tùy ý. Khóa self-host không dùng được với đích cloud. Nếu chọn self-host, phải bổ sung cấu hình đích tin cậy và kiểm tra hạ tầng trước.

## Lựa chọn repo

- [Postiz](https://github.com/gitroomhq/postiz-app): chọn làm cầu nối API; repo AGPL-3.0. Không sao chép code hoặc cài stack mới trong đợt này.
- [Mixpost](https://github.com/inovector/mixpost): phương án thay thế, chưa cài; phải kiểm tra bản/phạm vi tính năng cần dùng.
- [Windmill](https://github.com/windmill-labs/windmill): chưa cần; Studio đã có worker và hàng chờ, tránh hai nơi điều phối.

## Giới hạn nền tảng

Không mặc định Facebook cá nhân tương đương Page, Zalo OA tương đương Zalo Video, hoặc cấp quyền đăng đồng nghĩa cấp quyền giỏ hàng. TikTok có điều kiện ứng dụng và xét duyệt riêng. Không dùng cookie của trình duyệt để thay cho cấp quyền nền tảng.

Nguồn: [Postiz List Integrations](https://docs.postiz.com/public-api/integrations/list), [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines).
