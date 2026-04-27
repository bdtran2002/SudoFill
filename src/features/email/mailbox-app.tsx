import { useCallback, useEffect, useRef, useState } from 'react';
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
  fillVerificationCodeOnPage,
  MAILBOX_AUTOFILL_IDLE_MESSAGE,
  MAILBOX_AUTOFILL_MISSING_MAILBOX_MESSAGE,
  runMailboxAutofillFlow,
  sendMailboxCommand,
  toTransportFailureResponse,
  useCopiedFlash,
  useMailboxUiVisibilityReporting,
} from './mailbox-shared';
import { MailboxMessageBody, MailboxVerificationActions } from './mailbox-rendering';
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

function getMostRecentMessage(messages: MailboxSnapshot['messages']) {
  return messages.reduce<MailboxSnapshot['messages'][number] | null>((latest, message) => {
    if (!latest) return message;

    const latestTime = Date.parse(latest.createdAt);
    const messageTime = Date.parse(message.createdAt);

    if (Number.isNaN(latestTime)) return message;
    if (Number.isNaN(messageTime)) return latest;
    return messageTime >= latestTime ? message : latest;
  }, null);
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
  | { tone: 'success'; message: string; source: 'mailbox' | 'ui' }
  | { tone: 'error'; message: string; source: 'mailbox' | 'ui' };

function MessagePanel({
  snapshot,
  onOpenLink,
  onFillCode,
  pendingMessageId,
  inline = false,
}: {
  snapshot: MailboxSnapshot;
  onOpenLink: (url: string) => void;
  onFillCode: (code: string) => void;
  pendingMessageId: string | null;
  inline?: boolean;
}) {
  const isPendingDifferentMessage =
    pendingMessageId !== null && pendingMessageId !== snapshot.selectedMessageId;
  const wrapperClassName = inline
    ? 'animate-fade-in overflow-hidden rounded-b-xl border border-border-dim border-t-0 bg-surface-raised/55 px-4 py-4 shadow-[0_12px_24px_rgba(0,0,0,0.12)]'
    : 'animate-fade-in flex flex-col border-t border-border-dim px-4 py-4';

  if (!snapshot.selectedMessage || isPendingDifferentMessage) {
    return (
      <section className={wrapperClassName}>
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
    <section className={wrapperClassName}>
      <div>
        <h2 className={`font-brand break-words font-semibold leading-snug text-ink ${inline ? 'text-base' : 'text-lg'}`}>
          {message.subject}
        </h2>
        <p className={`${inline ? 'mt-1 text-[11px]' : 'mt-1 text-xs'} break-words text-ink-muted`}>
          {message.from}
        </p>
      </div>

      <MailboxVerificationActions
        onFillCode={onFillCode}
        onOpenLink={onOpenLink}
        verification={message.verification}
      />

      <div className={`${inline ? 'mt-3 text-[13px]' : 'mt-4 text-sm'} overflow-x-hidden leading-relaxed text-ink-secondary`}>
        <MailboxMessageBody message={message} onOpenLink={onOpenLink} />
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
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const previousAddressRef = useRef<string | null>(snapshot.address);
  const manualMessageSelectionRef = useRef(false);
  const autoOpenedMessageIdRef = useRef<string | null>(null);
  const isSidepanel = document.documentElement.classList.contains('sidepanel');
  const canOpenFirefoxSidebar = !isSidepanel && Boolean(getFirefoxSidebarAction()?.open);
  const canCloseFirefoxSidebar = isSidepanel && Boolean(getFirefoxSidebarAction()?.close);
  const isPollingActive = snapshot.pollingActive;
  const hasMailbox = Boolean(snapshot.address);
  const activeInlineMessageId = pendingMessageId ?? snapshot.selectedMessageId;
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
    const previousAddress = previousAddressRef.current;

    if (!previousAddress && snapshot.address) {
      window.requestAnimationFrame(() => {
        scrollRegionRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      });
    }

    if (previousAddress !== snapshot.address) {
      manualMessageSelectionRef.current = false;
      autoOpenedMessageIdRef.current = null;
    }

    previousAddressRef.current = snapshot.address;
  }, [snapshot.address]);

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

  const runCommand = useCallback(async (command: MailboxCommand) => {
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
  }, []);

  async function openMessage(messageId: string, source: 'manual' | 'auto') {
    if (source === 'manual') {
      manualMessageSelectionRef.current = true;
    } else {
      autoOpenedMessageIdRef.current = messageId;
    }

    await runCommand({ type: 'mailbox:open-message', messageId });
  }

  useEffect(() => {
    if (
      !hasMailbox ||
      snapshot.messages.length === 0 ||
      manualMessageSelectionRef.current ||
      pendingMessageId
    ) {
      return;
    }

    const latestMessage = getMostRecentMessage(snapshot.messages);
    if (!latestMessage || snapshot.selectedMessageId === latestMessage.id) {
      return;
    }

    if (autoOpenedMessageIdRef.current === latestMessage.id) {
      return;
    }

    autoOpenedMessageIdRef.current = latestMessage.id;
    void runCommand({ type: 'mailbox:open-message', messageId: latestMessage.id });
  }, [hasMailbox, pendingMessageId, runCommand, snapshot.messages, snapshot.selectedMessageId]);

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

  async function handleFillCode(code: string) {
    try {
      const didFill = await fillVerificationCodeOnPage(code);

      if (didFill) {
        setSidebarActionStatus({
          tone: 'success',
          message: 'Verification code sent to the page.',
          source: 'ui',
        });
      } else {
        setSidebarActionStatus({
          tone: 'error',
          message: 'Could not fill a code field on the page.',
          source: 'ui',
        });
      }
    } catch (error) {
      console.error('Failed to fill verification code on page', error);
      setSidebarActionStatus({
        tone: 'error',
        message: 'Could not fill a code field on the page.',
        source: 'ui',
      });
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
        ref={scrollRegionRef}
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
              {!hasMailbox && (
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
              )}
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

        {hasMailbox ? (
          <div className='animate-fade-in space-y-3 px-3 pb-4 sm:px-4' style={{ animationDelay: '60ms' }}>
            <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
              <div className='p-3'>
                <button
                  className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                  disabled={isBusy}
                  onClick={() => void autofillCurrentPage()}
                  type='button'
                >
                  <WandSparkles className='h-3.5 w-3.5' />
                  Autofill page
                </button>
              </div>
            </div>

            <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
              <div className='p-3'>
                <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                  Address
                </p>
                <div className='mt-2 flex items-center gap-2'>
                  <p className='min-w-0 flex-1 truncate text-sm font-semibold text-accent'>
                    {snapshot.address}
                  </p>
                  <button
                    className='flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void copyAddress()}
                    type='button'
                  >
                    <Copy className='h-3 w-3' />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
              <div className='flex items-center justify-between gap-3 border-b border-border-dim px-3 py-2.5'>
                <div className='flex min-w-0 items-center gap-2'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                    Inbox
                  </p>
                </div>
                <div className='flex items-center gap-1'>
                  <button
                    aria-label='Refresh inbox'
                    className='flex cursor-pointer items-center justify-center rounded-md border border-border-dim bg-surface-raised p-1.5 text-ink-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isBusy || isPollingActive ? 'animate-[spin_2s_linear_infinite]' : ''}`}
                    />
                  </button>
                  <button
                    aria-label='Open full-page mailbox'
                    className='flex cursor-pointer items-center justify-center rounded-md border border-border-dim bg-surface-raised p-1.5 text-ink-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={isBusy}
                    onClick={() => {
                      void openFullMailboxPage()
                        .then(() => clearUiActionError())
                        .catch((error) => reportUiActionFailure('open-full-page', error));
                    }}
                    type='button'
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>

              {snapshot.messages.length > 0 ? (
                <div className='divide-y divide-border-dim'>
                  {snapshot.messages.map((message) => {
                    const isActive = activeInlineMessageId === message.id;

                    return (
                      <div key={message.id} className='border-b border-border-dim last:border-b-0'>
                        <button
                          className={`group flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                            isActive ? 'bg-accent-bg' : 'hover:bg-surface-hover'
                          }`}
                          disabled={isBusy}
                          onClick={() => void openMessage(message.id, 'manual')}
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

                        {isActive && (
                          <MessagePanel
                            inline
                            onFillCode={handleFillCode}
                            onOpenLink={(url) => void runCommand({ type: 'mailbox:open-link', url })}
                            pendingMessageId={pendingMessageId}
                            snapshot={snapshot}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className='flex flex-col items-center gap-2 px-4 py-8 text-center text-ink-muted'>
                  <Mail className='h-5 w-5 opacity-30' />
                  <p className='text-sm'>No messages yet</p>
                  <p className='text-xs'>Keep the mailbox active and refresh after signing up.</p>
                </div>
              )}
            </div>

            <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
              <div className='space-y-3 p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='text-[11px] leading-relaxed text-ink-muted'>
                    <p>{autofillStatus.message}</p>
                    {sidebarActionStatus.tone !== 'idle' && (
                      <p
                        className={`mt-1 ${
                          sidebarActionStatus.tone === 'error' ? 'text-danger' : 'text-accent'
                        }`}
                      >
                        {sidebarActionStatus.message}
                      </p>
                    )}
                    {shouldShowPersistentMailboxError && snapshot.error && (
                      <p className='mt-1 text-danger'>{snapshot.error}</p>
                    )}
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      className='flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                      disabled={isBusy}
                      onClick={() =>
                        void openAutofillSettings().catch((error) =>
                          reportUiActionFailure('open-settings', error),
                        )
                      }
                      type='button'
                    >
                      <SlidersHorizontal className='h-3 w-3' />
                      Settings
                    </button>
                    <button
                      className='flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40'
                      disabled={isBusy}
                      onClick={() => void runCommand({ type: 'mailbox:discard' })}
                      type='button'
                    >
                      <Trash2 className='h-3 w-3' />
                      Discard email
                    </button>
                  </div>
                </div>
                <div className='flex items-center justify-between border-t border-border-dim pt-2 text-[10px] font-medium text-ink-muted'>
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
          </div>
        ) : (
          <>
            <div className='animate-fade-in px-3 pb-4 sm:px-4' style={{ animationDelay: '60ms' }}>
              <div className='overflow-hidden rounded-xl border border-border-dim bg-surface/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
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
          </>
        )}
      </div>
    </main>
  );
}
