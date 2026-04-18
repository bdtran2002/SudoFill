import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Copy,
  Inbox,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Mail,
  ChevronRight,
} from 'lucide-react';

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
  const response = (await chrome.runtime.sendMessage(command)) as MailboxResponse;
  if (!response.ok) throw new Error(response.error);
  return response.snapshot;
}

/* ── Copied toast hook ─────────────────────────────────────────────── */

function useCopiedFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash } as const;
}

/* ── Message detail panel ──────────────────────────────────────────── */

function MessagePanel({
  snapshot,
  onOpenLink,
}: {
  snapshot: MailboxSnapshot;
  onOpenLink: (url: string) => void;
}) {
  if (!snapshot.selectedMessage) {
    return (
      <section className="flex min-h-36 animate-fade-in-up items-center justify-center rounded-xl border border-border bg-surface p-5 text-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-2">
          <Mail className="h-5 w-5 opacity-40" />
          <span>Select an email to read it here</span>
        </div>
      </section>
    );
  }

  const message = snapshot.selectedMessage;

  return (
    <section className="animate-fade-in-up space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="space-y-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-accent-dim">
          Message
        </p>
        <h2 className="text-base font-semibold leading-snug text-text-primary">
          {message.subject}
        </h2>
        <p className="font-mono text-xs text-text-secondary">{message.from}</p>
      </div>

      {message.links.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-accent-dim">
            Verification links
          </p>
          <div className="flex flex-wrap gap-2">
            {message.links.map((link) => (
              <button
                key={link.url}
                className="group flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent-glow px-3 py-1.5 font-mono text-xs font-medium text-accent transition-all hover:border-accent/40 hover:bg-accent-glow-strong hover:shadow-[0_0_12px_rgba(45,212,191,0.15)]"
                onClick={() => onOpenLink(link.url)}
                type="button"
              >
                <ExternalLink className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-sm leading-relaxed text-text-secondary">
        {message.text ? (
          <pre className="whitespace-pre-wrap font-display">{message.text}</pre>
        ) : message.html ? (
          <div className="rounded-lg bg-surface-raised p-3 font-mono text-xs text-text-muted">
            HTML email received. Open the detected link above if available.
          </div>
        ) : (
          <p className="text-text-muted">No readable email body was returned.</p>
        )}
      </div>
    </section>
  );
}

/* ── Main popup ────────────────────────────────────────────────────── */

function PopupApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);
  const { copied, flash } = useCopiedFlash();

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      try {
        const next = await sendMailboxCommand({ type: 'mailbox:get-state' });
        if (!disposed) setSnapshot(next);
      } catch (error) {
        if (!disposed)
          setSnapshot((c) => ({
            ...c,
            error: error instanceof Error ? error.message : 'Failed to load mailbox state',
          }));
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
      setSnapshot(await sendMailboxCommand(command));
    } catch (error) {
      setSnapshot((c) => ({
        ...c,
        error: error instanceof Error ? error.message : 'Mailbox request failed',
      }));
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
    <main className="relative min-h-screen bg-void p-3 font-display text-text-primary antialiased">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {/* ── Header card ─────────────────────────────────────────── */}
        <section className="animate-fade-in-up rounded-xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-accent">
                SudoFill
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                Temp mailbox
              </h1>
            </div>
            {snapshot.unreadCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-unread/10 px-2 py-0.5 font-mono text-xs font-medium text-unread">
                <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-unread" />
                {snapshot.unreadCount}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Disposable inbox with auto-polling. Verification links are extracted automatically.
          </p>

          {/* ── Address / create area ──────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-border-bright bg-surface-raised p-3">
            {snapshot.address ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-accent">
                    {snapshot.address}
                  </p>
                  <button
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border-bright px-2 py-1 text-xs text-text-secondary transition-colors hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isBusy}
                    onClick={() => void copyAddress()}
                    type="button"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-bright bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isBusy}
                  onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                  type="button"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            ) : (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-void transition-all hover:bg-accent-dim hover:shadow-[0_0_20px_rgba(45,212,191,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || snapshot.status === 'creating'}
                onClick={() => void runCommand({ type: 'mailbox:create' })}
                type="button"
              >
                <Plus className="h-4 w-4" />
                {snapshot.status === 'creating' ? 'Creating...' : 'Create temp email'}
              </button>
            )}
          </div>

          {/* ── Status bar ─────────────────────────────────────────── */}
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-text-muted">
            <span className="uppercase tracking-widest">
              {snapshot.status === 'idle'
                ? 'Idle'
                : snapshot.status === 'creating'
                  ? 'Creating...'
                  : snapshot.status === 'error'
                    ? 'Error'
                    : 'Active'}
            </span>
            <span>
              {snapshot.lastCheckedAt
                ? `Checked ${formatTimestamp(snapshot.lastCheckedAt)}`
                : 'Not checked yet'}
            </span>
          </div>
        </section>

        {/* ── Error banner ────────────────────────────────────────── */}
        {snapshot.error && (
          <section className="animate-fade-in-up rounded-xl border border-danger-border bg-danger-bg p-4 font-mono text-xs text-danger">
            {snapshot.error}
          </section>
        )}

        {/* ── Inbox / detail ──────────────────────────────────────── */}
        {snapshot.address ? (
          <>
            <section className="animate-fade-in-up rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-primary">Inbox</h2>
                </div>
                <button
                  className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isBusy}
                  onClick={() => void runCommand({ type: 'mailbox:discard' })}
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                  Discard
                </button>
              </div>

              <div className="space-y-1">
                {snapshot.messages.length > 0 ? (
                  snapshot.messages.map((message) => (
                    <button
                      key={message.id}
                      className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                        snapshot.selectedMessageId === message.id
                          ? 'border-accent/30 bg-accent-glow'
                          : 'border-transparent hover:border-border-bright hover:bg-surface-hover'
                      }`}
                      onClick={() =>
                        void runCommand({ type: 'mailbox:open-message', messageId: message.id })
                      }
                      type="button"
                    >
                      {/* unread dot */}
                      <div className="flex h-5 w-3 shrink-0 items-center justify-center">
                        {!message.seen && (
                          <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-unread" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-sm ${!message.seen ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}
                          >
                            {message.subject}
                          </p>
                          <p className="shrink-0 font-mono text-[10px] text-text-muted">
                            {formatTimestamp(message.createdAt)}
                          </p>
                        </div>
                        <p className="truncate font-mono text-[11px] text-text-muted">
                          {message.from}
                        </p>
                        <p className="line-clamp-1 text-xs text-text-secondary">{message.intro}</p>
                      </div>

                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-center text-xs text-text-muted">
                    <Inbox className="h-5 w-5 opacity-30" />
                    Nothing received yet. Keep the mailbox active.
                  </div>
                )}
              </div>
            </section>

            <MessagePanel
              onOpenLink={(url) => void runCommand({ type: 'mailbox:open-link', url })}
              snapshot={snapshot}
            />
          </>
        ) : (
          <section className="animate-fade-in-up rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-text-muted">
            The mailbox is session-only. Close the popup if you want; polling continues while the
            browser session is active.
          </section>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);
