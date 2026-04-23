import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  WandSparkles,
} from 'lucide-react';

import {
  getAutofillErrorMessage,
  getAutofillResponseMessage,
  getInvalidAutofillResponseMessage,
  isAutofillContentResponse,
  normalizeAutofillTabError,
} from '../autofill/popup-errors';
import { generateAutofillProfile } from '../autofill/profile';
import { getStoredAutofillSettings } from '../autofill/settings';
import type { AutofillContentResponse } from '../autofill/types';
import { callWebExtensionApi } from '../../lib/webext-async';
import { EMPTY_MAILBOX_SNAPSHOT } from './state';
import type { MailboxCommand, MailboxDiagnostics, MailboxResponse, MailboxSnapshot } from './types';

type AutofillStatus =
  | { tone: 'idle'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string };

function toTransportFailureResponse(
  error: unknown,
  command: MailboxCommand,
  snapshot: MailboxSnapshot,
): MailboxResponse {
  const message = error instanceof Error ? error.message : 'Mailbox request failed';
  const diagnostics: MailboxDiagnostics = {
    command: command.type,
    phase: 'sendMessage',
    errorType: 'transport',
  };

  return {
    ok: false,
    error: message,
    diagnostics,
    snapshot: {
      ...snapshot,
      status: snapshot.address ? 'active' : 'error',
      error: message,
      diagnostics,
    },
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

async function sendMailboxCommand(command: MailboxCommand) {
  return (await callWebExtensionApi<MailboxResponse>('runtime', 'sendMessage', command)) as MailboxResponse;
}

function useCopiedFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash } as const;
}

function MessageDetail({
  snapshot,
  onBack,
  onOpenLink,
}: {
  snapshot: MailboxSnapshot;
  onBack: () => void;
  onOpenLink: (url: string) => void;
}) {
  if (!snapshot.selectedMessage) {
    return (
      <section className='flex h-full min-h-[320px] items-center justify-center p-8 text-center'>
        <div className='flex max-w-sm flex-col items-center gap-3 text-ink-muted'>
          <Mail className='h-6 w-6' />
          <p className='text-sm'>Pick a message to read it here.</p>
        </div>
      </section>
    );
  }

  const message = snapshot.selectedMessage;

  return (
    <section className='flex h-full min-h-[320px] flex-col'>
      <div className='flex items-start justify-between gap-3 border-b border-border-dim px-5 py-4'>
        <div className='min-w-0'>
          <button
            className='mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink md:hidden'
            onClick={onBack}
            type='button'
          >
            <ArrowLeft className='h-3.5 w-3.5' />
            Back to inbox
          </button>
          <h2 className='break-words text-2xl font-semibold leading-tight text-ink'>
            {message.subject}
          </h2>
          <p className='mt-2 break-words text-sm text-ink-secondary'>{message.from}</p>
        </div>
        <span className='shrink-0 text-xs text-ink-muted'>{formatTimestamp(message.createdAt)}</span>
      </div>

      {message.links.length > 0 && (
        <div className='border-b border-border-dim px-5 py-4'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
            Verification links
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            {message.links.map((link) => (
              <button
                key={link.url}
                className='group inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/20 bg-accent-bg px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent-bg-strong'
                onClick={() => onOpenLink(link.url)}
                type='button'
              >
                <ExternalLink className='h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100' />
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className='flex-1 overflow-y-auto px-5 py-5 text-sm leading-7 text-ink-secondary'>
        {message.text ? (
          <pre className='whitespace-pre-wrap break-words font-body'>{message.text}</pre>
        ) : message.html ? (
          <div className='rounded-md border border-border-dim bg-surface-raised px-4 py-3 text-sm text-ink-muted'>
            HTML-only email. Use a verification link above if one was detected.
          </div>
        ) : (
          <p className='text-ink-muted'>No readable body.</p>
        )}
      </div>
    </section>
  );
}

export function MailboxPage() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>({
    tone: 'idle',
    message: 'Generate a profile, then fill the page you already have open.',
  });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const sentVisibleRef = useRef(false);
  const { copied, flash } = useCopiedFlash();
  const isPollingActive = snapshot.pollingActive;

  useEffect(() => {
    function handleVisibilityChange() {
      setIsVisible(document.visibilityState === 'visible');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    sentVisibleRef.current = isVisible;

    void callWebExtensionApi('runtime', 'sendMessage', {
      type: 'mailbox-ui-visibility',
      visible: isVisible,
    }).catch(() => undefined);
  }, [isVisible]);

  useEffect(() => {
    return () => {
      sentVisibleRef.current = false;

      void callWebExtensionApi('runtime', 'sendMessage', {
        type: 'mailbox-ui-visibility',
        visible: false,
      }).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      const response = await sendMailboxCommand({ type: 'mailbox:get-state' }).catch((error) =>
        toTransportFailureResponse(error, { type: 'mailbox:get-state' }, EMPTY_MAILBOX_SNAPSHOT),
      );
      if (!disposed) {
        setSnapshot(response.snapshot);
      }
    }

    void loadState();
    const interval = window.setInterval(loadState, isVisible ? 500 : 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [isVisible]);

  useEffect(() => {
    if (!snapshot.selectedMessageId) {
      setMobileDetailOpen(false);
    }
  }, [snapshot.selectedMessageId]);

  async function runCommand(command: MailboxCommand) {
    setIsBusy(true);
    try {
      const response = await sendMailboxCommand(command).catch((error) =>
        toTransportFailureResponse(error, command, snapshot),
      );
      setSnapshot(response.snapshot);
      if (command.type === 'mailbox:open-message') {
        setMobileDetailOpen(true);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) {
      return;
    }

    await navigator.clipboard.writeText(snapshot.address);
    flash();
  }

  async function autofillCurrentPage() {
    setIsBusy(true);
    let activeTab: chrome.tabs.Tab | undefined;

    try {
      if (!snapshot.address) {
        setAutofillStatus({
          tone: 'error',
          message: 'Create a temp mailbox first, then run autofill.',
        });
        return;
      }

      [activeTab] = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
        active: true,
        currentWindow: true,
      });

      const tabError = normalizeAutofillTabError(activeTab);

      if (tabError) {
        setAutofillStatus({ tone: 'error', message: tabError });
        return;
      }

      const tabId = activeTab.id;
      if (tabId === undefined) {
        setAutofillStatus({
          tone: 'error',
          message: 'Open a page first, then try autofill again.',
        });
        return;
      }

      const settings = await getStoredAutofillSettings();
      const profile = generateAutofillProfile(settings, { email: snapshot.address });
      const rawResponse = await callWebExtensionApi<unknown>('tabs', 'sendMessage', tabId, {
        type: 'autofill:fill-profile',
        profile,
      });

      if (!isAutofillContentResponse(rawResponse)) {
        setAutofillStatus({
          tone: 'error',
          message: getInvalidAutofillResponseMessage(),
        });
        return;
      }

      const response: AutofillContentResponse = rawResponse;
      if (!response.ok) {
        setAutofillStatus({
          tone: 'error',
          message: getAutofillResponseMessage(response),
        });
        return;
      }

      setAutofillStatus({
        tone: 'success',
        message: getAutofillResponseMessage(response),
      });
    } catch (error) {
      setAutofillStatus({
        tone: 'error',
        message: getAutofillErrorMessage(error, activeTab),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function openAutofillSettings() {
    await callWebExtensionApi('runtime', 'openOptionsPage');
  }

  return (
    <main className='min-h-screen bg-void font-body text-ink antialiased'>
      <div className='mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6'>
        <header className='mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border-dim px-1 pb-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white'>
              <Mail className='h-4 w-4' />
            </div>
            <div className='min-w-0'>
              <h1 className='truncate text-lg font-semibold tracking-tight text-ink'>SudoFill Mail</h1>
              <p className='text-xs text-ink-muted'>Temporary inbox for signups and verification links</p>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
              {snapshot.address && (
                <span className='inline-flex items-center gap-1 rounded-full border border-border-dim px-3 py-1.5 text-xs font-medium text-ink-muted'>
                  <RefreshCw className={`h-3.5 w-3.5 text-accent ${isPollingActive ? 'animate-spin' : ''}`} />
                  {isPollingActive ? 'Polling' : 'Standby'}
                </span>
              )}
              {snapshot.unreadCount > 0 && (
                <span className='inline-flex items-center gap-1.5 rounded-full border border-unread/25 bg-unread-bg px-3 py-1.5 text-xs font-medium text-unread'>
                  <span className='inline-block h-1.5 w-1.5 rounded-full bg-unread' />
                  {snapshot.unreadCount} unread
                </span>
              )}
              <button
                className='inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                disabled={isBusy}
                onClick={() => void openAutofillSettings()}
                type='button'
              >
                <Settings className='h-4 w-4' />
                Settings
              </button>
          </div>
        </header>

        {snapshot.error && (
          <div className='mb-3 rounded-md border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger'>
            <p>{snapshot.error}</p>
            {snapshot.diagnostics && (
              <p className='mt-1 text-[10px] uppercase tracking-[0.16em] text-danger/80'>
                {snapshot.diagnostics.command ?? 'mailbox'}
                {snapshot.diagnostics.phase ? ` · ${snapshot.diagnostics.phase}` : ''}
                {snapshot.diagnostics.errorType ? ` · ${snapshot.diagnostics.errorType}` : ''}
              </p>
            )}
          </div>
        )}

        <div className='grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border-dim bg-surface/96 lg:grid-cols-[220px_minmax(320px,420px)_minmax(0,1fr)]'>
          <aside className='border-b border-border-dim px-4 py-4 lg:border-r lg:border-b-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted'>Mailbox</p>
            {snapshot.address ? (
              <>
                <p className='mt-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted'>Address</p>
                <p className='mt-2 break-all text-sm font-semibold text-accent'>{snapshot.address}</p>
                <div className='mt-4 flex flex-col gap-2'>
                  <button
                    className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void copyAddress()}
                    type='button'
                  >
                    <Copy className='h-4 w-4' />
                    {copied ? 'Copied' : 'Copy address'}
                  </button>
                  <button
                    className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                    disabled={isBusy}
                    onClick={() => void autofillCurrentPage()}
                    type='button'
                  >
                    <WandSparkles className='h-4 w-4' />
                    Autofill page
                  </button>
                  <button
                    className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    <RefreshCw className={`h-4 w-4 ${isBusy || isPollingActive ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:discard' })}
                    type='button'
                  >
                    <Trash2 className='h-4 w-4' />
                    Discard mailbox
                  </button>
                </div>
              </>
            ) : (
              <div className='mt-4 rounded-md border border-border-dim bg-surface-raised p-4'>
                <p className='text-sm leading-relaxed text-ink-secondary'>
                  Create a temp mailbox to start collecting verification emails.
                </p>
                <button
                  className='mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                  disabled={isBusy || snapshot.status === 'creating'}
                  onClick={() => void runCommand({ type: 'mailbox:create' })}
                  type='button'
                >
                  <Plus className='h-4 w-4' />
                  {snapshot.status === 'creating' ? 'Creating...' : 'Create temp email'}
                </button>
              </div>
            )}

            <div className='mt-5 border-t border-border-dim pt-4'>
              <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>Status</p>
              <p className='mt-2 text-sm text-ink-secondary'>
                {snapshot.lastCheckedAt ? `Last checked ${formatTimestamp(snapshot.lastCheckedAt)}` : 'Not checked yet'}
              </p>
              <p
                className={`mt-2 text-sm ${
                  autofillStatus.tone === 'error'
                    ? 'text-danger'
                    : autofillStatus.tone === 'success'
                      ? 'text-accent'
                      : 'text-ink-muted'
                }`}
              >
                {autofillStatus.message}
              </p>
            </div>
          </aside>

          <section
            className={`border-b border-border-dim lg:border-r lg:border-b-0 ${
              mobileDetailOpen ? 'hidden md:block' : ''
            }`}
          >
            <div className='flex items-center justify-between border-b border-border-dim px-4 py-3'>
              <div className='flex items-center gap-2'>
                <Inbox className='h-4 w-4 text-accent' />
                <p className='text-sm font-semibold text-ink'>Inbox</p>
              </div>
              <span className='text-xs text-ink-muted'>
                {snapshot.messages.length} {snapshot.messages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {snapshot.messages.length > 0 ? (
              <div className='divide-y divide-border-dim'>
                {snapshot.messages.map((message) => (
                  <button
                    key={message.id}
                    className={`group flex w-full cursor-pointer items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors ${
                      snapshot.selectedMessageId === message.id
                        ? 'border-accent bg-accent-bg/40'
                        : 'border-transparent hover:bg-surface-hover/80'
                    }`}
                    onClick={() => void runCommand({ type: 'mailbox:open-message', messageId: message.id })}
                    type='button'
                  >
                    <div className='mt-1 flex w-2 shrink-0 justify-center'>
                      {!message.seen && (
                        <span className='inline-block h-1.5 w-1.5 rounded-full bg-unread' />
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-baseline justify-between gap-3'>
                        <p className={`truncate text-sm ${!message.seen ? 'font-semibold text-ink' : 'font-medium text-ink-secondary'}`}>
                          {message.subject}
                        </p>
                        <span className='shrink-0 text-[11px] text-ink-muted'>
                          {formatTimestamp(message.createdAt)}
                        </span>
                      </div>
                      <p className='mt-1 truncate text-xs text-ink-muted'>{message.from}</p>
                      <p className='mt-1 line-clamp-2 text-sm text-ink-secondary'>{message.intro}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className='flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center text-ink-muted'>
                <Mail className='h-6 w-6 opacity-30' />
                <p className='text-sm'>No messages yet</p>
                <p className='max-w-xs text-xs'>Keep the mailbox active and refresh after signing up.</p>
              </div>
            )}
          </section>

          <div className={mobileDetailOpen ? 'block' : 'hidden md:block'}>
            <MessageDetail
              onBack={() => setMobileDetailOpen(false)}
              onOpenLink={(url) => void runCommand({ type: 'mailbox:open-link', url })}
              snapshot={snapshot}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
