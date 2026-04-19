import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, ExternalLink, RefreshCw, Trash2, Plus, Mail, ArrowRight } from 'lucide-react';

import '../../src/styles.css';
import { EMPTY_MAILBOX_SNAPSHOT } from '../../src/features/email/state';
import type {
  MailboxCommand,
  MailboxResponse,
  MailboxSnapshot,
} from '../../src/features/email/types';

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

async function sendMailboxCommand(command: MailboxCommand) {
  return await new Promise<MailboxResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(command, (response?: MailboxResponse) => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      if (!response) {
        reject(new Error('Mailbox command returned no response'));
        return;
      }

      resolve(response);
    });
  });
}

function useCopiedFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash } as const;
}

/* ── Message detail ────────────────────────────────────────────────── */

function MessagePanel({
  snapshot,
  onOpenLink,
}: {
  snapshot: MailboxSnapshot;
  onOpenLink: (url: string) => void;
}) {
  if (!snapshot.selectedMessage) {
    return (
      <section className='flex min-h-32 animate-fade-in items-center justify-center border-t border-border-dim p-6 text-center'>
        <div className='flex flex-col items-center gap-2 text-ink-muted'>
          <Mail className='h-5 w-5' />
          <span className='text-sm'>Select a message to read it</span>
        </div>
      </section>
    );
  }

  const message = snapshot.selectedMessage;

  return (
    <section className='animate-fade-in space-y-4 border-t border-border-dim p-5'>
      <div>
        <h2 className='font-brand text-lg font-semibold leading-snug text-ink'>
          {message.subject}
        </h2>
        <p className='mt-1 text-xs text-ink-muted'>{message.from}</p>
      </div>

      {message.links.length > 0 && (
        <div className='space-y-2'>
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

      <div className='text-sm leading-relaxed text-ink-secondary'>
        {message.text ? (
          <pre className='whitespace-pre-wrap font-body'>{message.text}</pre>
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

/* ── Main popup ────────────────────────────────────────────────────── */

function PopupApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const { copied, flash } = useCopiedFlash();

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      try {
        const response = await sendMailboxCommand({ type: 'mailbox:get-state' });
        if (!disposed) {
          setSnapshot(response.snapshot);
          setTransportError(null);
        }
      } catch (error) {
        if (!disposed) {
          setTransportError(
            error instanceof Error ? error.message : 'Failed to load mailbox state',
          );
        }
      }
    }

    void loadState();
    const interval = window.setInterval(loadState, 2_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  async function runCommand(command: MailboxCommand) {
    setIsBusy(true);

    try {
      const response = await sendMailboxCommand(command);
      setSnapshot(response.snapshot);
      setTransportError(null);
    } catch (error) {
      setTransportError(
        error instanceof Error ? error.message : 'Mailbox command failed unexpectedly',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) return;
    await navigator.clipboard.writeText(snapshot.address);
    flash();
  }

  return (
    <main className='min-h-screen bg-void font-body text-ink antialiased'>
      <div className='mx-auto max-w-md'>
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className='animate-fade-in px-5 pt-5 pb-4'>
          <div className='flex items-baseline justify-between'>
            <h1 className='font-brand text-2xl font-bold tracking-tight'>SudoFill</h1>
            {snapshot.unreadCount > 0 && (
              <span className='flex items-center gap-1.5 rounded-full bg-unread-bg px-2.5 py-0.5 text-xs font-medium text-unread'>
                <span className='inline-block h-1.5 w-1.5 animate-pulse-unread rounded-full bg-unread' />
                {snapshot.unreadCount} new
              </span>
            )}
          </div>
        </header>

        {/* ── Address card ───────────────────────────────────────── */}
        <div className='animate-fade-in px-5 pb-4' style={{ animationDelay: '60ms' }}>
          <div className='overflow-hidden rounded-xl border border-border bg-surface'>
            {snapshot.address ? (
              <div className='p-4'>
                <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                  Your address
                </p>
                <div className='mt-2 flex items-center gap-2'>
                  <p className='min-w-0 flex-1 truncate text-sm font-semibold text-accent'>
                    {snapshot.address}
                  </p>
                  <button
                    className='flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void copyAddress()}
                    type='button'
                  >
                    <Copy className='h-3 w-3' />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className='mt-3 flex gap-2'>
                  <button
                    className='flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    className='flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:discard' })}
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
                  onClick={() => void runCommand({ type: 'mailbox:create' })}
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

            {/* status strip */}
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
                {snapshot.lastCheckedAt
                  ? formatTimestamp(snapshot.lastCheckedAt)
                  : 'Not checked yet'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────── */}
        {(transportError ?? snapshot.error) && (
          <div className='animate-fade-in px-5 pb-4'>
            <div className='rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger'>
              {transportError ?? snapshot.error}
            </div>
          </div>
        )}

        {/* ── Inbox ──────────────────────────────────────────────── */}
        {snapshot.address && (
          <div className='animate-fade-in px-5 pb-5' style={{ animationDelay: '120ms' }}>
            <div className='overflow-hidden rounded-xl border border-border bg-surface'>
              <div className='border-b border-border-dim px-4 py-3'>
                <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                  Inbox
                </p>
              </div>

              {snapshot.messages.length > 0 ? (
                <div className='divide-y divide-border-dim'>
                  {snapshot.messages.map((message) => (
                    <button
                      key={message.id}
                      className={`group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors ${
                        snapshot.selectedMessageId === message.id
                          ? 'bg-accent-bg'
                          : 'hover:bg-surface-hover'
                      }`}
                      onClick={() =>
                        void runCommand({ type: 'mailbox:open-message', messageId: message.id })
                      }
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
              ) : (
                <div className='flex flex-col items-center gap-2 px-4 py-8 text-center text-ink-muted'>
                  <Mail className='h-5 w-5 opacity-30' />
                  <p className='text-sm'>No messages yet</p>
                  <p className='text-xs'>Keep the mailbox active and refresh after signing up.</p>
                </div>
              )}

              {snapshot.selectedMessage && (
                <MessagePanel
                  onOpenLink={(url) => void runCommand({ type: 'mailbox:open-link', url })}
                  snapshot={snapshot}
                />
              )}
            </div>
          </div>
        )}

        {snapshot.address && !snapshot.selectedMessage && snapshot.messages.length > 0 && (
          <div className='animate-fade-in px-5 pb-5' style={{ animationDelay: '180ms' }}>
            <div className='flex items-center justify-center rounded-xl border border-dashed border-border p-6 text-ink-muted'>
              <div className='flex flex-col items-center gap-2 text-center'>
                <Mail className='h-5 w-5 opacity-30' />
                <p className='text-sm'>Select a message above</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);
