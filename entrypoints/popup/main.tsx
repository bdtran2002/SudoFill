import { createRoot } from 'react-dom/client';

import '../../src/styles.css';

function PopupApp() {
  return (
    <main className='flex min-h-screen flex-col justify-between bg-slate-50 p-4 text-slate-950'>
      <div className='space-y-2'>
        <p className='text-xs font-medium uppercase tracking-[0.24em] text-slate-500'>SudoFill</p>
        <h1 className='text-2xl font-semibold'>Extension scaffold</h1>
        <p className='text-sm text-slate-600'>
          Popup, options, background, and content entrypoints are ready.
        </p>
      </div>
      <div className='rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm'>
        Business logic is intentionally deferred to later commits.
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);
