# Em Bé read-only MCP

MCP server này dùng SDK chính thức `modelcontextprotocol/python-sdk` và chỉ có
ba tool tổng hợp: ngủ, bú sữa và tương quan môi trường–giấc ngủ. Không có tool
SQL tùy ý, không có tool ghi/xóa và không expose bản ghi y tế thô.

## Ranh giới an toàn

- Chạy local qua `stdio`; không public port hoặc Cloudflare Tunnel.
- Mỗi truy vấn tối đa 31 ngày và 5.000 record trước khi tổng hợp.
- `read_only_hint` là metadata cho client, không phải cơ chế bảo mật.
- Adapter production tương lai chỉ được dùng DB user có `SELECT` trên curated
  views, đặt statement timeout và không nhận câu SQL từ model.
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

