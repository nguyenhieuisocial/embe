# Studio: bàn làm việc chạy trên web

## Tự tạo theo lịch (08/09/2026)

`/studio` có tiến độ tự động và nút tạm dừng/tiếp tục. RPC `embe_studio_autoplan()` được gọi từ entry point máy dựng đã chạy sẵn, không thêm process, không cần người dùng mở web. Sau khi bật: tạo một bản đầu tiên, sau đó tối đa một bản mỗi ngày lúc 08:00 Asia/Ho_Chi_Minh. Khi máy mất kết nối nhiều ngày, không dựng dồn.

Nguồn là 7 kịch bản gốc hữu hạn trong catalog, không phải tự nghiên cứu vô hạn. Bỏ bài vận động có ghi chú nguồn cần review lại. Nội dung, cảnh, nguồn và ngày đối chiếu giữ nguyên; không cắt cảnh cảnh báo. Mỗi slug chỉ dùng một lần; quá hạn nguồn, hết chủ đề, render lỗi hoặc đầy kho thì dừng tạo mới. Hàng đợi dựng đã có tiếp tục xử lý. Tạm dừng chỉ ngừng tạo mới, không xóa/dừng video đang dựng.

Schema private có `automation` và `automation_topic`, cùng advisory lock với workspace/queue, revision chống hai máy ghi đè. Không cấp quyền anon/authenticated; API kiểm tra phiên và same-origin. Không đọc bảng gia đình hoặc cookie mạng xã hội. Các kiểm chứng SQL là transaction rollback, không để lại fixture.

**Chưa hoàn tất xuất bản/đăng tự động:** chưa có social publisher, OAuth tài khoản đích hoặc xác nhận chuyên môn. API và UI ghi rõ `not_connected`, không ghi render completed thành published. Không tự phê duyệt nội dung y tế, không đưa video lên feed công khai. Máy nhà cần đang hoạt động để tạo video; nội dung đã dựng được lưu trên cloud riêng của EmBe.

Kết quả vận hành 08/09: đã bật revision 2; worker hiện hữu tự tạo và dựng video đầu, 720×1280, 23,25 giây, còn 6 chủ đề. `scripts/health/studio-daily-live.mjs` chỉ đọc tiến độ, kiểm tra phiên riêng và video thật (Range 206 + metadata), không tạo job. Bố cục 375/393/430/412/768/1280 đạt; Cent không phải iPhone/Safari vật lý. Phiên kiểm tra được thu hồi. Không restart worker, không public post.

Hướng nối xuất bản đã khảo sát, **chưa tích hợp**: [Buffer API](https://support.buffer.com/en-us/articles/what-is-buffers-api-GtIYIQilz5) có gói Free, 3.000 request/30 ngày; [gói Free tối đa 3 kênh](https://buffer.com/pricing). Có thể tái dùng bộ đăng được nền tảng cấp quyền thay vì dựng OAuth app nội bộ riêng. Cần tài khoản Buffer và quyền trên đúng kênh đích. [Giới hạn kênh](https://support.buffer.com/en-us/articles/connecting-your-channels-to-buffer-HvWLgAJvL9): Facebook Page, không phải profile cá nhân; Instagram cá nhân chỉ thông báo để đăng, không phải auto-publish. Không hứa Zalo Video qua Buffer hoặc tự gắn sản phẩm. API cần URL media truy cập được cho đến khi đăng: phải làm riêng cơ chế phát hành nội dung đã được chọn, không mở công khai bucket draft hoặc dữ liệu gia đình.

## Phạm vi

`/studio/ban-lam-viec` và `/studio/soan`: tạo kịch bản, lấy mẫu từ 11 video, sửa/thêm/bỏ/đổi thứ tự cảnh, lưu lên EmBe, tạo bản riêng, phục hồi bản xóa, yêu cầu dựng MP4 dọc có giọng Việt. Sổ `/studio/kham-pha` chuyển sang cloud với revision check; sổ cũ trong localStorage chỉ nhập khi bấm, không bị xóa. Link từ ý tưởng mở ô soạn, không tự biến nội dung tham khảo thành kiến thức đã kiểm chứng.

Lưu bản nháp không đồng nghĩa video đã thay đổi. Dựng luôn chụp một phiên bản cố định; sửa tiếp không thay video cũ. Các bản xong có nhãn phiên bản, xem/tải MP4, caption/kịch bản, VTT đúng mốc giọng đọc. Video có dấu bản nháp, nguồn trong kịch bản kèm theo, không tự duyệt y khoa.

Chia sẻ thực tế dùng Web Share files, hai lần chạm (chuẩn bị file → chia sẻ) để giữ user activation trên iPhone. Không hỗ trợ thì tải file; hủy bảng chia sẻ không coi là lỗi đăng. Không chia sẻ URL private cần đăng nhập cho bạn bè. Chưa có social OAuth, đăng tự động hoặc gắn sản phẩm tự động; người dùng thực hiện tại ứng dụng đích.

## Thiết kế

Tái dùng palette EmBe: paper #FFF8FB, surface #FFFEFD, rose #A54A6A, ink #35282E, line #F0DEE5, mint #55786C; font Việt `--font-body`. Nội dung căn trái, một cột. Không hero hoặc số liệu marketing lớn. Thanh bốn mục ngắn ở đầu Studio, nút tối thiểu 44px, ô nhập 16px, giữ app shell safe area.

Luồng: Video mẫu / Khám phá → Soạn từng cảnh → Lưu → Xác nhận đã đọc → Dựng → Xem → Chia sẻ file.

## Dữ liệu và quyền

- Schema `embe_studio` riêng: project, notebook, render, worker_state. RLS, grant chỉ service_role; không cấp anon/authenticated. RPC security invoker, search_path rỗng. Backend kiểm tra phiên đang hoạt động và same-origin cho mutation; response private/no-store.
- Project tối đa 100 (kể cả đã xóa), 6 cảnh, 180 ký tự lời/cảnh, 900 ký tự tổng, nguồn HTTPS (không fetch), payload <24KB. Sổ 200 links, <1MB. API đọc body có giới hạn bytes, không tin Content-Length.
- Revision chống ghi đè hai máy, retry cùng nội dung idempotent. Sổ lỗi không reset; lưu lỗi giữ form. SessionStorage giữ bản viết dở, người dùng chọn phục hồi; không tự ghi đè cloud. Xuất JSON kịch bản và sổ để giữ bản sao riêng.
- Cloud không chứa API key/claim trong response client. Video/poster private, chỉ endpoint EmBe đã kiểm tra session lấy; Range, MIME, kích thước, SHA-256; không redirect lộ URL kho.
- Media job input chỉ text, không URL download, không đường dẫn đĩa, không lấy gia đình/ảnh Rednote. Secret giữ ở cấu hình runtime sẵn có.

## Máy dựng

Tái sử dụng Piper/ONNX/PyAV/Pillow và minh họa EmBe hiện có; không thêm mô hình/container. `web_worker.py` thuộc GPL-3.0-or-later, cùng bộ dựng giọng đã có. Model/config có checksum cố định; CPU inference 2 thread, encode 2 thread, một job toàn hệ thống. MP4 H264/AAC 720×1280, 24fps; ≤90 giây, ≤4MB/file. Chữ quá dài trả lỗi để sửa, không cắt lặng lẽ. VTT lấy đúng timing giọng thực tế.

Scheduled Task `EmBe Studio Renderer` chạy pythonw, quyền Limited, AtLogOn. Một socket bound không listen chống trùng, không mở cổng API. Poll 30 giây, model chỉ nạp khi có job. Không PowerShell bật/tắt, không Docker restart, không thu health data. Máy nhà phải đang chạy và user Windows đăng nhập; khi tắt, bản đã dựng vẫn xem được từ cloud và job mới chờ. UI có thời điểm heartbeat, không giả worker online.

Queue ≤3 đang chờ/chạy; ≤100 bản dựng, manual retry tối đa 3 lần/bản; lease 15 phút, heartbeat tiến độ trong dựng; cancel/deletion vô hiệu claim ngay. Một lần dựng timeout 480 giây; tối thiểu 512MB đĩa trống. Temp directory riêng do Python tạo, dọn sau lượt; không xóa ảnh nguồn. Không mở API worker cũ ra Internet.

Giới hạn: xóa mềm chặn truy cập ngay, không xóa vật lý media; canceled upload có thể để object không còn được trỏ. Giới hạn queue/retry chặn tăng vô hạn theo một yêu cầu; chưa có GC cloud tự động, lịch backup Studio độc lập hoặc publish scheduler. Không tự xóa nội dung đã dựng. Mất mạng giữ ô nhập, không tuyên bố có offline render/background iOS upload.

## Kiểm chứng

Unit/API/UI: contract mẫu, auth trước RPC, body/URL bounds, revision conflict, không tự render sau save, giữ form khi lỗi, share cần thao tác riêng. Database: `supabase/tests/studio_workspace.sql` transaction rollback kiểm tra create/idempotency/conflict/claim/delete/restore và quyền. Live verifier kiểm tra phiên bản deploy, tạo/lưu/mở lại giữa hai browser context, dựng thật, Range/video/audio, chia sẻ mock và bố cục mobile; native share đích cần iPhone thực tế, không suy từ mock thành đăng bài thật.
