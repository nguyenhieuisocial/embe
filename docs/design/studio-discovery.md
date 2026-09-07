# Khám phá nội dung EmBe — 07/09/2026

## Phạm vi chạy thật

`/studio/kham-pha`, sau đăng nhập: 10 nhóm từ khóa do EmBe biên tập, tiếng Việt/Trung/Anh; mở search ở 6 nền tảng xã hội và Google Trends. Google Trends VN RSS được lấy tự động khi mở trang. Đây là tín hiệu Google Search, không phải collector social hay bằng chứng y khoa. Không tìm thấy từ khớp là kết quả hợp lệ, không tạo dữ liệu mẫu thay thế.

Sổ localStorage tối đa 200 link / 50 snapshots mỗi link / <1 MB. Lưu–sửa–xóa–hoàn tác, xuất JSON/nhập gộp giữ ghi chú cũ, xuất dàn ý. Chưa đồng bộ cloud; UI nói rõ. Không lưu cookies/xsec token, không tải ảnh/video/bình luận. Tốc độ từ hai số đếm, cách >=1 giờ, thiếu=null, số giảm/cũ >48 giờ không tính. Không đo viral từ một ảnh chụp số liệu, không rank chéo nền tảng. Dàn ý là template biên tập gốc, không gọi LLM hoặc tự duyệt y khoa.

## Tái sử dụng và vận hành

- Dùng route auth `memberAuthorization`, Next Data Cache 15 phút, API trả private/no-store; cache public payload và thời điểm thực lấy nguồn, không cache danh tính. Failure cũng cooldown, không đổi IP/token để thử vượt chặn.
- Fixed upstream `https://trends.google.com/trending/rss?geo=VN`, no redirects, timeout 10s, stream cap 1MB, XML content type, cấm DTD/entities. Client dùng DOMParser sẵn có, đọc text, React escape, không render HTML hay tải media trong feed. Request không nhận URL hoặc chuyển cookie người dùng.
- Không thêm dependency/server/Docker/Redis/model nền. Không lịch chạy 24/7. Nút cập nhật dùng cache, không ép quét mỗi click. Cache có thể trả bản cũ khi revalidate; UI luôn giữ thời điểm gốc.
- Import không tự fetch URL. HTTPS/host allowlist, canonical dedup, size/count/type/timestamp validation. Lỗi storage không xóa form hoặc giả báo thành công. So bản localStorage trước ghi để không âm thầm đè tab khác.

## Thiết kế mobile (frontend-design)

Tái dùng hệ hiện tại: paper #FFF8FB, surface #FFFEFD, rose #A54A6A, ink #35282E, line #F0DEE5, mint #55786C. Font Việt hiện có `--font-body`; không thêm font hay hero. Một cột, nội dung căn trái; chỉ platform links wrap, control >=44px, input16px. Dàn ý: chọn chủ đề → ngôn ngữ/từ khóa → mở nguồn; kết quả RSS/mẫu tham khảo gấp lại; sổ và trạng thái lưu phía dưới. Không dashboard số lớn vì không có social telemetry. Giữ shell safe-area và reduced motion. Đây là bổ sung công cụ, không redesign toàn site.

## Nghiên cứu và quyết định

- Google xác nhận RSS export trong [Trending Now help](https://support.google.com/trends/answer/3076011?hl=en). Live RSS đọc được 07/09, có pubDate và approx_traffic; không hứa độ phủ toàn bộ hoặc real-time.
- [RSSHub](https://github.com/DIYgod/RSSHub), AGPL-3.0 ở bản kiểm tra, [route XHS](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/xiaohongshu/user.ts) có nhánh cookie/cache, không cam kết event webhook. Chưa cài.
- [TrendRadar](https://github.com/sansan0/TrendRadar) GPL3, [NewsNow](https://github.com/ourongxing/newsnow) MIT: tham khảo tổ chức nguồn, không copy code/triển khai thêm.
- [pytrends](https://github.com/GeneralMills/pytrends) archived 17/04/2025; [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) archived ở lần đọc API 07/09/2026. Không coi là official APIs.
- [TikTok-Api](https://github.com/davidteather/TikTok-Api) unofficial, public-only/no upload; [TikTokDownload](https://github.com/Johnserf-Seed/TikTokDownload) latest push hiển thị 2024-06-28. Chưa sử dụng để thu thập.
- [BGE-M3](https://huggingface.co/BAAI/bge-m3) là text embedding; [CLIP](https://github.com/openai/CLIP) mới xử lý image/text. Không mặc định BGE-M3 là multimodal hoặc CLIP truy vấn Việt đạt chất lượng. [BERTopic](https://github.com/MaartenGr/BERTopic), [jieba](https://github.com/fxsjy/jieba), [HanLP](https://github.com/hankcs/HanLP), [Qdrant](https://github.com/qdrant/qdrant), [Chroma](https://github.com/chroma-core/chroma): chưa cần cho tập nhỏ, chưa cài.
- Repo 404 được liệt kê trên trang nghiên cứu; không kết luận chưa bao giờ tồn tại. Không có căn cứ “nhạc quyết định 50% viral”, suy MCN từ following, miễn bản quyền bằng reaction, hoặc đủ stack chỉ vì có danh sách công cụ. Không tích hợp thương mại/thu bình luận cá nhân/stealth trong phạm vi này.

## Điều kiện mở rộng

Collector riêng từng nền tảng chỉ thêm sau khi xác minh route truy cập hợp lệ, license, tính ổn định và khả năng giảm tải; giữ nguồn/timestamp/null metrics, dedup ID. 401/403/CAPTCHA/429 => tạm dừng và xử lý theo điều khoản, không rotation để né. Nếu cần đồng bộ hai máy, tạo kho riêng có migration/ACL; không nhét nghiên cứu social vào hồ sơ sức khỏe. Bật lịch theo dõi là quyết định riêng, không ngầm tạo automation.
