'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  MANUAL_CANCELLATION_REASONS,
  CANCELLATION_REASON_KEY,
  type CancellationReasonCode,
} from '@/lib/orders/cancellation';

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonCode: string, note: string) => Promise<void> | void;
}

// CancelOrderDialog collects the mandatory cancellation reason before an order
// is rejected. A note is required only for the "other" reason. Mirrors the
// server contract (POST /orders/:id/reject with reason_code + note).
export function CancelOrderDialog({ open, onOpenChange, onConfirm }: CancelOrderDialogProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState<CancellationReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  const noteRequired = reason === 'other';
  const canConfirm = reason !== null && (!noteRequired || note.trim() !== '');

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!canConfirm || reason === null || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason, note.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(440px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-fs-lg font-semibold text-[var(--fg)]">
                  {t('cancelOrderTitle')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('cancelOrderReasonPrompt')}
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t('close')}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-[var(--s-2)]">
              {MANUAL_CANCELLATION_REASONS.map((code) => {
                const selected = reason === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setReason(code)}
                    className={cn(
                      'flex items-center justify-between gap-[var(--s-3)] rounded-r-md px-[var(--s-4)] py-[var(--s-3)] text-fs-md text-left border transition-colors',
                      selected
                        ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--fg)]'
                        : 'border-[var(--line)] text-[var(--fg)] hover:bg-[var(--surface)]',
                    )}
                  >
                    <span>{t(CANCELLATION_REASON_KEY[code])}</span>
                    {selected && <CheckIcon className="w-4 h-4 text-[var(--brand-500)] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-[var(--s-4)]">
              <label className="block text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
                {noteRequired ? t('cancelReasonNoteRequired') : t('cancelReasonNoteOptional')}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-r-md border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] text-fs-sm px-[var(--s-3)] py-[var(--s-2)] focus:outline-none focus:border-[var(--brand-500)]"
              />
            </div>

            <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-5)]">
              <Button variant="ghost" className="flex-1" onClick={close} disabled={submitting}>
                {t('back')}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={confirm}
                disabled={!canConfirm || submitting}
              >
                {t('confirmCancelOrder')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
