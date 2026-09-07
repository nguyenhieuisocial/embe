import type { StudioTopic } from './studio-types';

export type StudioVoice = { id: 'thuc-doan-south-v2' | 'my-duyen-south-v2' | 'kim-thanh-south-v2' | 'thuc-doan-south-v1' | 'my-duyen-south-v1' | 'ai-han-south' | 'piper'; speed: 0.95 | 1 | 1.05 };
export type StudioDocument = { title: string; stage: string; caption: string; scenes: { heading: string; text: string; speechText?: string }[]; sources: { title: string; url: string }[]; voice?: StudioVoice };
export type StudioProject = { id: string; revision: number; payload: StudioDocument; deleted: boolean; created_at: string; updated_at: string };
export type StudioRender = { id: string; revision: number; status: 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled'; progress: number; error: string | null; attempts: number; output?: { duration: number; voiceCredit: { attribution: string; url: string; license: string }; beats: { heading: string; text: string; start: number; end: number }[] } | null };
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid_request'); return v as Record<string, unknown>; };
const text = (v: unknown, max: number, required = false) => { if (typeof v !== 'string' || v.length > max || (required && !v.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) throw new Error('invalid_request'); return v.trim(); };
export function studioDocument(raw: unknown): StudioDocument {
  const value = record(raw);
  if (Object.keys(value).some(k => !['title','stage','caption','scenes','sources','voice'].includes(k))) throw new Error('invalid_request');
  let voice: StudioVoice | undefined;
  if (value.voice !== undefined) {
    const v=record(value.voice);
    if (Object.keys(v).some(k=>!['id','speed'].includes(k)) || !['thuc-doan-south-v2','my-duyen-south-v2','kim-thanh-south-v2','thuc-doan-south-v1','my-duyen-south-v1','ai-han-south','piper'].includes(String(v.id)) || typeof v.speed!=='number' || ![.95,1,1.05].includes(v.speed)) throw new Error('invalid_request');
    voice={id:v.id as StudioVoice['id'],speed:v.speed as StudioVoice['speed']};
  }
  if (!Array.isArray(value.scenes) || value.scenes.length < 1 || value.scenes.length > 6 || !Array.isArray(value.sources) || value.sources.length > 6) throw new Error('invalid_request');
  const scenes = value.scenes.map(raw => { const s = record(raw); const speechText = s.speechText === undefined ? '' : text(s.speechText, 240);
    return { heading: text(s.heading, 80), text: text(s.text, 180), ...(speechText ? {speechText} : {}) }; });
  if (scenes.reduce((n,s) => n+s.text.length,0) > 900) throw new Error('invalid_request');
  if (scenes.reduce((n,s) => n+(s.speechText??s.text).length,0) > 1100) throw new Error('invalid_request');
  const sources = value.sources.map(raw => { const s = record(raw); const u = new URL(text(s.url, 700, true));
    if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('invalid_request');
    u.hash=''; for (const key of [...u.searchParams.keys()]) if (/token|secret|cookie|signature|xsec|^utm_/i.test(key)) u.searchParams.delete(key);
    return { title: text(s.title, 100, true), url: u.href }; });
  return { title: text(value.title, 120, true), stage: text(value.stage, 80), caption: text(value.caption, 1500), scenes, sources, ...(voice?{voice}:{}) };
}
export function templateDocument(topic?: StudioTopic): StudioDocument {
  const voice: StudioVoice = {id:'thuc-doan-south-v2',speed:1};
  return topic ? { title: topic.title, stage: topic.stage, caption: `${topic.caption}\n${topic.hashtags.map(t=>`#${t}`).join(' ')}`, scenes: topic.beats.slice(0,6).map(b=>({heading:b.heading,text:b.text})), sources: topic.sources.slice(0,6).map(s=>({ title: s.publisher, url:s.url })), voice }
    : { title: 'Ý tưởng mới', stage: 'Mẹ bầu', caption: '', scenes: [{heading:'Mở đầu',text:''},{heading:'Một điều cần biết',text:''},{heading:'Việc nhỏ hôm nay',text:''}], sources: [], voice };
}
export function readyToRender(doc: StudioDocument) { return doc.sources.length > 0 && doc.scenes.every(s=>s.heading && s.text); }
export const renderLabels = {queued:'Đang chờ dựng',rendering:'Đang dựng video',completed:'Video đã sẵn sàng',failed:'Chưa dựng được',cancelled:'Đã hủy'};
export const renderErrors: Record<string,string> = {text_does_not_fit:'Chữ dài quá khung. Rút gọn tiêu đề hoặc lời từng cảnh.',voice_too_long:'Lời đọc quá dài. Chia nhỏ hoặc rút gọn các cảnh.',render_budget_exceeded:'Video vượt giới hạn bản ngắn. Rút gọn kịch bản rồi dựng lại.',storage_unavailable:'Kho video tạm không kết nối được. Có thể thử lại.',interrupted:'Máy dựng đã gián đoạn. Bản nháp còn nguyên; có thể thử lại.',worker_unavailable:'Máy dựng tạm gặp lỗi. Bản nháp còn nguyên.',invalid_project:'Kiểm tra nội dung từng cảnh và nguồn.'};
export function documentScript(doc: StudioDocument) { return `${doc.title}\n${doc.stage}\nBản nháp — chưa duyệt chuyên môn.\n\n${doc.scenes.map((s,i)=>`${i+1}. ${s.heading}\n${s.text}${s.speechText?`\nLời đọc riêng: ${s.speechText}`:''}`).join('\n\n')}\n\nCaption\n${doc.caption}\n\nNguồn đối chiếu\n${doc.sources.map(s=>`${s.title}: ${s.url}`).join('\n')}`; }
