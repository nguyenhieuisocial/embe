# Hồ sơ thai kỳ — đọc và đối chiếu giấy tờ

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

## Nâng cấp đọc chi tiết và đối chiếu — 07/09/2026

- Ảnh JPEG/PNG/WebP hợp lệ dưới 15 MB và tối đa 16 triệu điểm ảnh được giữ nguyên khi tải, tránh nén lại mất chữ nhỏ. Ảnh khác vẫn qua luồng chuyển đổi giới hạn 3200px; PDF không bị đổi. Worker không thay file lưu.
- Trang lớn được đọc bằng một ảnh tổng quan và tối đa ba vùng chi tiết chồng mép. Tái sử dụng Pillow/PDFium và Ollama vision; không cài thêm model hoặc gửi tài liệu cho AI bên ngoài. Schema đọc khoản thu/thuốc trước các trường tổng quát để giảm lỗi tách bảng thành từng ô rồi mất dòng cuối.
- Kiểm tra mâu thuẫn số, dấu âm/bất đẳng thức, dấu thập phân và đơn vị so với câu trích; kiểm tra lớp chữ PDF, nhãn trùng khác giá trị và cảnh báo chạm giới hạn dòng. Đây chỉ là phát hiện mâu thuẫn, **không chứng minh câu AI trích đúng với ảnh**. Mọi thuốc, danh tính và ngày vẫn cần đối chiếu.
- Giao diện frontend-design giữ bảng màu hiện tại, thao tác tối thiểu 44px: ảnh gốc riêng tư xem ngay tại chỗ, phóng to/thu nhỏ và cuộn bằng cảm ứng hoặc bàn phím; chọn trang PDF, lọc mục cần kiểm tra, giữ bản sửa qua chuyển trang. Nội dung sao chép luôn mang trạng thái bản nháp/đã đối chiếu và dấu chưa rõ. Phản hồi lưu sai cấu trúc không làm mất bản sửa.
- Benchmark `medical-recognition-detail-benchmark.py --kind receipt_long`: phiếu thu dài giả lập, so sánh ảnh tổng quan với ảnh chi tiết trên cùng model/prompt. Năm số tiền kiểm tra ở đúng nhóm khoản thu: **1/5 → 5/5**, 19,92 → 23,07 giây; bản chi tiết có 12 dòng dịch vụ + 3 dòng thanh toán. Tên dịch vụ còn bị rút thành “Dịch vụ”, đã được đánh dấu do trùng nhãn; không tuyên bố nhận đúng toàn bộ dòng.
- Bốn loại giấy tờ rõ chữ (phiếu thu, đơn thuốc, siêu âm, bệnh án) đều phân loại đúng, 11 giá trị kiểm tra còn đủ; 4,25–5,48 giây với model đã nạp. Hai mẫu vẫn sai dấu họ tên; không suy độ chính xác ngoài bộ mẫu. PDF hai trang render đủ, bảy trang báo giới hạn. Không dùng dữ liệu thật.
- Kiểm tra trước live: 802 tests/152 files của portal, typecheck và build đạt; mobile-shell nằm trong bộ này. Các kiểm tra Python bao gồm dấu/số/đơn vị, đối chiếu nguồn, giới hạn ảnh, không sửa file gốc và không ghi chỉ số y tế. Live được xác minh riêng qua script có tạo rồi xóa mềm đúng một hồ sơ giả lập, không thay hồ sơ gia đình.
