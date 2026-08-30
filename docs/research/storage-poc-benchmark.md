# Benchmark — Free-First Hybrid Storage PoC

**Ngày chạy:** 2026-08-30
**Dữ liệu:** deterministic synthetic, không có dữ liệu gia đình
**Trạng thái production:** disabled

## Kết quả đã đo: LocalStorage

Đây là baseline code + filesystem, không phải tốc độ Internet. Mỗi file được tạo,
SHA-256, atomic copy, đọc toàn bộ, đọc ba Range 64 KiB và bốn Range song song.

| Size | Upload MiB/s | Download MiB/s | TTFB ms | Range p50 ms | 4 Range đồng thời MiB/s |
|---:|---:|---:|---:|---:|---:|
| 1 MiB | 90.53 | 183.72 | 5.42 | 0.27 | 3,167.06 |
| 20 MiB | 581.04 | 1,670.84 | 4.49 | 0.25 | 4,678.43 |
| 100 MiB | 804.45 | 2,125.74 | 5.57 | 0.38 | 5,157.21 |
| 500 MiB | 705.83 | 2,198.63 | 5.89 | 0.26 | 4,878.72 |
| 1 GiB | 685.06 | 2,201.90 | 5.70 | 0.25 | 4,767.44 |
| 2 GiB | 374.55 | 2,293.19 | 4.76 | 0.27 | 4,075.08 |
| 3.9 GB decimal | 171.17 | 2,453.61 | 6.00 | 0.25 | 5,385.03 |

Tốc độ download cao chịu ảnh hưởng OS page cache; không được dùng làm con số ổ
đĩa bền vững. Mục đích của baseline là chứng minh code xử lý file lớn, `bigint`,
Range và concurrency không vỡ trước khi thêm mạng.

## Cache baseline

Read-through cache 1 GiB được chạy ở 1/20/100/500 MiB. Sau mỗi object, lần đọc
toàn bộ đầu tiên là miss; ba Range và bốn Range song song tiếp theo là hit.

| Size | Cold TTFB ms | Range p50 sau cache ms | Hits cộng dồn | Misses cộng dồn | Evictions |
|---:|---:|---:|---:|---:|---:|
| 1 MiB | 14.96 | 0.33 | 7 | 1 | 0 |
| 20 MiB | 36.40 | 0.34 | 14 | 2 | 0 |
| 100 MiB | 130.72 | 0.28 | 21 | 3 | 0 |
| 500 MiB | 553.75 | 0.34 | 28 | 4 | 0 |

PoC hiện cache cả ciphertext/object trước khi phục vụ Range; đây là reference
implementation an toàn, chưa phải sparse cache tối ưu như `varc`/NoBuf.

## Live provider matrix

| Provider | Trạng thái | Lý do |
|---|---|---|
| Telegram Premium MTProto | **skipped** | Không phát hiện dedicated Premium session/API ID/hash/private shard allowlist |
| Cloudflare R2 | **measured** | Private `embe-backup`, scoped Object Read/Write key; chỉ synthetic data |
| AWS S3 | **skipped** | Không có disposable bucket/scoped credential |

### Cloudflare R2 đã đo (client-side AES-256-GCM)

| Size | Upload MiB/s | Download MiB/s | TTFB ms | Range p50 ms | 4 Range đồng thời MiB/s |
|---:|---:|---:|---:|---:|---:|
| 1 MiB | 0.31 | 1.19 | 840.14 | 207.10 | 2.27 |
| 20 MiB | 5.37 | 21.64 | 896.94 | 2,787.68 | 10.02 |

API smoke test thật cũng đã đạt: health, upload 1 MiB đã mã hóa, giải mã khi tải,
full checksum, HTTP Range, soft delete và HTTP 404 sau xóa. Sau benchmark, prefix
PoC trên R2 còn **0 object**. Các số nhỏ này chỉ xác nhận đường truyền và tính
đúng đắn, chưa phải capacity test. Range hiện phải lấy ciphertext đầy đủ trước khi
giải mã nên latency 20 MiB còn cao; sparse encrypted-range cache là bước tối ưu sau.

Không có số tốc độ, `FLOOD_WAIT`, session revoke, permission loss hoặc expired
file reference nào được bịa ra. Phân loại RPC error đã có mocked contract tests;
network interruption, permission drill và session revoke thật mới chỉ có runbook,
chỉ được đánh dấu `measured` sau khi lab credential đúng phạm vi được cấp.

## So sánh kiến trúc hiện tại

| Tiêu chí | Telegram Premium MTProto | R2 Standard | S3 Standard Singapore | Local |
|---|---|---|---|---|
| Giá storage | Gộp trong subscription Premium, không có SKU/SLA storage | $0.015/GB-tháng sau free 10 GB | khoảng $0.025/GB-tháng dưới 50 TB | Disk, điện, backup |
| Egress | Không có bảng giá nhưng rate/abuse không được bảo đảm | Miễn phí | Direct Internet có phí sau allowance | LAN miễn phí |
| Object API/SLA | Không | S3-compatible, 99.9% SLA | Native S3, hệ sinh thái/SLA mạnh | Do mình vận hành |
| Range/video | Phải proxy MTProto, align chunk và cache | Native Range + Cloudflare | Native Range + CDN | Native Range |
| Recovery | Scan history + encrypted manifest; chậm/không SLA | List/Inventory/versioning | Inventory/versioning/replication | Snapshot + manifest |
| Privacy | Cloud chat không E2EE; cần client-side AEAD | Private bucket + client/server encryption | Private bucket + KMS/client encryption | Kiểm soát tốt nhất nếu host an toàn |
| Platform risk | Cao; intended-use/automation chưa được Telegram phê duyệt | Thấp trong product contract | Thấp trong product contract | Không có platform ban |

Telegram Premium không thực sự “free”: nó là subscription dành cho messaging,
không phải hợp đồng object storage. Chi phí tiền mặt có thể thấp ở nhiều TB nhưng
rủi ro mất account, thay Terms, throttling và restore time không thể quy đổi thành
SLA như R2/S3.

## Phân loại dữ liệu

| Lớp dữ liệu | Telegram-only | Replica bắt buộc | Quyết định |
|---|---:|---|---|
| Synthetic benchmark, file tái tạo được | Có trong lab | Không | Tự xóa sau test |
| Thumbnail/preview công khai đã duyệt | Không cần | Local hoặc R2 hot | Telegram chỉ delivery tùy chọn |
| Ảnh/video gia đình đã chọn, không nhạy cảm | Không | Local canonical + R2/S3/B2 encrypted | Telegram chỉ experimental encrypted replica |
| RAW/original không thể tái tạo, sách/PDF quan trọng | Không | Ít nhất hai replica + offsite 3-2-1 | Không phụ thuộc Telegram |
| Hồ sơ sức khỏe, giấy tờ định danh, ảnh riêng tư của mẹ/trẻ | Tuyệt đối không | Local encrypted + storage có policy/backup kiểm soát | Không đưa Telegram |

Trong production hiện không có lớp dữ liệu nào được duyệt `Telegram-only`.

## Test tự động

- 31 test cases: provider contract Local/S3/R2, API auth/tenant/owner/Range/delete,
  chunked AEAD/corruption, cache, migration/idempotency, signed-encrypted manifest,
  index rebuild, retry `FLOOD_WAIT`, mocked MTProto upload/range/history/delete và
  delete retry worker, resume đúng offset sau file-reference expiry và phân loại
  `FLOOD_PREMIUM_WAIT`/session revoke/permission loss; manifest hỏng không chặn
  phần còn lại của index rebuild; Telegram upload API đi qua local canonical +
  outbox worker thay vì giữ request nhiều GB mở tới Telegram.
- 1 live Telegram gate được skip theo thiết kế.
- Hai feature flag vẫn mặc định `false`.
- Live R2 provider và API smoke test đã chạy bằng scoped key; Compose profile đã
  dừng sau test và không nối Portal/Immich/Supabase production.

## Kết luận tạm thời

PoC offline chứng minh abstraction, schema, Range, encryption, cache và recovery
manifest có thể triển khai mà không đổi application. Nó **chưa chứng minh**
Telegram phù hợp làm origin/cold storage vì chưa có live measurement và rủi ro
Terms/durability vẫn độc lập với performance.

Quyết định hiện tại: giữ `TelegramStorage` là **experimental provider**, không
dùng `cold/origin`, không là secondary replica production. Local + R2/S3 vẫn là
đường production có thể kiểm soát.
