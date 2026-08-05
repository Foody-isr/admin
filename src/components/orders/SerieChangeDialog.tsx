'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, CheckIcon, CalendarClockIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  FULFILLMENT_CHANGE_REASONS,
  FULFILLMENT_REASON_KEY,
  dayGap,
  type FulfillmentChangeReasonCode,
} from '@/lib/orders/fulfillment-reason';

interface SerieChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collection day the order currently sits on, "YYYY-MM-DD". */
  fromDate: string;
  /** Collection day the operator just picked, "YYYY-MM-DD". */
  toDate: string;
  onConfirm: (reasonCode: FulfillmentChangeReasonCode, note: string) => Promise<void> | void;
}

// SerieChangeDialog is the friction between picking another série and saving it.
// The picker lists upcoming séries as adjacent rows, so the next week sits one
// line below the current one: an order was once moved seven days out by a single
// mis-click, and nothing in the data could later tell that from a deliberate
// move. Naming the gap out loud catches the slip; the reason explains the rest.
export function SerieChangeDialog({
  open,
  onOpenChange,
  fromDate,
  toDate,
  onConfirm,
}: SerieChangeDialogProps) {
  const { t, locale } = useI18n();
  const [reason, setReason] = useState<FulfillmentChangeReasonCode | null>(null);
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

  const gap = dayGap(fromDate, toDate);
  const longDate = (iso: string) => {
    const parsed = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

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
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(460px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-fs-lg font-semibold text-[var(--fg)]">
                  {t('serieChangeTitle')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('serieChangeReasonPrompt')}
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

            {/* The move itself, spelled out. A date pair alone reads as two
                interchangeable options; the day count is what makes a slip
                obvious. */}
            <div className="flex items-start gap-[var(--s-3)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] py-[var(--s-3)] mb-[var(--s-4)]">
              <CalendarClockIcon className="w-5 h-5 text-[var(--fg-muted)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-fs-md text-[var(--fg)]">
                  {longDate(fromDate)} <span className="text-[var(--fg-muted)]">&rarr;</span>{' '}
                  <span className="font-semibold">{longDate(toDate)}</span>
                </div>
                {gap !== 0 && (
                  <div className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                    {gap > 0
                      ? t('serieChangeLaterBy').replace('{days}', String(gap))
                      : t('serieChangeEarlierBy').replace('{days}', String(Math.abs(gap)))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-[var(--s-2)]">
              {FULFILLMENT_CHANGE_REASONS.map((code) => {
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
                    <span>{t(FULFILLMENT_REASON_KEY[code])}</span>
                    {selected && <CheckIcon className="w-4 h-4 text-[var(--brand-500)] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-[var(--s-4)]">
              <label className="block text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
                {noteRequired ? t('serieReasonNoteRequired') : t('serieReasonNoteOptional')}
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
                variant="primary"
                className="flex-1"
                onClick={confirm}
                disabled={!canConfirm || submitting}
              >
                {t('confirmSerieChange')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
