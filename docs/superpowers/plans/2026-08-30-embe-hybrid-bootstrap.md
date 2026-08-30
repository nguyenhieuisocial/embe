# Em Bé Hybrid Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến `C:\EmBe` thành project root duy nhất cho mã nguồn, cấu hình, Obsidian vault và bằng chứng vận hành; dùng Cloudflare, Vercel và Supabase có chọn lọc mà vẫn giữ dữ liệu gốc ở local.

**Architecture:** Git, IaC, migration, script, tài liệu và Obsidian vault nằm dưới `C:\EmBe`. Portal chạy trên Vercel; Cloudflare bảo vệ hostname và kết nối đến local BFF qua Tunnel; Supabase chỉ giữ read-model đã duyệt và không bao giờ là system of record. Ảnh RAW/video, hồ sơ y tế, database nguồn và secrets không được đưa vào Git hoặc Vercel/Supabase.

**Tech Stack:** Windows 11, WSL2 Ubuntu, Docker Desktop cho development, GitHub private repository, Obsidian, Cloudflare DNS/Access/Tunnel/R2, Vercel Next.js, Supabase Postgres/Auth tùy chọn, SOPS + age, Restic.

**Spec:** `./2026-08-30-embe-family-data-platform.md`

## Global Constraints

- Project root trên máy hiện tại là `C:\EmBe`; không tạo source/config ở workspace cũ sau bootstrap.
- `C:\EmBe\embe` là Obsidian vault local-first; toàn bộ vault bị loại khỏi Git và được backup bằng Restic mã hóa.
- Memos là nơi ghi nhanh; Obsidian nhận export một chiều để tránh xung đột hai chiều.
- `C:\EmBe\data\media` là stable path nhưng dữ liệu media thật phải đặt trên disk/NAS riêng bằng junction hoặc mount; không lấp SSD hệ thống.
- Vercel chỉ host Portal và lightweight server functions; không proxy RAW/4K hoặc chạy job dài.
- Supabase Free chỉ giữ curated portal read-model nếu được bật; không giữ medical records, GPS, RAW/video, token hoặc full BabyBuddy events.
- Cloudflare R2 Free chỉ đủ cho config/DB snapshot nhỏ; full media offsite cần quota trả phí hoặc remote NAS.
- Chỉ `embe.hieu.asia` và `data.embe.hieu.asia` có public DNS; admin apps và MCP không public.
- Không lưu cleartext token trong Git, Obsidian, `.env`, Vercel client bundle hoặc Supabase public schema.
- Mọi cloud resource phải thuộc project/organization `EmBe`, không dùng chung project database với iFan.

---

### Task 1: Khởi tạo project root và Obsidian vault

**Files:**
- Create: `C:\EmBe\.gitignore`
- Create: `C:\EmBe\README.md`
- Preserve: `C:\EmBe\embe\.obsidian\*`
- Create: `C:\EmBe\embe\00-Home.md`
- Create: `C:\EmBe\embe\90-System\Data-Ownership.md`
- Create: `C:\EmBe\embe\Templates\Daily-Journal.md`

**Interfaces:**
- Consumes: root directory trống đã được kiểm tra.
- Produces: Git root và vault có ranh giới backup/version-control rõ ràng.

- [ ] **Step 1: Tạo layout cố định**

  Tạo `apps`, `services`, `infra`, `scripts`, `supabase`, `vault`, `data`, `exports`, `secrets`, `docs` dưới `C:\EmBe`.

- [ ] **Step 2: Khóa file nhạy cảm khỏi Git**

  `.gitignore` phải loại toàn bộ `embe/`, `data/`, `exports/`, cleartext trong `secrets/`, `.env*`, database files và media extensions; chỉ cho phép `*.example`, `*.enc.*` và tài liệu không chứa dữ liệu gia đình.

- [ ] **Step 3: Tạo cấu trúc vault**

  Vault gồm `00-Inbox`, `10-Pregnancy`, `20-Baby`, `30-Milestones`, `40-Health`, `50-Media`, `60-Inventory`, `70-Books`, `90-System`, `Templates`.

- [ ] **Step 4: Ghi data ownership note**

  `Data-Ownership.md` ghi Memos là capture source, BabyBuddy là structured source, Immich là media source, Paperless là document source; vault chỉ là curated archive và không ghi ngược tự động.

- [ ] **Step 5: Verify**

  Chạy `git check-ignore -v embe/00-Home.md data/test.db secrets/test.env` và yêu cầu cả ba path đều bị ignore.

- [ ] **Step 6: Commit**

  Commit bằng message `chore(workspace): bootstrap embe root and vault`.

### Task 2: Secret model và local toolchain

**Files:**
- Create: `C:\EmBe\.sops.yaml`
- Create: `C:\EmBe\secrets\README.md`
- Create: `C:\EmBe\infra\env\cloud.example.env`
- Create: `C:\EmBe\scripts\verify-toolchain.ps1`

**Interfaces:**
- Consumes: project root Task 1.
- Produces: secret convention và toolchain check không tiết lộ secret values.

- [ ] **Step 1: Cài công cụ local**

  Cài `sops`, `age`, `restic`, `cloudflared`, `typst`; Docker Desktop phải chạy Linux engine.

- [ ] **Step 2: Tạo age identity**

  Private identity chỉ nằm trong Windows credential-protected user profile và password manager recovery copy; `.sops.yaml` chỉ chứa public recipient.

- [ ] **Step 3: Khai secret names**

  Khai tên biến `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `VERCEL_PROJECT_ID`, `SUPABASE_PROJECT_REF`; file example không chứa giá trị thật.

- [ ] **Step 4: Verify**

  `verify-toolchain.ps1` kiểm tra executable, Docker server, WSL2 và disk free; script fail khi Docker daemon tắt hoặc ổ C còn dưới 100 GB.

- [ ] **Step 5: Commit**

  Commit bằng message `chore(security): establish encrypted secret workflow`.

### Task 3: GitHub private repository

**Files:**
- Create: `C:\EmBe\.github\workflows\validate.yml`
- Create: `C:\EmBe\docs\operations\source-control.md`

**Interfaces:**
- Consumes: local Git root và authenticated GitHub CLI.
- Produces: private repo `nguyenhieuisocial/embe` với secret scan và build validation.

- [ ] **Step 1: Khởi tạo Git**

  Default branch là `main`; không import `.git` từ workspace cũ.

- [ ] **Step 2: Tạo private repo**

  Tạo `nguyenhieuisocial/embe` ở chế độ private và gắn `origin`; không đặt vault hoặc data trong initial commit.

- [ ] **Step 3: Thêm validation workflow**

  Workflow chỉ chạy lint, typecheck, unit tests, secret scan và IaC validation; deployment dùng environment approval.

- [ ] **Step 4: Negative test**

  Tạo file giả bị `.gitignore` chặn và xác nhận `git status --short` không liệt kê nó; xóa file giả sau test.

- [ ] **Step 5: Commit và push**

  Commit bằng message `ci(repo): add private validation pipeline`, sau đó push `main`.

### Task 4: Cloudflare control plane

**Files:**
- Create: `C:\EmBe\infra\cloudflare\README.md`
- Create: `C:\EmBe\infra\cloudflare\access-policy.json`
- Create: `C:\EmBe\infra\cloudflare\tunnel-routes.json`

**Interfaces:**
- Consumes: zone `hieu.asia`, scoped Cloudflare API token và family email allowlist.
- Produces: Access-protected portal hostname và outbound-only local data hostname.

- [ ] **Step 1: Tạo scoped token**

  Token chỉ có DNS Edit cho `hieu.asia`, Cloudflare Tunnel Edit và Access Apps and Policies Edit; không dùng Global API Key.

- [ ] **Step 2: Tạo Access application**

  `embe.hieu.asia` và `data.embe.hieu.asia` dùng deny-by-default, allow đúng family emails, OTP enabled và session duration 24 giờ.

- [ ] **Step 3: Tạo tunnel**

  Tunnel `embe-home` chỉ route `data.embe.hieu.asia` đến local BFF; route fallback trả HTTP 404.

- [ ] **Step 4: Tạo R2 bucket**

  Bucket `embe-backup` dùng credential Object Read & Write giới hạn đúng bucket; giai đoạn miễn phí chỉ chứa encrypted config/DB snapshot nhỏ.

- [ ] **Step 5: Negative tests**

  Email ngoài allowlist bị chặn; origin không có inbound port; public hostname không expose BabyBuddy/Memos/Immich admin routes.

- [ ] **Step 6: Commit**

  Commit bằng message `feat(cloudflare): define protected hybrid edge`.

### Task 5: Vercel Portal

**Files:**
- Create: `C:\EmBe\apps\portal\package.json`
- Create: `C:\EmBe\apps\portal\vercel.json`
- Create: `C:\EmBe\apps\portal\src\app\page.tsx`
- Create: `C:\EmBe\apps\portal\src\app\api\health\route.ts`
- Create: `C:\EmBe\apps\portal\tests\privacy.spec.ts`

**Interfaces:**
- Consumes: private GitHub repo và Cloudflare-protected `data.embe.hieu.asia`.
- Produces: personal-family Next.js portal trên Vercel, không giữ upstream tokens trong browser.

- [ ] **Step 1: Tạo Next.js app tối thiểu bằng test-first**

  Viết test yêu cầu trang home render timeline shell, gallery shell và Vietnamese labels; chạy test để xác nhận fail trước implementation.

- [ ] **Step 2: Implement static shell**

  Portal chỉ fetch curated JSON và signed thumbnail/video URLs từ local BFF; không proxy media qua Vercel Function.

- [ ] **Step 3: Privacy test**

  Build output và browser bundle không được chứa token prefix, internal IP, BabyBuddy fields, GPS hoặc health note.

- [ ] **Step 4: Tạo Vercel project**

  Tạo project `embe-portal`, link repo, đặt production branch `main`, gắn `embe.hieu.asia`; deployment preview không có quyền đọc production data.

- [ ] **Step 5: Verify Cloudflare in front of Vercel**

  Truy cập chưa đăng nhập bị Access chặn; sau OTP trang tải được và gọi local BFF thành công; Vercel usage không tăng theo byte RAW/video.

- [ ] **Step 6: Commit**

  Commit bằng message `feat(portal): deploy protected family shell`.

### Task 6: Supabase optional curated read-model

**Files:**
- Create: `C:\EmBe\supabase\config.toml`
- Create: `C:\EmBe\supabase\schemas\portal_read_model.sql`
- Create: `C:\EmBe\supabase\tests\rls.sql`
- Create: `C:\EmBe\docs\architecture\supabase-boundary.md`

**Interfaces:**
- Consumes: explicitly approved subset of timeline/milestone metadata.
- Produces: optional cloud read-model that can be deleted/rebuilt from local sources.

- [ ] **Step 1: Tạo project riêng**

  Tạo Supabase organization/project mang tên `EmBe`; không dùng project hoặc schema của iFan.

- [ ] **Step 2: Khai private schema**

  Raw ingest ở schema không expose; public-facing view dùng `security_invoker = true`; Data API exposure phải opt-in rõ ràng.

- [ ] **Step 3: Khai dữ liệu được phép**

  Chỉ sync event ID giả lập, event date, public caption đã duyệt, album cover reference và portal role; cấm medical value, GPS, original filenames, RAW/video và service tokens.

- [ ] **Step 4: RLS tests**

  Test anonymous access trả zero rows; family user chỉ đọc rows được phép; mọi INSERT/UPDATE/DELETE từ client bị từ chối.

- [ ] **Step 5: Failure mode test**

  Khi Supabase pause hoặc unavailable, local source và Obsidian export vẫn hoạt động; portal hiển thị trạng thái tạm thời thay vì mất dữ liệu.

- [ ] **Step 6: Commit**

  Commit bằng message `feat(supabase): add rebuildable portal read model`.

### Task 7: Local BFF, data paths và Obsidian export

**Files:**
- Create: `C:\EmBe\services\local-bff\src\main.py`
- Create: `C:\EmBe\services\local-bff\tests\test_policy.py`
- Create: `C:\EmBe\services\vault-export\src\export.py`
- Create: `C:\EmBe\services\vault-export\tests\test_idempotency.py`
- Create: `C:\EmBe\infra\compose\hybrid.yml`

**Interfaces:**
- Consumes: Memos/Immich local APIs và source IDs.
- Produces: curated portal API, signed media links và deterministic Markdown export.

- [ ] **Step 1: Policy tests trước implementation**

  Test BFF từ chối asset ngoài album allowlist, GPS fields, original download và unknown route; test exporter chạy hai lần không tạo duplicate note.

- [ ] **Step 2: Implement local BFF**

  BFF chỉ trả timeline đã duyệt, thumbnail, encoded video và minimal metadata; bind private Docker network, chỉ Cloudflare Tunnel vào được.

- [ ] **Step 3: Implement one-way vault export**

  Mỗi memo xuất thành Markdown theo source ID; edit cập nhật cùng file; delete chuyển note vào archive manifest, không xóa vĩnh viễn tự động.

- [ ] **Step 4: Stable media path**

  `C:\EmBe\data\media` phải trỏ đến disk/NAS riêng; script startup fail nếu path rơi về SSD C hoặc free space dưới 25%.

- [ ] **Step 5: Integration test**

  Tạo memo test và preview asset test; xác nhận Portal đọc được, vault có đúng một Markdown note, Git không thấy note/media.

- [ ] **Step 6: Commit**

  Commit bằng message `feat(hybrid): bridge local sources to cloud portal and vault`.

### Task 8: Backup và bootstrap acceptance

**Files:**
- Create: `C:\EmBe\scripts\backup\run-restic.ps1`
- Create: `C:\EmBe\scripts\backup\restore-drill.ps1`
- Create: `C:\EmBe\docs\operations\hybrid-restore.md`
- Create: `C:\EmBe\docs\operations\bootstrap-evidence.md`

**Interfaces:**
- Consumes: source/config, vault, app DB snapshots, media manifest và two backup targets.
- Produces: restore evidence và go/no-go decision cho MVP implementation.

- [ ] **Step 1: Backup local repository**

  Restic backup code/config encrypted state, vault và consistent DB snapshots đến local target khác thiết bị.

- [ ] **Step 2: Backup offsite tiered data**

  R2 Free nhận encrypted config/DB/vault snapshot trong quota; media đi remote NAS hoặc paid object storage khi vượt quota.

- [ ] **Step 3: Restore drill**

  Restore vào temporary directory, mở ngẫu nhiên một vault note, một DB dump và manifest; verify checksums.

- [ ] **Step 4: Acceptance checks**

  Xác nhận cloud outage không làm mất source data, local outage không lộ admin apps, Supabase có thể rebuild, và Vercel không chứa media originals.

- [ ] **Step 5: Commit**

  Commit bằng message `test(ops): prove hybrid bootstrap recovery`.

---

## Self-review

- Spec coverage: project root, Obsidian vault, Cloudflare, Vercel, Supabase, secrets, local/cloud boundary, backup và failure modes đều có task/gate.
- Placeholder scan: resource names, paths, hostnames, roles và test outcomes đều được xác định; secret values được tạo just-in-time và không xuất hiện trong plan.
- Interface consistency: `embe.hieu.asia` là Portal, `data.embe.hieu.asia` là local BFF, Supabase chỉ là rebuildable read-model và vault chỉ nhận one-way export.
