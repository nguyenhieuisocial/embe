import type { StudioDocument } from './studio-project';
export const studioChannels = {undecided:'Chưa chọn',tiktok:'TikTok',instagram:'Instagram',facebook:'Facebook',youtube:'YouTube',zalo:'Zalo Video'} as const;
export type StudioChannel = keyof typeof studioChannels;
export type ReviewRequest = {id:string;project_id:string;project_revision:number;render_id:string;target:StudioChannel;status:'pending'|'cancelled';revision:number;created_at:string;updated_at:string;title?:string;stale:boolean;snapshot?:StudioDocument;origin?:'manual'|'automatic'};
export type ReviewEvent = {id:number;action:'requested'|'commented'|'cancelled'|'reopened';note:string;created_at:string};
// A checklist of things to inspect, never a diagnosis, clinical approval or proof that a source supports a claim.
export function editorialChecks(doc:StudioDocument) {
  const text=[doc.title,doc.caption,...doc.scenes.map(s=>`${s.heading} ${s.text}`)].join(' ');
  return [
    ...(!doc.sources.length?['Chưa có nguồn đối chiếu.']:[]),
    ...(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|iu|ml)\b|liều dùng|tự uống|ngừng thuốc/iu.test(text)?['Có liều lượng hoặc hướng dẫn dùng thuốc: người có chuyên môn cần đối chiếu.']:[]),
    ...(/100\s*%|chắc chắn|tuyệt đối an toàn|chữa khỏi|cam kết|không cần (?:khám|bác sĩ)/iu.test(text)?['Có lời khẳng định mạnh: cần kiểm tra và diễn đạt đúng mức chắc chắn.']:[]),
    ...(/chảy máu|khó thở|thai máy giảm|đau ngực|co giật/iu.test(text)?['Có dấu hiệu cảnh báo sức khỏe: cần hướng dẫn tìm trợ giúp phù hợp, không chỉ tự theo dõi.']:[]),
  ];
}
