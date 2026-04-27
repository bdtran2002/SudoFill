import type {
  MailboxMessageDetail,
  MailboxMessageSummary,
  MailboxVerificationDetails,
} from './types';

const NORMALIZE_HOST_PREFIX = /^www\./;

export interface VerificationPopupPayload {
  senderLabel: string;
  subject: string;
  messageId: string;
  link: { label: string; url: string } | null;
  code: { label: string; code: string } | null;
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(NORMALIZE_HOST_PREFIX, '');
}

export function getHostnameFromUrl(url: string) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return '';
  }
}

export function isRelatedHostname(candidate: string, target: string) {
  const left = normalizeHostname(candidate);
  const right = normalizeHostname(target);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function domainFromAddress(value: string) {
  const match = value.match(/@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? normalizeHostname(match[1]) : '';
}

function labelFromFromField(from: string) {
  const addressDomain = domainFromAddress(from);
  if (addressDomain) return addressDomain;
  return from.trim() || 'Verification email';
}

export function getVerificationPopupTargetHostname(
  verification: MailboxVerificationDetails,
  from: string,
) {
  return getHostnameFromUrl(verification.bestLink?.url ?? '') || domainFromAddress(from);
}

function getVerificationPopupTargetHostnames(
  verification: MailboxVerificationDetails,
  from: string,
) {
  return [
    ...new Set([getHostnameFromUrl(verification.bestLink?.url ?? ''), domainFromAddress(from)]),
  ]
    .map((hostname) => normalizeHostname(hostname))
    .filter(Boolean);
}

export function isVerificationPopupRelevant(
  activeHostname: string,
  verification: MailboxVerificationDetails,
  from: string,
) {
  return getVerificationPopupTargetHostnames(verification, from).some((target) =>
    isRelatedHostname(activeHostname, target),
  );
}

export function buildVerificationPopupPayload(
  message: MailboxMessageDetail,
): VerificationPopupPayload | null {
  const link = message.verification.bestLink;
  const code = message.verification.bestCode;

  if (!link && !code) return null;

  return {
    senderLabel: labelFromFromField(message.from),
    subject: message.subject,
    messageId: message.id,
    link: link ? { label: link.label, url: link.url } : null,
    code: code ? { label: code.label, code: code.code } : null,
  };
}

export function findRelatedVerificationMessage(
  activeHostname: string,
  messages: MailboxMessageSummary[],
  getMessage: (messageId: string) => MailboxMessageDetail | null,
) {
  const sortedMessages = [...messages].sort((left, right) => {
    const leftMessage = getMessage(left.id);
    const rightMessage = getMessage(right.id);
    const leftTime = Date.parse(leftMessage?.createdAt ?? left.createdAt ?? '');
    const rightTime = Date.parse(rightMessage?.createdAt ?? right.createdAt ?? '');

    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
    if (Number.isNaN(leftTime)) return 1;
    if (Number.isNaN(rightTime)) return -1;
    return rightTime - leftTime;
  });

  for (const summary of sortedMessages) {
    const message = getMessage(summary.id);
    if (
      message &&
      isVerificationPopupRelevant(activeHostname, message.verification, message.from)
    ) {
      const payload = buildVerificationPopupPayload(message);
      if (payload) return payload;
    }
  }

  return null;
}
