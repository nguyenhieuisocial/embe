# Kết nối AI chính chủ

EmBe dùng đúng công cụ MCP do Memos và BabyBuddy cung cấp, không viết lại API của họ.

## Đang hoạt động

- Memos phục vụ MCP tại `http://127.0.0.1:5230/mcp` trên máy nhà.
- Health gate chỉ gọi `initialize` và `tools/list`, kiểm tra nhóm công cụ cần thiết và không đọc memo, file hay token.
- Trợ lý phân tích sức khỏe của EmBe vẫn chỉ nhận dữ liệu tổng hợp từ MCP riêng chỉ-đọc; không nối LLM thẳng vào database.

## Chưa bật chủ động

BabyBuddy MCP chính chủ có cả công cụ tạo, sửa và xóa dữ liệu. Chỉ triển khai sau khi có hồ sơ em bé và tạo được một user API giới hạn quyền phù hợp. Token quản trị không được dùng cho AI, và thao tác ghi phải có xác nhận của bố/mẹ.

Paperless-ngx, Mealie, Barcode Buddy và ntfy không được thêm vào production trong đợt này vì lần lượt có rủi ro dữ liệu cleartext, trùng Grocy, duy trì chậm hoặc tạo thêm relay iOS.
