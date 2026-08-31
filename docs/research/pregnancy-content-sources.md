# Nguồn nội dung “Mẹ bầu hôm nay”

**Ngày rà soát:** 2026-08-30
**Phạm vi:** Checklist hằng ngày, thực đơn Việt Nam tham khảo, an toàn thực
phẩm và lựa chọn phần mềm miễn phí/mã nguồn mở.

## Quyết định

- Nội dung sức khỏe được diễn giải ngắn từ WHO, CDC, NHS và Viện Dinh dưỡng
  Quốc gia; không sao chép nguyên văn và không đưa ra chẩn đoán/liều dùng cá nhân.
- Thực đơn chỉ là gợi ý đa dạng thực phẩm, không đặt calorie hoặc mục tiêu tăng
  cân. Đái tháo đường thai kỳ, tăng huyết áp, thiếu máu, đa thai, dị ứng và các
  tình trạng khác cần thực đơn riêng từ nhân viên y tế.
- Ngày dự sinh và trạng thái checklist được lưu qua API riêng tư, chỉ server có
  quyền gọi Supabase. Trình duyệt vẫn giữ một bản cục bộ để dùng khi mất mạng và
  tự đồng bộ lại; GA4 không nhận các giá trị này.
- Giữ Grocy làm nguồn sự thật cho recipe, meal plan, tồn kho và shopping list.
  Không cài thêm Mealie, Yuvomi/Oikos hay OpenFamily vì trùng vai trò.
- Grocy đã có plugin tra barcode Open Food Facts. Dữ liệu Open Food Facts là dữ
  liệu cộng đồng, chỉ dùng để hỗ trợ nhập nhãn; không xem là chỉ định dinh dưỡng.
- USDA FoodData Central là phương án bổ sung sau này cho dữ liệu thành phần thực
  phẩm chuẩn hóa; API miễn phí nhưng cần key và dữ liệu Việt Nam hạn chế.

## Nguồn y tế

- [WHO recommendations on antenatal care](https://www.who.int/publications/i/item/9789241549912),
  WHO, 2016 và các cập nhật liên quan: chăm sóc trước sinh, ăn đa dạng, hoạt động
  thể chất và dùng vi chất trong hệ thống chăm sóc thai kỳ. License CC BY-NC-SA
  3.0 IGO.
- [Safer Food Choices for Pregnant Women](https://www.cdc.gov/food-safety/foods/pregnant-women.html),
  CDC, cập nhật 31-01-2025: clean, separate, cook, chill; tránh thực phẩm sống,
  chưa tiệt trùng và nhóm cá thủy ngân cao.
- [About Alcohol Use During Pregnancy](https://www.cdc.gov/alcohol-pregnancy/about/index.html),
  CDC, cập nhật 02-04-2026: không có lượng hoặc thời điểm uống rượu bia nào đã
  biết là an toàn trong thai kỳ.
- [Exercising in pregnancy](https://www.nhs.uk/best-start-in-life/pregnancy/exercising-in-pregnancy/),
  NHS: vận động nhẹ, tăng dần nếu trước đó ít vận động và lắng nghe cơ thể.
- [VNeNUTRITION](https://viendinhduong.vn/landing-page), Viện Dinh dưỡng Quốc
  gia — Bộ Y tế: nguồn Việt Nam ưu tiên để tham khảo thực phẩm và thực đơn.

## Công cụ và dữ liệu đã đánh giá

| Công cụ | License | Vai trò | Quyết định |
|---|---|---|---|
| [Grocy](https://github.com/grocy/grocy) | MIT | Recipe, meal plan, tồn kho, mua sắm, OpenAPI | Giữ; đã chạy trong core stack |
| [Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/) | ODbL/data; AGPL server | Barcode, thành phần, dị ứng, nhãn dinh dưỡng | Dùng qua plugin Grocy, coi là dữ liệu cộng đồng |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) | CC0 | Dữ liệu thành phần thực phẩm | Tùy chọn sau này; cần API key miễn phí |
| [Mealie](https://github.com/mealie-recipes/mealie) | AGPL-3.0 | Recipe/meal planner | Không cài vì trùng Grocy |
| [Yuvomi/Oikos](https://github.com/ulsklyc/yuvomi) | MIT | Task, calendar, meal, shopping | Không cài vì trùng Portal + Grocy |
| [Vikunja](https://github.com/go-vikunja/vikunja) | AGPL-3.0 | Checklist/task đa người dùng | Chưa cần; checklist thai kỳ nhỏ hơn nhiều |

## Giới hạn

Checklist không được dùng để trì hoãn khám. Nội dung công khai khác nhau theo
quốc gia và có thể được cập nhật; cần rà soát nguồn mỗi quý và khi bác sĩ thay
đổi khuyến nghị cá nhân.
