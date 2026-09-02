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
    detail: "Gồm thịt, trứng, cá và hải sản sống/tái; sữa hoặc nước ép chưa tiệt trùng; rau mầm sống, bột sống và rau quả chưa rửa sạch.",
    action: "Kiểm tra chữ “pasteurized/tiệt trùng” trên nhãn; khi ăn ngoài, chọn món chín kỹ và còn nóng.",
    sourceLabel: "CDC — thực phẩm an toàn khi mang thai",
    sourceHref: "https://www.cdc.gov/food-safety/foods/pregnant-women.html"
  },
  {
    id: "no-high-mercury-fish",
    level: "avoid",
    category: "Ăn uống",
    title: "Tránh cá có hàm lượng thủy ngân cao",
    detail: "Danh sách FDA/EPA cần tránh gồm cá ngừ mắt to, cá thu vua, cá marlin, orange roughy, cá mập, cá kiếm và cá ngói Vịnh Mexico.",
    action: "Nếu tên loài không rõ, hỏi người bán hoặc đổi sang cá trong nhóm ít thủy ngân; không bỏ hoàn toàn cá chỉ vì lo thủy ngân.",
    sourceLabel: "FDA/EPA — bảng chọn cá",
    sourceHref: "https://www.fda.gov/food/consumers/advice-about-eating-fish"
  },
  {
    id: "no-cold-deli-foods",
    level: "avoid",
    category: "An toàn thực phẩm",
    title: "Không ăn nguội thịt chế biến và hải sản hun khói lạnh",
    detail: "Thịt nguội, xúc xích, giò/chả đóng gói và hải sản hun khói bảo quản lạnh có thể mang Listeria dù đã được giữ lạnh.",
    action: "Chỉ dùng sau khi hâm nóng bốc hơi đều; chọn salad tự làm thay vì salad trộn sẵn ở quầy và nấu chín rau mầm.",
    sourceLabel: "CDC — phòng Listeria",
    sourceHref: "https://www.cdc.gov/listeria/prevention/index.html"
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

export const folkPracticeLevels = [
  {
    id: "keep",
    title: "Có thể giữ",
    mark: "♡",
    detail: "Phong tục hoặc cách chăm sóc khiến Mẹ thấy dễ chịu, miễn là không ép buộc, không tốn kém quá mức và không thay chỉ dẫn y tế.",
    examples: "Một nghi thức gia đình nhẹ nhàng, lời chúc, vật kỷ niệm hoặc món quen đã được nấu an toàn."
  },
  {
    id: "fun",
    title: "Chỉ để vui",
    mark: "✦",
    detail: "Đoán giới tính qua dáng bụng, món thèm hay dùng món ăn để đoán da, tóc, chiều cao của bé không phải căn cứ y khoa.",
    examples: "Có thể lưu như câu chuyện gia đình, nhưng không dùng để đổi chế độ ăn, bỏ xét nghiệm hoặc quyết định chăm sóc."
  },
  {
    id: "avoid",
    title: "Không nên làm",
    mark: "!",
    detail: "Không uống thuốc nam, rượu thuốc hay sản phẩm không rõ thành phần; không xông hoặc ngâm quá nóng; không kiêng khem cực đoan.",
    examples: "Không tự dừng thuốc đã kê và không trì hoãn liên hệ nơi đang khám để thử mẹo dân gian trước."
  }
] as const;

export const pregnancyMyths = [
  {
    id: "eat-for-two",
    question: "Phải “ăn cho hai”?",
    answer: "Không. Mục tiêu là ăn đa dạng và vừa sức, không tăng gấp đôi khẩu phần. Nhu cầu cụ thể thay đổi theo giai đoạn và hồ sơ sức khỏe.",
    sourceLabel: "ACOG — ăn uống lành mạnh",
    sourceHref: "https://www.acog.org/womens-health/faqs/healthy-eating-during-pregnancy"
  },
  {
    id: "blanket-food-bans",
    question: "Phải kiêng mọi món chua, cay, dứa, nước dừa và các loại hạt?",
    answer: "Không có một lệnh cấm chung như vậy trong hướng dẫn thực phẩm chính thống. Giảm món làm Mẹ khó chịu; các loại hạt dùng được nếu không dị ứng. Vẫn ưu tiên danh sách an toàn thực phẩm và dặn riêng của nơi khám.",
    sourceLabel: "NHS — thực phẩm cần tránh",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/"
  },
  {
    id: "miscarriage-blame",
    question: "Đi làm, vận động hoặc quan hệ gây sảy thai?",
    answer: "Những sinh hoạt này không phải nguyên nhân của sảy thai sớm. Nếu đang ra máu, đau, có biến chứng hoặc được nơi khám dặn hạn chế, cần làm theo chỉ dẫn riêng.",
    sourceLabel: "ACOG — sảy thai sớm",
    sourceHref: "https://www.acog.org/womens-health/faqs/early-pregnancy-loss"
  },
  {
    id: "cat",
    question: "Có mèo thì phải cho đi?",
    answer: "Không. Trọng tâm là tránh trực tiếp dọn phân mèo, đeo găng khi làm vườn hoặc tiếp xúc đất và rửa tay kỹ; đồng thời ăn thịt chín và rửa rau quả.",
    sourceLabel: "CDC — phòng toxoplasmosis",
    sourceHref: "https://www.cdc.gov/toxoplasmosis/about/"
  },
  {
    id: "bed-rest",
    question: "Phải nằm yên để giữ thai?",
    answer: "Không nên tự nằm bất động kéo dài. Nghỉ khi mệt là hợp lý, nhưng hạn chế hoạt động hoặc nằm nghỉ tuyệt đối chỉ theo chỉ định cá nhân của bác sĩ.",
    sourceLabel: "ACOG — nghỉ tuyệt đối và thai kỳ nguy cơ cao",
    sourceHref: "https://www.acog.org/womens-health/experts-and-stories/the-latest/so-you-have-a-high-risk-pregnancy-heres-what-to-expect"
  },
  {
    id: "herbal-is-safe",
    question: "Thuốc nam và thảo dược luôn an toàn?",
    answer: "Không. “Tự nhiên” không đồng nghĩa an toàn, sản phẩm có thể tương tác với thuốc hoặc không rõ thành phần. Hỏi bác sĩ, nữ hộ sinh hay dược sĩ trước khi dùng.",
    sourceLabel: "NHS — thuốc trong thai kỳ",
    sourceHref: "https://www.nhs.uk/pregnancy/keeping-well/medicines/"
  },
  {
    id: "heat",
    question: "Xông nóng hoặc ngâm bồn thật nóng giúp khỏe hơn?",
    answer: "Không nên. Sauna, bồn nước nóng và xông làm tăng thân nhiệt, đặc biệt cần tránh ở đầu thai kỳ. Chọn tắm ấm vừa phải và dừng nếu chóng mặt hoặc khó chịu.",
    sourceLabel: "ACOG — sauna và bồn nước nóng",
    sourceHref: "https://www.acog.org/womens-health/experts-and-stories/ask-acog/can-i-use-a-sauna-or-hot-tub-early-in-pregnancy"
  },
  {
    id: "travel",
    question: "Mang thai là phải kiêng đi xa hoàn toàn?",
    answer: "Không phải với mọi thai kỳ. Khi thai kỳ bình thường, đi lại thường vẫn được; thời điểm, quãng đường và biện pháp phòng huyết khối cần được cá nhân hóa với nơi khám.",
    sourceLabel: "ACOG — đi lại khi mang thai",
    sourceHref: "https://www.acog.org/womens-health/faqs/travel-during-pregnancy"
  }
] as const;

export const pregnancySources = [
  {
    label: "ACOG — ăn uống lành mạnh trong thai kỳ",
    href: "https://www.acog.org/womens-health/faqs/healthy-eating-during-pregnancy"
  },
  {
    label: "ACOG — giảm buồn nôn và nôn trong thai kỳ",
    href: "https://www.acog.org/womens-health/faqs/morning-sickness-nausea-and-vomiting-of-pregnancy"
  },
  {
    label: "FDA/EPA — chọn cá ít thủy ngân",
    href: "https://www.fda.gov/food/consumers/advice-about-eating-fish"
  },
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
    label: "ACOG — sảy thai sớm và những điều không phải nguyên nhân",
    href: "https://www.acog.org/womens-health/faqs/early-pregnancy-loss"
  },
  {
    label: "ACOG — nghỉ tuyệt đối và hạn chế hoạt động",
    href: "https://www.acog.org/womens-health/experts-and-stories/the-latest/so-you-have-a-high-risk-pregnancy-heres-what-to-expect"
  },
  {
    label: "ACOG — đi lại trong thai kỳ",
    href: "https://www.acog.org/womens-health/faqs/travel-during-pregnancy"
  },
  {
    label: "ACOG — sauna và bồn nước nóng",
    href: "https://www.acog.org/womens-health/experts-and-stories/ask-acog/can-i-use-a-sauna-or-hot-tub-early-in-pregnancy"
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
    detail: "Mục tiêu là ăn được, giữ đủ nước và duy trì món đa dạng trong khả năng — không ép một thực đơn cứng khi đang nghén.",
    foodLabel: "Món dễ bắt đầu",
    food: "Thử 5–6 bữa nhỏ: cháo thịt nạc hoặc cá chín, cơm mềm, bánh mì, chuối; thêm trứng chín, đậu phụ, hạt hoặc sữa chua tiệt trùng nếu hợp.",
    drink: "Nước lọc từng ngụm suốt ngày; có thể đổi vị bằng sữa tiệt trùng hoặc nước quả tiệt trùng ít đường. Cộng cả cà phê, trà, cola và chocolate vào giới hạn caffeine.",
    comfortLabel: "Khi đang nghén",
    comfort: "Để bánh quy nhạt hoặc bánh mì cạnh giường, tránh mùi gây buồn nôn và chọn món ít béo, dễ tiêu. Không cần cố ăn món làm Mẹ Ngân khó chịu.",
    warning: "Không giữ được thức ăn hoặc nước, tiểu ít/sẫm màu, chóng mặt hoặc sụt cân: liên hệ nơi đang khám sớm.",
    sources: [
      {
        label: "ACOG · nghén",
        href: "https://www.acog.org/womens-health/faqs/morning-sickness-nausea-and-vomiting-of-pregnancy"
      },
      {
        label: "ACOG · dinh dưỡng",
        href: "https://www.acog.org/womens-health/faqs/healthy-eating-during-pregnancy"
      }
    ]
  },
  {
    title: "Ba tháng giữa",
    detail: "Giữ bữa ăn đa dạng; ưu tiên nguồn đạm, sắt, canxi và choline từ thực phẩm thay vì tự tăng liều viên bổ sung.",
    foodLabel: "Gợi ý phối hợp",
    food: "Thịt nạc, cá hoặc trứng chín, đậu và rau lá xanh; dùng cùng cam, ổi hoặc rau giàu vitamin C. Thêm sữa/sữa chua tiệt trùng, đậu phụ và cá ít thủy ngân.",
    drink: "Nước lọc là chính; sữa tiệt trùng hoặc đồ uống tăng cường canxi phù hợp nếu không dung nạp sữa. Tránh để nước ngọt thay nước lọc.",
    comfortLabel: "Đổi món trong tuần",
    comfort: "Chọn 2–3 khẩu phần cá ít thủy ngân mỗi tuần, mỗi lần khoảng một lòng bàn tay; đổi loại cá và luôn nấu chín kỹ.",
    warning: "Thiếu máu, đái tháo đường thai kỳ, tăng huyết áp, đa thai hoặc dị ứng cần kế hoạch riêng từ bác sĩ/chuyên gia dinh dưỡng.",
    sources: [
      {
        label: "ACOG · dinh dưỡng",
        href: "https://www.acog.org/womens-health/faqs/healthy-eating-during-pregnancy"
      },
      {
        label: "FDA/EPA · chọn cá",
        href: "https://www.fda.gov/food/consumers/advice-about-eating-fish"
      }
    ]
  },
  {
    title: "Ba tháng cuối",
    detail: "Giữ chất lượng bữa ăn nhưng chia nhỏ nếu nhanh no hoặc ợ nóng; tiếp tục đạm, sắt, canxi, rau quả và ngũ cốc phù hợp.",
    foodLabel: "Món vừa bụng",
    food: "Cháo cá hoặc thịt chín, canh rau, cơm với đậu phụ/trứng chín, sữa chua tiệt trùng và trái cây đã rửa sạch; điều chỉnh lượng theo cảm giác no.",
    drink: "Uống nước đều giữa các bữa thay vì dồn nhiều một lúc. Giảm đồ uống có caffeine, có gas hoặc quá ngọt nếu chúng làm ợ nóng nặng hơn.",
    comfortLabel: "Khi ợ nóng",
    comfort: "Chia thành bữa nhỏ, ngồi thẳng khi ăn và sau ăn; tránh ăn trong khoảng 3 giờ trước khi ngủ và giảm đúng món kích hoạt triệu chứng của Mẹ Ngân.",
    warning: "Ợ nóng kéo dài, nôn nhiều hoặc không ăn uống được cần được nơi đang khám đánh giá; không tự mua thuốc dạ dày.",
    sources: [
      {
        label: "NHS · ợ nóng",
        href: "https://www.nhs.uk/pregnancy/common-symptoms/indigestion-and-heartburn/"
      },
      {
        label: "ACOG · dinh dưỡng",
        href: "https://www.acog.org/womens-health/faqs/healthy-eating-during-pregnancy"
      }
    ]
  }
] as const;

export const urgentCareReminders = [
  "Ra máu âm đạo, đau bụng dữ dội, ngất hoặc cảm giác tình trạng đang nguy hiểm.",
  "Đau đầu dữ dội không giảm, nhìn mờ hoặc sưng xuất hiện đột ngột.",
  "Khó thở xuất hiện đột ngột, đau ngực hoặc chóng mặt rõ rệt.",
  "Cử động thai giảm rõ rệt sau khi đã được hướng dẫn theo dõi, hoặc nghi chuyển dạ nhưng không chắc phải làm gì."
] as const;
