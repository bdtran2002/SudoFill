import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEventHandler, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, ChevronUp, Mail, RotateCcw, Save, Settings } from 'lucide-react';

import '../../src/styles.css';
import {
  AUTOFILL_SEX_OPTIONS,
  DEFAULT_AUTOFILL_SETTINGS,
  US_STATE_OPTIONS,
} from '../../src/features/autofill/constants';
import {
  getStoredAutofillSettings,
  isAutofillAgeRangeValid,
  setStoredAutofillSettings,
} from '../../src/features/autofill/settings';
import type { AutofillSettings } from '../../src/features/autofill/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function OptionsApp() {
  const [settings, setSettings] = useState<AutofillSettings>(DEFAULT_AUTOFILL_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hint, setHint] = useState('');
  const statusTimeoutRef = useRef<number | null>(null);
  const mailboxUrl = chrome.runtime.getURL('mailbox.html');
  const settingsUrl = chrome.runtime.getURL('options.html');

  function clearStatusTimeout() {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
  }

  function scheduleIdleStatus(delayMs: number) {
    clearStatusTimeout();
    statusTimeoutRef.current = window.setTimeout(() => {
      setSaveState('idle');
      statusTimeoutRef.current = null;
    }, delayMs);
  }

  useEffect(() => {
    let mounted = true;

    void getStoredAutofillSettings()
      .then((loaded) => {
        if (mounted) {
          setSettings(loaded);
          setHint('');
        }
      })
      .catch((error) => {
        if (mounted) {
          setSaveState('error');
          setHint(
            `Error reading settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      });

    return () => {
      mounted = false;
      clearStatusTimeout();
    };
  }, []);

  const canSave = useMemo(() => isAutofillAgeRangeValid(settings), [settings]);
  const ageHasError = !canSave && Boolean(settings.ageMin || settings.ageMax);

  async function persistSettings(
    next: AutofillSettings,
    successHint: string,
    errorHint: string,
    idleDelay: number,
  ) {
    if (saveState === 'saving') {
      return;
    }

    clearStatusTimeout();
    setSaveState('saving');
    setHint('');

    try {
      await setStoredAutofillSettings(next);
      setSaveState('saved');
      setHint(successHint);
      scheduleIdleStatus(idleDelay);
    } catch {
      setSaveState('error');
      setHint(errorHint);
    }
  }

  async function saveSettings() {
    if (!canSave) {
      setSaveState('error');
      setHint('Check the age range before saving.');
      return;
    }

    await persistSettings(settings, 'Saved to browser storage.', 'Could not save settings.', 1800);
  }

  async function resetSettings() {
    const previousSettings = settings;

    setSettings(DEFAULT_AUTOFILL_SETTINGS);
    clearStatusTimeout();
    setSaveState('saving');
    setHint('');

    try {
      await setStoredAutofillSettings(DEFAULT_AUTOFILL_SETTINGS);
      setSaveState('saved');
      setHint('Reset to defaults.');
      scheduleIdleStatus(1200);
    } catch {
      setSettings(previousSettings);
      setSaveState('error');
      setHint('Could not reset settings.');
    }
  }

  return (
    <main className='min-h-screen bg-void px-5 py-6 font-body text-ink antialiased sm:px-6 sm:py-8'>
      <div className='mx-auto flex w-full max-w-3xl flex-col'>
        <header className='animate-fade-in px-1 pb-4 sm:px-0'>
          <div className='flex min-h-14 flex-wrap items-center justify-between gap-4 border-b border-border-dim pb-4'>
            <div className='flex min-w-0 items-center gap-3'>
              <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white'>
                <Settings className='h-4 w-4' />
              </div>
              <div>
                <p className='text-lg font-semibold tracking-tight text-ink'>SudoFill Settings</p>
                <p className='text-xs text-ink-muted'>
                  Adjust autofill defaults used by the popup and sidebar
                </p>
              </div>
            </div>
            <nav className='flex items-center gap-1 rounded-lg border border-border-dim bg-surface-raised p-1'>
              <a
                className='inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink'
                href={mailboxUrl}
              >
                <Mail className='h-4 w-4' />
                Mailbox
              </a>
              <a
                className='inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white'
                href={settingsUrl}
              >
                <Settings className='h-4 w-4' />
                Settings
              </a>
            </nav>
          </div>
          <p className='mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary'>
            Tune the generated profile used by SudoFill autofill. Keep it broad for flexibility, or
            narrow it just enough for your workflow.
          </p>
        </header>

        <section
          className='animate-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow-[0_18px_60px_rgba(0,0,0,0.22)]'
          style={{ animationDelay: '60ms' }}
        >
          <div className='border-b border-border-dim bg-[linear-gradient(135deg,rgba(239,75,75,0.12),transparent_55%)] px-4 py-3 sm:px-5'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted'>
              Autofill defaults
            </p>
            <p className='mt-1 text-sm leading-relaxed text-ink-secondary'>
              These values shape the identity details SudoFill generates when filling a form.
            </p>
          </div>

          <div className='divide-y divide-border-dim'>
            <SettingSection
              description='Generate street, city, state, and postal details for forms that ask for a mailing address.'
              title='Generated address'
            >
              <ToggleField
                checked={settings.generateAddress}
                onChange={(checked) =>
                  setSettings((current) => ({ ...current, generateAddress: checked }))
                }
              />
            </SettingSection>

            <SettingSection
              description='Restrict generated profiles to a specific state when a form asks for one.'
              title='State'
            >
              <SelectField
                ariaLabel='State'
                onChange={(event) =>
                  setSettings((current) => ({ ...current, state: event.target.value }))
                }
                value={settings.state}
              >
                {US_STATE_OPTIONS.map((option) => (
                  <option key={option.name} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </SelectField>
            </SettingSection>

            <SettingSection
              description='Leave blank to keep age flexible, or set a small range to avoid outliers.'
              title='Age range'
            >
              <div className='grid grid-cols-2 gap-3'>
                <AgeField
                  fallbackValue={18}
                  invalid={ageHasError}
                  label='Min'
                  max={99}
                  min={18}
                  onChange={(next) => setSettings((current) => ({ ...current, ageMin: next }))}
                  placeholder='18'
                  value={settings.ageMin}
                />
                <AgeField
                  fallbackValue={99}
                  invalid={ageHasError}
                  label='Max'
                  max={99}
                  min={18}
                  onChange={(next) => setSettings((current) => ({ ...current, ageMax: next }))}
                  placeholder='99'
                  value={settings.ageMax}
                />
              </div>
            </SettingSection>

            <SettingSection
              description='Bias generated names and profile data toward a sex when the site needs one.'
              title='Sex'
            >
              <SelectField
                ariaLabel='Sex'
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    sex: event.target.value as AutofillSettings['sex'],
                  }))
                }
                value={settings.sex}
              >
                {AUTOFILL_SEX_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </SettingSection>
          </div>

          <div className='flex flex-col gap-3 border-t border-border-dim bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
            <div className='space-y-0.5'>
              <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                Status
              </p>
              <p className={`text-sm ${canSave ? 'text-ink-secondary' : 'text-danger'}`}>
                {hint || (canSave ? 'Ready to save.' : 'Fix the age range before saving.')}
              </p>
            </div>

            <div className='flex gap-2'>
              <button
                className='inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'
                disabled={saveState === 'saving'}
                onClick={() => void resetSettings()}
                type='button'
              >
                <RotateCcw className='h-3.5 w-3.5' />
                Reset
              </button>
              <button
                className='inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                disabled={saveState === 'saving' || !canSave}
                onClick={() => void saveSettings()}
                type='button'
              >
                <Save className='h-3.5 w-3.5' />
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className='grid gap-4 px-4 py-4 sm:px-5 sm:py-5 md:grid-cols-[1fr_auto] md:items-start'>
      <div className='space-y-1'>
        <h2 className='text-sm font-semibold text-ink sm:text-base'>{title}</h2>
        <p className='max-w-md text-sm leading-relaxed text-ink-secondary'>{description}</p>
      </div>
      <div className='md:min-w-64'>{children}</div>
    </div>
  );
}

function SelectField({
  ariaLabel,
  value,
  onChange,
  children,
}: {
  ariaLabel: string;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
}) {
  return (
    <div className='relative'>
      <select
        aria-label={ariaLabel}
        className='w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20'
        onChange={onChange}
        value={value}
      >
        {children}
      </select>
      <ChevronDown className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted' />
    </div>
  );
}

function AgeField({
  label,
  invalid,
  value,
  placeholder,
  fallbackValue,
  min,
  max,
  onChange,
}: {
  label: string;
  invalid?: boolean;
  value: string;
  placeholder: string;
  fallbackValue: number;
  min: number;
  max: number;
  onChange: (next: string) => void;
}) {
  const current = value === '' ? NaN : Number(value);

  function stepAge(delta: 1 | -1) {
    if (!Number.isFinite(current)) {
      onChange(String(fallbackValue));
      return;
    }

    onChange(String(Math.min(max, Math.max(min, current + delta))));
  }

  return (
    <label className='block'>
      <span className='mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
        {label}
      </span>
      <div
        className={`flex items-center gap-1 rounded-lg border bg-surface px-2 py-2.5 transition-colors ${
          invalid
            ? 'border-danger-border focus-within:ring-2 focus-within:ring-danger/20'
            : 'border-border focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20'
        }`}
      >
        <input
          className='min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted'
          inputMode='numeric'
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
          pattern='[0-9]*'
          placeholder={placeholder}
          type='text'
          value={value}
        />
        <div className='flex flex-col overflow-hidden rounded-md border border-border-dim bg-surface-raised'>
          <button
            aria-label={`Increase ${label.toLowerCase()}`}
            className='grid h-5 w-6 place-items-center text-ink-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35'
            disabled={Number.isFinite(current) ? current >= max : false}
            onClick={() => stepAge(1)}
            type='button'
          >
            <ChevronUp className='h-3 w-3' />
          </button>
          <button
            aria-label={`Decrease ${label.toLowerCase()}`}
            className='grid h-5 w-6 place-items-center border-t border-border-dim text-ink-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35'
            disabled={Number.isFinite(current) ? current <= min : false}
            onClick={() => stepAge(-1)}
            type='button'
          >
            <ChevronDown className='h-3 w-3' />
          </button>
        </div>
      </div>
    </label>
  );
}

function ToggleField({
  ariaLabel = 'Toggle setting',
  checked,
  disabledLabel = 'Disabled',
  enabledLabel = 'Enabled',
  onChange,
}: {
  ariaLabel?: string;
  checked: boolean;
  disabledLabel?: string;
  enabledLabel?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`group inline-flex items-center gap-3 rounded-full border px-3 py-2 transition-colors ${
        checked
          ? 'border-accent/30 bg-accent-bg text-ink'
          : 'border-border bg-surface text-ink-secondary'
      }`}
      onClick={() => onChange(!checked)}
      role='switch'
      type='button'
    >
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-void shadow-sm transition-transform ${
            checked ? 'translate-x-0' : '-translate-x-5'
          }`}
        />
      </span>
      <span className='text-sm font-medium'>{checked ? enabledLabel : disabledLabel}</span>
    </button>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsApp />);
