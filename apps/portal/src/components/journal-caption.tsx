import { cleanJournalCaption } from "../lib/journal-content";

const CHECKIN_LINE = /(?:\r?\n){1,2}📍 \[([^\]\r\n]{1,120})\]\((https:\/\/[^)\s]+)\)\s*$/u;

function safeGoogleMapsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.google.com" ||
      url.pathname !== "/maps/search/" ||
      url.searchParams.get("api") !== "1" ||
      !url.searchParams.get("query")
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function JournalCaption({ caption }: { caption: string }) {
  const cleanCaption = cleanJournalCaption(caption);
  const match = cleanCaption.match(CHECKIN_LINE);
  const href = match ? safeGoogleMapsUrl(match[2]) : null;
  if (!match || !href) return cleanCaption ? <p className="journal-caption-text">{cleanCaption}</p> : null;

  const body = cleanCaption.slice(0, match.index).trim();
  return (
    <div className="journal-caption">
      {body ? <p className="journal-caption-text">{body}</p> : null}
      <a className="journal-caption-map" href={href} target="_blank" rel="noreferrer">
        <span aria-hidden="true">⌖</span>{match[1]}
      </a>
    </div>
  );
}
