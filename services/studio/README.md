# EmBe Mẹ Bầu — xưởng nội dung kiến thức

Tạo **chủ đề → kịch bản → storyboard → phụ đề → video dọc nháp** cho nội dung cộng đồng. Không bắt đầu từ Kỷ Niệm, không lấy ảnh, hồ sơ sức khỏe hoặc nhật ký của gia đình.

## Đã có trong bản đầu

- 8 kịch bản tiếng Việt có nguồn NHS/FDA/CDC đối chiếu ngày 07/09/2026; 22 ý tưởng riêng **chưa đủ nghiên cứu để xuất bản**.
- Tự xếp thứ tự theo mức ưu tiên biên tập và luân phiên tuyến nội dung, tránh nhiều video cùng chủ đề liên tiếp. Đây **không** phải số liệu xu hướng thực tế hoặc dự báo viral.
- Mỗi kịch bản có mở đầu A/B, từng cảnh, lời đọc, caption, hashtag và nguồn. Một minh họa gốc tạo bằng imagegen; không dùng ảnh người thật.
- Biên dịch thành ảnh dọc, WebVTT, lời đọc dạng văn bản và MP4 H.264 30 fps, 1080×1920 hoặc bản xem thử 360×640.
- Hàng đợi SQLite riêng: chống gửi trùng, hủy/thử lại, khôi phục sau gián đoạn, checksum, video HTTP Range và xóa bản dựng.

**Giao diện web:** `/studio`, có lối vào ở Hôm nay và Nhà mình. Xem/tìm/lọc các chủ đề, xem từng video, chép kịch bản/caption, tải video/phụ đề/kịch bản và đọc nguồn ngay sau khi đăng nhập EmBe. 22 ý tưởng được tách riêng và ghi rõ chưa nghiên cứu đủ.

**Bổ sung 07/09/2026:** ba video gốc dạng bảng hai cột, lấy cảm hứng từ bố cục Rednote đã xem; có giọng đọc AI tiếng Việt, nhấn sáng hàng theo lời và phụ đề. Tổng cộng 11 video, trong đó 8 bản đầu vẫn không có giọng đọc. Xem [đối chiếu mẫu và giới hạn](../../docs/design/studio-rednote-review.md).

**Chưa có:** nhạc, tài khoản mạng xã hội, tự đăng bài, lấy trend trực tiếp, LLM tự nghiên cứu vô hạn hoặc nút tạo/chỉnh sửa bản dựng trong portal. API worker không được mở ra Internet, không tự khởi động cùng Windows. Toàn bộ đầu ra là bản nháp chưa duyệt chuyên môn; không dùng chữ “đã duyệt y khoa”.

## Đưa một bộ đã dựng lên web

Không chép video vào Git hoặc `public/`. Dùng publisher để kiểm tra SHA-256, tải lên bucket private riêng và tạo metadata build không chứa bí mật:

```powershell
node services/studio/scripts/publish-portal.mjs --campaign data/studio-editorial/campaign-f6622f746066 --catalog services/studio/content/catalog.json --env-file secrets/runtime/portal-sync.env --output apps/portal/src/content/studio-catalog.json
```

Sau đó đưa metadata và code portal lên main theo quy trình triển khai đang có. Publisher chỉ dùng cấu hình EmBe đã chỉ định, không dùng biến môi trường của dự án khác. Không thay bucket hoặc dữ liệu gia đình. Upload cùng checksum được xác minh lại, không ghi đè object. Frontend chỉ gọi `/api/studio/<slug>/<kind>`; route kiểm tra phiên còn hoạt động trước khi tải từ kho, hỗ trợ Range cho iPhone, không redirect lộ URL nhà cung cấp.

Kho lưu trữ đã lên cloud nhưng **nội dung vẫn chỉ xem sau đăng nhập**, không phải phát hành công khai lên mạng xã hội. Video/poster mới giới hạn 4 MB/file để hợp với proxy của bộ nháp nhỏ; cần đường streaming riêng trước khi đưa video lớn vào. Thông số layout và góp ý Opus 5 ở `docs/design/studio-mobile.md`.

## Hướng nội dung

Ưu tiên câu hỏi đời thường: “Bầu ăn gì?”, “Điều nào thật sự cần kiêng?”, “Khi nào nên hỏi người chăm sóc thai kỳ?”, “Ba giúp gì được hôm nay?”. Mỗi video chỉ trả lời một vấn đề, mở đầu rõ trong 2–3 giây, giải thích ngắn và có việc cụ thể để người xem lưu/chia sẻ.

Các tuyến: ăn uống dễ hiểu; mẹ dễ chịu hơn; tinh thần và người đồng hành; chuẩn bị đi sinh; chăm mẹ sau sinh; chăm bé an toàn. Mẹo dân gian phải phân biệt **có bằng chứng / chưa đủ bằng chứng / có nguy cơ**, không gắn phong tục thành chỉ định y tế.

Không hù dọa, đổ lỗi cho mẹ, hứa con trắng/thông minh, đoán giới tính như khoa học, tự kê thuốc, tự chẩn đoán hoặc bảo đảm an toàn tuyệt đối. Lời kêu gọi tương tác không thay hướng dẫn đi khám khẩn cấp. Không sao chép lời hát, clip, logo hoặc hình người khác.

Sau khi có kênh và nội dung được duyệt, có thể thử lần lượt hai mở đầu rồi so thời gian xem, lượt lưu/chia sẻ trên **dữ liệu thật**. Bản hiện tại chưa thu thập hoặc khẳng định các chỉ số đó.

## Chạy một bộ nội dung

Tại `C:\EmBe`, dùng môi trường Python có dependency trong `pyproject.toml`. Không cần Docker, API key tạo ảnh, Supabase, Immich hay Telegram để chạy lại bộ đã có.

```powershell
$env:PYTHONPATH = 'C:\EmBe\services\studio\src'
.\.venv\Scripts\python.exe -m embe_studio.cli campaign --catalog services/studio/content/catalog.json --illustration services/studio/assets/me-bau-doc-nhan.png --root data/studio-editorial --render-count 8 --full
```

Đầu ra ở `data/studio-editorial/campaign-<hash>/`:

- `Kich-ban-va-lich-de-xuat.md`: kịch bản, nguồn và liên kết video.
- `*.voiceover.txt`, `*.vtt`, `*.project.json`: lời đọc, phụ đề và từng cảnh.
- `cards/manifest.json`: locator nội bộ, nguồn gốc và SHA-256 của ảnh biên tập.
- `queue/outputs/*.mp4`, `report.json`: bản dựng và kết quả thực tế.

Gọi lại với cùng dữ liệu và chất lượng không dựng trùng job đã hoàn tất. Catalog thay đổi tạo campaign mới, không ghi đè bản cũ. Chương trình tự dừng khi ngày đối chiếu nguồn đã quá hạn; **không tự gia hạn ngày hoặc coi kiểm tra URL là thẩm định y khoa**. Lịch đề xuất là thứ tự, không phải lịch tự đăng. Các bản dựng không vào Git.

## API nội bộ cho tích hợp sau

`EMBE_STUDIO_ENABLED=true` mới cho phép `serve`/`worker`. `EMBE_STUDIO_TOKEN` tối thiểu 32 ký tự ASCII, giữ trong cấu hình bí mật; không đưa vào trình duyệt hoặc Git. `serve` chỉ nghe `127.0.0.1:8794`. Server adapter tương lai phải kiểm tra quyền EmBe trước khi gọi, không bỏ lớp đăng nhập để expose worker.

Chạy API với `--root <campaign>/queue`; worker dùng cùng root và `--manifest <campaign>/cards/manifest.json`. Không trộn manifest giữa các campaign.

| API | Công dụng |
| --- | --- |
| `GET /health` | Trạng thái API, không chứng minh worker đang sống hoặc TTS sẵn sàng |
| `POST /jobs` | Gửi `idempotency_key` UUID và `project` |
| `GET /jobs`, `GET /jobs/{id}` | Danh sách/trạng thái, không trả locator hoặc lời riêng |
| `POST /jobs/{id}/cancel`, `/retry` | Hủy/thử lại có giới hạn |
| `GET /jobs/{id}/video?download=true` | Tải bản hoàn tất; hỗ trợ HTTP Range |
| `DELETE /jobs/{id}` | Ngừng truy cập ngay; GC xóa MP4 trong lượt worker tiếp theo |

Tất cả endpoint cần `Authorization: Bearer ...`, `private, no-store`. Từ chối request có Origin/Sec-Fetch-Site; đây không thay authentication. Input chỉ gồm UUID ảnh được manifest cấp, không nhận URL hoặc đường dẫn file tùy ý. Đây là service tin cậy nội bộ, không phải mô hình multi-tenant.

## Giới hạn vận hành và bảo vệ máy

Một worker độc quyền; encode 2 thread; tối đa 5 job đang chờ/chạy, 200 job kể cả tombstone mỗi queue; 12 cảnh/job, 8 giây/cảnh; ảnh ≤10 MB, ≤20 megapixel; request ≤16 KiB; output ≤100 MB; giới hạn render 600 giây, dừng khi kiểm tra ngân sách giữa các giây; cần ≥512 MB trống trước khi bắt đầu. Đây không phải cgroup hay giới hạn RAM cứng. Chạy từng bộ hữu hạn, không tạo vòng mở PowerShell hoặc khởi động lại ứng dụng.

Lỗi ảnh nguồn tạm thời được thử tối đa 3 lần, backoff 30/120 giây; lỗi dữ liệu không tự thử liên tục. OS lock tự giải phóng khi worker chết. Bản dở ở `work/`, chỉ chuyển sang `outputs/` sau kiểm tra định dạng và checksum. GC chỉ xóa UUID MP4 do queue quản lý, không chạm ảnh nguồn. Manifest/checksum chống nhầm ảnh, không bảo vệ trước quản trị viên máy có quyền sửa đồng thời cả ảnh và manifest.

Sao lưu catalog, mã nguồn, artwork và cả campaign bằng snapshot nhất quán hoặc SQLite backup API; không chép riêng file SQLite đang chạy rồi bỏ WAL. Không có backup ngoài máy được cấu hình riêng cho Studio. Giữ campaign đã duyệt để tái lập; bản mới không dùng chung queue nên không bị nhầm nguồn. Trước khi vận hành dài hạn cần chính sách lưu giữ/dọn campaign, giám sát worker và kênh duyệt/phát hành. Không tự xóa tombstone để lách giới hạn 200.

## Tái sử dụng và quyền sử dụng

| Thành phần | Vai trò / lưu ý |
| --- | --- |
| [PyAV](https://github.com/PyAV-Org/PyAV) | Binding FFmpeg, BSD-3-Clause cho PyAV; dependency codec có giấy phép riêng |
| [FFmpeg](https://ffmpeg.org/legal.html) / libx264 | Encode MP4 qua PyAV wheel, không mở shell; không gộp giấy phép codec thành BSD, kiểm tra GPL và yêu cầu phân phối nếu đóng gói lại |
| [Pillow](https://github.com/python-pillow/Pillow) | Dựng ảnh/chữ, HPND; không tự viết codec |
| [FastAPI](https://github.com/fastapi/fastapi) / [Uvicorn](https://github.com/encode/uvicorn) | API và HTTP Range qua Starlette; MIT/BSD-3-Clause |
| [SQLite](https://www.sqlite.org/copyright.html) | Hàng đợi giao dịch, public domain |
| Font | Dùng Arial sẵn trên Windows hoặc DejaVu Sans trên Linux; không phân phối lại Arial |
| Whiteboard Studio được gửi qua Drive | Chưa nhập mã vì chưa xác minh giấy phép; chỉ tham khảo hướng kiến trúc |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | TTS tùy chọn trong môi trường cô lập; runtime GPL-3.0, module `narrated.py` GPL-3.0-or-later; VAIS1000 model card ghi dataset CC BY 4.0, có attribution trong portal/script |

Xem [nguồn gốc minh họa](assets/PROVENANCE.md) và [catalog có nguồn từng bài](content/catalog.json). Chạy kiểm tra liên quan: `python -m pytest services/studio/tests -q`; CI riêng không thay dependency các service khác.

## Dựng bảng kiến thức có giọng đọc

Môi trường `.venv-studio-voice` riêng, cài `requirements-voice.txt` và `pip install -e services/studio`. Không thay môi trường nhận diện y tế/thức ăn. Model tải từ revision cố định `1162a9173d0ce503555aed757976b7a9912eae4c` tại [Piper voices](https://huggingface.co/rhasspy/piper-voices/tree/1162a9173d0ce503555aed757976b7a9912eae4c/vi/vi_VN/vais1000/medium), đặt `.onnx` và `.onnx.json` vào `data/studio-voice/models`. Compiler kiểm tra SHA-256 cả hai, không tự tải model khác.

```powershell
.\.venv-studio-voice\Scripts\python.exe -m embe_studio.narrated --catalog services/studio/content/infographic-v2.json --model data/studio-voice/models/vi_VN-vais1000-medium.onnx --output data/studio-voice/rednote-boards-v1 --artwork services/studio/assets
.\.venv-studio-voice\Scripts\python.exe -m unittest discover -s services/studio/voice_tests -v
node services/studio/scripts/publish-portal.mjs --campaign data/studio-voice/rednote-boards-v1 --catalog services/studio/content/infographic-v2.json --env-file secrets/runtime/portal-sync.env --output apps/portal/src/content/studio-catalog.json --merge
```

Lệnh dựng chạy hữu hạn ba bài, giữ WAV từng cảnh để biên tập viên nghe lại. TTS có thể khác nhẹ giữa lần dựng; lưu bản đầu ra đã chọn và checksum, không hứa bit-for-bit deterministic. `*.timeline.json` riêng hỗ trợ cảnh theo đúng độ dài lời đọc, không lách giới hạn 8 giây/cảnh của API Project cũ. Publisher `--merge` giữ bộ cũ và ý tưởng, kiểm tra catalog chưa đổi sau khi render, không xuất file quá 4 MB hoặc báo có giọng khi chưa xác minh AAC. Không gọi compiler bằng input từ web.
