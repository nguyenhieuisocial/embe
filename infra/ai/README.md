# Local AI runtime

Ollama chạy trực tiếp trên Windows để tận dụng GPU NVIDIA; model và manifest
được lưu tại `C:\EmBe\data\models\ollama`. API chỉ lắng nghe trên
`127.0.0.1:11434`, không được publish qua Docker, Cloudflare Tunnel hoặc router.

## Runtime đã chọn

- Ollama `0.33.2`, cài từ release chính thức sau khi kiểm checksum và chữ ký.
- `qwen3:8b`, dùng cho tiếng Việt, tổng hợp dữ liệu và tool calling cục bộ.
- MCP analytics vẫn giữ giới hạn read-only, tối đa 31 ngày/5.000 record; model
  không được nhận SQL, secrets hoặc bản ghi y tế thô.

Hai user environment variable bắt buộc:

```text
OLLAMA_MODELS=C:\EmBe\data\models\ollama
OLLAMA_HOST=127.0.0.1:11434
```

## Kiểm tra vận hành

```powershell
ollama list
ollama ps
Get-NetTCPConnection -LocalPort 11434 -State Listen
```

Kết quả hợp lệ phải có model `qwen3:8b`, GPU được sử dụng khi đang suy luận và
`LocalAddress` là `127.0.0.1`.
