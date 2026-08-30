# Tài liệu kiến trúc Em Bé

Sơ đồ tương tác chính:

- Nguồn chuẩn: `diagrams/embe-system.architecture.json`
- Bản xem độc lập: `diagrams/embe-system.architecture.html`

Sơ đồ được tạo bằng mã nguồn mở [Archify](https://github.com/tt-a1i/archify), không tự xây renderer riêng. Dự án khóa nguồn skill trong `skills-lock.json`; bản đã dùng khi tạo tài liệu là `2.16.0-dev.0`, commit `4ac500a498267f18bda42b3c82b51edb8f9c1baf`.

## Cập nhật sơ đồ

```powershell
npx -y skills add tt-a1i/archify --skill archify --agent codex --copy --yes
node .agents\skills\archify\bin\archify.mjs validate architecture docs\architecture\diagrams\embe-system.architecture.json --quality showcase --json
node .agents\skills\archify\bin\archify.mjs deliver architecture docs\architecture\diagrams\embe-system.architecture.json docs\architecture\diagrams\embe-system.architecture.html --quality showcase --json
node .agents\skills\archify\bin\archify.mjs visual-check docs\architecture\diagrams\embe-system.architecture.html --json
```

Chỉ commit JSON nguồn và HTML đã qua kiểm tra. Ảnh chụp kiểm tra là sản phẩm tạm thời, có thể tái tạo. Giao diện điều khiển của viewer dùng tiếng Anh theo fallback của Archify; nội dung hệ thống dùng tiếng Việt.
