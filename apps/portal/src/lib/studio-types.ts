export type StudioSource = { publisher: string; title: string; url: string; jurisdiction: string; source_reviewed: string | null };
export type StudioBeat = { heading: string; text: string; start: number; end: number };
export type StudioTopic = {
  slug: string; title: string; pillar: string; stage: string; hookB: string; caption: string;
  hashtags: string[]; duration: number; beats: StudioBeat[]; sources: StudioSource[];
  audio?: boolean; checkedAt?: string; reviewDue?: string;
  voiceCredit?: { name: string; attribution: string; url: string; license: string };
};
export type StudioSummary = Pick<StudioTopic, 'slug' | 'title' | 'pillar' | 'stage' | 'duration' | 'audio'>;
