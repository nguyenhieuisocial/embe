export const dailyChecklist = [
  {
    id: "supplements",
    group: "Ăn uống",
    title: "Thuốc và vi chất theo đúng đơn",
    detail: "Chỉ dùng loại và liều đã được bác sĩ hoặc nữ hộ sinh xác nhận."
  },
  {
    id: "breakfast",
    group: "Ăn uống",
    title: "Đã ăn sáng",
    detail: "Đánh dấu sau khi ăn; không cần ghi calo hoặc cân từng món."
  },
  {
    id: "lunch",
    group: "Ăn uống",
    title: "Đã ăn trưa",
    detail: "Ưu tiên món chín kỹ và phù hợp với khẩu vị, thể trạng hiện tại."
  },
  {
    id: "dinner",
    group: "Ăn uống",
    title: "Đã ăn tối",
    detail: "Ăn lượng vừa sức; không dùng checklist để ép ăn khi đang khó chịu."
  },
  {
    id: "varied-meals",
    group: "Ăn uống",
    title: "Ăn đa dạng trong ngày",
    detail: "Phối hợp rau, quả, ngũ cốc, đạm và sữa tiệt trùng nếu phù hợp."
  },
  {
    id: "fruit-veg",
    group: "Ăn uống",
    title: "Có rau hoặc quả trong ngày",
    detail: "Rửa sạch và chọn loại phù hợp; ưu tiên thay đổi màu sắc, chủng loại."
  },
  {
    id: "protein",
    group: "Ăn uống",
    title: "Có nguồn đạm trong ngày",
    detail: "Ví dụ thịt, cá, trứng chín kỹ, đậu hoặc hạt phù hợp."
  },
  {
    id: "food-safety",
    group: "Ăn uống",
    title: "Kiểm tra an toàn thực phẩm",
    detail: "Rửa sạch, tách sống–chín, nấu chín kỹ và giữ lạnh đúng cách."
  },
  {
    id: "water-rest",
    group: "Chăm cơ thể",
    title: "Uống nước đều trong ngày",
    detail: "Chia đều theo cảm giác khát và hướng dẫn riêng nếu có."
  },
  {
    id: "no-alcohol",
    group: "Chăm cơ thể",
    title: "Không rượu bia, thuốc lá",
    detail: "Tránh cả khói thuốc thụ động và các chất kích thích không được chỉ định."
  },
  {
    id: "movement",
    group: "Chăm cơ thể",
    title: "Vận động nhẹ nếu cơ thể cho phép",
    detail: "Đi bộ hoặc bài tập đã được nhân viên y tế đồng ý; dừng khi khó chịu."
  },
  {
    id: "rest",
    group: "Chăm cơ thể",
    title: "Có khoảng nghỉ cho cơ thể",
    detail: "Nghỉ khi mệt và ưu tiên nhịp sinh hoạt mà cơ thể chịu được."
  },
  {
    id: "notes",
    group: "Chăm cơ thể",
    title: "Ghi lại điều muốn hỏi khi khám",
    detail: "Triệu chứng, thuốc đang dùng, giấc ngủ, tâm trạng hoặc thay đổi đáng chú ý."
  }
] as const;

export const weeklyMenu = [
  {
    day: "Ngày 1",
    breakfast: "Yến mạch, sữa tiệt trùng, chuối",
    lunch: "Cơm gạo lứt, cá hồi chín, cải xanh",
    dinner: "Canh gà nấm, đậu phụ, cam"
  },
  {
    day: "Ngày 2",
    breakfast: "Bánh mì nguyên cám, trứng chín, bơ",
    lunch: "Cơm, bò xào rau củ chín kỹ, thanh long",
    dinner: "Bún tôm chín, rau luộc, sữa chua tiệt trùng"
  },
  {
    day: "Ngày 3",
    breakfast: "Phở gà chín kỹ, rau đã rửa sạch",
    lunch: "Cơm, đậu phụ sốt cà, canh bí đỏ",
    dinner: "Cá basa kho chín, rau dền, lê"
  },
  {
    day: "Ngày 4",
    breakfast: "Khoai lang, trứng chín, sữa đậu nành tiệt trùng",
    lunch: "Cơm, thịt nạc chín kỹ, bông cải",
    dinner: "Miến gà, nấm chín, đu đủ"
  },
  {
    day: "Ngày 5",
    breakfast: "Cháo yến mạch thịt bằm chín, táo",
    lunch: "Cơm, tôm hấp chín, canh rau mồng tơi",
    dinner: "Đậu lăng hầm rau củ, bánh mì nguyên cám"
  },
  {
    day: "Ngày 6",
    breakfast: "Bún bò chín kỹ, giá được nấu chín",
    lunch: "Cơm, gà áp chảo chín, salad rau đã rửa kỹ",
    dinner: "Cháo cá hồi chín, bí xanh, quýt"
  },
  {
    day: "Ngày 7",
    breakfast: "Sữa chua tiệt trùng, yến mạch, xoài",
    lunch: "Cơm, cá mòi chín, rau củ hấp",
    dinner: "Mì trứng chín với đậu phụ và rau cải"
  }
] as const;

export const pregnancySources = [
  {
    label: "WHO — chăm sóc trước sinh, dinh dưỡng và vận động",
    href: "https://www.who.int/publications/i/item/9789241549912"
  },
  {
    label: "CDC — lựa chọn thực phẩm an toàn khi mang thai",
    href: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    label: "NHS — vận động trong thai kỳ",
    href: "https://www.nhs.uk/best-start-in-life/pregnancy/exercising-in-pregnancy/"
  },
  {
    label: "Viện Dinh dưỡng Quốc gia — VNeNUTRITION",
    href: "https://viendinhduong.vn/landing-page"
  },
  {
    label: "NHS — triệu chứng thai kỳ cần được hỗ trợ",
    href: "https://www.nhs.uk/pregnancy/common-symptoms/pregnancy-symptoms-you-need-to-get-help-for/"
  },
  {
    label: "ACOG — dấu hiệu cảnh báo khẩn cấp trong thai kỳ",
    href: "https://www.acog.org/giving/programs/quality-and-safety/resources"
  },
  {
    label: "ACOG — huyết áp trong thai kỳ",
    href: "https://www.acog.org/womens-health/faqs/preeclampsia-and-high-blood-pressure-during-pregnancy"
  },
  {
    label: "CDC — theo dõi cân nặng trong thai kỳ",
    href: "https://www.cdc.gov/maternal-infant-health/pregnancy-weight/index.html"
  }
] as const;

export const trimesterGuides = [
  {
    title: "Ba tháng đầu",
    detail: "Xác nhận lịch chăm sóc trước sinh, ghi đầy đủ thuốc và vi chất đang dùng, hỏi bác sĩ trước khi tự bổ sung hoặc ngừng bất kỳ loại nào."
  },
  {
    title: "Ba tháng giữa",
    detail: "Duy trì lịch khám, ăn đa dạng và vận động ở mức đã được nhân viên y tế đồng ý; ghi lại câu hỏi thay vì tự diễn giải triệu chứng."
  },
  {
    title: "Ba tháng cuối",
    detail: "Chuẩn bị kế hoạch đi sinh, số liên hệ và túi cần mang; trao đổi cách theo dõi cử động thai phù hợp với hướng dẫn của nơi đang khám."
  }
] as const;

export const urgentCareReminders = [
  "Ra máu âm đạo, đau bụng dữ dội, ngất hoặc cảm giác tình trạng đang nguy hiểm.",
  "Đau đầu dữ dội không giảm, nhìn mờ hoặc sưng xuất hiện đột ngột.",
  "Khó thở xuất hiện đột ngột, đau ngực hoặc chóng mặt rõ rệt.",
  "Cử động thai giảm rõ rệt sau khi đã được hướng dẫn theo dõi, hoặc nghi chuyển dạ nhưng không chắc phải làm gì."
] as const;
