# Em Bé Family Data Platform

`C:\EmBe` là project root duy nhất trên máy phát triển cho hệ thống lưu trữ hành trình thai kỳ và em bé.

## Ranh giới dữ liệu

- GitHub chỉ chứa source code, infrastructure-as-code, migrations và tài liệu kỹ thuật không có dữ liệu gia đình.
- `embe/`, `data/` và `exports/` là dữ liệu local-private, không bao giờ được commit.
- Secrets chỉ được lưu ở dạng mã hóa bằng SOPS/age.
- Ảnh RAW/video và hồ sơ y tế không được đưa lên Vercel hoặc Supabase.

## Thành phần

- `apps/`: Family Portal.
- `services/`: sync daemon, local BFF, analytics, MCP và document builder.
- `infra/`: Docker, Cloudflare, Vercel và vận hành.
- `infra/ai/`: runtime AI local-only và ranh giới mạng.
- `supabase/`: schema/migrations cho optional curated read-model.
- `embe/`: Obsidian vault local-first tại `C:\EmBe\embe`.
- `data/`: stable mount paths đến appdata và media storage.
- `exports/`: PDF và output được tạo lại.
- `docs/`: roadmap, architecture decisions và runbooks.

## Chính sách tái sử dụng

- Ưu tiên dự án mã nguồn mở hoặc free tier trưởng thành trước khi viết dịch vụ mới.
- Mỗi nhu cầu chỉ có một công cụ chính; không chạy nhiều nền tảng trùng vai trò.
- Code riêng chỉ dùng cho policy gia đình, mapping dữ liệu và adapter chưa có sẵn.
- Trước khi nhận dependency phải kiểm tra license, maintenance, export/backup và privacy boundary.
