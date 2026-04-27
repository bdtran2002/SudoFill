import type { MailboxLink, MailboxVerificationCode, MailboxVerificationDetails } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const HTML_LINK_PATTERN = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const CODE_LINE_PATTERNS = [
  /(?:verification|security|sign[- ]?in|login|one[- ]?time|passcode|otp)[^\n\r]{0,24}?code[^\n\r]{0,12}?\b([A-Z0-9]{4,8})\b/gi,
  /code[^\n\r]{0,12}?\b([A-Z0-9]{4,8})\b/gi,
];
const NUMERIC_CODE_PATTERN = /\b\d{4,8}\b/g;
const MAX_LINK_CANDIDATES = 8;
const MAX_CODE_CANDIDATES = 5;

const POSITIVE_VERIFICATION_CUES = [
  'verify',
  'verification',
  'confirm',
  'activate',
  'magic link',
  'sign in',
  'signin',
  'login',
  'passwordless',
  'one-time',
  'one time',
  'security code',
  'verification code',
  'passcode',
  'otp',
];

const NEGATIVE_LINK_CUES = [
  'unsubscribe',
  'privacy',
  'terms',
  'support',
  'help',
  'preference',
  'settings',
  'view in browser',
  'cdn-cgi',
  'track',
  'open tracking',
];

function countCharacter(value: string, character: string) {
  return [...value].filter((candidate) => candidate === character).length;
}

function trimTrailingLinkPunctuation(url: string) {
  let trimmed = url.replace(/[,.]+$/, '');

  while (trimmed.endsWith(')')) {
    const openingParentheses = countCharacter(trimmed, '(');
    const closingParentheses = countCharacter(trimmed, ')');

    if (closingParentheses <= openingParentheses) {
      break;
    }

    trimmed = trimmed.slice(0, -1).replace(/[,.]+$/, '');
  }

  return trimmed;
}

function normalizeLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.length > 36 ? `${hostname.slice(0, 33)}...` : hostname;
  } catch {
    return 'Open link';
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getCueScore(value: string, cues: string[], weight: number) {
  const normalized = normalizeText(value);
  return cues.reduce((score, cue) => score + (normalized.includes(cue) ? weight : 0), 0);
}

function isLikelyAssetUrl(url: string) {
  return /\.(?:png|jpe?g|gif|svg|webp|css|js)(?:$|[?#])/i.test(url);
}

function buildLinkLabel(url: string, score: number, context: string) {
  const normalizedContext = normalizeText(context);

  if (score >= 20 || /verify|confirm|activate|magic|sign in|login/.test(normalizedContext)) {
    if (normalizedContext.includes('magic')) return 'Open magic link';
    if (normalizedContext.includes('sign in') || normalizedContext.includes('login')) {
      return 'Sign in with this link';
    }
    return 'Verify with this link';
  }

  return normalizeLabel(url);
}

type RawLinkCandidate = {
  url: string;
  context: string;
  anchorText: string;
  score: number;
};

function scoreLink(url: string, subject: string, context: string, anchorText: string) {
  const urlText = normalizeText(url);
  const contextText = normalizeText(context);
  const anchor = normalizeText(anchorText);
  const subjectText = normalizeText(subject);

  let score = 0;
  score += getCueScore(urlText, POSITIVE_VERIFICATION_CUES, 14);
  score += getCueScore(contextText, POSITIVE_VERIFICATION_CUES, 12);
  score += getCueScore(anchor, POSITIVE_VERIFICATION_CUES, 16);
  score += getCueScore(subjectText, POSITIVE_VERIFICATION_CUES, 6);
  score -= getCueScore(urlText, NEGATIVE_LINK_CUES, 22);
  score -= getCueScore(contextText, NEGATIVE_LINK_CUES, 20);
  score -= getCueScore(anchor, NEGATIVE_LINK_CUES, 24);

  if (/(?:token|code|auth|verify|confirm|activate)/.test(urlText)) {
    score += 14;
  }

  if (/(?:click|open|continue)/.test(contextText) && score > 0) {
    score += 8;
  }

  if (isLikelyAssetUrl(url)) {
    score -= 40;
  }

  return score;
}

function collectRawLinkCandidates(subject: string, text: string, html: string) {
  const candidates = new Map<string, RawLinkCandidate>();
  const strippedHtml = stripHtml(html);

  const addCandidate = (url: string, context: string, anchorText = '') => {
    const trimmedUrl = trimTrailingLinkPunctuation(url);
    const score = scoreLink(trimmedUrl, subject, context, anchorText);
    const existing = candidates.get(trimmedUrl);

    if (!existing || score > existing.score) {
      candidates.set(trimmedUrl, {
        url: trimmedUrl,
        context,
        anchorText,
        score,
      });
    }
  };

  for (const source of [text, strippedHtml]) {
    for (const match of source.matchAll(new RegExp(URL_PATTERN))) {
      const matchedUrl = match[0] ?? '';
      const start = Math.max(0, (match.index ?? 0) - 80);
      const end = Math.min(source.length, (match.index ?? 0) + matchedUrl.length + 80);
      addCandidate(matchedUrl, source.slice(start, end));
    }
  }

  for (const match of html.matchAll(new RegExp(HTML_LINK_PATTERN))) {
    const [, url = '', rawAnchorText = ''] = match;
    addCandidate(url, `${subject} ${stripHtml(rawAnchorText)} ${strippedHtml}`, stripHtml(rawAnchorText));
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

function toMailboxLink(candidate: RawLinkCandidate): MailboxLink {
  return {
    label: buildLinkLabel(candidate.url, candidate.score, `${candidate.anchorText} ${candidate.context}`),
    url: candidate.url,
  };
}

type RawCodeCandidate = {
  code: string;
  label: string;
  score: number;
};

function normalizeCandidateCode(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/ +/g, ' ');
}

function collectRawCodeCandidates(subject: string, text: string, html: string) {
  const candidates = new Map<string, RawCodeCandidate>();
  const normalizedBody = [subject, text, stripHtml(html)].filter(Boolean).join('\n');
  const lines = normalizedBody.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const addCandidate = (code: string, context: string, baseScore: number) => {
    const normalizedCode = normalizeCandidateCode(code);

    if (!/^[A-Z0-9][A-Z0-9 -]{3,11}$/i.test(normalizedCode)) {
      return;
    }

    const score =
      baseScore +
      getCueScore(context, POSITIVE_VERIFICATION_CUES, 10) -
      getCueScore(context, NEGATIVE_LINK_CUES, 10);
    const label = /sign in|signin|login/i.test(`${subject} ${context}`)
      ? 'Sign-in code'
      : 'Verification code';

    const existing = candidates.get(normalizedCode);
    if (!existing || score > existing.score) {
      candidates.set(normalizedCode, {
        code: normalizedCode,
        label,
        score,
      });
    }
  };

  for (const line of lines) {
    for (const pattern of CODE_LINE_PATTERNS) {
      for (const match of line.matchAll(new RegExp(pattern))) {
        addCandidate(match[1] ?? '', line, 22);
      }
    }

    if (getCueScore(line, POSITIVE_VERIFICATION_CUES, 1) > 0) {
      for (const match of line.matchAll(NUMERIC_CODE_PATTERN)) {
        addCandidate(match[0], line, 16);
      }
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

export function extractMailboxLinks(...sources: Array<string | null | undefined>): MailboxLink[] {
  const [subject = '', text = '', html = ''] = sources;
  return collectRawLinkCandidates(subject ?? '', text ?? '', html ?? '')
    .map(toMailboxLink)
    .slice(0, MAX_LINK_CANDIDATES);
}

export function extractMailboxVerificationDetails({
  subject,
  text,
  html,
}: {
  subject: string;
  text: string;
  html: string;
}): MailboxVerificationDetails {
  const subjectText = normalizeText(subject);
  const rankVerificationLink = (url: string) => {
    const urlText = normalizeText(url);
    return (
      getCueScore(urlText, POSITIVE_VERIFICATION_CUES, 14) +
      getCueScore(subjectText, POSITIVE_VERIFICATION_CUES, 6) -
      getCueScore(urlText, NEGATIVE_LINK_CUES, 24) -
      (isLikelyAssetUrl(url) ? 40 : 0)
    );
  };

  const linkCandidates = extractMailboxLinks(subject, text, html)
    .map((candidate) => ({ ...candidate, score: rankVerificationLink(candidate.url) }))
    .filter((candidate) => candidate.score > -10)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_LINK_CANDIDATES)
    .map(({ score: _score, ...candidate }) => candidate);
  const bestLink = linkCandidates[0] ?? null;
  const codeCandidates = collectRawCodeCandidates(subject, text, html)
    .filter((candidate) => candidate.score > 0)
    .map<MailboxVerificationCode>(({ code, label }) => ({ code, label }))
    .slice(0, MAX_CODE_CANDIDATES);

  return {
    bestLink: bestLink && rankVerificationLink(bestLink.url) > 0 ? bestLink : null,
    linkCandidates,
    bestCode: codeCandidates[0] ?? null,
    codeCandidates,
  };
}
