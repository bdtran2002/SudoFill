import '../../src/styles.css';
import { createRoot } from 'react-dom/client';

function OptionsApp() {
  return (
    <main className='min-h-screen bg-void px-6 py-14 font-body text-ink antialiased'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-6'>
        <header className='animate-fade-in'>
          <h1 className='font-brand text-4xl font-bold tracking-tight'>SudoFill</h1>
          <p className='mt-1 text-sm text-ink-secondary'>
            Settings will land once feature behavior is defined.
          </p>
        </header>

        <section
          className='animate-fade-in rounded-xl border border-border bg-surface p-6'
          style={{ animationDelay: '60ms' }}
        >
          <div className='flex items-center gap-3 text-ink-muted'>
            <span className='text-sm'>Placeholder options page.</span>
          </div>
        </section>
      </div>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Options root element not found.');
}

createRoot(rootElement).render(<OptionsApp />);
