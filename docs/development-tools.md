# Công cụ phát triển EmBe — 08/09/2026

Đây là công cụ cho người phát triển, không phải tính năng của web và không cấp quyền đăng mạng xã hội.

## RTK — đã chạy thử

- Nguồn: https://github.com/rtk-ai/rtk
- Bản Windows: 0.48.0, cài riêng tại `tools/bin/rtk-0.48.0/rtk.exe`.
- SHA-256 ZIP đã khớp `checksums.txt` của release: `8c9ae56bacde865112777a9fe9791b449186d8b2a081c32c0772ef773f284f93`.
- Đã chạy `--version` và `git status`. Không chạy `init`, không thêm PATH hay hook toàn máy.
- Chỉ giảm đầu ra lệnh; chưa đo mức tiết kiệm token trên EmBe. Không dùng bản tóm tắt thay bằng chứng lỗi, đọc skill đầy đủ hay review mã nguồn.

## UI UX Pro Max — đã cài riêng và sử dụng

- Nguồn: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Commit: `4aad0584d92131626b16d4ff4d77f0455385013c`.
- Skill: `.agents/skills/ui-ux-pro-max`; cài bằng skill-installer với `--ref` và `--dest C:/EmBe/.agents/skills`.
- Đã đọc SKILL.md và chạy search `focus not obscured --domain ux`: trả hai hướng dẫn phân biệt WCAG AA và AAA. Áp dụng làm tiêu chí review thanh điều hướng cố định, không coi kết quả tra cứu là chứng nhận UI đạt.
- Chưa thay giao diện hoặc tự sinh design system mới. Giữ tone, typography và các component sẵn có của EmBe.
- Không commit cả kho dữ liệu/vendor vào portal; nếu máy khác cần dùng, cài lại từ commit trên.

## gstack — chọn lọc phương pháp, chưa cài runtime

- Nguồn: https://github.com/garrytan/gstack
- Đã đọc digest tại commit `0530392821c277b95e5cd65aa9d9fda4248718b2`.
- Áp dụng thứ tự tái sử dụng vào AGENTS.md thay vì cài thêm bộ điều phối, browser hay deploy.
- Không chạy `setup`, không thêm auto-update, không sao chép cookie, không thay quy trình push main của EmBe.
- Chưa kiểm chứng runtime/Bun trên máy này. Khi thực sự cần tính năng riêng của gstack, kiểm tra dependency và phạm vi thay đổi trước.

## Cách dùng

## Áp dụng thực tế bổ sung — 08/09/2026

- RTK: chạy trực tiếp `git status` trên EmBe, xác nhận cây sạch; không cài hook toàn máy.
- UI UX Pro Max: truy vấn `form prefill redundant entry --domain ux -n 2` trả về Redundant Entry và Submit Feedback. Áp dụng vào luồng lấy thuốc đã lưu: tự điền số lần khi văn bản ghi rõ số lần/ngày; không suy ra lịch từ số viên, số lượng cấp, tần suất theo tuần hay cách dùng khi cần.
- Bộ OCR hiện có: `pytest services/media-ingest/tests/test_medical_document_ocr.py -q` đạt 11 kiểm thử. Không coi unit tests là đo độ chính xác trên hồ sơ thật.
- Luồng thuốc + mobile shell: 44 kiểm thử đạt, typecheck đạt. Không thêm nhà cung cấp AI, không gửi thêm dữ liệu y tế ra dịch vụ ngoài.
- Chưa cài hoặc xác minh runtime gstack; không gọi việc áp dụng một phương pháp là đã tích hợp cả repo.

```powershell
& C:/EmBe/tools/bin/rtk-0.48.0/rtk.exe git status
& C:/EmBe/.venv/Scripts/python.exe C:/EmBe/.agents/skills/ui-ux-pro-max/scripts/search.py 'focus not obscured' --domain ux -n 2
```

Kho cài đặt là nội bộ và bị gitignore. Không truyền bí mật, hồ sơ sức khỏe hoặc ảnh gia đình vào truy vấn của công cụ.
