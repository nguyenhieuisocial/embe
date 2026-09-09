// Ingredient guidance, not product certification. Reviewed against linked sources 2026-09-09.
const aad = "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care";
const acne = "https://mothertobaby.org/fact-sheets/topical-acne-treatments-pregnancy/";
const household = "https://www.pregnancybirthbaby.org.au/pregnancy/nutrition-and-lifestyle/toxic-household-products-to-avoid-during-pregnancy";

export const pregnancyCosmetics = [
  {
    id: "skin-simple", level: "do", category: "Mỹ phẩm · dưỡng da",
    title: "Dưỡng ẩm, sữa rửa mặt: ưu tiên đơn giản",
    detail: "Làm sạch dịu nhẹ, dưỡng ẩm phù hợp loại da; ưu tiên không hương liệu khi da nhạy cảm. Kem dưỡng không tự động phù hợp nếu có thêm hoạt chất trị mụn hoặc làm trắng.",
    action: "Đọc toàn bộ bảng thành phần INCI, không chỉ tên sản phẩm. Không cần thay tất cả mỹ phẩm đang dùng.", sourceLabel: "AAD — chăm sóc da thai kỳ", sourceHref: aad
  },
  {
    id: "skin-sunscreen", level: "do", category: "Mỹ phẩm · chống nắng",
    title: "Kem chống nắng: zinc oxide / titanium dioxide",
    detail: "Ưu tiên chống nắng phổ rộng SPF 30 trở lên, kết hợp áo, mũ và bóng râm. Kẽm oxit và titan dioxit là lựa chọn chống nắng khoáng AAD gợi ý cho thai kỳ.",
    action: "Dùng theo nhãn; không bỏ chống nắng vì lo ngại mọi loại hóa chất.", sourceLabel: "AAD — chống nắng khi mang thai", sourceHref: aad
  },
  {
    id: "skin-retinoid", level: "avoid", category: "Mỹ phẩm · trị mụn",
    title: "Retinoid: retinol, tretinoin, adapalene, tazarotene",
    detail: "Tránh retinoid trong thai kỳ. Thuốc uống isotretinoin khác với mỹ phẩm bôi và cần xử trí y tế ngay nếu có thai khi dùng.",
    action: "Ngừng sản phẩm retinoid và liên hệ bác sĩ; mang nhãn, thời gian đã dùng. Lỡ bôi không đồng nghĩa thai đã bị ảnh hưởng.", sourceLabel: "MotherToBaby — thuốc trị mụn bôi", sourceHref: acne
  },
  {
    id: "skin-hydroquinone", level: "avoid", category: "Mỹ phẩm · trị nám",
    title: "Hydroquinone: tránh tự dùng trị nám",
    detail: "AAD khuyên tránh hydroquinone khi mang thai, kể cả trong kem phối hợp làm sáng da.",
    action: "Kiểm tra nhãn kem trị nám; trao đổi phương án khác với bác sĩ da liễu.", sourceLabel: "AAD — thành phần nên tránh", sourceHref: aad
  },
  {
    id: "skin-mercury", level: "avoid", category: "Mỹ phẩm · làm trắng",
    title: "Kem trộn, kem trắng có thủy ngân hoặc không nhãn",
    detail: "Thủy ngân (mercury, mercurous chloride, calomel, mercuric, mercurio, Hg) có thể gây hại; sản phẩm không rõ nguồn gốc có thể không khai báo thành phần. Không thể xác nhận an toàn bằng màu, mùi hoặc quảng cáo.",
    action: "Không dùng; giữ bao bì để hỏi nhân viên y tế nếu đã tiếp xúc. Tránh để trẻ chạm vào sản phẩm.", sourceLabel: "FDA — an toàn sản phẩm làm trắng", sourceHref: "https://www.fda.gov/consumers/skin-facts-what-you-need-know-about-skin-lightening-products/skin-product-safety"
  },
  {
    id: "skin-azelaic", level: "limit", category: "Mỹ phẩm · trị mụn",
    title: "Azelaic acid: có thể cân nhắc khi cần",
    detail: "Là một lựa chọn bôi trị mụn được ACOG đề cập qua MotherToBaby. Không phải mọi sản phẩm phối hợp đều phù hợp.",
    action: "Chọn loại cùng bác sĩ/dược sĩ; dùng đúng nhãn, không tự tăng lượng hoặc bôi diện rộng.", sourceLabel: "MotherToBaby — azelaic acid", sourceHref: acne
  },
  {
    id: "skin-bha", level: "limit", category: "Mỹ phẩm · tẩy da chết",
    title: "BHA / salicylic acid: xét nồng độ và vùng bôi",
    detail: "Không phải mọi BHA đều bị cấm. Sản phẩm bôi trị mụn có thể được cân nhắc; hấp thu tăng trên da tổn thương, bôi nhiều hoặc diện rộng. Peel mạnh không tương đương sữa rửa mặt.",
    action: "Hỏi trước nếu trên 2%, dùng peel hoặc điều trị chai/mụn cóc. Không tự dùng trên vùng rộng.", sourceLabel: "MotherToBaby — hấp thu qua da", sourceHref: acne
  },
  {
    id: "skin-bpo", level: "limit", category: "Mỹ phẩm · trị mụn",
    title: "Benzoyl peroxide: dùng có điều kiện",
    detail: "Có thể là lựa chọn trị mụn bôi khi cần; cần xem các hoạt chất phối hợp, nhất là adapalene.",
    action: "Hỏi bác sĩ/dược sĩ sản phẩm và cách dùng; tránh tự kết hợp nhiều thuốc trị mụn.", sourceLabel: "MotherToBaby — benzoyl peroxide", sourceHref: acne
  },
  {
    id: "skin-vitc-aha", level: "limit", category: "Mỹ phẩm · dưỡng da",
    title: "Vitamin C / glycolic acid (AHA)",
    detail: "Có thể cân nhắc để chăm sóc sắc tố da; không đồng nghĩa mọi peel nồng độ cao đều phù hợp.",
    action: "Chọn sản phẩm dịu nhẹ; hỏi bác sĩ trước thủ thuật peel.", sourceLabel: "AAD — chăm sóc sắc tố", sourceHref: aad
  },
  {
    id: "skin-uncertain", level: "limit", category: "Mỹ phẩm · đọc nhãn",
    title: "Tinh dầu, parabens, phthalates: không suy diễn an toàn",
    detail: "AAD khuyên trao đổi về mức sử dụng. Nhãn organic, natural, clean hoặc “cho bà bầu” không thay thế đánh giá thành phần.",
    action: "Gửi nhãn và cách dùng cho bác sĩ/dược sĩ khi chưa rõ; không tự uống tinh dầu.", sourceLabel: "AAD — thành phần cần cân nhắc", sourceHref: aad
  },
  {
    id: "skin-hair-dye", level: "limit", category: "Mỹ phẩm · tóc",
    title: "Nhuộm tóc: không cần kiêng tuyệt đối",
    detail: "NHS cho biết đa số nghiên cứu cho thấy nhuộm đúng cách có mức phơi nhiễm thấp. Có thể chọn đợi sau 12 tuần, nhưng đây không phải bảo đảm mọi loại thuốc nhuộm đều an toàn.",
    action: "Thử phản ứng theo nhãn, đeo găng, thông gió, không quá thời gian quy định và xả kỹ. Báo salon biết đang mang thai.", sourceLabel: "NHS — nhuộm tóc", sourceHref: "https://www.nhs.uk/best-start-in-life/pregnancy/using-hair-dye-in-pregnancy-is-it-safe/"
  },
  {
    id: "skin-hair-straightening", level: "avoid", category: "Mỹ phẩm · tóc",
    title: "Duỗi keratin giải phóng formaldehyde",
    detail: "Một số thuốc làm thẳng tóc giải phóng formaldehyde khi gia nhiệt. Không thể đánh giá chỉ từ tên “keratin”. Tiếp xúc nghề nghiệp thường xuyên khác với một lần làm tóc.",
    action: "Tránh dịch vụ có formaldehyde; yêu cầu bảng thành phần và thông tin an toàn hóa chất. Nếu làm nghề tóc, trao đổi riêng về thông gió và bảo hộ.", sourceLabel: "MotherToBaby — hóa chất làm tóc", sourceHref: "https://mothertobaby.org/fact-sheets/hair-treatments-pregnancy/"
  },
  {
    id: "skin-nails", level: "limit", category: "Mỹ phẩm · móng",
    title: "Sơn móng, gel và acetone",
    detail: "Làm móng thông thường không đồng nghĩa bị cấm trong thai kỳ. Cần hạn chế hơi hóa chất, tiếp xúc da và đảm bảo dụng cụ vệ sinh; làm nghề nail cần đánh giá mức tiếp xúc riêng.",
    action: "Chọn nơi thoáng, không để hóa chất dính da; ngừng khi kích ứng hoặc khó chịu. Nhãn “free” không bảo đảm an toàn tuyệt đối.", sourceLabel: "MotherToBaby — làm móng", sourceHref: "https://mothertobaby.org/baby-blog/nailing-down-the-facts-nail-treatment-safety-in-pregnancy/"
  },
  {
    id: "skin-cleaners", level: "limit", category: "Hóa chất · gia dụng",
    title: "Nước lau nhà, rửa chén, chất tẩy",
    detail: "Nhiều sản phẩm gia dụng có thể dùng theo nhãn; không phải mọi hóa chất đều phải kiêng. Nồng độ, đường tiếp xúc và thông gió quan trọng.",
    action: "Đeo găng, mở cửa, tránh hít hơi/xịt trực tiếp; nhờ người khác xử lý hóa chất mạnh hoặc khi thấy khó chịu.", sourceLabel: "Pregnancy, Birth and Baby — hóa chất gia dụng", sourceHref: household
  },
  {
    id: "skin-bleach-mixing", level: "avoid", category: "Hóa chất · gia dụng",
    title: "Không trộn Javel với chất tẩy khác",
    detail: "Bleach / sodium hypochlorite trộn với ammonia hoặc chất tẩy khác có thể tạo khí nguy hiểm. Quy tắc này áp dụng cho cả gia đình, không riêng mẹ bầu.",
    action: "Dùng từng sản phẩm đúng nhãn, thông gió và bảo hộ. Nếu khó thở sau tiếp xúc, rời vùng có khí khi an toàn và gọi cấp cứu 115; không quay lại tự xử lý.", sourceLabel: "CDC — dùng chất tẩy an toàn", sourceHref: "https://www.cdc.gov/hygiene/about/cleaning-and-disinfecting-with-bleach.html"
  },
  {
    id: "skin-paint-pesticide", level: "limit", category: "Hóa chất · môi trường",
    title: "Sơn, dung môi, thuốc diệt côn trùng",
    detail: "Không thể đánh giá chung mọi công thức. Tránh phơi nhiễm không cần thiết, nhất là nơi kín hoặc tiếp xúc nghề nghiệp kéo dài.",
    action: "Nhờ người khác thi công/phun; tuân thủ nhãn về bảo hộ và thời điểm quay lại. Mang tên hóa chất hoặc bảng SDS khi hỏi nhân viên y tế.", sourceLabel: "Pregnancy, Birth and Baby — hóa chất gia dụng", sourceHref: household
  }
] as const;
