# Secrets

Không đặt cleartext credential trong thư mục này hoặc trong Git.

- File được commit phải có dạng `*.enc.yaml`, `*.enc.json` hoặc `*.enc.env` và được mã hóa bằng SOPS/age.
- Private age identity và Restic recovery password phải nằm trong password manager của chủ hệ thống.
- Mỗi service dùng credential riêng và chỉ có quyền tối thiểu.
- Token tạm thời phải được xoay hoặc thu hồi sau bootstrap.
- Age identity local hiện nằm tại `C:\EmBe\secrets\age\keys.txt`, bị Git ignore
  và giới hạn quyền NTFS. Chủ hệ thống phải lưu thêm một recovery copy trong
  password manager hoặc USB cất ngoại tuyến trước khi coi backup là hoàn chỉnh.
