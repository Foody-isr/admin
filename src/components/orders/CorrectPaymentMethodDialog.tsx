'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, CheckIcon, InfoIcon, BanknoteIcon, CreditCardIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ManualPaymentMethod } from '@/lib/api';

interface CorrectPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How the order currently reads as settled, so the dialog can mark it and
   *  keep confirm disabled on a no-op. */
  currentMethod?: string;
  currentReference?: string;
  onConfirm: (
    method: ManualPaymentMethod,
    reference: string,
    note: string,
  ) => Promise<void> | void;
}

const OPTIONS: { method: ManualPaymentMethod; labelKey: string; Icon: typeof BanknoteIcon }[] = [
  { method: 'cash', labelKey: 'cash', Icon: BanknoteIcon },
  { method: 'credit_card', labelKey: 'creditCard', Icon: CreditCardIcon },
];

// CorrectPaymentMethodDialog lets an owner/manager fix HOW a settled order was
// paid, without moving its payment status.
//
// It exists because there was previously no way to do that at all: staff who
// picked the wrong method at collection had to walk the order back to unpaid
// through the status override and re-collect it, which moved the payment status
// twice, left two misleading "paid → unpaid" entries in the trail, and still
// never corrected the payment_method column the reports read.
//
// Mirrors the server contract (PUT /orders/:id/payment-method with
// payment_method + optional reference and note).
export function CorrectPaymentMethodDialog({
  open,
  onOpenChange,
  currentMethod,
  currentReference,
  onConfirm,
}: CorrectPaymentMethodDialogProps) {
  const { t } = useI18n();
  const [method, setMethod] = useState<ManualPaymentMethod | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod(null);
      // Pre-filled so an operator correcting only the method does not have to
      // retype a reference that is already on the order.
      setReference(currentReference ?? '');
      setNote('');
      setSubmitting(false);
    }
  }, [open, currentReference]);

  // Confirm stays live when only the reference changed: attaching a slip number
  // to an already-correct method is a legitimate use of this dialog.
  const canConfirm =
    method !== null &&
    (method !== currentMethod || reference.trim() !== (currentReference ?? '').trim());

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!canConfirm || method === null || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(method, reference.trim(), note.trim());
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
                  {t('correctPaymentMethod')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('correctPaymentMethodPrompt')}
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
                const selected = method === opt.method;
                const isCurrent = currentMethod === opt.method;
                return (
                  <button
                    key={opt.method}
                    type="button"
                    onClick={() => setMethod(opt.method)}
                    className={cn(
                      'flex items-center justify-between gap-[var(--s-3)] rounded-r-md px-[var(--s-4)] py-[var(--s-3)] text-fs-md text-left border transition-colors',
                      selected
                        ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--fg)]'
                        : 'border-[var(--line)] text-[var(--fg)] hover:bg-[var(--surface)]',
                    )}
                  >
                    <span className="flex items-center gap-[var(--s-2)]">
                      <opt.Icon className="w-4 h-4 shrink-0 text-[var(--fg-muted)]" />
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
              <label htmlFor="correct-payment-reference" className="block text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
                {t('paymentReference')} <span className="text-[var(--fg-subtle)]">({t('optional')})</span>
              </label>
              <input
                id="correct-payment-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                autoComplete="off"
                className="w-full rounded-r-md border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] text-fs-sm px-[var(--s-3)] py-[var(--s-2)] focus:outline-none focus:border-[var(--brand-500)]"
              />
              <p className="text-fs-xs text-[var(--fg-muted)] mt-[var(--s-1)]">
                {t('paymentReferenceHint')}
              </p>
            </div>

            <div className="mt-[var(--s-4)]">
              {/* Labelled as the REASON, not just "Note": next to the invoice
                  number above, an unqualified "Note" reads like a second place
                  to put the same thing. */}
              <label htmlFor="correct-payment-method-note" className="block text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
                {t('correctPaymentMethodNote')}
              </label>
              <textarea
                id="correct-payment-method-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-r-md border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] text-fs-sm px-[var(--s-3)] py-[var(--s-2)] focus:outline-none focus:border-[var(--brand-500)]"
              />
            </div>

            <div className="mt-[var(--s-4)] flex items-start gap-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-[var(--s-2)]">
              <InfoIcon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--fg-muted)]" />
              <p className="text-fs-sm text-[var(--fg-muted)]">
                {t('correctPaymentMethodSilentNote')}
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
                {t('correctPaymentMethod')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
