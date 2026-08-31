# Nhận diện bữa ăn bằng ảnh cho EmBe

**Ngày đối chiếu:** 01/09/2026  
**Trạng thái:** kiến trúc production có hàng rào an toàn; kết quả ảnh luôn là bản nháp cần xác nhận.

## Kết luận kiến trúc

EmBe dùng một pipeline ghép từ các thành phần nhỏ, không cài thêm một ứng dụng calorie tracker song song:

1. iPhone chụp ảnh; trình duyệt thu nhỏ tối đa 1.600 px, chuyển sang JPEG và loại EXIF/GPS.
2. Ảnh vào bucket Supabase riêng tư, thời gian sống ngắn; frontend không nhận khóa dịch vụ.
3. Worker trên máy nhà tải ảnh và gọi `qwen3-vl:4b-instruct` qua Ollama loopback để nhận diện tên món, khẩu phần sơ bộ, nhóm thực phẩm và điểm cần xác nhận.
4. Kết quả ở trạng thái `review`; Mẹ Ngân sửa tên món/khẩu phần rồi bấm xác nhận.
5. Chỉ bản đã xác nhận mới vào lịch sử. Gợi ý 7 ngày chỉ nói về các bữa đã ghi, không suy ra bữa bị bỏ, thiếu chất, bệnh lý hay liều bổ sung.
6. Worker tra trước bản SR Legacy CC0 của FoodData Central ngay trên máy (7.793 thực phẩm). API USDA chỉ bổ sung món chưa có và kết quả được cache 180 ngày, nên hệ thống không phụ thuộc quota `DEMO_KEY`.
7. Ảnh tạm bị xóa sau khi tạo bản nháp. Ảnh gốc gia đình vẫn do Immich quản lý, không trộn vào kho phân tích món ăn.

## Vì sao không để AI trả một con số “chính xác”

Một ảnh 2D không cho biết chắc nguyên liệu, dầu/gia vị, cách nấu và phần bị che. Góc chụp, khoảng cách và phối cảnh cũng làm sai ước lượng thể tích. Tổng quan khoa học cho thấy nhận diện món và khẩu phần vẫn là hai bài toán khó; hệ thống tự động hoàn toàn còn sai số đáng kể. Vì vậy EmBe hiển thị độ chắc chắn, cho phép để trống gram, và yêu cầu xác nhận.

- [Tổng quan nhận diện món và ước lượng thể tích](https://pubmed.ncbi.nlm.nih.gov/32365038/)
- [Scoping review về AI đánh giá khẩu phần từ ảnh](https://pmc.ncbi.nlm.nih.gov/articles/PMC11607557/)
- [Systematic review về độ hợp lệ của phương pháp ảnh](https://pmc.ncbi.nlm.nih.gov/articles/PMC7686022/)

## Thành phần mã nguồn mở đã đánh giá

| Thành phần | Có thể học/tái sử dụng | Quyết định cho EmBe |
|---|---|---|
| [CalorieMate](https://github.com/ignoxx/caloriemate) | Luồng chụp → ước lượng → bổ sung ghi chú → phân tích lại; nhớ bữa quen bằng CLIP | Học luồng sản phẩm; không nhúng code vì repo chưa khai giấy phép rõ trên GitHub |
| [Fud AI](https://github.com/apoorvdarshan/fud-ai) | MIT, local-first, nhiều ảnh + ghi chú, review trước khi lưu, barcode, lịch sử | Học UX và schema dinh dưỡng; không cài app riêng vì trùng Portal và làm người dùng phải học thêm |
| [Wellness Nourish](https://github.com/davidmosiah/wellness-nourish) | MIT, MCP local-first, USDA + Open Food Facts, explicit save intent | Học provider split và nguyên tắc “không ghi nếu chưa xác nhận”; có thể nối MCP sau khi meal history ổn định |
| [FoodSAM](https://github.com/jamesjg/FoodSAM) | Apache-2.0, phân vùng từng món trong đĩa | Chưa chạy thường trực: nặng GPU, không giải quyết calorie; chỉ benchmark sau nếu ảnh nhiều món thất bại |
| [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) | 5.000+ đĩa, khối lượng nguyên liệu, macro, RGB-D | Chỉ làm benchmark; món căng-tin Mỹ không đại diện bữa Việt và dataset rất lớn |
| [FoodDetector / VietFood67](https://github.com/nvhnam/FoodDetector) | Nhận diện 68 lớp món Việt, chạy ONNX | Chỉ đánh giá nghiên cứu: tác giả cấm dùng thương mại/tái phân phối dataset dù repo hiển thị MIT |
| [DietAI24](https://github.com/Runz96/DietAI24) | MIT, nghiên cứu food code + portion + nutrient trên ASA24/Nutrition5k | Học cách tách ba bước; không dùng như dịch vụ production |
| [FoodShot](https://github.com/soroqn1/FoodShot) | Job queue, USDA, lịch sử, export | Không dùng: BUSL cấm production nếu chưa xin phép và nhãn “medical-grade” không có giá trị xác nhận độc lập |
| [Open Food Facts](https://github.com/openfoodfacts/openfoodfacts-server) | Barcode, nhãn đóng gói, dị ứng | Dùng sau cho đồ đóng gói; dữ liệu cộng đồng, không thay nguồn tư vấn thai kỳ |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) | Dữ liệu thành phần dinh dưỡng chuẩn hóa, CC0 | Dùng bản SR Legacy tải về máy làm nguồn chính; API server-side là fallback và cache 180 ngày; vẫn cần nguồn Việt Nam bổ sung |

## Dữ liệu Việt Nam

- [Bảng thành phần thực phẩm Việt Nam 2017](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2017%29-vietnamese-food-composition-table/en) là nguồn ưu tiên cho nguyên liệu Việt nhưng hiện được FAO mô tả là bản in, chưa có API công khai phù hợp để tích hợp tự động.
- [Phần mềm thực đơn mẹ và bé được Bộ Y tế công bố](https://moh.gov.vn/vi_VN/hoat-dong-cua-lanh-dao-bo/-/asset_publisher/TW6LTp1ZtwaN/content/bo-y-te-cong-bo-phan-mem-xay-dung-thuc-on-can-bang-dinh-duong-cho-phu-nu-mang-thai-ba-me-cho-con-bu-va-tre-em-tu-7-thang-en-60-thang-tuoi-) có hơn 1.300 món và công cụ kiểm tra chế độ ăn. EmBe chỉ liên kết/đối chiếu nội dung công khai, không sao chép dữ liệu khi chưa có giấy phép/API.
- Giai đoạn đầu, model trả cả tên Việt và từ khóa nguyên liệu tiếng Anh. Số dinh dưỡng chỉ được tính khi map được vào nguồn dữ liệu có provenance rõ.

## Hàng rào thai kỳ

- Chỉ khuyến khích đa dạng thực phẩm từ các bữa đã ghi, phù hợp với [WHO về tư vấn dinh dưỡng khi mang thai](https://www.who.int/tools/elena/interventions/nutrition-counselling-pregnancy).
- Cảnh báo ảnh chỉ là lời nhắc kiểm tra; danh sách an toàn dựa trên [CDC](https://www.cdc.gov/food-safety/foods/pregnant-women.html).
- Không đặt calorie mục tiêu, không chấm “đạt/không đạt” vi chất, không tự đề nghị tăng liều vitamin/sắt/folate, không diễn giải nguy cơ sản khoa.
- Bất kỳ gợi ý bổ sung hay chế độ đặc biệt nào cũng phải dựa trên hướng dẫn của nơi khám, tiền sử, xét nghiệm và thuốc đang dùng — dữ liệu mà ảnh không thể biết.

## Tình trạng triển khai

- Đã có API upload riêng tư, hàng đợi, soft delete, retry/backoff, xác minh MIME/kích thước, checksum và xóa ảnh tạm.
- Đã có worker Ollama loopback với JSON allowlist, khử món lặp và giới hạn tối đa 8 món phân biệt.
- Đã có chỉ mục USDA cục bộ, kiểm checksum bản phát hành và tìm kiếm offline; không bị giới hạn 30 lượt/giờ của `DEMO_KEY`.
- Đã có màn hình iPhone-first: chọn bữa, chụp, ghi chú, xem độ chắc chắn, sửa tên/gram, xác nhận, xem gợi ý 7 ngày.
- Model không được tự tạo số calorie/macro. Sau khi người dùng xác nhận tên món và gram, worker tra FoodData Central, lưu nguồn đối chiếu và trả một khoảng calorie có biên sai số. Mapping món Việt vẫn cần benchmark; món không tìm được sẽ để trống thay vì đoán.

## Cổng nghiệm thu tiếp theo

1. Bộ ảnh test không chứa dữ liệu riêng: 30 bữa Việt, trong đó có món trộn, canh, suất nhiều đĩa và ảnh thiếu sáng.
2. Đo top-1 tên món, recall thành phần, sai số gram sau xác nhận, thời gian phản hồi p50/p95 và tỷ lệ phải sửa.
3. Chỉ mở rộng gợi ý định lượng khi sai số/coverage món Việt đã được công bố; số hiện tại luôn là khoảng ước lượng và vẫn giữ bước xác nhận.
4. Không dùng ảnh thật để huấn luyện; không gửi ảnh sang dịch vụ AI bên ngoài.
