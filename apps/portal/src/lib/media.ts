import { getTimeline, type TimelineEvent } from "./timeline";

export type MediaMemory = Pick<TimelineEvent, "id" | "eventAt" | "title" | "caption">;

export async function getMediaMemories(): Promise<MediaMemory[]> {
  return (await getTimeline())
    .filter((event) => event.albumCoverUrl !== null)
    .map(({ id, eventAt, title, caption }) => ({ id, eventAt, title, caption }));
}

export function isAllowedMediaUrl(value: string, configuredHosts: string): boolean {
  try {
    const url = new URL(value);
    const hosts = new Set(configuredHosts.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}
