import {
  ArrowRight,
  Copy,
  ExternalLink,
  Mail,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
} from 'lucide-react';

import type { MailboxSnapshot } from './types';

const GITHUB_REPO_URL = 'https://github.com/bdtran2002/SudoFill';

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export type AutofillStatus =
  | { tone: 'idle'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string };

export function MailboxHeader({
  isSidepanel,
  unreadCount,
}: {
  isSidepanel: boolean;
  unreadCount: number;
}) {
  return (
    <header className='animate-fade-in px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <h1 className='font-brand text-2xl font-bold tracking-tight'>SudoFill</h1>
        <div className='flex items-center gap-2'>
          <a
            aria-label='Open SudoFill on GitHub'
            className={`inline-flex h-7 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent ${
              isSidepanel
                ? 'gap-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]'
                : 'w-7'
            }`}
            href={GITHUB_REPO_URL}
            rel='noreferrer'
            target='_blank'
          >
            <ExternalLink className='h-3 w-3' />
            {isSidepanel && <span>GitHub</span>}
          </a>
          {unreadCount > 0 && (
            <span className='flex items-center gap-1.5 rounded-full bg-unread-bg px-2.5 py-0.5 text-xs font-medium text-unread'>
              <span className='inline-block h-1.5 w-1.5 animate-pulse-unread rounded-full bg-unread' />
              {unreadCount} new
            </span>
          )}
        </div>
      </div>
      {isSidepanel && (
        <p className='mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary'>
          Generate a temporary inbox, autofill signup forms, and review verification links without
          leaving the page.
        </p>
      )}
    </header>
  );
}

export function MailboxStatusCard({
  copied,
  isBusy,
  onCopyAddress,
  onCreateMailbox,
  onDiscardMailbox,
  onRefreshMailbox,
  snapshot,
}: {
  copied: boolean;
  isBusy: boolean;
  onCopyAddress: () => void;
  onCreateMailbox: () => void;
  onDiscardMailbox: () => void;
  onRefreshMailbox: () => void;
  snapshot: MailboxSnapshot;
}) {
  return (
    <div className='animate-fade-in px-4 pb-4 sm:px-5' style={{ animationDelay: '60ms' }}>
      <div className='overflow-hidden rounded-xl border border-border bg-surface'>
        {snapshot.address ? (
          <div className='p-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
              Your address
            </p>
            <div className='mt-2 flex flex-col gap-2 sm:flex-row sm:items-center'>
              <p className='min-w-0 flex-1 truncate text-sm font-semibold text-accent'>
                {snapshot.address}
              </p>
              <button
                className='flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:shrink-0'
                disabled={isBusy}
                onClick={onCopyAddress}
                type='button'
              >
                <Copy className='h-3 w-3' />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
              <button
                className='flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1'
                disabled={isBusy}
                onClick={onRefreshMailbox}
                type='button'
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                className='flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1'
                disabled={isBusy}
                onClick={onDiscardMailbox}
                type='button'
              >
                <Trash2 className='h-3.5 w-3.5' />
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className='p-4'>
            <button
              className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
              disabled={isBusy || snapshot.status === 'creating'}
              onClick={onCreateMailbox}
              type='button'
            >
              <Plus className='h-4 w-4' />
              {snapshot.status === 'creating' ? 'Creating...' : 'Create temp email'}
            </button>
            <p className='mt-3 text-center text-xs leading-relaxed text-ink-muted'>
              Session-only. Polling continues while the browser is open.
            </p>
          </div>
        )}

        <div className='flex items-center justify-between border-t border-border-dim bg-surface-raised px-4 py-2 text-[10px] font-medium text-ink-muted'>
          <span className='uppercase tracking-widest'>
            {snapshot.status === 'idle'
              ? 'Idle'
              : snapshot.status === 'creating'
                ? 'Creating'
                : snapshot.status === 'error'
                  ? 'Error'
                  : 'Active'}
          </span>
          <span>
            {snapshot.lastCheckedAt ? formatTimestamp(snapshot.lastCheckedAt) : 'Not checked yet'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AutofillCard({
  autofillStatus,
  isBusy,
  onAutofillCurrentPage,
  onOpenAutofillSettings,
}: {
  autofillStatus: AutofillStatus;
  isBusy: boolean;
  onAutofillCurrentPage: () => void;
  onOpenAutofillSettings: () => void;
}) {
  return (
    <div className='animate-fade-in px-4 pb-4 sm:px-5' style={{ animationDelay: '90ms' }}>
      <div className='overflow-hidden rounded-xl border border-border bg-surface'>
        <div className='p-4'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                Autofill
              </p>
              <p className='mt-2 text-sm leading-relaxed text-ink-secondary'>
                Use your saved ranges to generate a fake profile and fill common signup fields.
              </p>
            </div>
            <WandSparkles className='mt-0.5 h-4 w-4 shrink-0 text-accent' />
          </div>

          <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
            <button
              className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1'
              disabled={isBusy}
              onClick={onAutofillCurrentPage}
              type='button'
            >
              <WandSparkles className='h-3.5 w-3.5' />
              Autofill page
            </button>
            <button
              className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1'
              disabled={isBusy}
              onClick={onOpenAutofillSettings}
              type='button'
            >
              <SlidersHorizontal className='h-3.5 w-3.5' />
              Settings
            </button>
          </div>
        </div>

        <div className='border-t border-border-dim bg-surface-raised px-4 py-2 text-[11px] text-ink-muted'>
          <span
            className={
              autofillStatus.tone === 'error'
                ? 'text-danger'
                : autofillStatus.tone === 'success'
                  ? 'text-accent'
                  : 'text-ink-muted'
            }
          >
            {autofillStatus.message}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MailboxErrorPanel({
  diagnostics,
  error,
}: {
  diagnostics: MailboxSnapshot['diagnostics'];
  error: string;
}) {
  return (
    <div className='animate-fade-in px-4 pb-4 sm:px-5'>
      <div className='space-y-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger'>
        <p>{error}</p>
        {diagnostics && (
          <p className='text-[10px] uppercase tracking-[0.16em] text-danger/80'>
            {diagnostics.command ?? 'mailbox'}
            {diagnostics.phase ? ` · ${diagnostics.phase}` : ''}
            {diagnostics.errorType ? ` · ${diagnostics.errorType}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function MessagePanel({
  isSidepanel,
  onOpenLink,
  snapshot,
}: {
  isSidepanel: boolean;
  onOpenLink: (url: string) => void;
  snapshot: MailboxSnapshot;
}) {
  if (!snapshot.selectedMessage) {
    return (
      <section
        className={`flex min-h-28 animate-fade-in items-center justify-center border-t border-border-dim px-4 py-5 text-center ${
          isSidepanel ? 'md:min-h-full md:border-t-0 md:border-l' : ''
        }`}
      >
        <div className='flex flex-col items-center gap-2 text-ink-muted'>
          <Mail className='h-5 w-5' />
          <span className='text-sm'>Select a message to read it</span>
        </div>
      </section>
    );
  }

  const message = snapshot.selectedMessage;

  return (
    <section
      className={`animate-fade-in flex flex-col border-t border-border-dim px-4 py-4 ${
        isSidepanel ? 'md:min-h-full md:border-t-0 md:border-l' : ''
      }`}
    >
      <div>
        <h2 className='font-brand break-words text-lg font-semibold leading-snug text-ink'>
          {message.subject}
        </h2>
        <p className='mt-1 break-words text-xs text-ink-muted'>{message.from}</p>
      </div>

      {message.links.length > 0 && (
        <div className='mt-4 space-y-2'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
            Verification links
          </p>
          <div className='flex flex-wrap gap-1.5'>
            {message.links.map((link) => (
              <button
                key={link.url}
                className='group flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/20 bg-accent-bg px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent-bg-strong'
                onClick={() => onOpenLink(link.url)}
                type='button'
              >
                <ExternalLink className='h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100' />
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className='mt-4 overflow-x-hidden text-sm leading-relaxed text-ink-secondary'>
        {message.text ? (
          <pre className='whitespace-pre-wrap break-words font-body'>{message.text}</pre>
        ) : message.html ? (
          <div className='rounded-md border border-border-dim bg-surface-raised px-3 py-2 text-xs text-ink-muted'>
            HTML-only email. Use a verification link above if one was detected.
          </div>
        ) : (
          <p className='text-ink-muted'>No readable body.</p>
        )}
      </div>
    </section>
  );
}

export function InboxPanel({
  isSidepanel,
  onOpenLink,
  onOpenMessage,
  snapshot,
}: {
  isSidepanel: boolean;
  onOpenLink: (url: string) => void;
  onOpenMessage: (messageId: string) => void;
  snapshot: MailboxSnapshot;
}) {
  return (
    <div className='animate-fade-in px-4 pb-5 sm:px-5' style={{ animationDelay: '120ms' }}>
      <div className='w-full overflow-hidden rounded-xl border border-border bg-surface'>
        <div className='border-b border-border-dim px-4 py-3'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
            Inbox
          </p>
        </div>

        {snapshot.messages.length > 0 ? (
          <div
            className={
              isSidepanel ? 'md:grid md:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]' : ''
            }
          >
            <div className='divide-y divide-border-dim'>
              {snapshot.messages.map((message) => (
                <button
                  key={message.id}
                  className={`group flex w-full cursor-pointer items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${
                    snapshot.selectedMessageId === message.id
                      ? 'bg-accent-bg'
                      : 'hover:bg-surface-hover'
                  }`}
                  onClick={() => onOpenMessage(message.id)}
                  type='button'
                >
                  <div className='flex h-5 w-2 shrink-0 items-center'>
                    {!message.seen && (
                      <span className='inline-block h-2 w-2 animate-pulse-unread rounded-full bg-unread' />
                    )}
                  </div>

                  <div className='min-w-0 flex-1'>
                    <div className='flex items-baseline justify-between gap-2'>
                      <p
                        className={`truncate text-sm ${
                          !message.seen
                            ? 'font-semibold text-ink'
                            : 'font-medium text-ink-secondary'
                        }`}
                      >
                        {message.subject}
                      </p>
                      <span className='shrink-0 text-[10px] text-ink-muted'>
                        {formatTimestamp(message.createdAt)}
                      </span>
                    </div>
                    <p className='mt-0.5 truncate text-xs text-ink-muted'>{message.from}</p>
                    <p className='mt-0.5 line-clamp-1 text-xs text-ink-secondary'>
                      {message.intro}
                    </p>
                  </div>

                  <ArrowRight className='mt-1 h-3.5 w-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-60' />
                </button>
              ))}
            </div>
            <MessagePanel isSidepanel={isSidepanel} onOpenLink={onOpenLink} snapshot={snapshot} />
          </div>
        ) : (
          <div className='flex flex-col items-center gap-2 px-4 py-8 text-center text-ink-muted'>
            <Mail className='h-5 w-5 opacity-30' />
            <p className='text-sm'>No messages yet</p>
            <p className='text-xs'>Keep the mailbox active and refresh after signing up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
