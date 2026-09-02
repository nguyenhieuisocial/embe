const JOURNAL_SYNC_MARKER = /(?:\r?\n)?<!--\s*embe-journal:[0-9a-f-]{36}\s*-->/giu;
const TRAILING_ENCODED_SPACE = /(?:\s|&#(?:x20|32);|&nbsp;)+$/giu;

export function cleanJournalCaption(value: string): string {
  return value
    .replace(JOURNAL_SYNC_MARKER, "")
    .replace(TRAILING_ENCODED_SPACE, "")
    .trim();
}
