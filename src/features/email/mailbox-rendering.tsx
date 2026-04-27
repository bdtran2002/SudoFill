import { createElement, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BadgeCheck, Copy, ExternalLink, KeyRound, Link2 } from 'lucide-react';

import { copyTextToClipboard } from './mailbox-shared';
import type { MailboxLink, MailboxMessageDetail, MailboxVerificationCode } from './types';

const LINK_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

const BLOCK_TAG_CLASSNAMES: Record<string, string> = {
  blockquote: 'my-3 border-l-2 border-border-dim pl-4 text-ink-muted',
  code: 'rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[0.85em] text-ink',
  h1: 'my-3 text-xl font-semibold leading-tight text-ink',
  h2: 'my-3 text-lg font-semibold leading-tight text-ink',
  h3: 'my-3 text-base font-semibold leading-tight text-ink',
  h4: 'my-3 text-sm font-semibold leading-tight text-ink',
  h5: 'my-3 text-sm font-semibold leading-tight text-ink',
  h6: 'my-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted',
  hr: 'my-4 border-border-dim',
  li: 'my-1',
  ol: 'my-3 ml-5 list-decimal space-y-1',
  p: 'mb-3 last:mb-0',
  pre: 'my-3 overflow-x-auto rounded-md border border-border-dim bg-surface-raised px-3 py-2 font-mono text-xs leading-6 text-ink-secondary',
  table: 'my-4 w-full border-collapse text-left text-sm',
  td: 'border border-border-dim px-3 py-2 align-top',
  th: 'border border-border-dim bg-surface-raised px-3 py-2 align-top font-semibold text-ink',
  ul: 'my-3 ml-5 list-disc space-y-1',
};

const SAFE_STYLE_PROPERTIES = new Set([
  'background-color',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'border-color',
  'border-left',
  'border-radius',
  'border-right',
  'border-top',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'vertical-align',
  'white-space',
  'width',
]);

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

function normalizeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sanitizeUrl(url: string) {
  try {
    const parsed = new URL(
      url,
      typeof window !== 'undefined' ? window.location.href : 'https://example.invalid',
    );
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function sanitizeInlineStyle(styleText: string): CSSProperties | undefined {
  const style: Record<string, string> = {};

  for (const declaration of styleText.split(';')) {
    const [rawProperty = '', ...rawValueParts] = declaration.split(':');
    const property = rawProperty.trim().toLowerCase();
    const value = rawValueParts.join(':').trim();

    if (!property || !value || !SAFE_STYLE_PROPERTIES.has(property)) {
      continue;
    }

    if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) {
      continue;
    }

    const camelProperty = property.replace(/-([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    style[camelProperty] = value;
  }

  return Object.keys(style).length > 0 ? (style as unknown as CSSProperties) : undefined;
}

function getElementClassName(tagName: string) {
  return BLOCK_TAG_CLASSNAMES[tagName] ?? '';
}

function renderTextWithLinks(value: string, onOpenLink: (url: string) => void) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(new RegExp(LINK_URL_PATTERN))) {
    const matchIndex = match.index ?? 0;
    const rawUrl = match[0] ?? '';
    const matchedUrl = trimTrailingLinkPunctuation(rawUrl);
    const trailingPunctuation = rawUrl.slice(matchedUrl.length);

    if (matchIndex > lastIndex) {
      nodes.push(value.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <a
        key={`${matchIndex}-${matchedUrl}`}
        className='break-all text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent'
        href={matchedUrl}
        onClick={(event) => {
          event.preventDefault();
          onOpenLink(matchedUrl);
        }}
        rel='noreferrer noopener'
      >
        {matchedUrl}
      </a>,
    );

    if (trailingPunctuation) {
      nodes.push(trailingPunctuation);
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

function renderEmailNode(node: Node, key: string, onOpenLink: (url: string) => void): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return renderTextWithLinks(node.textContent ?? '', onOpenLink);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child, index) =>
    renderEmailNode(child, `${key}.${index}`, onOpenLink),
  );

  if (
    tagName === 'script' ||
    tagName === 'style' ||
    tagName === 'iframe' ||
    tagName === 'object' ||
    tagName === 'embed' ||
    tagName === 'form' ||
    tagName === 'input' ||
    tagName === 'button' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'option' ||
    tagName === 'noscript'
  ) {
    return null;
  }

  if (tagName === 'br') {
    return <br key={key} />;
  }

  if (tagName === 'a') {
    const href = sanitizeUrl(element.getAttribute('href') ?? '');

    if (!href) {
      return <span key={key}>{children}</span>;
    }

    return (
      <a
        key={key}
        className='break-words text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent'
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onOpenLink(href);
        }}
        rel='noreferrer noopener'
      >
        {children}
      </a>
    );
  }

  const props: { className?: string; style?: CSSProperties } = {};
  const className = getElementClassName(tagName);

  if (className) {
    props.className = className;
  }

  const inlineStyle = element.getAttribute('style');
  if (inlineStyle) {
    props.style = sanitizeInlineStyle(inlineStyle);
  }

  const align = element.getAttribute('align');
  if (align && !props.style) {
    props.style = { textAlign: align as CSSProperties['textAlign'] };
  } else if (align) {
    props.style = { ...props.style, textAlign: align as CSSProperties['textAlign'] };
  }

  if (
    tagName === 'span' ||
    tagName === 'div' ||
    tagName === 'section' ||
    tagName === 'article' ||
    tagName === 'header' ||
    tagName === 'footer' ||
    tagName === 'main' ||
    tagName === 'aside' ||
    tagName === 'nav' ||
    tagName === 'center' ||
    tagName === 'small' ||
    tagName === 'strong' ||
    tagName === 'b' ||
    tagName === 'em' ||
    tagName === 'i' ||
    tagName === 'u' ||
    tagName === 's' ||
    tagName === 'del' ||
    tagName === 'sup' ||
    tagName === 'sub' ||
    tagName === 'font' ||
    tagName === 'p' ||
    tagName === 'blockquote' ||
    tagName === 'pre' ||
    tagName === 'code' ||
    tagName === 'ul' ||
    tagName === 'ol' ||
    tagName === 'li' ||
    tagName === 'table' ||
    tagName === 'thead' ||
    tagName === 'tbody' ||
    tagName === 'tfoot' ||
    tagName === 'tr' ||
    tagName === 'th' ||
    tagName === 'td' ||
    tagName === 'h1' ||
    tagName === 'h2' ||
    tagName === 'h3' ||
    tagName === 'h4' ||
    tagName === 'h5' ||
    tagName === 'h6' ||
    tagName === 'hr'
  ) {
    return createElement(tagName, { key, ...props }, tagName === 'hr' ? null : children);
  }

  return <span key={key}>{children}</span>;
}

function renderSanitizedHtml(html: string, onOpenLink: (url: string) => void) {
  if (typeof DOMParser === 'undefined') {
    return [];
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(document.body.childNodes).map((node, index) =>
    renderEmailNode(node, `html-${index}`, onOpenLink),
  );
}

function ActionButton({
  label,
  onClick,
  icon,
  tone = 'default',
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  tone?: 'default' | 'accent';
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
        tone === 'accent'
          ? 'border-accent/20 bg-accent-bg text-accent hover:border-accent/40 hover:bg-accent-bg-strong'
          : 'border-border bg-surface-raised text-ink-secondary hover:border-accent/40 hover:text-accent'
      }`}
      onClick={onClick}
      type='button'
    >
      {icon}
      {label}
    </button>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyTextToClipboard(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className='group flex w-full items-center justify-between gap-3 rounded-lg border border-accent/20 bg-accent-bg px-3 py-3 text-left text-accent transition-colors hover:border-accent/40 hover:bg-accent-bg-strong'
      onClick={() => void handleCopy()}
      type='button'
    >
      <div className='min-w-0'>
        <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/70'>Code</p>
        <p className='mt-1 break-all font-mono text-lg font-semibold leading-tight'>{code}</p>
      </div>
      <span className='inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/20 bg-surface px-2 py-1 text-xs font-medium text-accent transition-colors group-hover:border-accent/40'>
        <Copy className='h-3.5 w-3.5' />
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}

function LinkAction({
  link,
  onOpenLink,
}: {
  link: MailboxLink;
  onOpenLink: (url: string) => void;
}) {
  const host = normalizeHost(link.url);

  return (
    <button
      className='group flex w-full items-start gap-3 rounded-lg border border-accent/20 bg-accent-bg px-3 py-3 text-left text-accent transition-colors hover:border-accent/40 hover:bg-accent-bg-strong'
      onClick={() => onOpenLink(link.url)}
      type='button'
    >
      <span className='mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-accent'>
        <ExternalLink className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block break-words font-medium leading-snug'>{link.label}</span>
        {host && <span className='mt-1 block text-xs text-accent/70'>{host}</span>}
      </span>
    </button>
  );
}

function secondaryLinkKey(link: MailboxLink) {
  return `${link.url}::${link.label}`;
}

function secondaryCodeKey(code: MailboxVerificationCode) {
  return `${code.code}::${code.label}`;
}

export function MailboxVerificationActions({
  verification,
  fallbackLinks,
  onOpenLink,
}: {
  verification: MailboxMessageDetail['verification'];
  fallbackLinks: MailboxLink[];
  onOpenLink: (url: string) => void;
}) {
  const linkCandidates =
    verification.linkCandidates.length > 0 ? verification.linkCandidates : fallbackLinks;
  const bestLink = verification.bestLink ?? linkCandidates[0] ?? null;
  const bestCode = verification.bestCode;

  const secondaryLinks = linkCandidates.filter((link) => link.url !== bestLink?.url);
  const secondaryCodes = verification.codeCandidates.filter((code) => code.code !== bestCode?.code);
  const hasPrimaryAction = Boolean(bestLink || bestCode);

  if (!bestLink && !bestCode && secondaryLinks.length === 0 && secondaryCodes.length === 0) {
    return null;
  }

  return (
    <div className='border-b border-border-dim px-5 py-4'>
      <div className='flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
        <BadgeCheck className='h-3.5 w-3.5 text-accent' />
        <span>Recommended actions</span>
      </div>

      {hasPrimaryAction && (
        <div className='mt-3 grid gap-3 lg:grid-cols-2'>
          {bestLink ? (
            <div className={bestCode ? '' : 'lg:col-span-2'}>
              <LinkAction link={bestLink} onOpenLink={onOpenLink} />
            </div>
          ) : null}

          {bestCode ? (
            <div className={bestLink ? '' : 'lg:col-span-2'}>
              <CopyableCode code={bestCode.code} />
              <p className='mt-2 text-xs text-ink-muted'>{bestCode.label}</p>
            </div>
          ) : null}
        </div>
      )}

      {(secondaryLinks.length > 0 || secondaryCodes.length > 0) && (
        <div className='mt-4 rounded-lg border border-border-dim bg-surface-raised px-3 py-3'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
            Secondary actions
          </p>

          {secondaryLinks.length > 0 && (
            <div className='mt-3 flex flex-wrap gap-2'>
              {secondaryLinks.map((link) => (
                <ActionButton
                  key={secondaryLinkKey(link)}
                  icon={<Link2 className='h-3.5 w-3.5' />}
                  label={link.label}
                  onClick={() => onOpenLink(link.url)}
                  tone='default'
                />
              ))}
            </div>
          )}

          {secondaryCodes.length > 0 && (
            <div className='mt-3 flex flex-wrap gap-2'>
              {secondaryCodes.map((code) => (
                <ActionButton
                  key={secondaryCodeKey(code)}
                  icon={<KeyRound className='h-3.5 w-3.5' />}
                  label={`${code.label}: ${code.code}`}
                  onClick={() => {
                    void copyTextToClipboard(code.code).catch(() => undefined);
                  }}
                  tone='default'
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MailboxMessageBody({
  message,
  onOpenLink,
}: {
  message: Pick<MailboxMessageDetail, 'text' | 'html'>;
  onOpenLink: (url: string) => void;
}) {
  const htmlContent = useMemo(
    () => (message.html ? renderSanitizedHtml(message.html, onOpenLink) : []),
    [message.html, onOpenLink],
  );

  if (htmlContent.length > 0) {
    return <div className='space-y-1'>{htmlContent}</div>;
  }

  if (message.text) {
    return (
      <div className='whitespace-pre-wrap break-words font-body'>
        {renderTextWithLinks(message.text, onOpenLink)}
      </div>
    );
  }

  return <p className='text-ink-muted'>No readable body.</p>;
}

export { renderSanitizedHtml, renderTextWithLinks };
