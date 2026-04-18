import type { MessageLink } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

function normalizeLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.length > 36 ? `${hostname.slice(0, 33)}...` : hostname;
  } catch {
    return 'Open link';
  }
}

export function extractMailboxLinks(...sources: Array<string | null | undefined>): MessageLink[] {
  const uniqueLinks = new Map<string, MessageLink>();

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
