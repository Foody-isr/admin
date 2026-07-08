'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, CheckIcon, InfoIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@/lib/api';

interface OverridePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPaymentStatus?: PaymentStatus;
  onConfirm: (paymentStatus: PaymentStatus, note: string) => Promise<void> | void;
}

// Correctable payment targets, ordered from least to most settled. Refunded is
// intentionally absent — a real refund keeps its own money-moving flow; this
// dialog only corrects a mis-marked status (e.g. an internal order wrongly
// marked "paid in cash").
const OPTIONS: { status: PaymentStatus; labelKey: string }[] = [
  { status: 'unpaid', labelKey: 'unpaid' },
  { status: 'pending', labelKey: 'pending' },
  { status: 'paid', labelKey: 'paid' },
];

// OverridePaymentDialog lets an owner/manager correct an order's payment status
// (paid ⇄ unpaid ⇄ pending), bypassing the forward-only payment rule. It is the
// escape hatch for a mis-click — e.g. a cash order marked paid that was never
// collected. The customer is NOT notified. Mirrors the server contract
// (PUT /orders/:id/payment-status/override with payment_status + optional note).
export function OverridePaymentDialog({
  open,
  onOpenChange,
  currentPaymentStatus,
  onConfirm,
}: OverridePaymentDialogProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus(null);
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  // Selecting the status the order already has is a no-op — keep confirm disabled.
  const canConfirm = status !== null && status !== currentPaymentStatus;

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!canConfirm || status === null || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(status, note.trim());
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
                  {t('correctPayment')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('correctPaymentPrompt')}
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
              {OPTIONS.map((opt) => {
                const selected = status === opt.status;
                const isCurrent = currentPaymentStatus === opt.status;
                return (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => setStatus(opt.status)}
                    className={cn(
                      'flex items-center justify-between gap-[var(--s-3)] rounded-r-md px-[var(--s-4)] py-[var(--s-3)] text-fs-md text-left border transition-colors',
                      selected
                        ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--fg)]'
                        : 'border-[var(--line)] text-[var(--fg)] hover:bg-[var(--surface)]',
                    )}
                  >
                    <span className="flex items-center gap-[var(--s-2)]">
                      {t(opt.labelKey)}
                      {isCurrent && (
                        <span className="text-fs-xs text-[var(--fg-muted)]">· {t('current')}</span>
                      )}
                    </span>
                    {selected && <CheckIcon className="w-4 h-4 text-[var(--brand-500)] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-[var(--s-4)]">
              <label className="block text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
                {t('correctStatusNote')}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-r-md border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] text-fs-sm px-[var(--s-3)] py-[var(--s-2)] focus:outline-none focus:border-[var(--brand-500)]"
              />
            </div>

            {/* Confirmation line: this only fixes a record — no money moves and the
                customer is never notified. Always visible so staff see it before
                confirming. */}
            <div className="mt-[var(--s-4)] flex items-start gap-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-[var(--s-2)]">
              <InfoIcon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--fg-muted)]" />
              <p className="text-fs-sm text-[var(--fg-muted)]">
                {t('correctPaymentSilentNote')}
              </p>
            </div>

            <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-5)]">
              <Button variant="ghost" className="flex-1" onClick={close} disabled={submitting}>
                {t('back')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={confirm}
                disabled={!canConfirm || submitting}
              >
                {t('correctPayment')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
