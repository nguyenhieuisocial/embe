# Repo/case study cho Free-First Hybrid Storage

**Kiểm tra:** 2026-08-30. Metadata sao/release chỉ là snapshot tại ngày kiểm tra.

## Repo được yêu cầu

| Repo | Data plane / stack | Điều đáng học | Vấn đề không được copy mù quáng |
|---|---|---|---|
| [Teldrive](https://github.com/tgdrive/teldrive) | Go, gotd MTProto, Postgres | Range/stream, multipart, BLAKE3, retry, rate limiter, encryption từng part | Hướng tăng nhiều bot để lấy tốc độ có rủi ro né giới hạn; metadata vẫn phụ thuộc DB |
| [tg-s3](https://github.com/gps949/tg-s3) | Bot API/Local Bot API, Worker/D1/R2 | S3 surface, three-tier cache, Range, multipart, SSE | Không có LICENSE grant rõ; Bot cloud-storage site xung đột ToS; không có 4 GB Premium |
| [NoBuf](https://github.com/Istiaq-Edu/NoBuf) | Rust grammers MTProto, Tauri, MSE | Progressive 512 KB→8 MB, prefetch/backpressure, video seek, bounded concurrency | Chưa có app-layer encryption; performance chủ yếu self-report; trust surface lớn |
| [TGWebDrive](https://github.com/Sam8r/TGWebDrive) | GramJS MTProto, Express, SQLite | Stream upload/range, split/reassemble, service-worker retry | Rất mới/ít adoption; session + index cùng SQLite; resume large download chưa hoàn chỉnh |
| [TAS](https://github.com/ixchio/tas) | Bot API, Node, AES-GCM, SQLite/FUSE | Chunk AEAD, checksum, backoff | Chunk 49 MB vượt public `getFile` 20 MB; claim “won't ban/free forever” nguy hiểm |
| [TG-FileStreamBot](https://github.com/EverythingSuckz/TG-FileStreamBot) | Go/gotd, bot/user session | Range blocks, prefetch, bounded buffer, direct streaming | Flood handling còn gap; short URL hash; public link/ToS/content risk |
| [telegram2teldrive](https://github.com/iwconfig/telegram2teldrive) | Python, user API, Postgres injection | Cho thấy khả năng scan channel cũ | Tiêm thẳng DB, phụ thuộc schema cũ; không dùng làm write/recovery path |

## Repo/component bổ sung

| Repo | Giá trị tham khảo | Đánh giá |
|---|---|---|
| [Telegram-Drive](https://github.com/caamer20/Telegram-Drive) | Local-first, Rust/grammers, TDENC2 XChaCha20-Poly1305, registry reconstruction | Tham khảo mạnh; license cần review trước reuse; encrypted media cố ý mất Range/preview |
| [TeleVault](https://github.com/yahyatoubali/televault) | Index versioned trong pinned messages/reply chain, GC, AES-GCM+scrypt, resume | Pattern recovery tốt nhất trong nhóm; vẫn là dự án nhỏ và chưa audit độc lập |
| [TDrive](https://github.com/jeetrex17/TDrive) | Split >2 GB, XChaCha20-Poly1305, shared drives/mount | Trẻ nhưng active; chỉ học state machine/manifest |
| [Driftgram Sync](https://github.com/devwithfarshi/driftgram-sync-tool) | Telethon, hash/conflict/restore browser | Quá mới; không encrypt; không đủ độ chín production |
| [99apps teledrive](https://github.com/99apps-id/teledrive) | Durable delete queue, reconcile/trash, encrypted credentials | Alpha, trusted operator only; pattern ops hữu ích |
| [varc](https://github.com/tgdrive/varc) | Sparse read-through Range cache cho Caddy | Component cache đáng benchmark; không phải storage/index system |

## Pattern đã chọn cho PoC

- Semantic asset trong DB tách khỏi provider locator.
- Locator Telegram bền là shard + message ID; không coi `file_reference` là bền.
- Manifest mã hóa và authenticated nằm cạnh object để scan history/rebuild.
- AEAD độc lập theo chunk, key envelope nằm ngoài Telegram payload.
- Scheduler có server wait + jitter, không rotate account để né flood.
- Cache có quota, hit/miss/eviction; Range không lộ Telegram session/URL.
- Feature flag, dedicated-account assertion và shard allowlist fail-closed.

PoC dùng Telethon + `cryptg` để khớp stack Python hiện có và giữ phần tích hợp
nhỏ nhất. Đây không phải lựa chọn production đã chốt. Nếu live benchmark vượt
gate kỹ thuật và pháp lý, vòng kế tiếp phải benchmark lại gotd/TDLib vì hai hướng
này phù hợp hơn cho worker dài hạn và xử lý chi tiết MTProto/CDN/file reference.

## Pattern bị loại

- Bot API làm public S3/cloud drive/file host.
- “Unlimited”, “permanent”, “free forever”, “won't ban” hoặc “zero knowledge”
  khi chưa có SLA/audit.
- Multi-account/token rotation để tăng throughput.
- Short deterministic share token, session cleartext, channel ID ở frontend.
- Chỉ giữ index trong SQLite/Postgres mà không có export/rebuild manifest.
- Reuse crypto code chưa audit hoặc upload part plaintext rồi mới encrypt.

## Nguồn nền tảng

- [Telegram API Terms](https://core.telegram.org/api/terms)
- [Telegram Premium FAQ](https://telegram.org/faq_premium/)
- [MTProto file upload/download](https://core.telegram.org/api/files)
- [File references](https://core.telegram.org/api/file-references)
- [RPC error handling](https://core.telegram.org/api/errors)
- [Bot Developer Terms](https://telegram.org/tos/bot-developers)

Bot Terms cấm rõ cloud-storage site. MTProto client Terms không đưa ra một phê
duyệt tương đương cho object-storage worker; chúng yêu cầu legitimate client,
minh bạch và không hành động thay người dùng khi họ không biết/đồng ý. Vì vậy
MTProto PoC vẫn có platform/ToS risk cao và thành công kỹ thuật không phải quyền
rollout production.
