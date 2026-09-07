import { type StudioRender } from './studio-project';

export type StudioAutomation = {
  enabled: boolean; revision: number; nextRunAt: string; lastCheckedAt: string | null;
  status: string; workerSeenAt: string | null; remaining: number; reviewDue: string | null;
  publication: { status: 'not_connected'; publishedCount: 0 };
  history: { slug: string; project_id: string; title: string; created_at: string; deleted: boolean;
    render_id: string | null; render_status: StudioRender['status'] | null; progress: number | null; error: string | null }[];
};
export const automationLabels: Record<string, string> = {
  paused: 'Đã tạm dừng tạo video mới.', scheduled: 'Đang theo lịch mỗi ngày.', created: 'Đã chọn chủ đề và tạo kịch bản.',
  queue_full: 'Đợi các video đang dựng hoàn tất.', workspace_full: 'Kho Studio đã đầy; không tạo thêm video.',
  sources_expired: 'Nguồn cần được đối chiếu lại trước khi tạo nội dung tiếp.', topics_exhausted: 'Đã dùng hết kịch bản trong thư viện; không lặp lại chủ đề.',
  render_failed: 'Một video chưa dựng được; tạm ngừng tạo thêm để tránh dồn lỗi.', plan_error: 'Chưa tạo được kịch bản theo lịch. Các video đã có vẫn giữ nguyên.',
};
