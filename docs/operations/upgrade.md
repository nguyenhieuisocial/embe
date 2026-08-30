# Em Bé — Quy trình nâng cấp an toàn

1. Đọc changelog và xác nhận phiên bản đích đã được pin.
2. Chạy `scripts\update\preflight-update.ps1`. Chỉ tiếp tục khi kết quả `pass`.
3. Tạo backup mới và giữ manifest; không dùng `restic check` thay cho restore drill.
4. Chạy contract tests, thử migration trên bản snapshot, rồi smoke test.
5. Nâng cấp trong maintenance window; kiểm tra Portal, sync và backup sau nâng cấp.
6. Nếu migration không tương thích ngược, rollback bằng restore đã kiểm chứng,
   không chỉ đổi image tag.

Preflight tự chặn khi ổ đĩa thiếu headroom, backup cũ, restore drill quá hạn,
sync lỗi hoặc contract test hỏng.
