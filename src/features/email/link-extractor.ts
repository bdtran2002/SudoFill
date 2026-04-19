import type { MailboxLink } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

/**
 * Converts a URL into a compact label suitable for the mailbox UI.
 */
function normalizeLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.length > 36 ? `${hostname.slice(0, 33)}...` : hostname;
  } catch {
    return 'Open link';
  }
}

/**
 * Extracts unique links from one or more message content sources.
 */
export function extractMailboxLinks(...sources: Array<string | null | undefined>): MailboxLink[] {
  const uniqueLinks = new Map<string, MailboxLink>();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    const matches = source.match(URL_PATTERN) ?? [];

    for (const match of matches) {
      const trimmed = match.replace(/[),.]+$/, '');

      if (!uniqueLinks.has(trimmed)) {
        uniqueLinks.set(trimmed, {
          label: normalizeLabel(trimmed),
          url: trimmed,
        });
      }
    }
  }

  return [...uniqueLinks.values()].slice(0, 5);
}
