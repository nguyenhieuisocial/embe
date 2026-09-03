export const HOSPITAL_BAG_GROUPS = [
  {
    id: "documents",
    label: "Giấy tờ",
    items: [
      ["identity", "Giấy tờ tùy thân"],
      ["insurance", "Bảo hiểm và hồ sơ đăng ký sinh"],
      ["pregnancy-records", "Sổ khám, xét nghiệm và siêu âm"],
      ["birth-plan", "Kế hoạch sinh và số liên hệ"]
    ]
  },
  {
    id: "mother",
    label: "Đồ của Mẹ",
    items: [
      ["mother-clothes", "Quần áo rộng, dễ thay"],
      ["mother-hygiene", "Đồ vệ sinh cá nhân và băng sau sinh"],
      ["mother-slippers", "Dép chống trượt"],
      ["mother-medicine", "Thuốc/vi chất theo dặn dò"],
      ["mother-charger", "Điện thoại và dây sạc"]
    ]
  },
  {
    id: "baby",
    label: "Đồ của Bé",
    items: [
      ["baby-clothes", "Quần áo sơ sinh"],
      ["baby-diapers", "Bỉm và khăn mềm"],
      ["baby-blanket", "Khăn quấn hoặc chăn mỏng"],
      ["baby-hat", "Mũ, bao tay và bao chân"],
      ["baby-car-seat", "Ghế ô tô nếu gia đình dùng xe"]
    ]
  }
] as const;

export const HOSPITAL_BAG_IDS = HOSPITAL_BAG_GROUPS.flatMap((group) => group.items.map(([id]) => id));
