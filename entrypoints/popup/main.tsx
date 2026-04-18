import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

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

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.snapshot;
}

function MessagePanel({
  snapshot,
  onOpenLink,
}: {
  snapshot: MailboxSnapshot;
  onOpenLink: (url: string) => void;
}) {
  if (!snapshot.selectedMessage) {
    return (
      <section className='flex min-h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white/90 p-4 text-center text-sm text-slate-500 shadow-sm'>
        Select an email to read it here.
      </section>
    );
  }

  const message = snapshot.selectedMessage;

  return (
    <section className='space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='space-y-1'>
        <p className='text-xs font-medium uppercase tracking-[0.24em] text-slate-500'>Message</p>
        <h2 className='text-lg font-semibold text-slate-950'>{message.subject}</h2>
        <p className='text-xs text-slate-500'>{message.from}</p>
      </div>

      {message.links.length > 0 ? (
        <div className='space-y-2'>
          <p className='text-xs font-medium uppercase tracking-[0.2em] text-slate-500'>
            Verification links
          </p>
          <div className='flex flex-wrap gap-2'>
            {message.links.map((link) => (
              <button
                key={link.url}
                className='rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100'
                onClick={() => onOpenLink(link.url)}
                type='button'
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className='space-y-3 text-sm text-slate-700'>
        {message.text ? <pre className='whitespace-pre-wrap font-sans'>{message.text}</pre> : null}
        {!message.text && message.html ? (
          <div className='rounded-2xl bg-slate-50 p-3 text-xs text-slate-600'>
            HTML email received. Open the detected link above if available.
          </div>
        ) : null}
        {!message.text && !message.html ? <p>No readable email body was returned.</p> : null}
      </div>
    </section>
  );
}

function PopupApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(EMPTY_MAILBOX_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function loadState() {
      try {
        const nextSnapshot = await sendMailboxCommand({ type: 'mailbox:get-state' });
        if (!disposed) {
          setSnapshot(nextSnapshot);
        }
      } catch (error) {
        if (!disposed) {
          setSnapshot((current) => ({
            ...current,
            error: error instanceof Error ? error.message : 'Failed to load mailbox state',
          }));
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
      const nextSnapshot = await sendMailboxCommand(command);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Mailbox request failed',
      }));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) {
      return;
    }

    await navigator.clipboard.writeText(snapshot.address);
  }

  return (
    <main className='min-h-screen bg-slate-50 p-4 text-slate-950'>
      <div className='mx-auto flex w-full max-w-md flex-col gap-4'>
        <section className='rounded-[28px] bg-slate-950 p-5 text-white shadow-lg'>
          <div className='space-y-2'>
            <p className='text-xs font-medium uppercase tracking-[0.24em] text-slate-400'>
              SudoFill
            </p>
            <h1 className='text-2xl font-semibold'>Temp mailbox</h1>
            <p className='text-sm text-slate-300'>
              Create a disposable inbox, keep polling while the session is active, and open
              verification emails fast.
            </p>
          </div>

          <div className='mt-5 rounded-3xl bg-white/8 p-4'>
            {snapshot.address ? (
              <div className='space-y-3'>
                <p className='break-all text-sm font-medium'>{snapshot.address}</p>
                <div className='flex gap-2'>
                  <button
                    className='flex-1 rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300'
                    disabled={isBusy}
                    onClick={() => void copyAddress()}
                    type='button'
                  >
                    Copy address
                  </button>
                  <button
                    className='rounded-2xl border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={isBusy}
                    onClick={() => void runCommand({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <button
                className='w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300'
                disabled={isBusy || snapshot.status === 'creating'}
                onClick={() => void runCommand({ type: 'mailbox:create' })}
                type='button'
              >
                {snapshot.status === 'creating' ? 'Creating mailbox...' : 'Create temp email'}
              </button>
            )}
          </div>

          <div className='mt-4 flex items-center justify-between text-xs text-slate-300'>
            <span>{snapshot.unreadCount} unread</span>
            <span>
              {snapshot.lastCheckedAt
                ? `Checked ${formatTimestamp(snapshot.lastCheckedAt)}`
                : 'Not checked yet'}
            </span>
          </div>
        </section>

        {snapshot.error ? (
          <section className='rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm'>
            {snapshot.error}
          </section>
        ) : null}

        {snapshot.address ? (
          <>
            <section className='rounded-3xl border border-slate-200 bg-white p-4 shadow-sm'>
              <div className='mb-3 flex items-center justify-between'>
                <div>
                  <p className='text-xs font-medium uppercase tracking-[0.2em] text-slate-500'>
                    Inbox
                  </p>
                  <h2 className='text-lg font-semibold text-slate-950'>Incoming mail</h2>
                </div>
                <button
                  className='text-sm font-medium text-slate-500 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-300'
                  disabled={isBusy}
                  onClick={() => void runCommand({ type: 'mailbox:discard' })}
                  type='button'
                >
                  Discard
                </button>
              </div>

              <div className='space-y-2'>
                {snapshot.messages.length > 0 ? (
                  snapshot.messages.map((message) => (
                    <button
                      key={message.id}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        snapshot.selectedMessageId === message.id
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                      onClick={() =>
                        void runCommand({ type: 'mailbox:open-message', messageId: message.id })
                      }
                      type='button'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0 space-y-1'>
                          <div className='flex items-center gap-2'>
                            {!message.seen ? (
                              <span className='h-2.5 w-2.5 rounded-full bg-blue-500' />
                            ) : null}
                            <p className='truncate text-sm font-semibold text-slate-950'>
                              {message.subject}
                            </p>
                          </div>
                          <p className='truncate text-xs text-slate-500'>{message.from}</p>
                          <p className='line-clamp-2 text-sm text-slate-600'>{message.intro}</p>
                        </div>
                        <p className='shrink-0 text-xs text-slate-400'>
                          {formatTimestamp(message.createdAt)}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className='rounded-2xl bg-slate-50 p-4 text-sm text-slate-500'>
                    Nothing received yet. Keep the mailbox active and refresh if you just signed up.
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
          <section className='rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm'>
            The mailbox is session-only. Close the popup if you want; the extension will keep trying
            to poll while the browser session remains active.
          </section>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);
