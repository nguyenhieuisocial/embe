// Editorial metadata only. Never ingest health records, cookies or downloaded media here.
export const discoveryKey = 'embe:studio-discovery:v1';
export const niches = [
  { id: 'food', label: 'Ăn uống khi mang thai', vi: 'bầu ăn gì an toàn', zh: '孕期饮食 科普', en: 'pregnancy food safety' },
  { id: 'nausea', label: 'Ốm nghén', vi: 'ốm nghén bữa nhỏ', zh: '孕吐 少食多餐', en: 'morning sickness small meals' },
  { id: 'visits', label: 'Khám thai & hồ sơ', vi: 'khám thai chuẩn bị câu hỏi', zh: '产检 准备 清单', en: 'prenatal appointment questions' },
  { id: 'vitamins', label: 'Đọc nhãn vitamin', vi: 'đọc nhãn vitamin bầu', zh: '孕期 营养补充剂 标签', en: 'prenatal supplement label' },
  { id: 'partner', label: 'Ba đồng hành', vi: 'chồng chăm vợ mang thai', zh: '准爸爸 孕期 陪伴', en: 'pregnancy partner support' },
  { id: 'birth', label: 'Chuẩn bị đi sinh', vi: 'đồ đi sinh gọn nhẹ', zh: '待产包 精简 清单', en: 'minimal hospital bag checklist' },
  { id: 'postpartum', label: 'Mẹ sau sinh', vi: 'chăm sóc mẹ sau sinh', zh: '产后 恢复 心理 支持', en: 'postpartum mother support' },
  { id: 'sleep', label: 'Bé ngủ an toàn', vi: 'trẻ sơ sinh ngủ an toàn', zh: '婴儿 安全 睡眠', en: 'baby safe sleep' },
  { id: 'weaning', label: 'Ăn dặm', vi: 'ăn dặm dấu hiệu sẵn sàng', zh: '辅食 添加 准备 信号', en: 'baby starting solids readiness' },
  { id: 'play', label: 'Chơi & gắn kết', vi: 'ba mẹ chơi cùng em bé', zh: '亲子 陪伴 游戏', en: 'parent baby bonding play' },
] as const;
export type NicheId = typeof niches[number]['id'];
export type Snapshot = { at: string; likes: number | null; shares: number | null; saves: number | null };
export type DiscoveryItem = { id: string; title: string; url: string; niche: NicheId; note: string; status: 'saved' | 'draft'; snapshots: Snapshot[] };
export const seedReferences = [
  { title: 'Cách trình bày dòng thời gian thai kỳ', url: 'https://www.rednote.com/discovery/item/68b50cbc000000001b037c33', niche: 'visits' },
  { title: 'Bảng đối chiếu ăn dặm — cần kiểm chứng nội dung', url: 'https://www.rednote.com/discovery/item/6a83ddf0000000002800359f', niche: 'weaning' },
  { title: 'Bảng chuẩn bị khám thai', url: 'https://www.rednote.com/discovery/item/6a8cfdc7000000002b00129e', niche: 'visits' },
  { title: 'Video đổi bảng theo giai đoạn', url: 'https://www.rednote.com/discovery/item/6a8240250000000028009eb6', niche: 'visits' },
] satisfies Pick<DiscoveryItem, 'title' | 'url' | 'niche'>[];
export function searchLinks(niche: typeof niches[number], language: 'vi' | 'zh' | 'en', custom = '') {
  const q = custom.trim().slice(0, 100) || niche[language]; const encoded = encodeURIComponent(q);
  return [
    { name: 'Rednote', url: `https://www.xiaohongshu.com/search_result?keyword=${encoded}` },
    { name: 'Douyin', url: `https://www.douyin.com/search/${encoded}` },
    { name: 'TikTok', url: `https://www.tiktok.com/search?q=${encoded}` },
    { name: 'Bilibili', url: `https://search.bilibili.com/all?keyword=${encoded}` },
    { name: 'Kuaishou', url: `https://www.kuaishou.com/search/video?searchKey=${encoded}` },
    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${encoded}` },
    { name: 'Google Trends Việt Nam', url: `https://trends.google.com/trends/explore?geo=VN&q=${encoded}` },
  ];
}
const hosts = ['rednote.com', 'xiaohongshu.com', 'xhslink.com', 'xhslink.cn', 'douyin.com', 'tiktok.com', 'bilibili.com', 'b23.tv', 'kuaishou.com', 'youtube.com', 'youtu.be', 'trends.google.com'];
export function cleanReferenceUrl(input: string): string {
  const url = new URL(input.trim());
  if (input.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('Chỉ nhận liên kết HTTPS từ các nền tảng trong danh sách.');
  // Tokens, cookies, share tracking and arbitrary query strings never enter saved/exported metadata.
  const allowed = new URLSearchParams();
  for (const key of ['v', 'q', 'geo']) if (url.searchParams.has(key)) allowed.set(key, url.searchParams.get(key)!.slice(0, 150));
  const host = url.hostname.replace(/^www\./, '');
  let path = url.pathname.replace(/\/$/, '');
  if (['rednote.com', 'xiaohongshu.com'].includes(host)) path = path.replace(/^\/explore\//, '/discovery/item/');
  return `https://${host === 'xiaohongshu.com' ? 'rednote.com' : host}${path}${allowed.size ? `?${allowed}` : ''}`;
}
export function validateBoard(value: unknown): DiscoveryItem[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Sổ chỉ nhận tối đa 200 ý tưởng.');
  const ids = new Set<string>(); const urls = new Set<string>();
  const result = value.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('Dữ liệu sổ không hợp lệ.');
    const item = raw as DiscoveryItem;
    if (typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 180 || typeof item.note !== 'string' || item.note.length > 1500 || !niches.some(n => n.id === item.niche) || !['saved', 'draft'].includes(item.status) || !Array.isArray(item.snapshots) || item.snapshots.length > 50) throw new Error('Dữ liệu sổ không hợp lệ.');
    const url = cleanReferenceUrl(item.url); if (urls.has(url)) throw new Error('Sổ có liên kết bị trùng.');
    ids.add(item.id); urls.add(url);
    const snapshots = item.snapshots.map(s => {
      if (!s || typeof s.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(s.at) || !Number.isFinite(Date.parse(s.at)) || Date.parse(s.at) > Date.now() + 60000) throw new Error('Giờ ghi nhận không hợp lệ.');
      for (const key of ['likes', 'shares', 'saves'] as const) if (s[key] !== null && (!Number.isSafeInteger(s[key]) || s[key]! < 0 || s[key]! > 1e12)) throw new Error('Nhập số nguyên; để trống nếu nguồn không hiển thị.');
      return { at: new Date(s.at).toISOString(), likes: s.likes, shares: s.shares, saves: s.saves };
    }).sort((a,b) => Date.parse(a.at) - Date.parse(b.at));
    if (snapshots.some((s,i) => i && s.at === snapshots[i-1].at)) throw new Error('Hai lần ghi nhận không được trùng giờ.');
    return { id: item.id, title: item.title.trim(), url, niche: item.niche, note: item.note, status: item.status, snapshots };
  });
  if (new TextEncoder().encode(JSON.stringify({ version: 1, items: result })).length > 990000) throw new Error('Sổ gần đạt 1 MB. Xuất bản sao rồi giảm bớt ý tưởng cũ.');
  return result;
}
export function mergeBoard(current: DiscoveryItem[], incoming: DiscoveryItem[]): DiscoveryItem[] {
  // Merge, never replace another device's notes silently. Existing reference wins.
  const byUrl = new Map(current.map(item => [item.url, item]));
  for (const item of incoming) if (!byUrl.has(item.url)) byUrl.set(item.url, { ...item, id: crypto.randomUUID() });
  return validateBoard([...byUrl.values()]);
}
export function velocity(item: DiscoveryItem, now = Date.now()) {
  const last = item.snapshots.at(-1); const previous = item.snapshots.at(-2);
  if (!last || !previous) return { label: 'Cần hai lần ghi nhận', value: null };
  const hours = (Date.parse(last.at) - Date.parse(previous.at)) / 3600000;
  if (hours < 1) return { label: 'Hai lần cần cách nhau ít nhất 1 giờ', value: null };
  if (now - Date.parse(last.at) > 48 * 3600000) return { label: 'Số liệu đã cũ', value: null };
  const keys = (['likes', 'shares', 'saves'] as const).filter(key => last[key] !== null && previous[key] !== null);
  if (!keys.length) return { label: 'Thiếu chỉ số để đối chiếu', value: null };
  if (keys.some(key => last[key]! < previous[key]!)) return { label: 'Số đếm giảm — cần kiểm tra', value: null };
  const delta = keys.reduce((sum, key) => sum + last[key]! - previous[key]!, 0);
  return { label: `${(delta / hours).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tương tác/giờ (${keys.map(k => ({likes:'thích',shares:'chia sẻ',saves:'lưu'})[k]).join(', ')})`, value: delta / hours };
}
export function editorialBrief(item: DiscoveryItem) {
  return `Ý tưởng EmBe: ${item.title}\nChủ đề: ${niches.find(n => n.id === item.niche)?.label}\nNguồn cảm hứng: ${item.url}\nGóc nhìn riêng: ${item.note || 'Chưa ghi'}\n\nMở đầu: Một câu hỏi cụ thể của ba mẹ.\nThân bài: Ba ý ngắn, dùng ví dụ Việt Nam và minh họa gốc.\nKết: Một việc nhỏ hoặc câu hỏi cho lần khám.\n\nCần đối chiếu nguồn y khoa hiện hành, kiểm tra quyền hình/nhạc/giọng và duyệt nội dung trước khi đăng. Đây là dàn ý biên tập, không phải kiến thức đã được kiểm chứng.`;
}
export type TrendSignal = { title: string; startedAt: string | null; volume: string; url: string; relevant: boolean };
export function parseTrendFeed(xml: string): TrendSignal[] {
  if (xml.length > 1000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Nguồn không hợp lệ.');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror') || !doc.querySelector('rss channel')) throw new Error('Nguồn không hợp lệ.');
  const seen = new Set<string>();
  return [...doc.querySelectorAll('item')].slice(0, 100).flatMap(item => {
    const title = item.querySelector('title')?.textContent?.trim().slice(0, 180); if (!title || seen.has(title)) return [];
    seen.add(title);
    const normalized = title.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').toLowerCase();
    const relevant = /(?:^|\W)(me bau|mang thai|thai ky|thai nhi|so sinh|sau sinh|om nghen|an dam|di sinh|sua me|nuoi con|tre em|tiem chung|dinh duong|nipt|kham thai)(?:$|\W)/.test(normalized);
    const date = Date.parse(item.querySelector('pubDate')?.textContent ?? '');
    return [{ title, startedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, volume: item.getElementsByTagNameNS('*', 'approx_traffic')[0]?.textContent?.slice(0,40) ?? 'Không có số liệu', url: `https://trends.google.com/trends/explore?geo=VN&q=${encodeURIComponent(title)}`, relevant }];
  });
}
