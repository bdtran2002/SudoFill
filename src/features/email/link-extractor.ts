import type { MailboxLink } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const MAX_MAILBOX_LINKS = 5;

function trimTrailingLinkPunctuation(url: string) {
  return url.replace(/[),.]+$/, '');
}

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

function createMailboxLink(url: string): MailboxLink {
  return {
    label: normalizeLabel(url),
    url,
  };
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
      const trimmed = trimTrailingLinkPunctuation(match);

      if (!uniqueLinks.has(trimmed)) {
        uniqueLinks.set(trimmed, createMailboxLink(trimmed));
      }
    }
  }

  return [...uniqueLinks.values()].slice(0, MAX_MAILBOX_LINKS);
}
