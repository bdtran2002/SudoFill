import { useEffect, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';

import { EMPTY_MAILBOX_SNAPSHOT } from './state';
import type { MailboxCommand, MailboxSnapshot } from './types';
import {
  copyTextToClipboard,
  formatTimestamp,
  MAILBOX_AUTOFILL_IDLE_MESSAGE,
  MAILBOX_AUTOFILL_MISSING_MAILBOX_MESSAGE,
  runMailboxAutofillFlow,
  sendMailboxCommand,
  toTransportFailureResponse,
  useCopiedFlash,
  useMailboxUiVisibilityReporting,
} from './mailbox-shared';
import { callWebExtensionApi } from '../../lib/webext-async';

type FirefoxSidebarActionApi = {
  open?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
};

function getFirefoxSidebarAction(): FirefoxSidebarActionApi | undefined {
  return (
    globalThis as typeof globalThis & {
      browser?: {
        sidebarAction?: FirefoxSidebarActionApi;
      };
    }
  ).browser?.sidebarAction;
}

async function openFirefoxSidebar(): Promise<void> {
  const sidebarAction = getFirefoxSidebarAction();

  if (!sidebarAction?.open) {
    throw new Error('Firefox sidebar is unavailable');
  }

  await sidebarAction.open();
}

async function closeFirefoxSidebar(): Promise<void> {
  const sidebarAction = getFirefoxSidebarAction();

  if (!sidebarAction?.close) {
    throw new Error('Firefox sidebar is unavailable');
  }

  await sidebarAction.close();
}

async function openFullMailboxPage() {
  const mailboxUrl = chrome.runtime.getURL('mailbox.html');
  const [existingTab] = await callWebExtensionApi<chrome.tabs.Tab[]>('tabs', 'query', {
    url: mailboxUrl,
  });

  if (existingTab?.id !== undefined) {
    await callWebExtensionApi('tabs', 'update', existingTab.id, { active: true });

    if (existingTab.windowId !== undefined) {
      await Promise.resolve(chrome.windows.update(existingTab.windowId, { focused: true }));
    }

    return;
  }

  await callWebExtensionApi('tabs', 'create', { url: mailboxUrl });
}

type AutofillStatus =
  | { tone: 'idle'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string };

type SidebarActionStatus =
  | { tone: 'idle'; message: ''; source: null }
  | { tone: 'success'; message: string; source: 'mailbox' }
  | { tone: 'error'; message: string; source: 'mailbox' | 'ui' };

function MessagePanel({
  snapshot,
  onOpenLink,
  pendingMessageId,
  isSidepanel,
}: {
  snapshot: MailboxSnapshot;
  onOpenLink: (url: string) => void;
  pendingMessageId: string | null;
  isSidepanel: boolean;
}) {
  const isPendingDifferentMessage =
    pendingMessageId !== null && pendingMessageId !== snapshot.selectedMessageId;

  if (!snapshot.selectedMessage || isPendingDifferentMessage) {
    return (
      <section
        className={`flex min-h-28 animate-fade-in items-center justify-center border-t border-border-dim px-4 py-5 text-center ${
          isSidepanel ? 'md:min-h-full md:border-t-0 md:border-l' : ''
        }`}
      >
        <div className='flex flex-col items-center gap-2 text-ink-muted'>
          <Mail className='h-5 w-5' />
          <span className='text-sm'>
            {pendingMessageId || snapshot.selectedMessageId
              ? 'Loading message…'
              : 'Select a message to read it'}
          </span>
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

export function MailboxApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>({
    tone: 'idle',
    message: MAILBOX_AUTOFILL_IDLE_MESSAGE,
  });
  const [sidebarActionStatus, setSidebarActionStatus] = useState<SidebarActionStatus>({
    tone: 'idle',
    message: '',
    source: null,
  });
  const { copied, flash } = useCopiedFlash();
  const snapshotRef = useRef(snapshot);
  const isSidepanel = document.documentElement.classList.contains('sidepanel');
  const canOpenFirefoxSidebar = !isSidepanel && Boolean(getFirefoxSidebarAction()?.open);
  const canCloseFirefoxSidebar = isSidepanel && Boolean(getFirefoxSidebarAction()?.close);
  const isPollingActive = snapshot.pollingActive;
  const shouldShowPersistentMailboxError =
    Boolean(snapshot.error) &&
    !(
      sidebarActionStatus.tone === 'error' &&
      sidebarActionStatus.source === 'mailbox' &&
      sidebarActionStatus.message === snapshot.error
    );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (
      snapshot.address &&
      autofillStatus.tone === 'error' &&
      autofillStatus.message === MAILBOX_AUTOFILL_MISSING_MAILBOX_MESSAGE
    ) {
      setAutofillStatus({ tone: 'idle', message: MAILBOX_AUTOFILL_IDLE_MESSAGE });
    }
  }, [autofillStatus, snapshot.address]);

  useEffect(() => {
    if (sidebarActionStatus.tone === 'idle') {
      return undefined;
    }

    const timeout = window.setTimeout(
      () => {
        setSidebarActionStatus({ tone: 'idle', message: '', source: null });
      },
      sidebarActionStatus.tone === 'success' ? 2200 : 5000,
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [sidebarActionStatus]);

  useEffect(() => {
    function handleVisibilityChange() {
      setIsVisible(document.visibilityState === 'visible');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useMailboxUiVisibilityReporting(isVisible);

  function reportUiActionFailure(
    action: 'open-sidebar' | 'close-sidebar' | 'open-full-page' | 'open-settings' | 'copy-address',
    error: unknown,
  ) {
    const message =
      action === 'open-sidebar'
        ? 'Failed to open sidebar'
        : action === 'close-sidebar'
          ? 'Failed to close sidebar'
          : action === 'open-full-page'
            ? 'Failed to open full-page mailbox'
            : action === 'copy-address'
              ? 'Could not copy address to clipboard'
              : 'Failed to open settings';
    console.error(message, error);
    setSidebarActionStatus({ tone: 'error', message, source: 'ui' });
  }

  function clearUiActionError() {
    setSidebarActionStatus((currentStatus) =>
      currentStatus.source === 'ui' ? { tone: 'idle', message: '', source: null } : currentStatus,
    );
  }

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      const response = await sendMailboxCommand({ type: 'mailbox:get-state' }).catch((error) =>
        toTransportFailureResponse(error, { type: 'mailbox:get-state' }, snapshotRef.current),
      );
      if (!disposed) setSnapshot(response.snapshot);
    }

    void loadState();
    const interval = window.setInterval(loadState, isVisible ? 500 : 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [isVisible]);

  async function runCommand(command: MailboxCommand) {
    if (command.type === 'mailbox:open-message') {
      setPendingMessageId(command.messageId);
    }

    setIsBusy(true);
    try {
      const response = await sendMailboxCommand(command).catch((error) =>
        toTransportFailureResponse(error, command, snapshotRef.current),
      );
      setSnapshot(response.snapshot);

      if (!response.ok) {
        setSidebarActionStatus({ tone: 'error', message: response.error, source: 'mailbox' });
      } else if (response.snapshot.error) {
        setSidebarActionStatus({
          tone: 'error',
          message: response.snapshot.error,
          source: 'mailbox',
        });
      } else if (command.type === 'mailbox:create') {
        setSidebarActionStatus({
          tone: 'success',
          message: 'Temporary mailbox created.',
          source: 'mailbox',
        });
      } else if (command.type === 'mailbox:refresh') {
        setSidebarActionStatus({
          tone: 'success',
          message: 'Mailbox refreshed.',
          source: 'mailbox',
        });
      } else if (command.type === 'mailbox:discard') {
        setSidebarActionStatus({
          tone: 'success',
          message: 'Mailbox discarded.',
          source: 'mailbox',
        });
      } else {
        setSidebarActionStatus((currentStatus) =>
          currentStatus.source === 'mailbox'
            ? { tone: 'idle', message: '', source: null }
            : currentStatus,
        );
      }
    } finally {
      if (command.type === 'mailbox:open-message') {
        setPendingMessageId(null);
      }
      setIsBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) return;

    try {
      await copyTextToClipboard(snapshot.address);
      flash();
      clearUiActionError();
    } catch (error) {
      reportUiActionFailure('copy-address', error);
    }
  }

  async function autofillCurrentPage() {
    setIsBusy(true);

    try {
      await runMailboxAutofillFlow({
        snapshotAddress: snapshot.address,
        setAutofillStatus,
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function openAutofillSettings() {
    await callWebExtensionApi('runtime', 'openOptionsPage');
    clearUiActionError();
    if (!isSidepanel) {
      window.close();
    }
  }

  return (
    <main
      className={`flex h-full min-h-0 w-full font-body text-ink antialiased ${
        isSidepanel ? 'overflow-hidden bg-void' : 'bg-void'
      }`}
    >
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-y-auto ${
          isSidepanel ? 'sidepanel-scroll-region' : 'popup-scroll-region'
        }`}
      >
        <header className='animate-fade-in px-3 pt-4 pb-3 sm:px-4 sm:pt-5 sm:pb-4'>
          <div className='flex items-baseline justify-between'>
            <h1 className='font-brand text-2xl font-bold tracking-tight'>SudoFill</h1>
            <div className='flex items-center gap-2'>
              {canOpenFirefoxSidebar && (
                <button
                  className='flex cursor-pointer items-center gap-1 rounded-md border border-border-dim bg-surface-raised px-2 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                  disabled={isBusy}
                  onClick={() => {
                    void openFirefoxSidebar()
                      .then(() => {
                        clearUiActionError();
                        if (!isSidepanel) {
                          window.close();
                        }
                      })
                      .catch((error) => reportUiActionFailure('open-sidebar', error));
                  }}
                  type='button'
                >
                  <ArrowRight className='h-3 w-3' />
                  Open sidebar
                </button>
              )}
              <button
                className='flex cursor-pointer items-center gap-1 rounded-md border border-border-dim bg-surface-raised px-2 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                disabled={isBusy}
                onClick={() => {
                  void openFullMailboxPage()
                    .then(() => clearUiActionError())
                    .catch((error) => reportUiActionFailure('open-full-page', error));
                }}
                type='button'
              >
                <ExternalLink className='h-3 w-3' />
                Full page
              </button>
              {snapshot.unreadCount > 0 && (
                <span className='flex items-center gap-1.5 rounded-full bg-unread-bg px-2.5 py-0.5 text-xs font-medium text-unread'>
                  <span className='inline-block h-1.5 w-1.5 animate-pulse-unread rounded-full bg-unread' />
                  {snapshot.unreadCount} new
                </span>
              )}
              {canCloseFirefoxSidebar && (
                <button
                  aria-label='Close sidebar'
                  className='flex cursor-pointer items-center justify-center rounded-md border border-border-dim bg-surface-raised p-1.5 text-ink-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                  disabled={isBusy}
                  onClick={() => {
                    void closeFirefoxSidebar()
                      .then(() => clearUiActionError())
                      .catch((error) => reportUiActionFailure('close-sidebar', error));
                  }}
                  type='button'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>
          {isSidepanel && (
            <p className='mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary'>
              Generate a temporary inbox, autofill signup forms, and review verification links
              without leaving the page.
            </p>
          )}
        </header>

        <div className='animate-fade-in px-3 pb-4 sm:px-4' style={{ animationDelay: '60ms' }}>
          <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
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
                    onClick={() => void copyAddress()}
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
                    onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isBusy || isPollingActive ? 'animate-[spin_2s_linear_infinite]' : ''}`}
                    />
                    Refresh
                  </button>
                  <button
                    className='flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1'
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

        {sidebarActionStatus.tone === 'error' && (
          <div className='animate-fade-in px-3 pb-4 sm:px-4'>
            <div
              aria-atomic='true'
              aria-live='assertive'
              className='rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger'
              role='alert'
            >
              <p>{sidebarActionStatus.message}</p>
            </div>
          </div>
        )}
        {sidebarActionStatus.tone === 'success' && (
          <div className='animate-fade-in px-3 pb-4 sm:px-4'>
            <div
              aria-atomic='true'
              aria-live='polite'
              className='rounded-lg border border-accent/25 bg-accent-bg px-4 py-3 text-xs text-accent'
              role='status'
            >
              <p>{sidebarActionStatus.message}</p>
            </div>
          </div>
        )}

        <div className='animate-fade-in px-3 pb-4 sm:px-4' style={{ animationDelay: '90ms' }}>
          <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
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
                  onClick={() => void autofillCurrentPage()}
                  type='button'
                >
                  <WandSparkles className='h-3.5 w-3.5' />
                  Autofill page
                </button>
                <button
                  className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1'
                  disabled={isBusy}
                  onClick={() =>
                    void openAutofillSettings().catch((error) =>
                      reportUiActionFailure('open-settings', error),
                    )
                  }
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

        {shouldShowPersistentMailboxError && snapshot.error && (
          <div className='animate-fade-in px-3 pb-4 sm:px-4'>
            <div className='space-y-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger'>
              <p>{snapshot.error}</p>
              {snapshot.diagnostics && (
                <p className='text-[10px] uppercase tracking-[0.16em] text-danger/80'>
                  {snapshot.diagnostics.command ?? 'mailbox'}
                  {snapshot.diagnostics.phase ? ` · ${snapshot.diagnostics.phase}` : ''}
                  {snapshot.diagnostics.errorType ? ` · ${snapshot.diagnostics.errorType}` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {snapshot.address && (
          <div className='animate-fade-in px-3 pb-5 sm:px-4' style={{ animationDelay: '120ms' }}>
            <div className='w-full overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
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
                          pendingMessageId === message.id ||
                          snapshot.selectedMessageId === message.id
                            ? 'bg-accent-bg'
                            : 'hover:bg-surface-hover'
                        }`}
                        disabled={isBusy}
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
                  <MessagePanel
                    isSidepanel={isSidepanel}
                    onOpenLink={(url) => void runCommand({ type: 'mailbox:open-link', url })}
                    pendingMessageId={pendingMessageId}
                    snapshot={snapshot}
                  />
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
        )}
      </div>
    </main>
  );
}
