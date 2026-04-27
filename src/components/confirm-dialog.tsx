import { useEffect, useId, useRef } from 'react';

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
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    window.setTimeout(() => {
      cancelButtonRef.current?.focus() ?? dialogRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
      );

      const firstElement = focusableElements[0] ?? dialog;
      const lastElement = focusableElements.at(-1) ?? dialog;

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
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
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          aria-modal='true'
          className='w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.4)]'
          onClick={(event) => event.stopPropagation()}
          ref={dialogRef}
          role='dialog'
          tabIndex={-1}
        >
          <div className='border-b border-border-dim bg-[linear-gradient(135deg,rgba(239,75,75,0.14),transparent_55%)] px-5 py-4'>
            <p id={titleId} className='text-base font-semibold text-ink'>
              {title}
            </p>
            <p id={descriptionId} className='mt-2 text-sm leading-relaxed text-ink-secondary'>
              {description}
            </p>
          </div>

          <div className='flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end'>
            <button
              className='inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-ink'
              onClick={onCancel}
              ref={cancelButtonRef}
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
