'use client';

// Confirm-weights modal for by-weight orders. Shown when an order is on a card
// hold awaiting weigh-in (settlement_status === "held"). Staff enter the real
// weighed grams for each by-weight line; the modal shows each line's live price
// (price_per_kg × grams / 1000) and a running total against the authorized
// hold, warning when the total would exceed it. On submit it calls
// confirmOrderWeights and lets the host refresh the order.

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ScaleIcon, XIcon, AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { Button, NumberField } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { confirmOrderWeights, type Order, type OrderItem } from '@/lib/api';

interface ConfirmWeightsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  /** Called after weights are confirmed so the host can refresh the order. */
  onConfirmed: () => void;
}

// Only by-weight lines are weighed; everything else is priced as-is.
function byWeightLines(order: Order | null): OrderItem[] {
  return (order?.items ?? []).filter((it) => it.pricing_mode === 'by_weight');
}

export function ConfirmWeightsModal({
  open, onOpenChange, order, onConfirmed,
}: ConfirmWeightsModalProps) {
  const { t } = useI18n();

  const lines = useMemo(() => byWeightLines(order), [order]);

  // grams keyed by order_item_id. Prefilled with each line's estimated weight
  // when the modal opens so staff only adjust what actually differs.
  const [grams, setGrams] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const seed: Record<number, number> = {};
    for (const line of lines) seed[line.id] = line.estimated_weight_grams ?? 0;
    setGrams(seed);
    setSubmitting(false);
    setError(null);
  }, [open, lines]);

  const linePrice = (line: OrderItem): number => {
    const g = grams[line.id] ?? 0;
    const perKg = line.price_per_kg ?? 0;
    // Weight is per unit; multiply by quantity to price the whole line.
    return (perKg * g) / 1000 * (line.quantity || 1);
  };

  const runningTotal = lines.reduce((sum, line) => sum + linePrice(line), 0);
  const holdAmount = order?.hold_amount ?? 0;
  const overHold = holdAmount > 0 && runningTotal > holdAmount + 0.005;
  const allWeighed = lines.every((line) => (grams[line.id] ?? 0) > 0);

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!order || !allWeighed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmOrderWeights(
        order.restaurant_id,
        order.id,
        lines.map((line) => ({
          order_item_id: line.id,
          actual_weight_grams: grams[line.id] ?? 0,
        })),
      );
      onOpenChange(false);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(520px,calc(100vw-32px))] max-h-[calc(100vh-64px)] flex flex-col bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Header */}
          <div className="flex items-start gap-[var(--s-3)] p-[var(--s-5)] pb-[var(--s-4)]">
            <div
              className="rounded-r-md grid place-items-center w-11 h-11 shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 15%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              <ScaleIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-fs-lg font-semibold text-[var(--fg)]">
                {t('confirmWeightsTitle') || 'Confirm weights'}
              </Dialog.Title>
              <Dialog.Description className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
                {t('confirmWeightsSubtitle') ||
                  'Enter the measured weight for each item to finalize the charge.'}
              </Dialog.Description>
            </div>
            <button
              onClick={close}
              aria-label={t('close') || 'Close'}
              className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto px-[var(--s-5)]">
            {lines.length === 0 ? (
              <p className="text-fs-sm text-[var(--fg-muted)] py-[var(--s-4)]">
                {t('confirmWeightsNoLines') || 'No items in this order are priced by weight.'}
              </p>
            ) : (
              <div className="flex flex-col gap-[var(--s-3)]">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-r-md border border-[var(--line)] p-[var(--s-3)]"
                  >
                    <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-2)]">
                      <span className="text-fs-sm font-medium truncate">
                        {line.quantity > 1 ? `${line.quantity}× ` : ''}
                        {line.name}
                      </span>
                      <span className="font-mono tabular-nums text-fs-sm font-semibold shrink-0">
                        ₪{linePrice(line).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-[var(--s-3)]">
                      <div className="relative flex-1">
                        <NumberField
                          min={0}
                          value={grams[line.id] ?? 0}
                          onChange={(v) =>
                            setGrams((prev) => ({ ...prev, [line.id]: v }))
                          }
                          placeholder="0"
                          className="pe-10 font-mono"
                        />
                        <span className="absolute end-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                          g
                        </span>
                      </div>
                      <span className="text-fs-xs text-[var(--fg-subtle)] font-mono tabular-nums shrink-0">
                        ₪{(line.price_per_kg ?? 0).toFixed(2)}/kg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Running total vs hold */}
            <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-2)]">
              <div className="flex items-center justify-between px-[var(--s-3)] py-[var(--s-2)] rounded-r-md bg-[var(--surface-2)] border border-[var(--line)]">
                <span className="text-fs-sm text-[var(--fg-muted)]">
                  {t('confirmWeightsRunningTotal') || 'Running total'}
                </span>
                <span
                  className="font-mono tabular-nums text-fs-md font-semibold"
                  style={{ color: overHold ? 'var(--danger-500)' : 'var(--fg)' }}
                >
                  ₪{runningTotal.toFixed(2)}
                </span>
              </div>
              {holdAmount > 0 && (
                <div className="flex items-center justify-between px-[var(--s-3)] text-fs-xs text-[var(--fg-subtle)]">
                  <span>{t('confirmWeightsHoldAmount') || 'Authorized hold'}</span>
                  <span className="font-mono tabular-nums">₪{holdAmount.toFixed(2)}</span>
                </div>
              )}
              {overHold && (
                <div
                  className="flex items-start gap-2 px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-xs"
                  style={{
                    background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
                    color: 'var(--danger-500)',
                  }}
                >
                  <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {t('confirmWeightsOverHold') ||
                      'The total exceeds the authorized hold. Only the hold amount can be captured; collect the difference separately.'}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-[var(--s-3)] text-fs-xs text-[var(--danger-500)]">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-[var(--s-2)] p-[var(--s-5)] pt-[var(--s-4)]">
            <Button variant="ghost" size="md" onClick={close} disabled={submitting}>
              {t('cancel') || 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleConfirm}
              disabled={submitting || lines.length === 0 || !allWeighed}
            >
              <CheckIcon className="w-4 h-4" />
              {submitting
                ? `${t('saving') || 'Saving'}…`
                : (t('confirmWeightsConfirm') || 'Confirm and charge')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
