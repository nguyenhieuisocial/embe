# Nguồn biểu đồ tăng trưởng WHO

EmBe chỉ dùng vùng tham khảo để giúp gia đình nhìn lại xu hướng số đo. Kết quả
không phải chẩn đoán và không thay thế việc đo, đánh giá của nhân viên y tế.

## Bộ dữ liệu

- Chuẩn: WHO Child Growth Standards 2006, trẻ từ lúc sinh đến dưới 5 tuổi.
- Nguồn mã nguồn chính thức: `WorldHealthOrganization/anthro`.
- Phiên bản cố định: commit `b776d8a12b1c97369c748b561159fd2ec4f4db58`.
- Giấy phép của nguồn: GPL-3.0; bản quyền World Health Organization và các tác giả
  được ghi trong repository nguồn. Bản giấy phép đầy đủ nằm tại
  `docs/licenses/WHO-ANTHRO-GPL-3.0.txt`. EmBe không đổi nhãn hoặc nhận bộ dữ liệu
  này là dữ liệu do EmBe tạo ra.
- Trang chuẩn chính thức:
  https://www.who.int/tools/child-growth-standards/standards

Các file nguồn và SHA-256:

| Chỉ số | File | SHA-256 |
|---|---|---|
| Cân nặng theo tuổi | `weianthro.txt` | `bc15a6a623dd1d5beaeed1497666332aa54bc4ccd15ff9658c487d79694ab77b` |
| Chiều dài/chiều cao theo tuổi | `lenanthro.txt` | `709f7a11881451daf7820f022d363d5bdb93746b5361d6bd9218af6ff838e0c2` |
| Vòng đầu theo tuổi | `hcanthro.txt` | `e794e46f06b91223ad2c6435148dc08794a1d75b67613a652c3151201a98bf7c` |

## Cách tính và giới hạn

Script `scripts/data/build-who-growth-reference.mjs` tải đúng ba file ở commit
trên, kiểm tra checksum rồi tạo bảng LMS dùng trong ứng dụng. Với mỗi ngày tuổi,
hai đường biên `-2` và `+2` z-score được tính trực tiếp bằng công thức LMS mà WHO
Anthro sử dụng: `M × (1 + L × S × z)^(1/L)`. Không nội suy tuổi, không để LLM tính,
không suy ra hoặc gắn nhãn percentile.

Biểu đồ dùng tuổi theo ngày kể từ ngày sinh. Với trẻ sinh non, EmBe chỉ nhắc gia
đình hỏi bác sĩ về tuổi hiệu chỉnh; ứng dụng không tự đổi tuổi dùng trong đánh
giá. Dữ liệu ngoài khoảng 0–1856 ngày không được tính bằng bộ tham chiếu này.
