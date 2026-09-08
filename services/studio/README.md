# EmBe Mẹ Bầu — xưởng nội dung kiến thức

## Tự tạo video theo ngày (08/09/2026)

Trang `/studio` theo dõi lịch 1 video/ngày lúc 08:00 giờ Việt Nam, với nút tạm dừng/tiếp tục. Máy dựng đang cài tự chọn trong 7 kịch bản có nguồn, tạo project và dựng bằng giọng miền Nam; không cần mở trình duyệt. Không dựng dồn ngày bị lỡ hoặc lặp lại slug. Hết thư viện, nguồn quá hạn, dựng lỗi hoặc đầy kho thì dừng tạo thêm. Chưa phải tự nghiên cứu chủ đề mới, tự duyệt chuyên môn hoặc tự đăng mạng xã hội. Không dùng dữ liệu gia đình. Chi tiết tại `docs/design/studio-workspace.md`.

## Bàn làm việc trên web (07/09/2026)

### Phát âm và cân mức âm v3 (08/09/2026)

- `auto-south` dùng Thục Đoan v3. Thêm lựa chọn Thùy Dung (preset nữ miền Nam, phong cách tin tức/thuyết minh); không giả mạo giọng người thật, không thay model fp32 đã pin. Giữ toàn bộ preset và file v1/v2 để so sánh.
- Mở rộng cách đọc BMI/WHO/NHS/FDA/USDA chỉ ở lời đọc; chữ video, số, liều, đơn vị vẫn nguyên. SDK sea-g2p tiếp tục xử lý số, khoảng, ngày tháng; không tự viết lại bộ đọc số.
- Tăng nghỉ giữa các cảnh 160 ms, không cắt nghỉ trong câu. Dùng FFmpeg `loudnorm` có sẵn trong PyAV để đo rồi cân toàn bản đọc: mục tiêu −18 LUFS, true peak −2 dBTP, giới hạn khuếch đại 6 dB, không đổi cao độ. Đo lại và dừng nếu mức âm/độ dài không đạt; đây là kiểm tra tín hiệu, **không phải đánh giá độ tự nhiên hoặc xác nhận đọc đúng từng chữ**. Tham chiếu: https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- Hai mẫu tự viết tại `data/studio-voice/comparison-v3/result.json`: trước khoảng −20,5 LUFS, sau −18,36/−18,34 LUFS; peak −2 dBTP trước AAC. Inference đã chặn socket; upload private có đối chiếu checksum. Không dùng hồ sơ gia đình, không thêm API trả phí hoặc tải thêm model.
- Mẫu mới xuất hiện trong `/studio` và nút nghe ngay ngoài phần tùy chỉnh ở `/studio/soan`. Video lịch sử không thay; bản dựng mới lưu `processingVersion:3` và kết quả mastering. Verifier `scripts/health/studio-voice-mastering-live.mjs` chỉ đọc/phát mẫu, kiểm tra Range/auth/mobile; không tạo job hay sửa dữ liệu.

### Nhịp đọc và phát âm v2 (08/09/2026)

- Bản mới mặc định Thục Đoan v2; thêm Mỹ Duyên v2 và Kim Thanh (preset nữ miền Nam Apache 2.0 cùng model đã pin). Giữ nguyên lựa chọn v1 và file video trước đây, không âm thầm gắn nhãn lại lịch sử.
- Dùng ngữ cảnh câu tối đa 256 ký tự thay 130, giữ xuống dòng để SDK ngắt đoạn, đọc riêng DHA/NIPT/AI/PDF. Không tự đổi số, đơn vị hoặc liều thuốc. Đây vẫn là VieNeu Turbo fp32 đã có, **không phải model mới hoặc bằng chứng chất lượng tương đương người thu**.
- v2 bỏ padding làm tròn từng giây: chỉ rút phần im lặng ngoài câu dưới -54 dBFS, giữ biên âm mềm, căn cảnh theo frame 24 fps; không cắt khoảng nghỉ trong câu, không đổi cao độ. Mux AAC 48 kHz/128 kbps và phụ đề hỗ trợ mốc mili giây.
- Mỗi cảnh có “Chỉnh phát âm”: `speechText` tối đa 240 ký tự, tổng lời thực đọc ≤1.100. Chỉ ảnh hưởng lời đọc, chữ video/phụ đề không đổi. Bản xuất và màn hình duyệt hiển thị cả hai để đối chiếu; bỏ trống trở lại lời mặc định. Không chấp nhận SSML, URL hay audio reference làm lệnh.
- Mẫu tự viết đã dựng bằng `compare_story_voices.py --quality-v2 --upload`, socket bị chặn trong inference, upload kho private xác minh SHA-256. Không đọc dữ liệu gia đình, không đăng mạng xã hội. Mẫu cũ để so sánh; xác nhận decode/nhịp không thay đánh giá nghe bởi con người.
- Ba video bảng kiến thức trong thư viện cũng đã dựng lại bằng Kim Thanh v2 (`data/studio-voice/quality-v2-boards`), giữ nguyên toàn bộ lời, nguồn và nhãn chưa duyệt. Kho cũ không bị xóa; chỉ metadata bản hiện hành đổi sang file mới.
- Thử nguồn Edge-TTS 7.2.8 ngày 08/09 nhận `NoAudioReceived`; **không đưa provider lỗi vào production**, không tự fallback giọng khác, không mở tài khoản TTS trả phí. Thư viện thử chỉ nằm trong môi trường Studio cô lập, không là dependency runtime.

Mở `/studio/ban-lam-viec`: tạo/sửa/lưu kịch bản trên EmBe, dựng MP4 có giọng Việt ngay từ web, xem/tải/chia sẻ file. `/studio/kham-pha` lưu sổ chung trên cloud, có nhập sổ cũ từ thiết bị. Nút sửa bản riêng ở từng video giữ nguyên bản gốc. Xem [kiến trúc, giới hạn và vận hành hiện hành](../../docs/design/studio-workspace.md).

Máy dựng Windows chạy pythonw trong môi trường giọng đã có, poll 30 giây; máy nhà cần đang bật và đăng nhập Windows. Không dùng API local cũ để expose Internet. Các phần bên dưới mô tả pipeline hữu hạn ban đầu; giới hạn “chưa có nút sửa/dựng” đã được thay bằng bàn làm việc. Tự đăng mạng xã hội vẫn chưa có.

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

### Phụ đề và chú thích tự động (08/09/2026)

- Worker web tự tạo phụ đề từ đúng chữ đã lưu, tối đa hai dòng, theo từng cụm ngắn. Giữ số với đơn vị và cụm phủ định cùng nhau; không dùng nhận dạng lời nói để đoán lại số liệu. TTS vẫn đọc nguyên cảnh, không cắt thành các lời đọc rời rạc.
- Mốc đầu/cuối cảnh dựa trên âm thanh thực; mốc từng cụm **ước lượng trong cảnh**, không phải karaoke hoặc căn từng từ bằng forced alignment. Cấu trúc `captions.timing=estimated_within_scene` ghi rõ giới hạn này.
- Chữ được ghép sẵn trong MP4, nền tương phản, chừa mép phải và đáy cho nút mạng xã hội. Tự ghi tên nguồn đã lưu; không tự chứng nhận nội dung y khoa. Không có hiệu ứng nhấp nháy.
- Bản dựng hoàn tất có file VTT, SRT và chú thích đăng bài lấy từ snapshot bất biến của chính video. Caption để trống thì dùng tiêu đề/giai đoạn/nguồn; giữ caption tác giả nếu có, thêm nhãn AI và chưa duyệt chuyên môn. Không tạo thêm kết luận sức khỏe, link sản phẩm hoặc tự đăng mạng xã hội.
- Chỉ tự áp dụng cho lần dựng mới; video lịch sử giữ nguyên, VTT/SRT cũ tiếp tục dùng timeline cả cảnh. Asset và nội dung tải xuống vẫn yêu cầu đăng nhập, `private, no-store`.
- Kiểm tra hữu hạn: `tests/test_subtitles.py`, `voice_tests/test_narrated.py`, portal `studio-voice-subtitles.test.ts`, `mobile-shell.test.tsx`. `scripts/preview_subtitles.py` dựng hai cảnh gốc với mạng bị chặn. `scripts/health/studio-subtitles-live.mjs` chỉ đọc bản demo có sẵn, kiểm tra video/tải phụ đề trên Cent riêng; không thay iPhone/Safari thật.

### Tự động từ bản nháp đến video (08/09/2026)

- Bản mới mặc định `auto-south`, `autoRender: true`. Một giọng nữ miền Nam nhất quán (Thục Đoan v2), tự chậm lại ở cảnh có số liệu; chuẩn hóa phát âm chỉ cho lời đọc, không sửa số/liều, phụ đề hoặc nguồn. Tùy chỉnh thủ công được thu gọn và không bắt buộc.
- Editor tự lưu sau 1,8 giây ngừng nhập; chọn kịch bản mẫu bắt đầu bản riêng tự động. Không tạo bản rỗng khi chỉ mở trang. Giữ chữ mới gõ trong lúc đang lưu, dừng khi có xung đột phiên bản; lỗi mạng thử lại tối đa 3 lần cách 30 giây và tiếp tục khi có mạng trở lại.
- Migration `studio_automatic_drafts` cung cấp RPC chỉ `service_role`. Worker có sẵn đưa bản đã bật tự dựng, đủ cảnh/nguồn và ổn định 30 giây vào hàng đợi. Không phụ thuộc trang đang mở; tối đa 3 job trong hàng đợi, 100 bản dựng tổng, dùng unique revision và lock hiện có.
- Bản hủy không tự bật lại ở cùng revision; bản cũ đang dựng được hủy khi chỉnh sửa hoặc tắt tự dựng. Chỉ lỗi hạ tầng được thử lại sau 2 phút, tối đa 3 lượt; lỗi nội dung giữ lại để xử lý, không lặp vô hạn.
- Bản cũ không đổi khi chỉ xem. Lần lưu tiếp theo mặc định bật tự dựng nhưng giữ giọng đã chọn; video lịch sử không bị ghi đè. Không đụng dữ liệu sức khỏe, không tự duyệt y khoa hoặc tự đăng mạng xã hội.

### Giọng nữ miền Nam và hàng chờ duyệt trên web (07/09/2026)

- `/studio/soan`: bản mới mặc định Thục Đoan, có thêm Mỹ Duyên (nữ miền Nam, kể/đọc truyện), tốc độ 0,95 / 1 / 1,05. Studio có nghe so sánh cùng một câu; chỉ tải khi mở và nhấn phát. Bản nháp cũ giữ đúng giọng đã lưu (Piper hoặc Ái Hân); đổi giọng tạo phiên bản mới, không sửa lịch sử video cũ.
- `/studio/duyet-dang`: lưu yêu cầu theo đúng kịch bản + video, nguồn, nơi đăng dự kiến, góp ý, rút/đưa lại vào hàng chờ, xuất hồ sơ dạng TXT. Sửa hoặc xóa dự án khiến yêu cầu trước đó có nhãn bản cũ.
- **Đây là hàng chờ nội bộ, không phải đã gửi bác sĩ hoặc đã thẩm định y khoa.** Tài khoản gia đình dùng chung không chứng minh danh tính/chuyên môn của người duyệt. Không có action approve/publish/schedule. Năm nền tảng chưa có kết nối API, chưa tự đăng. Việc trao quyền cho một người duyệt và kết nối tài khoản đích là điều kiện còn thiếu, không thể thay bằng AI hoặc cookie trình duyệt.
- Tách quyền schema `embe_studio`; endpoint yêu cầu phiên đang hoạt động và same-origin khi ghi. Request gắn revision/render; lịch sử append-only, tối đa 100 yêu cầu và 100 sự kiện/yêu cầu. Không đọc hồ sơ gia đình.

Voice runtime: `vieneu==3.6.4` cài `--no-deps`, sau đó `requirements-southern-voice.txt` bên trong `.venv-studio-voice` đã có `requirements-voice.txt`. Không cài Torch/Gradio hay tạo thêm Docker. Chạy `python -m embe_studio.southern_voice` một lần để tải 6 artifact Nano (~282 MB), revision cố định và SHA-256 trong module. Runtime chỉ đọc model local và preset đúng checksum; dùng CPU 2 luồng, không gọi TTS bên ngoài, không sao chép giọng cá nhân.

[VieNeu v3 Nano](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano) và preset Ái Hân được phát hành Apache 2.0, có xác nhận quyền preset trong model card; KHÔNG dùng bộ preset VieNeu cũ có hạn chế phi thương mại. Nano còn thử nghiệm, cần nghe lại phát âm; không tuyên bố đã đạt chất lượng giọng thu chuyên nghiệp. Bản MP4 giữ nhãn giọng AI và attribution trong kịch bản tải về. Mẫu riêng không chứa thông tin sức khỏe.

### Nâng chất lượng giọng kể chuyện (07/09/2026)

- [VieNeu v3 Turbo](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo) fp32 ONNX + hai preset nữ miền Nam có sẵn, Apache 2.0. Pin revision/checksum trong `story_voice.py`; cài bằng `python -m embe_studio.story_voice` (~521 MB) một lần. Không dùng clone, encoder/denoiser, Torch, GPU pack, API TTS trả phí hoặc dữ liệu gia đình.
- SDK 3.6.4 chưa chuyển tiếp `codec_dir`; adapter nhỏ đưa engine ONNX local vào chính pipeline SDK, giữ cách chia câu, phonemizer, khoảng nghỉ và repetition guard. Bộ so sánh chặn socket trong suốt inference để xác minh không gọi mạng.
- Giữ 48 kHz đến MP4, AAC mono 128 kbps, tốc độ bằng FFmpeg `atempo` không đổi cao độ; cân mức âm có giới hạn, giữ ngữ điệu, fade 5 ms tránh tiếng bật đầu/cuối. Chỉ sửa phát âm thương hiệu EmBe → Em Bé ở đầu vào đọc; không thay số, đơn vị, kịch bản hoặc phụ đề.
- Giọng cũ vẫn có ID và engine riêng. Không âm thầm thay giọng trong phiên bản đã lưu hoặc yêu cầu duyệt. Các mẫu catalog thay locator/checksum mới nhưng giữ kho file cũ. Không tuyên bố đã nghe duyệt chuyên môn hay giọng đạt thu âm người thật.
- Kiểm tra `test_story_voice.py`, `test_narrated.py`, `studio-story-voice.test.tsx`; `compare_story_voices.py --upload` chỉ dựng và đưa mẫu tự viết vào kho private. Chưa tự đăng mạng xã hội. Verifier live `scripts/health/studio-story-voice-live.mjs` chỉ chỉnh một bản demo được xác minh danh tính.

Kiểm tra: `apps/portal/tests/studio-review.test.tsx`, `services/studio/tests/test_web_worker.py`, và verifier live hữu hạn `scripts/health/studio-review-live.mjs`. Không có bài mạng xã hội nào được đăng trong kiểm tra. Kiểm tra trình duyệt iPhone-sized không thay kiểm tra iPhone/Safari thật.

Môi trường `.venv-studio-voice` riêng, cài `requirements-voice.txt` và `pip install -e services/studio`. Không thay môi trường nhận diện y tế/thức ăn. Model tải từ revision cố định `1162a9173d0ce503555aed757976b7a9912eae4c` tại [Piper voices](https://huggingface.co/rhasspy/piper-voices/tree/1162a9173d0ce503555aed757976b7a9912eae4c/vi/vi_VN/vais1000/medium), đặt `.onnx` và `.onnx.json` vào `data/studio-voice/models`. Compiler kiểm tra SHA-256 cả hai, không tự tải model khác.

```powershell
.\.venv-studio-voice\Scripts\python.exe -m embe_studio.narrated --catalog services/studio/content/infographic-v2.json --model data/studio-voice/models/vi_VN-vais1000-medium.onnx --output data/studio-voice/rednote-boards-v1 --artwork services/studio/assets
.\.venv-studio-voice\Scripts\python.exe -m unittest discover -s services/studio/voice_tests -v
node services/studio/scripts/publish-portal.mjs --campaign data/studio-voice/rednote-boards-v1 --catalog services/studio/content/infographic-v2.json --env-file secrets/runtime/portal-sync.env --output apps/portal/src/content/studio-catalog.json --merge
```

Lệnh dựng chạy hữu hạn ba bài, giữ WAV từng cảnh để biên tập viên nghe lại. TTS có thể khác nhẹ giữa lần dựng; lưu bản đầu ra đã chọn và checksum, không hứa bit-for-bit deterministic. `*.timeline.json` riêng hỗ trợ cảnh theo đúng độ dài lời đọc, không lách giới hạn 8 giây/cảnh của API Project cũ. Publisher `--merge` giữ bộ cũ và ý tưởng, kiểm tra catalog chưa đổi sau khi render, không xuất file quá 4 MB hoặc báo có giọng khi chưa xác minh AAC. Không gọi compiler bằng input từ web.
