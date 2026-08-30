# EmBe procurement recommendations

Dịch vụ này chỉ tạo đề xuất mua vật tư từ số liệu Grocy và báo giá đã được người
dùng xác nhận. Nó không đăng nhập sàn thương mại điện tử, không vượt CAPTCHA và
không bao giờ tự đặt hàng.

Luồng an toàn:

1. Grocy cung cấp tồn kho, quy cách gói và lịch sử tiêu thụ.
2. Báo giá được nhập tay hoặc bằng CSV có cột `verified=true`.
3. Bộ tính dùng median để giảm ảnh hưởng của một ngày tiêu thụ hoặc giao hàng bất
   thường, rồi quy đổi nhu cầu thành số gói nguyên.
4. Tổng chi phí hiển thị riêng tiền hàng, vận chuyển, xử lý kho, thuế và chênh lệch
   tỷ giá.
5. Đề xuất đi qua `DRAFT -> REVIEWED -> APPROVED -> ORDERED -> RECEIVED`; các
   bước từ `APPROVED` trở đi bắt buộc do người dùng thực hiện.

Migration `migrations/0001_procurement.sql` giữ mã sản phẩm Grocy dưới dạng
`product_ref`, nên không khóa hệ thống vào một nhà cung cấp. Chỉ mục riêng ngăn
hai đề xuất đang mở cho cùng một sản phẩm.

Chạy kiểm thử:

```powershell
python -m unittest discover -s services/procurement/tests -v
```

Hiện dịch vụ chưa được bật với dữ liệu thật. Bước sau là chọn chính xác các sản
phẩm Grocy và nhập ít nhất ba mẫu tiêu thụ/thời gian giao hàng; nếu thiếu dữ liệu,
hệ thống phải trả “chưa đủ dữ liệu” thay vì đoán.
