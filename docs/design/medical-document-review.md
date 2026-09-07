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

## Nguồn công cụ

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): ràng buộc JSON không bảo đảm đúng nội dung.
- [pypdfium2 API](https://pypdfium2.readthedocs.io/en/stable/python_api.html): render PDF/text layer cục bộ. Không coi text extraction là phân tích bố cục hoàn chỉnh.

Worker: `services/media-ingest/medical_document_worker.py`; cài dependencies bằng `requirements-medical.txt`, đăng ký bằng `scripts/install-medical-document-worker.ps1`. Live health cục bộ: `data/status/medical-document-worker.json`. Bộ mẫu và kết quả ở `data/medical-recognition-verification`; không đưa file gia đình vào Git.
