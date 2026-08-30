# Media và iPhone

Không nhập ảnh thật khi `verify-media-storage.ps1` chưa trả `ready: true`.
Ổ chứa media phải là ổ vật lý riêng, còn ít nhất 25% dung lượng sau khi nhập.

## Luồng an toàn

1. Gắn ổ media riêng và đặt `MEDIA_LOCATION` cùng
   `IMMICH_EXTERNAL_LIBRARY_PATH` trong file env local bị Git bỏ qua.
2. Chạy verifier trước khi khởi động lại Immich.
3. Chạy media ingest ở chế độ dry-run. Job chỉ nhận ảnh, video và RAW trong
   allowlist, tính SHA-256 và không tạo hay xóa file.
4. Chỉ thêm `--apply` sau khi dry-run hợp lệ. File được copy vào staging, kiểm
   checksum, rồi promote atomically; file nguồn luôn được giữ lại.
5. Mount archive vào Immich bằng
   `media.external.example.yml` ở chế độ read-only và tạo External Library từ
   `/external-library`.
6. Chỉ sau khi có bản sao thứ ba và restore drill đạt mới được xóa ảnh khỏi
   iPhone hoặc thẻ nhớ máy ảnh.

```powershell
C:\EmBe\.venv\Scripts\python.exe services\media-ingest\ingest_media.py `
  --source E:\DCIM `
  --target D:\EmBeMedia\archive
```

Immich không được publish trực tiếp lên Internet. Kết nối iPhone chỉ được bật
qua LAN riêng hoặc VPN sau khi firewall, địa chỉ server và ổ media đã qua
verifier. Thử trước bằng 10 ảnh, một HEIC/Live Photo và một video ngắn.
