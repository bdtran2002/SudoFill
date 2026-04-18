import { createRoot } from 'react-dom/client';
import { Settings } from 'lucide-react';

import '../../src/styles.css';

function OptionsApp() {
  return (
    <main className="min-h-screen bg-void px-6 py-12 font-display text-text-primary antialiased">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="animate-fade-in-up space-y-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-accent">
            SudoFill
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Options</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
            Settings UI will land in later commits once feature behavior is defined.
          </p>
        </header>

        <section className="animate-fade-in-up rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 text-text-muted">
            <Settings className="h-5 w-5 opacity-40" />
            <span className="text-sm">Placeholder options page.</span>
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsApp />);
