# Hồ sơ thai kỳ — đọc và đối chiếu giấy tờ

## Bảng thuốc, lời dặn nhiều dòng và ảnh nhỏ — 08/09/2026, `medical-source-v5.1`

- Đối chiếu thêm bảng thuốc từ lớp chữ PDF khi có tiêu đề cột rõ và các ô phân cách tab/pipe. Giữ riêng tên/hàm lượng, liều mỗi lần, số lần, đường dùng, thời gian và số lượng cấp. Không suy liều từ số viên; không lấy bảng giá thuốc thành đơn uống. Bảng thiếu cột, lệch hàng hoặc tên lặp không được ghép đoán. PDF không có lớp chữ/bảng rõ vẫn dùng ảnh và AI hiện có.
- Lời dặn/kết luận nhiều dòng được giữ thành một mục khi có nhãn đầu và nhãn kết thúc rõ trên cùng trang; không nối qua trang, khoảng trống hoặc cột không rõ. Nội dung vượt giới hạn vẫn còn trong lớp chữ gốc, không cắt rồi coi là đủ. Nguồn PDF khác AI được giữ riêng, không thay bản người dùng đã sửa.
- Kiểm tra cả chữ ở tên, thành phần, liều, tần suất, cách dùng; cảnh báo khi câu trích có “không/ngừng/tránh” mà bản đọc bỏ sót. Những dấu này chỉ phát hiện mâu thuẫn, không chứng minh OCR đúng. Chỗ có mâu thuẫn được ưu tiên đọc lại và luôn cần đối chiếu đơn gốc.
- Với thuốc, cấu trúc sinh bắt buộc chép đoạn nguồn trước các ô liều/thành phần, tránh lấy câu cuối trang làm chứng cứ cho dòng thuốc. Cảnh báo phủ định giới hạn ở cách dùng (“không uống”, “ngừng dùng”…), không nhầm chú thích tài liệu với chỉ dẫn uống thuốc. Lượt web đầu trên ảnh 1000×1800px bắt được dòng trùng/chân trang bị coi là thuốc; chưa coi lần đó là đạt, hai hồ sơ mẫu và phiên kiểm tra đã được dọn.
- Ảnh chia sẻ nhỏ hơn 2.000px được đọc thêm tối đa 2–3 vùng nếu lượt đầu rỗng, thiếu nội dung hoặc bị cắt. Không phóng đại tạo điểm ảnh; ảnh có cạnh ngắn dưới 600px chỉ báo cần ảnh rõ hơn. Ảnh đọc đủ ở lượt đầu không bị tăng số lượt gọi AI.
- Không thêm model/dịch vụ trả phí, đổi database/quyền, chạy lại hồ sơ cũ hay tự ghi liều vào lịch thuốc. Bộ kiểm tra Python: 74 đạt; portal: 62 kiểm tra bản đọc/import/mobile-shell đạt. AI local bản v5.1 trên sáu mẫu giả lập: đúng 6/6 loại và 16/16 nhóm ô mục tiêu, 10,26–28,64 giây, không tính hàng đợi. Đây không phải độ chính xác đo trên hồ sơ thật hay cam kết 100%.
- Verifier hiện có `medical-intake-live-smoke.mjs` hỗ trợ `EMBE_VERIFY_DOCUMENT_COMPACT=1` cùng `EMBE_VERIFY_DOCUMENT_KIND=prescription`, kiểm tra ảnh nhỏ qua web, lưu, mở lại, liên kết lần khám và giữ nguyên bản gốc. Kết quả thực tế nằm trong `data/medical-recognition-verification/`; dữ liệu mẫu không đưa vào Git.

## Đối chiếu chữ gốc và giữ chi tiết ảnh — 07/09/2026, `medical-source-v3`

- Trang thông thường được đọc bằng ảnh nguyên độ chi tiết trước; phiếu dài vẫn dùng các vùng chồng mép. Khi thiếu bảng xét nghiệm, nhãn chung hoặc đầu ra bị cắt, mới đọc bổ sung vùng. Thử chỉ đọc một ảnh cho mọi loại đã cho thấy mất bảng xét nghiệm, nên không bỏ luồng phục hồi chi tiết.
- Chỉ tách đơn vị lặp ở cuối một biểu thức số khớp chính xác (ví dụ `45,6 mm` + `mm`); giữ nguyên dấu thập phân, dấu so sánh và câu trích, không quy đổi đơn vị hay diễn giải khoảng số.
- Với PDF có lớp chữ: giữ thêm `fields.pdfValue`/`pdfEvidence` theo cặp, tương thích version 1. Bộ đọc PDF độc lập đối chiếu nhãn rõ, duy nhất trên cùng trang; bổ sung mục hành chính còn thiếu và giữ cả hai bản nếu khác AI. Không đoán bảng, không ghép nhãn trùng, nhiều cột hay câu bị xuống dòng. Những mục bổ sung vẫn cần người dùng đối chiếu; không tự ghi đè chỉ số/thuốc.
- Giao diện giữ hai câu trích riêng. Nút **Dùng chữ từ PDF cho mục này** thay nội dung đang sửa nhưng vẫn giữ dấu cần kiểm tra và cả hai nguồn; chọn bằng cảm ứng hoặc bàn phím. Chữ từ PDF cũng có thể là lớp OCR sai, không được gọi là kết quả y tế đã xác minh.
- PDF text layer được kiểm tra giới hạn 48.000 ký tự trước khi cấp phát. AI nhận tối đa 12.000 ký tự và luôn có ảnh cả trang; lớp chữ dài có cảnh báo, đối chiếu mục có nhãn vẫn dùng phần còn lại. Bản đọc quá 60 KB báo rõ cần tách tài liệu, không cắt dữ liệu âm thầm.
- Không thêm model, AI bên ngoài, bảng database hay quyền truy cập. Dữ liệu vẫn riêng tư, file gốc không thay đổi; các tài liệu đã lưu không bị tự chạy lại hoặc ghi đè.
- Sáu tài liệu giả lập: phân loại 6/6 đúng, 16/16 nhóm ô mục tiêu đạt trong lượt so sánh mới (8,17–19,79 giây; không tính hàng đợi). Bản trước đạt 15/16; câu giả lập “THEO DÕI MẪU” nay chép đúng trong lượt này. Đây là tập kiểm tra nhỏ trên máy hiện tại, **không phải độ chính xác trên hồ sơ thật**, không bảo đảm hết lỗi dấu/chữ viết tay.
- Verifier `medical-intake-live-smoke.mjs` thêm `EMBE_VERIFY_DOCUMENT_FORMAT=pdf` để kiểm tra PDF có chữ, lựa chọn nguồn bằng bàn phím, lưu/mở lại, khớp cơ sở và giữ nguyên file. Kết quả chạy trực tiếp ở `data/medical-recognition-verification/`, không chứa hồ sơ gia đình.

## Chi tiết có cấu trúc — 07/09/2026

- Giữ tương thích bản đọc version 1 cũ. Trường bổ sung tùy chọn: `fields.context`; thuốc có `route`, `duration`, `quantity`; khoản thu có `quantity`, `unitPrice`. Tất cả lưu dạng chữ nguyên văn, có thể sửa, sao chép và mở lại; số lượng cấp phát không thay cho liều.
- Bảng có nhãn cột bị nhận nhầm được khôi phục chỉ khi câu trích khớp chính xác từng ô; dòng khôi phục vẫn đánh dấu cần đối chiếu. Dòng tổng/giảm giá/phải trả trên phiếu thu được giữ trong nhóm thanh toán. Sai khác số lượng × đơn giá chỉ là cảnh báo đối chiếu, không tự sửa số tiền hay bỏ qua thuế/giảm giá.
- Khung phóng to chồng mép 20% để giữ các hàng nhiều dòng. Chỉ đọc lại từng vùng khi bản đầu chạm giới hạn, bị cắt giữa chừng hoặc thiếu bảng xét nghiệm; tối đa ba vùng nối tiếp, gia hạn claim giữa các lượt. Giữ kết quả đọc được khi một vùng lỗi, nhưng phải hiện cảnh báo chưa đọc hết. Không coi AI trích dẫn lại chính nó là bằng chứng chính xác.
- Sức chứa mỗi trang: 64 trường, 24 thuốc, 80 khoản thu, vẫn tối đa 6 trang / 60 KB bản đọc. Chạm giới hạn phải cảnh báo. Hồ sơ có cấu trúc vẫn tối đa 12 thuốc; phần chưa nhập luôn còn trong bản đọc. Không âm thầm cắt lời dặn dài để đưa vào danh sách thuốc.
- Ngày viết dạng Việt Nam và cùng một ngày viết nhiều kiểu được nhận thống nhất; không lấy ngày sinh hoặc ngày hẹn làm ngày khám. Nhiều ngày khác nhau phải chọn lại. Không gộp các người bệnh, các thai hay kết quả khác thời điểm vào một biểu đồ. Cặp huyết áp rõ đơn vị được đề xuất thành tâm thu/tâm trương; cân nặng chung trên siêu âm không tự coi là cân nặng Mẹ.
- Thuốc đã đối chiếu mang theo đường dùng, thời gian dùng và số lượng cấp vào lời dặn của hồ sơ. Không tạo đơn mới, chẩn đoán, lịch thuốc hoặc chi tiêu tự động từ OCR. Không thay dữ liệu đã nhập trước đó.
- Mở rộng riêng envelope của API import lên 96 KB cho bản đọc + dữ liệu chọn nhập; giới hạn cấu trúc, đăng nhập, same-origin và hai revision fences giữ nguyên. Không đổi schema/quyền database, không thêm AI bên ngoài hoặc model mới.
- Kiểm chứng: `scripts/health/medical-recognition-quality-benchmark.py` dùng sáu loại tài liệu giả lập và AI local thực; `medical-intake-live-smoke.mjs` hỗ trợ mẫu siêu âm và đơn thuốc qua `EMBE_VERIFY_DOCUMENT_KIND`. Báo cáo nằm ngoài Git trong `data/medical-recognition-verification/`. Đây không phải đánh giá lâm sàng hay cam kết nhận đúng mọi ảnh/giấy viết tay.
- Lượt benchmark cuối: cả 6 loại được phân loại đúng; 15/16 nhóm ô kiểm tra đạt, 14,29–19,96 giây trên máy hiện tại. Một câu giả lập trên giấy ra viện còn sai dấu/chữ (“THEO DÕI” bị đọc thành “THEO ĐỐI”). Không sửa bằng suy đoán; chẩn đoán/kết luận/lời dặn bắt buộc đánh dấu đối chiếu, kể cả khi câu AI trích tự khớp. Kiểm tra phần mềm: 826 tests/155 files portal, 32 tests worker, typecheck và build đạt. Chưa kiểm chứng iPhone thật trong lượt này.

## Phạm vi

Mở từ Hồ sơ thai kỳ → tài liệu → **Đọc & đối chiếu**. Nhận ảnh JPEG/PNG/WebP (HEIC chuyển bằng luồng iPhone hiện có) và PDF tối đa 6 trang, 15 MB/file. Thêm nhóm phiếu thu, bệnh án và giấy ra viện vào danh sách hồ sơ. Không đọc phim DICOM hoặc chẩn đoán từ ảnh siêu âm.

## Thiết kế

Theo skill frontend-design, giữ hệ Claude Design EmBe có sẵn: #FFF8FB nền, #FFFEFD mặt phẳng, #35282E chữ, #746269 chữ phụ, #A54A6A thao tác; Be Vietnam Pro/Noto Serif. Một cột, căn trái, input 16px, touch target 44px, nút lưu trong luồng cuộn để không đè bàn phím iPhone.

```text
‹ Hồ sơ thai kỳ
Đọc & đối chiếu
Mở bản gốc
Đã đọc · cần đối chiếu
Trang 1 / loại giấy tờ
  CRL            45,6 mm      [Sửa]
  Thuốc A        cách dùng   [Chưa rõ]
  [+ Thêm phần thiếu]
[ ] Đã đối chiếu các trang với bản gốc
[Lưu bản đối chiếu] [Chép nội dung]
```

Đã tham vấn Claude Code (`claude-opus-5`, high) về bố cục, không gửi hồ sơ thật. Chỉ dùng góp ý thiết kế; phần phản hồi tự mô tả đã đọc các file không tồn tại không được coi là bằng chứng khảo sát mã nguồn. Không tạo hoặc khẳng định đã mở dự án Claude Design online mới. Chọn từng dòng thu gọn thay toàn bộ form lớn; đổi loại trang không xóa bất kỳ dữ liệu đã đọc nào. Không dùng phần trăm “chính xác” do model tự khai.

## Xử lý và an toàn

- Reuse Ollama/Qwen3-VL hiện có; không thêm tài khoản AI hoặc gửi giấy tờ cho AI cloud. PDFium/pypdfium2 đọc text layer và render từng trang; Pillow chỉnh hướng EXIF, nền trong suốt và giới hạn kích thước. Không sharpen/binarize làm mất dấu thập phân.
- JSON schema bắt buộc ở đầu ra; kiểm tra lại kiểu/độ dài. Giữ số, đơn vị, ngày tháng, tên thương hiệu và giá tiền dạng nguyên văn. Không tự tính tổng thu, đổi đơn vị, suy ra chẩn đoán hoặc liều thiếu.
- Họ tên/ngày/mã hồ sơ luôn đánh dấu cần xem lại. Nếu text layer và phần đọc không khớp, đánh dấu chưa rõ. Đây không phải OCR đã được thẩm định lâm sàng.
- Mỗi trang tách thông tin/chỉ số, thuốc và khoản thu; evidence giữ nguyên khi sửa. Cho thêm/bỏ dòng và lưu bản đối chiếu riêng bên tài liệu. Không tự sửa hồ sơ khám, thuốc đang uống, nhắc lịch hoặc ngân sách. Luồng xác nhận thuốc cũ vẫn tương thích.
- Bản gốc luôn giữ nguyên trong bucket y tế private. API kiểm tra session còn hoạt động và cùng origin cho mutation. Browser không nhận object locator hoặc khóa AI.
- Queue có claim token, giới hạn 3 lần thử tự động, timeout/retry, tiến độ từng trang, loại trừ hồ sơ đã xóa. Chống ghi đè bản đã sửa bằng revision. Khi lỗi mạng/conflict không xóa nội dung đang sửa.
- Worker riêng chạy pythonw, một instance; không restart Docker hoặc worker bữa ăn. Máy tại nhà cần bật để AI đọc; web vẫn giữ và xem được tài liệu khi worker chưa online.

## Kiểm chứng

4 ảnh mẫu tiếng Việt, không dùng dữ liệu gia đình: nhận đúng loại phiếu thu, siêu âm, đơn thuốc, bệnh án; 11 giá trị kiểm tra xuất hiện đúng. Thời gian lượt đầu 17,68 / 5,37 / 8,13 / 7,20 giây trên máy hiện tại; không phải SLA. PDF raster 2 trang render đủ, PDF >6 trang dừng rõ ràng.

**Hạn chế thật:** model đọc sai dấu trong tên mẫu ở một ảnh (“DÙNG” thành “DŨNG”), và có lặp đơn vị/tiền ở nhiều nhóm. Đã bổ sung cảnh báo họ tên/ngày, hiển thị đơn vị không lặp và bỏ dòng thu trùng chính xác. Không tuyên bố chính xác 100%, không suy từ bộ mẫu nhỏ sang giấy viết tay, ảnh mờ hay mọi bệnh viện.

Kiểm tra SQL trong transaction rollback: queue idempotent, claim token cũ bị chặn, xác nhận lưu bền, revision cũ bị chặn, hồ sơ xóa không truy cập được, anon/authenticated không đọc bảng. Không để lại bản ghi thử trong DB.

Kiểm chứng 07/09/2026: 24 kiểm tra Python (worker mới và luồng đơn thuốc cũ), toàn bộ portal 146 files/741 tests, Next build và mobile-shell đạt trước triển khai. Sau bổ sung timeout/API conflict, typecheck và 36 kiểm tra liên quan đạt. CI bản `45ac759` đã thành công.

Lượt web thật đầu tiên (chỉ một phiếu thu dựng): đọc xong sau 22,7 giây, sửa/thêm dòng và tải lại giữ đúng nội dung. Trường hợp stale revision bị timeout khi đi qua HTTP; không coi đây là kiểm chứng hoàn tất. Đã chuyển lỗi xung đột từ SQLSTATE 40001 (HTTP 500) sang PT409, thêm hạn chờ 12 giây cho RPC; giữ nguyên khóa revision và không tự ghi đè. Phiếu thu thử đầu, file lưu và phiên đăng nhập thử đã được dọn; không xóa tài liệu gia đình.

Lượt xác minh cuối trên `https://embe.hieu.asia` phiên bản `61ed55218c04df7fcd598c365d05e2ade6189d64` đã đạt: ảnh phiếu thu mẫu được nhận diện sau 16,5 giây (bao gồm đợi worker); sửa tiêu đề, thêm khoản thu, xác nhận và tải lại giữ nguyên; bản sửa cũ nhận 409; file gốc giống từng byte; không đăng nhập/hồ sơ đã xóa không đọc được; các chiều rộng 375/393/430/412/768/1280 không tràn ngang hoặc target thấp hơn 44px (sai số đo 1px). Đã xem ảnh chụp màn hình iPhone giả lập; đây là Cent Browser chứ không phải iPhone vật lý. Tài liệu mẫu cuối, file lưu và riêng phiên đăng nhập kiểm tra đã được dọn. Chi tiết kết quả nằm trong `data/medical-recognition-verification/live-result.json`, không đưa dữ liệu gia đình lên Git.

## Nguồn công cụ

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): ràng buộc JSON không bảo đảm đúng nội dung.
- [pypdfium2 API](https://pypdfium2.readthedocs.io/en/stable/python_api.html): render PDF/text layer cục bộ. Không coi text extraction là phân tích bố cục hoàn chỉnh.
- [PostgREST custom errors](https://docs.postgrest.org/en/v16/references/errors.html): trả lỗi nghiệp vụ HTTP 409/404 tường minh, không giả làm lỗi máy chủ 500.

Worker: `services/media-ingest/medical_document_worker.py`; cài dependencies bằng `requirements-medical.txt`, đăng ký bằng `scripts/install-medical-document-worker.ps1`. Live health cục bộ: `data/status/medical-document-worker.json`. Bộ mẫu và kết quả ở `data/medical-recognition-verification`; không đưa file gia đình vào Git.

## Chữ nguồn độc lập — v5.3 (08/09/2026)

- Cài thêm `npm ci --ignore-scripts --prefix services/media-ingest` trên máy worker (Node 16+; runtime hiện dùng Node 22). [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 và model tiếng Việt/Anh được khóa phiên bản trong package-lock; không tải model từ CDN khi đọc hồ sơ.
- Ảnh trang chuẩn hóa truyền qua stdin sang tiến trình Node ẩn, tối đa 25 giây/trang. Không truyền Supabase keys, không ghi ảnh/chữ OCR vào tệp tạm. Python quản lý thư mục model tạm và dọn cả khi Node bị timeout. Không cần Docker hoặc cài Tesseract hệ thống.
- Giữ `ocrText`/`ocrEngine` riêng với `pdfText`, tối đa 48.000 codepoints/nguồn/trang và 1,25 MB/bản đọc. Bộ đọc chữ có thể sai dấu, số và thứ tự; không gán nguồn OCR vào `pdfValue` hay tự xác nhận liều thuốc. Khi AI trả cấu trúc hỏng sau lượt đọc chi tiết, vẫn lưu nguồn đã lấy và báo chưa phân loại; nếu AI mất kết nối, giữ cơ chế thử lại hiện có.
- “Chữ đọc từ ảnh” và “Chữ từ PDF” mặc định thu gọn, có tìm không dấu theo từng trang. Nút chép nội dung mang theo chữ nguồn và cảnh báo. Trigger hiện có bảo vệ nguồn khi sửa/lưu; không thêm quyền đọc công khai hoặc tự ghi vào dữ liệu sức khỏe.
- Benchmark dùng `scripts/health/medical-recognition-quality-benchmark.py --ocr`; sáu loại mẫu giả lập đều giữ nguồn và đúng 16 nhóm giá trị kiểm tra. Không suy kết quả này thành độ chính xác của hồ sơ thật. Bản đọc cũ không bị tự động xử lý lại hoặc sửa đổi.

## Nâng cấp đọc chi tiết và đối chiếu — 07/09/2026

- Ảnh JPEG/PNG/WebP hợp lệ dưới 15 MB và tối đa 16 triệu điểm ảnh được giữ nguyên khi tải, tránh nén lại mất chữ nhỏ. Ảnh khác vẫn qua luồng chuyển đổi giới hạn 3200px; PDF không bị đổi. Worker không thay file lưu.
- Trang lớn được đọc bằng một ảnh tổng quan và tối đa ba vùng chi tiết chồng mép. Tái sử dụng Pillow/PDFium và Ollama vision; không cài thêm model hoặc gửi tài liệu cho AI bên ngoài. Schema đọc khoản thu/thuốc trước các trường tổng quát để giảm lỗi tách bảng thành từng ô rồi mất dòng cuối.
- Kiểm tra mâu thuẫn số, dấu âm/bất đẳng thức, dấu thập phân và đơn vị so với câu trích; kiểm tra lớp chữ PDF, nhãn trùng khác giá trị và cảnh báo chạm giới hạn dòng. Đây chỉ là phát hiện mâu thuẫn, **không chứng minh câu AI trích đúng với ảnh**. Mọi thuốc, danh tính và ngày vẫn cần đối chiếu.
- Giao diện frontend-design giữ bảng màu hiện tại, thao tác tối thiểu 44px: ảnh gốc riêng tư xem ngay tại chỗ, phóng to/thu nhỏ và cuộn bằng cảm ứng hoặc bàn phím; chọn trang PDF, lọc mục cần kiểm tra, giữ bản sửa qua chuyển trang. Nội dung sao chép luôn mang trạng thái bản nháp/đã đối chiếu và dấu chưa rõ. Phản hồi lưu sai cấu trúc không làm mất bản sửa.
- Benchmark `medical-recognition-detail-benchmark.py --kind receipt_long`: phiếu thu dài giả lập, so sánh ảnh tổng quan với ảnh chi tiết trên cùng model/prompt. Năm số tiền kiểm tra ở đúng nhóm khoản thu: **1/5 → 5/5**, 19,92 → 23,07 giây; bản chi tiết có 12 dòng dịch vụ + 3 dòng thanh toán. Tên dịch vụ còn bị rút thành “Dịch vụ”, đã được đánh dấu do trùng nhãn; không tuyên bố nhận đúng toàn bộ dòng.
- Bốn loại giấy tờ rõ chữ (phiếu thu, đơn thuốc, siêu âm, bệnh án) đều phân loại đúng, 11 giá trị kiểm tra còn đủ; 4,25–5,48 giây với model đã nạp. Hai mẫu vẫn sai dấu họ tên; không suy độ chính xác ngoài bộ mẫu. PDF hai trang render đủ, bảy trang báo giới hạn. Không dùng dữ liệu thật.
- Kiểm tra trước live: 802 tests/152 files của portal, typecheck và build đạt; mobile-shell nằm trong bộ này. Các kiểm tra Python bao gồm dấu/số/đơn vị, đối chiếu nguồn, giới hạn ảnh, không sửa file gốc và không ghi chỉ số y tế. Live được xác minh riêng qua script có tạo rồi xóa mềm đúng một hồ sơ giả lập, không thay hồ sơ gia đình.
- Live `76b907f` đã nhận đủ 15 khoản thu/thanh toán của phiếu dài sau 32,564 giây (gồm chờ worker), phóng to ảnh, lọc chưa rõ, sửa/thêm/lưu/tải lại đạt, stale revision bị chặn 409, file gốc nguyên byte và kiểm tra sáu chiều rộng đạt. Qua xem screenshot phát hiện model tạo thêm trường trống BPD/CRL trên phiếu thu; đã sửa bộ lọc đầu ra để loại mẫu rỗng, vẫn giữ giá trị 0 và dữ liệu đọc được một phần. Đây không thay đổi quyền thêm dòng thủ công của người dùng.
