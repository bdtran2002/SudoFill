import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/styles.css';
import { MailboxApp } from '../../src/features/email/mailbox-app';

type FirefoxSidebarApi = {
  sidebarAction?: {
    open?: () => Promise<void>;
  };
};

function getFirefoxSidebarApi(): FirefoxSidebarApi | undefined {
  return (
    globalThis as typeof globalThis & {
      browser?: FirefoxSidebarApi;
    }
  ).browser;
}

function PopupRoot() {
  const [mode, setMode] = useState<'opening' | 'fallback'>('opening');

  useEffect(() => {
    const browserApi = getFirefoxSidebarApi();

    if (!browserApi?.sidebarAction?.open) {
      setMode('fallback');
      return;
    }

    let isDisposed = false;

    void browserApi.sidebarAction
      .open()
      .then(() => {
        if (!isDisposed) {
          window.close();
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setMode('fallback');
        }
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  if (mode === 'fallback') {
    return <MailboxApp />;
  }

  return (
    <main className='flex h-full min-h-0 w-full items-center justify-center bg-void px-4 text-center font-body text-ink antialiased'>
      <div className='space-y-2'>
        <p className='font-brand text-xl font-semibold tracking-tight'>Opening SudoFill…</p>
        <p className='text-sm text-ink-secondary'>Reopening the extension pane.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupRoot />);
