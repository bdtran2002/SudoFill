import { useEffect, useMemo, useState } from 'react';
import type { ChangeEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, RefreshCw, RotateCcw, Save, Settings } from 'lucide-react';

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
import type { AutofillSettings, GeneratedProfile } from '../../src/features/autofill/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function OptionsApp() {
  const [settings, setSettings] = useState<AutofillSettings>(DEFAULT_AUTOFILL_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hint, setHint] = useState('');
  const [previewSeed, setPreviewSeed] = useState(0);
  const [previewProfile, setPreviewProfile] = useState<GeneratedProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    void getStoredAutofillSettings()
      .then((loaded) => {
        if (mounted) setSettings(loaded);
      })
      .catch(() => {
        if (mounted) setSaveState('error');
      });

    return () => {
      mounted = false;
    };
  }, []);

  const canSave = useMemo(() => isAutofillAgeRangeValid(settings), [settings]);
  const ageHasError = !canSave && Boolean(settings.ageMin || settings.ageMax);
  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      const { generateAutofillProfile } = await import('../../src/features/autofill/profile');

      if (!cancelled) {
        setPreviewProfile(generateAutofillProfile(settings));
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [previewSeed, settings]);

  const previewDob = useMemo(
    () => (previewProfile ? formatPreviewDate(previewProfile.birthDateIso) : 'Loading…'),
    [previewProfile],
  );
  const previewStateLabel = useMemo(
    () =>
      US_STATE_OPTIONS.find((state) => state.code === previewProfile?.state)?.name ||
      previewProfile?.stateName ||
      'Any state',
    [previewProfile],
  );

  async function saveSettings() {
    if (saveState === 'saving') {
      return;
    }

    if (!canSave) {
      setSaveState('error');
      setHint('Check the age range before saving.');
      return;
    }

    setSaveState('saving');
    try {
      await setStoredAutofillSettings(settings);
      setSaveState('saved');
      setHint('Saved to browser storage.');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch {
      setSaveState('error');
      setHint('Could not save settings.');
    }
  }

  async function resetSettings() {
    if (saveState === 'saving') {
      return;
    }

    const next = DEFAULT_AUTOFILL_SETTINGS;
    setSettings(next);
    setHint('Reset to defaults.');
    setSaveState('saving');

    try {
      await setStoredAutofillSettings(next);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch {
      setSaveState('error');
    }
  }

  function regeneratePreview() {
    setPreviewSeed((current) => current + 1);
  }

  return (
    <main className='min-h-screen bg-void px-5 py-6 font-body text-ink antialiased sm:px-6 sm:py-8'>
      <div className='mx-auto flex w-full max-w-3xl flex-col'>
        <header className='animate-fade-in px-1 pb-4 sm:px-0'>
          <div className='flex items-baseline justify-between gap-4'>
            <div>
              <p className='text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-muted'>
                Options
              </p>
              <h1 className='font-brand mt-1 text-2xl font-bold tracking-tight sm:text-3xl'>
                SudoFill
              </h1>
            </div>
            <div className='hidden rounded-full border border-border bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted sm:flex sm:items-center sm:gap-2'>
              <Settings className='h-3.5 w-3.5' />
              Autofill defaults
            </div>
          </div>
          <p className='mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary'>
            Tune the generated profile used by the popup autofill action. Keep it broad for
            flexibility, or narrow it just enough for your workflow.
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

          <div className='grid gap-0 lg:grid-cols-[1.15fr_0.85fr]'>
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
                  <LabeledInput
                    invalid={ageHasError}
                    label='Min'
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, ageMin: event.target.value }))
                    }
                    placeholder='18'
                    type='number'
                    value={settings.ageMin}
                  />
                  <LabeledInput
                    invalid={ageHasError}
                    label='Max'
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, ageMax: event.target.value }))
                    }
                    placeholder='99'
                    type='number'
                    value={settings.ageMax}
                  />
                </div>
              </SettingSection>

              <SettingSection
                description='Bias generated names and profile data toward a sex when the site needs one.'
                title='Sex'
              >
                <SelectField
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

            <aside className='border-t border-border-dim bg-surface-raised/60 p-4 lg:border-l lg:border-t-0 sm:p-5'>
              <div className='overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.18)]'>
                <div className='border-b border-border-dim bg-[linear-gradient(135deg,rgba(239,75,75,0.12),transparent_58%)] px-4 py-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted'>
                        Live preview
                      </p>
                      <p className='mt-1 text-sm leading-relaxed text-ink-secondary'>
                        What the next autofill profile is likely to look like.
                      </p>
                    </div>
                    <button
                      className='inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'
                      onClick={regeneratePreview}
                      type='button'
                    >
                      <RefreshCw className='h-3.5 w-3.5' />
                      Regenerate
                    </button>
                  </div>
                </div>

                <div className='space-y-3 p-4'>
                  <div className='rounded-xl border border-border-dim bg-void/45 p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                          Identity
                        </p>
                        <h2 className='mt-2 truncate font-brand text-xl font-semibold tracking-tight text-ink'>
                          {previewProfile?.fullName ?? 'Generating profile…'}
                        </h2>
                      </div>
                      <span className='rounded-full border border-accent/20 bg-accent-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent'>
                        Live
                      </span>
                    </div>

                    <div className='mt-3 space-y-3 text-sm leading-relaxed'>
                      <PreviewRow label='Email' value={previewProfile?.email ?? 'Loading…'} />
                      <div className='grid grid-cols-2 gap-2'>
                        <PreviewPill label='DOB' value={previewDob} />
                        <PreviewPill
                          label='Sex'
                          value={previewProfile ? formatSexLabel(previewProfile.sex) : 'Loading…'}
                        />
                      </div>
                    </div>
                  </div>

                  <div className='rounded-xl border border-border-dim bg-surface-raised/70 p-4'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
                      Address
                    </p>
                    {previewProfile?.addressLine1 ? (
                      <div className='mt-3 space-y-1.5 text-sm text-ink-secondary'>
                        <p className='font-medium text-ink'>{previewProfile.addressLine1}</p>
                        {previewProfile.addressLine2 && <p>{previewProfile.addressLine2}</p>}
                        <p>{previewProfile.city}</p>
                        <p>
                          {previewStateLabel} {previewProfile.postalCode}
                        </p>
                      </div>
                    ) : !previewProfile ? (
                      <p className='mt-3 text-sm leading-relaxed text-ink-muted'>
                        Generating a preview profile…
                      </p>
                    ) : (
                      <p className='mt-3 text-sm leading-relaxed text-ink-muted'>
                        Address generation is off in the current settings.
                      </p>
                    )}
                  </div>

                  <div className='rounded-xl border border-border-dim bg-void/30 px-4 py-3 text-sm text-ink-secondary'>
                    <p className='font-semibold text-ink'>Quick guide</p>
                    <ul className='mt-2 space-y-2 leading-relaxed'>
                      <li>• Use broad defaults for maximum flexibility.</li>
                      <li>• Set only the fields your workflow actually needs.</li>
                      <li>• Reset anytime to return to the extension’s starter state.</li>
                    </ul>
                  </div>

                  <div className='rounded-xl border border-border-dim bg-void/40 px-4 py-4 text-sm text-ink-secondary'>
                    <p className='font-semibold text-ink'>Validation</p>
                    <p className='mt-1'>
                      Age values must stay between 18 and 99, and the minimum cannot exceed the
                      maximum.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
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
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
}) {
  return (
    <div className='relative'>
      <select
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

function LabeledInput({
  label,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; invalid?: boolean }) {
  return (
    <label className='block'>
      <span className='mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted'>
        {label}
      </span>
      <input
        className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:ring-2 ${
          invalid
            ? 'border-danger-border focus:border-danger focus:ring-danger/20'
            : 'border-border focus:border-accent/50 focus:ring-accent/20'
        }`}
        max={99}
        min={18}
        {...props}
      />
    </label>
  );
}

function ToggleField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label='Use generated address fields'
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
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-void shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className='text-sm font-medium'>{checked ? 'Enabled' : 'Disabled'}</span>
    </button>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border border-border-dim bg-surface px-3 py-2'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted'>
        {label}
      </p>
      <p className='mt-1 break-words text-sm text-ink'>{value}</p>
    </div>
  );
}

function PreviewPill({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border border-border-dim bg-surface px-3 py-2'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted'>
        {label}
      </p>
      <p className='mt-1 text-sm font-medium text-ink'>{value}</p>
    </div>
  );
}

function formatPreviewDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatSexLabel(value: string) {
  if (value === 'female') return 'Female';
  if (value === 'male') return 'Male';
  if (value === 'nonbinary') return 'Non-binary';
  return 'Unspecified';
}

createRoot(document.getElementById('root')!).render(<OptionsApp />);
