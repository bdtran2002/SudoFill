import '../../src/styles.css';
import {
  ArrowRight,
  Copy,
  ExternalLink,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Inbox,
  Bookmark,
  Clock3,
  History,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

type MessageLink = {
  label: string;
  url: string;
};

type MailMessage = {
  id: string;
  from: string;
  subject: string;
  intro: string;
  createdAt: string;
  seen: boolean;
  text?: string | null;
  html?: string | null;
  links: MessageLink[];
};

type MailboxSnapshot = {
  status: 'idle' | 'creating' | 'active' | 'error';
  address: string | null;
  unreadCount: number;
  messages: MailMessage[];
  selectedMessageId: string | null;
  selectedMessage: MailMessage | null;
  lastCheckedAt: string | null;
  error: string | null;
};

type SavedEmailTemplate = {
  id: string;
  name: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type EmailHistoryItem = {
  id: string;
  address: string;
  action: 'created' | 'reused' | 'deleted' | 'edited';
  createdAt: string;
};

type EmailVersion = {
  id: string;
  templateId: string;
  address: string;
  notes: string;
  createdAt: string;
};

const initialSnapshot: MailboxSnapshot = {
  status: 'idle',
  address: null,
  unreadCount: 0,
  messages: [],
  selectedMessageId: null,
  selectedMessage: null,
  lastCheckedAt: null,
  error: null,
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

async function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  // First ensure the background is ready
  await chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});

  // Small delay to allow service worker to start
  await new Promise((r) => setTimeout(r, 100));

  const response = await chrome.runtime.sendMessage(message);

  if (response === undefined) {
    throw new Error('Background did not respond. Try reloading the extension.');
  }

  return response as T;
}

function useCopyFlash() {
  const [copied, setCopied] = useState(false);

  function flash() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return { copied, flash };
}

function MessageDetail({
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

function PopupApp() {
  const [snapshot, setSnapshot] = useState<MailboxSnapshot>(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedEmailTemplate[]>([]);
  const [historyItems, setHistoryItems] = useState<EmailHistoryItem[]>([]);
  const [versions, setVersions] = useState<EmailVersion[]>([]);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const { copied, flash } = useCopyFlash();

  useEffect(() => {
    let stopped = false;

    async function loadState() {
      try {
        const response = await sendRuntimeMessage<{ snapshot: MailboxSnapshot }>({
          type: 'mailbox:get-state',
        });

        if (!stopped) {
          setSnapshot(response.snapshot);
        }
      } catch (error) {
        if (!stopped) {
          setSnapshot((current) => ({
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'Background script is not responding.',
          }));
        }
      }
    }

    async function loadSavedData() {
      try {
        const response = await sendRuntimeMessage<{
          templates: SavedEmailTemplate[];
          history: EmailHistoryItem[];
          versions: EmailVersion[];
        }>({
          type: 'saved:list',
        });

        if (!stopped) {
          setSavedTemplates(response.templates);
          setHistoryItems(response.history);
          setVersions(response.versions);
        }
      } catch {
        // Ignore saved data errors for now
      }
    }

    void loadState();
    void loadSavedData();

    const intervalId = window.setInterval(async () => {
      setSyncing(true);
      try {
        const response = await sendRuntimeMessage<{ snapshot: MailboxSnapshot }>({
          type: 'mailbox:get-state',
        });
        if (!stopped) {
          if (response.snapshot.messages.length > lastMessageCount) {
            setLastMessageCount(response.snapshot.messages.length);
          }
          setSnapshot(response.snapshot);
        }
      } catch {
        // Ignore polling errors
      }
      setSyncing(false);
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [lastMessageCount]);

  async function reloadSavedData() {
    const response = await sendRuntimeMessage<{
      templates: SavedEmailTemplate[];
      history: EmailHistoryItem[];
      versions: EmailVersion[];
    }>({
      type: 'saved:list',
    });

    setSavedTemplates(response.templates);
    setHistoryItems(response.history);
    setVersions(response.versions);
  }

  async function runAction(message: unknown) {
    setBusy(true);

    try {
      const response = await sendRuntimeMessage<{ snapshot: MailboxSnapshot }>(message);
      setSnapshot(response.snapshot);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown background error';

      setSnapshot((current) => ({
        ...current,
        status: current.address ? 'active' : 'error',
        error: messageText,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot.address) {
      return;
    }

    await navigator.clipboard.writeText(snapshot.address);
    flash();
  }

  async function saveCurrentAddress() {
    if (!snapshot.address) {
      return;
    }

    const defaultName = `Saved ${new Date().toLocaleDateString()}`;

    await sendRuntimeMessage({
      type: 'saved:create',
      name: defaultName,
      address: snapshot.address,
      notes: '',
    });

    await reloadSavedData();
  }

  async function reuseSavedTemplate(templateId: string) {
    const response = await sendRuntimeMessage<{
      ok: boolean;
      template?: SavedEmailTemplate;
      error?: string;
    }>({
      type: 'saved:reuse',
      id: templateId,
    });

    if (response.ok && response.template) {
      await navigator.clipboard.writeText(response.template.address);
      flash();
      await reloadSavedData();
    }
  }

  return (
    <main className='min-h-screen bg-void font-body text-ink antialiased'>
      <div className='mx-auto max-w-md'>
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
                    disabled={busy}
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
                    disabled={busy}
                    onClick={() => void runAction({ type: 'mailbox:refresh' })}
                    type='button'
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>

                  <button
                    className='flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-danger-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={busy}
                    onClick={() => void runAction({ type: 'mailbox:discard' })}
                    type='button'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    Discard
                  </button>
                </div>

                <div className='mt-3'>
                  <button
                    className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                    disabled={busy}
                    onClick={() => void saveCurrentAddress()}
                    type='button'
                  >
                    <Bookmark className='h-3.5 w-3.5' />
                    Save this email
                  </button>
                </div>
              </div>
            ) : (
              <div className='p-4'>
                <button
                  className='flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                  disabled={busy || snapshot.status === 'creating'}
                  onClick={() => void runAction({ type: 'mailbox:create' })}
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
                {syncing ? (
                  <span className='flex items-center gap-1'>
                    <RefreshCw className='h-2.5 w-2.5 animate-spin' />
                    Syncing
                  </span>
                ) : snapshot.status === 'idle' ? (
                  'Idle'
                ) : snapshot.status === 'creating' ? (
                  'Creating'
                ) : snapshot.status === 'error' ? (
                  'Error'
                ) : (
                  'Active'
                )}
              </span>

              <span>
                {snapshot.lastCheckedAt
                  ? formatTimestamp(snapshot.lastCheckedAt)
                  : 'Not checked yet'}
              </span>
            </div>
          </div>
        </div>

        <div className='animate-fade-in px-5 pb-4' style={{ animationDelay: '90ms' }}>
          <div className='overflow-hidden rounded-xl border border-border bg-surface'>
            <div className='border-b border-border-dim px-4 py-3'>
              <p className='flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                <Inbox className='h-3.5 w-3.5' />
                Load inbox
              </p>
            </div>

            <div className='p-4'>
              <p className='text-xs leading-relaxed text-ink-muted'>
                Load the latest inbox messages from your current temporary email.
              </p>

              <button
                className='mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
                disabled={busy || !snapshot.address}
                onClick={() => void runAction({ type: 'mailbox:refresh' })}
                type='button'
              >
                <Inbox className='h-4 w-4' />
                {snapshot.address ? 'Load inbox now' : 'Create email first'}
              </button>
            </div>
          </div>
        </div>

        {snapshot.error && (
          <div className='animate-fade-in px-5 pb-4'>
            <div className='rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger'>
              {snapshot.error}
            </div>
          </div>
        )}

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
                        void runAction({
                          type: 'mailbox:open-message',
                          messageId: message.id,
                        })
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
                              message.seen
                                ? 'font-medium text-ink-secondary'
                                : 'font-semibold text-ink'
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
                  <p className='text-xs'>Click “Load inbox now” after receiving mail.</p>
                </div>
              )}

              {snapshot.selectedMessage && (
                <MessageDetail
                  onOpenLink={(url) => void runAction({ type: 'mailbox:open-link', url })}
                  snapshot={snapshot}
                />
              )}
            </div>
          </div>
        )}

        <div className='animate-fade-in px-5 pb-5' style={{ animationDelay: '180ms' }}>
          <div className='overflow-hidden rounded-xl border border-border bg-surface'>
            <div className='border-b border-border-dim px-4 py-3'>
              <p className='flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                <Bookmark className='h-3.5 w-3.5' />
                Save & history
              </p>
            </div>

            <div className='space-y-5 p-4'>
              <div>
                <p className='mb-2 flex items-center gap-2 text-sm font-medium text-ink'>
                  <Bookmark className='h-4 w-4 text-ink-muted' />
                  Saved emails
                </p>

                {savedTemplates.length > 0 ? (
                  <div className='space-y-2'>
                    {savedTemplates.slice(0, 3).map((template) => (
                      <div
                        key={template.id}
                        className='rounded-lg border border-border-dim bg-surface-raised px-3 py-2'
                      >
                        <p className='text-sm font-medium text-ink'>{template.name}</p>
                        <p className='mt-1 truncate text-xs text-ink-secondary'>
                          {template.address}
                        </p>
                        <button
                          className='mt-2 text-xs font-medium text-accent hover:text-accent-hover'
                          onClick={() => void reuseSavedTemplate(template.id)}
                          type='button'
                        >
                          Reuse
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-ink-muted'>No saved emails yet.</p>
                )}
              </div>

              <div>
                <p className='mb-2 flex items-center gap-2 text-sm font-medium text-ink'>
                  <Clock3 className='h-4 w-4 text-ink-muted' />
                  Recent history
                </p>

                {historyItems.length > 0 ? (
                  <div className='space-y-2'>
                    {historyItems.slice(0, 3).map((item) => (
                      <div key={item.id} className='text-xs text-ink-secondary'>
                        <span className='font-medium text-ink'>{item.address}</span>
                        <span className='mx-1 text-ink-muted'>•</span>
                        <span>{item.action}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-ink-muted'>No history yet.</p>
                )}
              </div>

              <div>
                <p className='mb-2 flex items-center gap-2 text-sm font-medium text-ink'>
                  <History className='h-4 w-4 text-ink-muted' />
                  Version history
                </p>

                {versions.length > 0 ? (
                  <div className='space-y-2'>
                    {versions.slice(0, 3).map((version) => (
                      <div key={version.id} className='text-xs text-ink-secondary'>
                        <span className='font-medium text-ink'>{version.address}</span>
                        <span className='mx-1 text-ink-muted'>•</span>
                        <span>{formatTimestamp(version.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-ink-muted'>No saved versions yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {snapshot.address && !snapshot.selectedMessage && snapshot.messages.length > 0 && (
          <div className='animate-fade-in px-5 pb-5' style={{ animationDelay: '200ms' }}>
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

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Popup root element not found.');
}

createRoot(rootElement).render(<PopupApp />);
