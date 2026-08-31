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
6. Chỉ xóa ảnh khỏi iPhone/thẻ nhớ sau khi chính media đó có một bản off-site
   đã phục hồi kiểm chứng. Repository R2 critical hiện không nhận media gốc, nên
   việc chưa có bản sao media không chặn Portal nhưng vẫn chặn thao tác xóa nguồn.

```powershell
C:\EmBe\.venv\Scripts\python.exe services\media-ingest\ingest_media.py `
  --source E:\DCIM `
  --target D:\EmBeMedia\archive
```

Immich không được publish trực tiếp lên Internet. Kết nối iPhone chỉ được bật
qua LAN riêng hoặc VPN sau khi firewall, địa chỉ server và ổ media đã qua
verifier. Thử trước bằng 10 ảnh, một HEIC/Live Photo và một video ngắn.

## Kết nối iPhone qua Tailscale

1. Cài Tailscale trên máy chủ và iPhone, đăng nhập cùng một tài khoản gia đình.
2. Trên máy chủ, chạy dry-run trước; kết quả phải là `planned` và
   `privacy: tailnet-only`.
3. Chạy lại với `-Apply`, rồi nhập `server_url` được trả về vào ứng dụng Immich
   trên iPhone. Không bật Tailscale Funnel.

```powershell
powershell -File C:\EmBe\scripts\network\configure-immich-tailscale.ps1
powershell -File C:\EmBe\scripts\network\configure-immich-tailscale.ps1 -Apply
```
