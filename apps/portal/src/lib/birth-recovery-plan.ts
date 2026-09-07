import type { LinkTarget, OwnerRole, TaskCategory } from "./family-task-contract";

type PlanStep = { id: string; phase: "prepare" | "recovery"; title: string; note: string; ownerRole: OwnerRole; category: TaskCategory; linkTarget: LinkTarget };
export const BIRTH_RECOVERY_STEPS: PlanStep[] = [
  { id: "birth-preferences", phase: "prepare", title: "Trao đổi mong muốn khi sinh với nơi khám", note: "Ghi người đồng hành, điều giúp Mẹ dễ chịu, câu hỏi về giảm đau và chăm Bé. Đây là mong muốn để trao đổi, không thay kế hoạch y tế.", ownerRole: "family", category: "appointment", linkTarget: "health" },
  { id: "birth-transport", phase: "prepare", title: "Ba chốt đường đi viện và số liên hệ", note: "Lưu số nơi sinh, người đưa đi, phương án dự phòng và lời dặn riêng về khi nào đến viện.", ownerRole: "father", category: "pregnancy", linkTarget: "calendar" },
  { id: "birth-bag", phase: "prepare", title: "Ba soạn giấy tờ và giỏ đi sinh", note: "Đối chiếu danh sách nơi sinh: giấy tờ, hồ sơ đã khám, đồ cho Mẹ và Bé; không cần mua thêm nếu bệnh viện đã cấp.", ownerRole: "father", category: "inventory", linkTarget: "inventory" },
  { id: "birth-home-support", phase: "prepare", title: "Chốt người hỗ trợ khi Mẹ về nhà", note: "Ai nấu ăn, làm việc nhà, đưa đi khám và hỗ trợ ban đêm? Ghi tên, giờ và người thay thế.", ownerRole: "father", category: "general", linkTarget: "pregnancy" },
  { id: "recovery-discharge", phase: "recovery", title: "Lưu lời dặn và thuốc khi xuất viện", note: "Chép đúng hồ sơ ra viện, cách chăm sóc được hướng dẫn, dấu hiệu cần liên hệ và số nơi khám. Không tự thay liều.", ownerRole: "family", category: "health", linkTarget: "health" },
  { id: "recovery-visit", phase: "recovery", title: "Đặt lịch tái khám theo giấy ra viện", note: "Chọn ngày bác sĩ đã dặn cho Mẹ / Bé, nơi khám và người đưa đi; đem kết quả cùng câu hỏi đã ghi.", ownerRole: "father", category: "appointment", linkTarget: "calendar" },
  { id: "recovery-rest", phase: "recovery", title: "Ba chuẩn bị bữa ăn và thời gian nghỉ cho Mẹ", note: "Hỏi Mẹ cần gì hôm nay, thống nhất việc nhà và khoảng nghỉ; không đánh giá hồi phục chỉ bằng checklist.", ownerRole: "father", category: "meal", linkTarget: "meal" },
  { id: "recovery-checkin", phase: "recovery", title: "Hai mình ghi điều cần hỗ trợ hôm nay", note: "Ghi cảm xúc, khó khăn và điều muốn hỏi nơi khám. Nếu thấy không ổn, liên hệ hỗ trợ trực tiếp, không chờ ứng dụng.", ownerRole: "family", category: "journal", linkTarget: "journal" }
];
export function birthRecoveryStep(id: unknown): PlanStep | undefined { return typeof id === "string" ? BIRTH_RECOVERY_STEPS.find(step => step.id === id) : undefined; }
