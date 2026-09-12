# Sao lưu tệp online

## Đã kiểm chứng ngày 12/09/2026

- 111/111 tệp, 39.670.113 byte nguồn: 27 ảnh bữa ăn, 30 tệp hồ sơ, 54 tệp Studio.
- Tải lại cả 111 bản mã từ R2, giải mã bằng khóa phục hồi và đối chiếu byte với
  Supabase: tất cả khớp. Không dùng bản nguồn để giả lập kết quả giải mã.
- Cron tự chạy lại HTTP 200, 0 tệp còn thiếu, không ghi thêm bản trùng.
- 50 kiểm thử portal/mobile-shell, 10 kiểm thử Edge backup, 4 kiểm thử quyền
  backup và SQL fixture đạt. Snapshot DB mới khôi phục đủ 69 bảng sau khi thêm
  ledger; bản DB cloud 67 bảng trước đó vẫn được giữ nguyên theo quy tắc hằng ngày.
- Chưa thử phục hồi tệp vào môi trường Supabase mới hoặc iPhone thật.

## Phạm vi

Supabase Cron → Edge Function `cloud-file-archive` → R2 private `embe-backup`.
Không cần máy Windows, Ollama, GitHub runner hoặc worker local để chạy.

- Gồm `embe-meal-inbox`, `embe-medical-records`, `embe-photo-inbox`, `embe-studio-drafts`.
- Không gồm kho gốc Immich, previews có thể tạo lại, cấu hình Auth/Vault hoặc dịch vụ local.
- Mỗi 2 phút, tối đa 10 tệp/lượt. Tệp mới hoặc phiên bản mới được tự phát hiện.
- Không đổi hoặc xóa tệp nguồn. Mỗi phiên bản lưu một bản bất biến; retry không nhân đôi.
- Giới hạn 25 MiB/tệp, tổng dung lượng đặt trước 1 GiB và 10.000 phiên bản.
  Hết giới hạn thì giữ bản cũ, ngừng nhận thêm và báo còn tệp chưa sao lưu;
  không tự xóa lịch sử hoặc nâng gói. Đây không phải cam kết miễn phí cho toàn
  tài khoản R2, vì hạn mức có thể được dùng chung bởi dự án khác.

## Bảo mật và tính đúng

Tệp và metadata (tên, bucket, phiên bản, metadata gốc, SHA-256) được mã hóa
AES-256-GCM bằng khóa ngẫu nhiên từng tệp. Khóa tệp được bọc RSA-OAEP-SHA256
bằng khóa công khai của backup DB đã có. Khóa giải mã không đặt trên Edge,
GitHub hay Vercel. Header envelope được xác thực bằng GCM AAD.

R2 chỉ thấy tên băm trong `cloud-files-v1/*.emba`. Function không có API tải
bản gốc, danh sách đường dẫn, xóa hay lựa chọn địa chỉ đích từ bên gọi.
Token riêng trong Vault/Edge; cron gọi cố định đúng project. DB RPC chỉ dành
cho service role. Table ledger có RLS và quyền backup chỉ đọc cụ thể.

Lease DB chống chạy chồng; kiểm tra phiên bản nguồn sau download; PUT
`If-None-Match: *`; đọc lại toàn bộ ciphertext đối chiếu SHA-256 trước khi
đánh dấu đã lưu. Nếu tệp đổi/xóa trong lúc đọc, không coi là sao lưu thành công.
Trạng thái trên web đối chiếu phiên bản hiện tại; lỗi, vượt dung lượng hoặc
lịch quét cũ không được hiển thị xanh.

## Phục hồi và kiểm chứng

`scripts/backup/verify-file-archive.py` đọc bản mã từ R2, giải mã xác thực và
kiểm tra checksum toàn bộ nội dung gốc. Không cần Supabase đang hoạt động
ở chế độ mặc định; thêm `--compare-current` để đối chiếu byte với nguồn hiện tại.
Không ghi tệp sức khỏe dạng rõ ra thư mục hay log. Báo cáo riêng chỉ gồm số
lượng, dung lượng và các phép kiểm ở `exports/restore-verification/cloud-files`.

Cần giữ khóa `secrets/cloud-backup-recipient.pem` và mật khẩu phục hồi restic
ở nơi độc lập với máy nhà. Khóa này đã có bản mã ngoài máy trong restic-critical;
không lưu khóa rõ cạnh các bản sao trên R2. Chưa có giao diện khôi phục tệp vào
Supabase; không tự ghi đè dữ liệu gia đình khi kiểm chứng.

Kiểm thử: unit encryption/decryption/tampering, giới hạn byte, auth, source
version và retry; SQL fixture không mạng kiểm tra quyền, lease, dedup, phiên
bản mới và trạng thái tệp quá lớn. Backup DB cần empty Storage dependency
fixtures để khôi phục app view, không có nghĩa đã backup schema hệ thống Storage.

## Vận hành

Trong “Nhà mình”, xem riêng “Sao lưu dữ liệu online” và “Sao lưu tệp đã tải lên”.
Muốn tạm dừng, tắt đúng cron `embe-cloud-file-archive`; không xóa bản mã, ledger
hay tệp nguồn. Sau khi lỗi hạ tầng được xử lý, job chưa lưu tự thử lại sau 5 phút.
Triển khai lại Function không được thay public recipient nếu chưa có kế hoạch
giữ và quản lý cả khóa phục hồi cũ/mới.
