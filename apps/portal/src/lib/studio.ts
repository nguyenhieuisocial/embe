import data from '../content/studio-catalog.json';
import type { StudioTopic } from './studio-types';

export const studioInfo = { checkedAt: data.checkedAt, reviewDue: data.reviewDue, ideas: data.ideas };
export function studioTopics(): StudioTopic[] {
  return data.topics.map(({ assets: _assets, ...topic }) => topic);
}
export function studioTopic(slug: string): StudioTopic | undefined { return studioTopics().find(topic => topic.slug === slug); }
export function studioAsset(slug: string, kind: 'video' | 'poster') {
  return data.topics.find(topic => topic.slug === slug)?.assets[kind];
}
export function studioScript(topic: StudioTopic): string {
  return `${topic.title}\nBản nháp — chưa duyệt chuyên môn.\n\n${topic.beats.map(beat => `${beat.start}–${beat.end}s | ${beat.heading}\n${beat.text}`).join('\n\n')}\n\nMở đầu khác: ${topic.hookB}\n\nCaption: ${topic.caption}\n${topic.hashtags.map(tag => `#${tag}`).join(' ')}\n\nNguồn đối chiếu:\n${topic.sources.map(source => `${source.publisher}: ${source.url}`).join('\n')}`;
}
export function studioSubtitles(topic: StudioTopic): string {
  const time = (seconds: number) => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`;
  return `WEBVTT\n\n${topic.beats.map(beat => `${time(beat.start)} --> ${time(beat.end)}\n${beat.text}\n`).join('\n')}`;
}
