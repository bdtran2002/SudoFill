import { createRoot } from 'react-dom/client';

import '../../src/styles.css';

function OptionsApp() {
  return (
    <main className='min-h-screen bg-slate-50 px-6 py-10 text-slate-950'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-6'>
        <header className='space-y-2'>
          <p className='text-sm font-medium uppercase tracking-[0.24em] text-slate-500'>SudoFill</p>
          <h1 className='text-3xl font-semibold'>Options scaffold</h1>
          <p className='max-w-2xl text-sm text-slate-600'>
            Settings UI will land in later commits once feature behavior is defined.
          </p>
        </header>
        <section className='rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm'>
          Placeholder options page.
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsApp />);
