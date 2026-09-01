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

export const pregnancyGuidance = [
  {
    id: "varied-foods",
    level: "do",
    category: "Ăn uống",
    title: "Ăn đa dạng, không cần “ăn cho hai”",
    detail: "Phối hợp rau quả, tinh bột hoặc ngũ cốc, nguồn đạm và sữa hay sản phẩm thay thế phù hợp. Thai kỳ không đồng nghĩa phải tăng gấp đôi khẩu phần.",
    action: "Chọn bữa vừa sức, đổi món theo ngày và điều chỉnh theo dị ứng, bệnh nền hoặc hướng dẫn riêng.",
    sourceLabel: "NHS — ăn uống lành mạnh",
    sourceHref: "https://www.nhs.uk/best-start-in-life/pregnancy/healthy-eating-in-pregnancy/"
  },
  {
    id: "cook-separate-chill",
    level: "do",
    category: "An toàn thực phẩm",
    title: "Ăn chín, tách sống – chín",
    detail: "Rửa tay và rau quả, dùng riêng dụng cụ cho đồ sống, nấu chín kỹ và giữ lạnh sớm để giảm nguy cơ nhiễm khuẩn.",
    action: "Không nếm thịt sống; thức ăn hâm lại cần nóng đều, đặc biệt thịt nguội và xúc xích.",
    sourceLabel: "CDC — thực phẩm an toàn khi mang thai",
    sourceHref: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    id: "low-mercury-fish",
    level: "do",
    category: "Ăn uống",
    title: "Chọn cá ít thủy ngân và nấu chín",
    detail: "Cá chín như cá hồi, cá mòi, tôm hoặc cá ngừ đóng hộp loại light là những lựa chọn ít thủy ngân hơn theo hướng dẫn CDC.",
    action: "Đổi nhiều loại cá, không dùng một loại liên tục và hỏi nơi khám nếu cần khẩu phần riêng.",
    sourceLabel: "CDC — lựa chọn hải sản an toàn",
    sourceHref: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    id: "hydrate-rest",
    level: "do",
    category: "Thói quen",
    title: "Uống đều, ăn vừa sức và nghỉ khi mệt",
    detail: "Chia nước trong ngày, ưu tiên nước lọc; ăn bữa nhỏ hơn nếu đầy bụng hoặc ợ nóng và không ép ăn khi buồn nôn.",
    action: "Mang chai nước dễ thấy, uống theo cảm giác khát và hướng dẫn riêng nếu bác sĩ yêu cầu hạn chế dịch.",
    sourceLabel: "NHS — nước uống và giữ đủ nước",
    sourceHref: "https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/"
  },
  {
    id: "safe-movement",
    level: "do",
    category: "Vận động",
    title: "Vận động vừa sức nếu thai kỳ bình thường",
    detail: "ACOG khuyến nghị hướng tới 150 phút hoạt động aerobic mức vừa mỗi tuần khi thai kỳ bình thường và nhân viên y tế đồng ý.",
    action: "Đi bộ ngắn, khởi động và hạ nhiệt; vẫn nói chuyện được trong lúc tập và dừng nếu thấy không ổn.",
    sourceLabel: "ACOG — vận động trong thai kỳ",
    sourceHref: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy"
  },
  {
    id: "caffeine-limit",
    level: "limit",
    category: "Đồ uống",
    title: "Caffeine không quá 200 mg mỗi ngày",
    detail: "Tổng caffeine tính cả cà phê, trà, cola, nước tăng lực, chocolate và một số viên hay bột bổ sung.",
    action: "Đọc nhãn và cộng tổng trong ngày; cà phê pha máy hoặc mua ngoài có thể nhiều hơn một cốc hòa tan.",
    sourceLabel: "NHS — caffeine trong thai kỳ",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/"
  },
  {
    id: "salt-sugar-limit",
    level: "limit",
    category: "Ăn uống",
    title: "Giảm món quá mặn, nhiều đường hoặc siêu chế biến",
    detail: "Ưu tiên thực phẩm ít thêm muối và đường; không cần cân đếm từng calo nếu nơi khám không yêu cầu.",
    action: "Đổi nước ngọt sang nước lọc, chọn đồ ăn vặt đơn giản và đọc nhãn khi mua đồ đóng gói.",
    sourceLabel: "NHS — ăn uống lành mạnh",
    sourceHref: "https://www.nhs.uk/best-start-in-life/pregnancy/healthy-eating-in-pregnancy/"
  },
  {
    id: "large-meals-limit",
    level: "limit",
    category: "Thói quen",
    title: "Hạn chế bữa quá lớn hoặc ăn sát giờ ngủ",
    detail: "Nếu đầy bụng hay ợ nóng, bữa nhỏ và thường xuyên có thể dễ chịu hơn; ngồi thẳng khi ăn và ngay sau ăn.",
    action: "Thử chia nhỏ bữa và tránh ăn trong khoảng 3 giờ trước khi ngủ nếu đang bị ợ nóng.",
    sourceLabel: "NHS — ợ nóng trong thai kỳ",
    sourceHref: "https://www.nhs.uk/pregnancy/common-symptoms/indigestion-and-heartburn/"
  },
  {
    id: "heat-fall-risk-limit",
    level: "limit",
    category: "Vận động",
    title: "Giảm cường độ khi nóng, mệt hoặc có nguy cơ ngã",
    detail: "Không tập đến kiệt sức; cẩn trọng với hoạt động dễ ngã và tránh tập nặng trong thời tiết nóng.",
    action: "Chọn nơi mát, uống nước, báo người hướng dẫn biết đang mang thai và giảm nhịp khi không còn nói chuyện thoải mái.",
    sourceLabel: "NHS — vận động trong thai kỳ",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/exercise/"
  },
  {
    id: "herbal-tea-limit",
    level: "limit",
    category: "Đồ uống",
    title: "Cẩn trọng với trà thảo mộc và sản phẩm “tự nhiên”",
    detail: "“Tự nhiên” không đồng nghĩa an toàn trong thai kỳ. NHS khuyên hạn chế trà thảo mộc và tránh trà chứa rễ cam thảo.",
    action: "Giữ bao bì hoặc chụp nhãn để hỏi dược sĩ, bác sĩ hay nữ hộ sinh trước khi dùng thường xuyên.",
    sourceLabel: "NHS — thực phẩm cần tránh",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/"
  },
  {
    id: "no-alcohol",
    level: "avoid",
    category: "Đồ uống",
    title: "Không rượu bia",
    detail: "Không có lượng, thời điểm hay loại đồ uống có cồn nào được biết là an toàn trong thai kỳ.",
    action: "Nếu đã uống trước khi biết có thai, dừng từ bây giờ và trao đổi thẳng với nơi đang khám; không tự hoảng sợ.",
    sourceLabel: "CDC — rượu bia và thai kỳ",
    sourceHref: "https://www.cdc.gov/alcohol-pregnancy/about/index.html"
  },
  {
    id: "no-smoke",
    level: "avoid",
    category: "Môi trường",
    title: "Không thuốc lá, thuốc lá điện tử và khói thụ động",
    detail: "Khói thuốc trong thai kỳ gây hại cho mẹ và em bé; hút thụ động cũng liên quan tới cân nặng sơ sinh thấp.",
    action: "Giữ nhà và xe không khói thuốc; nhờ người thân hút hoàn toàn ở xa thay vì cạnh cửa sổ hay ban công gần.",
    sourceLabel: "CDC — thuốc lá và sức khỏe sinh sản",
    sourceHref: "https://www.cdc.gov/tobacco/about/cigarettes-and-reproductive-health.html"
  },
  {
    id: "no-risky-foods",
    level: "avoid",
    category: "An toàn thực phẩm",
    title: "Tránh thực phẩm sống, tái hoặc chưa tiệt trùng",
    detail: "Gồm thịt, trứng, cá và hải sản sống/tái; sữa hoặc nước ép chưa tiệt trùng; rau mầm sống và rau quả chưa rửa sạch.",
    action: "Kiểm tra chữ “pasteurized/tiệt trùng” trên nhãn và chọn món chín kỹ khi ăn ngoài.",
    sourceLabel: "CDC — thực phẩm an toàn khi mang thai",
    sourceHref: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    id: "no-high-mercury-fish",
    level: "avoid",
    category: "Ăn uống",
    title: "Tránh cá có hàm lượng thủy ngân cao",
    detail: "CDC nêu cá mập, cá kiếm, cá thu vua và cá ngói là các lựa chọn rủi ro cao hơn.",
    action: "Khi không biết rõ loại cá, hỏi người bán hoặc chọn các loại ít thủy ngân quen thuộc thay thế.",
    sourceLabel: "CDC — lựa chọn hải sản an toàn",
    sourceHref: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    id: "no-vitamin-a",
    level: "avoid",
    category: "Vi chất",
    title: "Tránh gan, dầu gan cá và viên chứa vitamin A dạng retinol",
    detail: "Quá nhiều vitamin A dạng retinol có thể gây hại cho sự phát triển của em bé.",
    action: "Đọc nhãn vitamin tổng hợp và đưa danh sách mọi vi chất đang dùng cho nơi khám kiểm tra.",
    sourceLabel: "NHS — vitamin và vi chất",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/pregnancy-vitamins-and-supplements/"
  },
  {
    id: "no-self-medication",
    level: "avoid",
    category: "Thuốc và vi chất",
    title: "Không tự dùng thuốc, thảo dược hoặc vi chất",
    detail: "Kể cả thuốc giảm đau, thuốc không kê đơn, thuốc nam và tinh dầu đều cần được kiểm tra là phù hợp với thai kỳ.",
    action: "Hỏi bác sĩ, nữ hộ sinh hoặc dược sĩ trước khi bắt đầu; cũng không tự ngừng thuốc đã kê.",
    sourceLabel: "NHS — thuốc trong thai kỳ",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/medicines/"
  },
  {
    id: "toxoplasmosis-care",
    level: "avoid",
    category: "Môi trường",
    title: "Tránh tiếp xúc trực tiếp với phân mèo và đất bẩn",
    detail: "Đất hoặc cát nhiễm phân mèo có thể mang ký sinh trùng Toxoplasma.",
    action: "Nhờ người khác dọn khay cát; nếu bắt buộc phải làm hoặc làm vườn, đeo găng và rửa tay kỹ sau đó.",
    sourceLabel: "CDC — phòng toxoplasmosis",
    sourceHref: "https://www.cdc.gov/toxoplasmosis/prevention/index.html"
  }
] as const;

export const pregnancyGuidanceLevels = [
  { id: "do", title: "Nên ưu tiên", mark: "✓" },
  { id: "limit", title: "Nên hạn chế", mark: "–" },
  { id: "avoid", title: "Nên tránh", mark: "×" }
] as const;

export const pregnancySources = [
  {
    label: "NIH ODS — nhu cầu và giới hạn vitamin, khoáng chất trong thai kỳ",
    href: "https://ods.od.nih.gov/factsheets/Pregnancy-HealthProfessional/"
  },
  {
    label: "National Academies — phương trình nhu cầu năng lượng DRI 2023",
    href: "https://nap.nationalacademies.org/resource/26818/DRIs_for_Energy_Highlights.pdf"
  },
  {
    label: "Apple — quyền riêng tư và quyền truy cập HealthKit",
    href: "https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data"
  },
  {
    label: "WHO — chăm sóc trước sinh, dinh dưỡng và vận động",
    href: "https://www.who.int/publications/i/item/9789241549912"
  },
  {
    label: "CDC — lựa chọn thực phẩm an toàn khi mang thai",
    href: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    label: "NHS — thực phẩm và caffeine cần lưu ý",
    href: "https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/"
  },
  {
    label: "NHS — thuốc, thảo dược và trị liệu trong thai kỳ",
    href: "https://www.nhs.uk/pregnancy/keeping-well/medicines/"
  },
  {
    label: "NHS — vitamin và vi chất trong thai kỳ",
    href: "https://www.nhs.uk/pregnancy/keeping-well/pregnancy-vitamins-and-supplements/"
  },
  {
    label: "CDC — rượu bia và thai kỳ",
    href: "https://www.cdc.gov/alcohol-pregnancy/about/index.html"
  },
  {
    label: "CDC — thuốc lá và sức khỏe sinh sản",
    href: "https://www.cdc.gov/tobacco/about/cigarettes-and-reproductive-health.html"
  },
  {
    label: "CDC — phòng toxoplasmosis",
    href: "https://www.cdc.gov/toxoplasmosis/prevention/index.html"
  },
  {
    label: "ACOG — vận động trong thai kỳ",
    href: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy"
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
