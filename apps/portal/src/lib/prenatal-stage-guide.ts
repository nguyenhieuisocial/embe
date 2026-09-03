export type PrenatalStageGuide = {
  movement: string;
  comfort: string;
  bonding: string;
  partner: string;
};

export function prenatalStageGuide(week: number): PrenatalStageGuide {
  if (week <= 13) return {
    movement: "Đi bộ nhẹ hoặc vận động quen thuộc nếu nơi khám đồng ý; nghỉ ngay khi mệt.",
    comfort: "Ăn thành bữa nhỏ nếu buồn nôn; kê đỡ lưng và đổi tư thế chậm.",
    bonding: "Mẹ hoặc Ba có thể nói vài câu với Bé. Không cần âm thanh lớn hay thiết bị chiếu sáng.",
    partner: "Ba Hiếu giúp ghi câu hỏi, chuẩn bị nước và cùng nhớ lịch khám."
  };
  if (week <= 27) return {
    movement: "Đi bộ, bơi nhẹ hoặc yoga bầu với người hướng dẫn đủ chuyên môn nếu thai kỳ cho phép.",
    comfort: "Giữ lưng được nâng đỡ; massage nhẹ ở tư thế nằm nghiêng có thể giúp thư giãn.",
    bonding: "Dành vài phút trò chuyện, đọc hoặc hát nhẹ. Bé có thể dần quen với giọng nói trong gia đình.",
    partner: "Ba Hiếu cùng dự khám khi có thể và bắt đầu chuẩn bị kế hoạch sinh."
  };
  return {
    movement: "Vận động vừa sức và tránh nguy cơ ngã; dừng nếu đau, chóng mặt, khó thở hoặc thấy không ổn.",
    comfort: "Ưu tiên tư thế dễ chịu, nghỉ thường xuyên; đau lưng nhiều hoặc kèm dấu hiệu bất thường cần liên hệ nơi khám.",
    bonding: "Giữ một nhịp quen thuộc: trò chuyện, đọc hoặc hát nhẹ. Không cần cố tạo phản ứng từ Bé.",
    partner: "Ba Hiếu kiểm tra giỏ đi sinh, đường đến nơi sinh và các số liên hệ cần thiết."
  };
}

export const prenatalGuideSources = [
  { label: "ACOG — vận động khi mang thai", href: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy" },
  { label: "NHS — giảm đau lưng", href: "https://www.nhs.uk/pregnancy/common-symptoms/back-pain/" },
  { label: "NHS — gắn kết với Bé", href: "https://www.nhs.uk/best-start-in-life/baby/baby-basics/bonding-with-your-baby/building-a-close-relationship-with-your-baby/" }
] as const;
