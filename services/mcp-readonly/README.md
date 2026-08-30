# Em Bé read-only MCP

MCP server này dùng SDK chính thức `modelcontextprotocol/python-sdk` và chỉ có
ba tool tổng hợp: ngủ, bú sữa và tương quan môi trường–giấc ngủ. Không có tool
SQL tùy ý, không có tool ghi/xóa và không expose bản ghi y tế thô.

## Ranh giới an toàn

- Chạy local qua `stdio`; không public port hoặc Cloudflare Tunnel.
- Mỗi truy vấn tối đa 31 ngày và 5.000 record trước khi tổng hợp.
- `read_only_hint` là metadata cho client, không phải cơ chế bảo mật.
- Adapter local chỉ mở SQLite ở chế độ chỉ đọc, dùng câu truy vấn cố định và
  không nhận câu SQL từ model.
- Kết quả tương quan chỉ mang tính mô tả, không phải quan hệ nhân quả hay chẩn
  đoán y khoa.

## Kiểm thử

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

`pylock.toml` khóa dependency và hash cho Python/Windows hiện tại. Server chạy
bằng `python -m embe_mcp.server`; khi chưa cấu hình adapter production, server
dùng repository rỗng và không đọc dữ liệu gia đình.

Local inference dùng Ollama theo cấu hình tại `infra/ai/README.md`. Ollama không
được gọi thẳng database; mọi truy vấn dữ liệu phải đi qua ba MCP tool giới hạn ở
trên.

## Hỏi AI cục bộ bằng tiếng Việt

CLI chỉ lấy một trong ba kết quả tổng hợp cố định rồi mới gửi kết quả đó đến
`qwen3:8b` qua `http://127.0.0.1:11434/api/generate`. Adapter từ chối endpoint
Internet, field bí mật, bản ghi/mốc thời gian thô và danh sách record. Request có
timeout 30 giây, thử lại một lần khi lỗi mạng tạm thời và không khai báo tools.

Ví dụ hỏi về giấc ngủ trong bảy ngày:

```powershell
.\.venv\Scripts\embe-hoi.exe `
  --database C:\EmBe\data\analytics\family-analytics.sqlite3 `
  --be-id child-primary `
  --chu-de ngu `
  --tu-ngay 2026-08-24 `
  --den-ngay 2026-08-30 `
  --cau-hoi "Tuần này bé ngủ thế nào?"
```

Ba chủ đề được phép là `ngu`, `bu` và `moi-truong`. Câu trả lời chỉ là diễn giải
thống kê, không thay thế tư vấn bác sĩ. Kiểm thử dùng dữ liệu giả và transport
giả; không gửi dữ liệu gia đình thật.

## Chạy local an toàn

Production entrypoint chỉ dùng stdio và mở SQLite bằng `mode=ro` cộng
`PRAGMA query_only`. Không có cổng HTTP public, raw SQL, tool ghi hoặc tham số
prompt. Mỗi lần chạy phải truyền chính xác child ID được phép:

```powershell
.\.venv\Scripts\python.exe -m embe_mcp.main `
  --database C:\EmBe\data\analytics\family-analytics.sqlite3 `
  --child-id child-primary
```

Kết quả có provenance, số mẫu và phiên bản thuật toán. Dữ liệu tổng hợp chỉ được
đưa cho Ollama tại loopback; module bảo vệ từ chối endpoint Internet, raw records
và field có dạng token/secret. Không cấu hình LLM đám mây cho dữ liệu sức khỏe.

Trên máy EmBe, server được đăng ký với Codex dưới tên `embe-readonly` bằng
entrypoint trên. Cấu hình không chứa token và chỉ trỏ tới SQLite local; sau khi
khởi động lại Codex, ba tool tổng hợp sẽ xuất hiện trong danh sách MCP.

