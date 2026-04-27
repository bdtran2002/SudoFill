import { useEffect } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-hidden='false'
      className='fixed inset-0 z-50 bg-black/60 px-4 py-6 backdrop-blur-[2px]'
      onClick={onCancel}
    >
      <div className='flex min-h-full items-center justify-center'>
        <div
          aria-labelledby='confirm-dialog-title'
          aria-modal='true'
          className='w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.4)]'
          onClick={(event) => event.stopPropagation()}
          role='dialog'
        >
          <div className='border-b border-border-dim bg-[linear-gradient(135deg,rgba(239,75,75,0.14),transparent_55%)] px-5 py-4'>
            <p id='confirm-dialog-title' className='text-base font-semibold text-ink'>
              {title}
            </p>
            <p className='mt-2 text-sm leading-relaxed text-ink-secondary'>{description}</p>
          </div>

          <div className='flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end'>
            <button
              className='inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-ink'
              onClick={onCancel}
              type='button'
            >
              {cancelLabel}
            </button>
            <button
              className={`inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors ${
                confirmTone === 'danger'
                  ? 'bg-danger hover:bg-danger/90'
                  : 'bg-accent hover:bg-accent-hover'
              }`}
              onClick={onConfirm}
              type='button'
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
