"use client";

import Link from 'next/link';
import { useState } from 'react';
import type { StudioSummary } from '../lib/studio-types';

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export default function StudioCollection({ topics, ideas }: { topics: StudioSummary[]; ideas: string[] }) {
  const [view, setView] = useState<'drafts' | 'ideas'>('drafts');
  const [query, setQuery] = useState(''); const [pillar, setPillar] = useState('');
  const term = searchable(query.trim());
  const filtered = topics.filter(topic => (!pillar || topic.pillar === pillar) && searchable(`${topic.title} ${topic.pillar} ${topic.stage}`).includes(term));
  const selectedIdeas = ideas.filter(idea => searchable(idea).includes(term));
  return <section className="studio-library" aria-label="Nội dung Studio">
    <div className="studio-switch" aria-label="Loại nội dung">
      <button type="button" aria-pressed={view === 'drafts'} onClick={() => setView('drafts')}>Kịch bản & video <span>{topics.length}</span></button>
      <button type="button" aria-pressed={view === 'ideas'} onClick={() => setView('ideas')}>Ý tưởng <span>{ideas.length}</span></button>
    </div>
    <label className="studio-search">Tìm chủ đề
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ăn cá, ốm nghén, sau sinh…" autoComplete="off" />
    </label>
    {view === 'drafts' && <label className="studio-filter">Nhóm nội dung
      <select value={pillar} onChange={event => setPillar(event.target.value)}><option value="">Tất cả chủ đề</option>
        {[...new Set(topics.map(topic => topic.pillar))].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>}
    <p className="studio-count" role="status">{view === 'drafts' ? `${filtered.length} bản nháp` : `${selectedIdeas.length} ý tưởng`}</p>
    {view === 'ideas' && <p className="studio-notice">Gợi ý để nghiên cứu tiếp, chưa phải kiến thức đã kiểm chứng hoặc lời khuyên sức khỏe.</p>}
    {view === 'drafts' ? <ul className="studio-list">
      {filtered.map(topic => <li key={topic.slug}><Link className="studio-topic" href={`/studio/${topic.slug}`}>
        {/* Same-origin, authenticated derivative; never expose a storage locator. */}
        <img src={`/api/studio/${topic.slug}/poster`} alt="" width={60} height={88} loading="lazy" decoding="async" />
        <span className="studio-topic-copy"><small>{topic.pillar}</small><strong>{topic.title}</strong><small>{topic.duration} giây · Video chưa có giọng đọc</small></span>
        <span className="studio-chevron" aria-hidden="true">›</span>
      </Link></li>)}
    </ul> : <ul className="studio-ideas">{selectedIdeas.map(idea => <li key={idea}>{idea}</li>)}</ul>}
    {(view === 'drafts' ? filtered.length : selectedIdeas.length) === 0 && <div className="studio-empty"><p>Chưa có chủ đề khớp với tìm kiếm này.</p><button type="button" onClick={() => { setQuery(''); setPillar(''); }}>Xóa bộ lọc</button></div>}
  </section>;
}
