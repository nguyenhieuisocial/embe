/** Copies an explicit daily count; never derives a schedule from dose or quantity. */
export function explicitDailyFrequency(value: string): number | null {
  const text = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const match = /^(?:([1-6]) lan\s*(?:\/|moi)\s*ngay|ngay (?:uong |dung )?([1-6]) lan)$/.exec(text);
  return match ? Number(match[1] || match[2]) : null;
}
