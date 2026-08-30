# Nội dung gia đình và Grocy

Checklist và thực đơn được giữ ở dạng JSON có phiên bản để có thể kiểm tra nguồn, xuất sang Obsidian và tái sử dụng mà không phải nhập lại. Nội dung chỉ là nhắc việc/gợi ý; không có chỉ tiêu calorie, liều dùng hoặc chẩn đoán.

Xuất bản ghi dùng trên Obsidian:

```powershell
C:\EmBe\.venv\Scripts\python.exe services\family-content\export_content.py `
  --content services\family-content\content\pregnancy-care.vi.json `
  --output "vault\30-Care\Mẹ-bầu-hôm-nay.md"
```

Grocy chỉ được seed danh mục chung và đơn vị tính, không tự tạo sản phẩm hoặc số lượng tồn giả. Chạy thử mặc định không thay đổi dữ liệu:

```powershell
C:\EmBe\.venv\Scripts\python.exe services\family-content\grocy_seed.py `
  --data services\family-content\content\grocy-master-data.vi.json
```

Muốn áp dụng, tạo API key trong Grocy, đặt key vào biến môi trường `GROCY_API_KEY`, rồi thêm `--apply`. Không truyền key trên dòng lệnh và không lưu key vào GitHub.

Sau đó bố mẹ nhập từng sản phẩm thật theo đúng nhãn và quy cách. Với bỉm, giữ “gói” là đơn vị mua và khai số “cái” trong mỗi gói; với sữa, không trộn “hộp”, “g” và “ml”. Tồn đầu kỳ, hạn dùng và giá chỉ nhập từ hàng đang có thật.
