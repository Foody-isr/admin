'use client';

// Drilldown modal for the "Économie client" badge. Shows step-by-step how
// the savings number is built — for each step, the cheapest `picks` options
// at their solo price, then the sum, minus the combo base price.
//
// Mirrors the pattern of `food-cost/CostPctBreakdownModal.tsx` (intro + a
// stack of fixed-width sections + footer with Close).

import { AlertTriangle, Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ComboSavingsBreakdown } from './pricing';

interface Props {
  comboName?: string;
  breakdown: ComboSavingsBreakdown;
  onClose: () => void;
}

export default function ComboSavingsBreakdownModal({ comboName, breakdown, onClose }: Props) {
  const { t } = useI18n();

  const state: 'saves' | 'surcharge' | 'even' =
    breakdown.savings > 0 ? 'saves'
    : breakdown.savings < 0 ? 'surcharge'
    : 'even';

  const absSavings = Math.abs(breakdown.savings);
  const absPct = Math.round(Math.abs(breakdown.savingsPct));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="rounded-r-lg w-full max-w-lg max-h-[85vh] flex flex-col border border-[var(--line)] shadow-3"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--s-5)] py-[var(--s-3)] border-b border-[var(--line)] shrink-0">
          <div>
            <h3 className="text-fs-md font-semibold text-[var(--fg)]">
              {t('savingsBreakdownTitle')}
            </h3>
            {comboName && (
              <p className="text-fs-xs text-[var(--fg-subtle)]">{comboName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            aria-label="Close"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-[var(--s-5)] py-[var(--s-4)] space-y-[var(--s-4)] text-fs-sm">
          <p className="text-[var(--fg-muted)] flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t('savingsBreakdownIntro')}</span>
          </p>

          {/* Per-step contributors */}
          {breakdown.steps.map((step, idx) => (
            <section key={idx} className="space-y-1.5">
              <h4 className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)]">
                {idx + 1}. {step.stepName || `—`}
              </h4>
              <div
                className="rounded-r-md p-[var(--s-3)] font-mono text-fs-sm"
                style={{ background: 'var(--surface-2)' }}
              >
                {step.picks === 0 ? (
                  <p className="text-[var(--fg-subtle)] italic">{t('savingsBreakdownStepOptional')}</p>
                ) : step.contributors.length === 0 ? (
                  <p className="text-[var(--fg-subtle)] italic">{t('savingsBreakdownStepEmpty')}</p>
                ) : (
                  <>
                    <p className="text-[var(--fg-subtle)] mb-1.5 not-italic font-sans text-fs-xs">
                      {t('savingsBreakdownStepIntro').replace('{picks}', String(step.picks))}
                    </p>
                    {step.contributors.map((c, i) => (
                      <div key={i} className="flex justify-between text-[var(--fg)]">
                        <span className="truncate pe-2">
                          {c.itemName}
                          {c.variantName && (
                            <span className="text-[var(--fg-muted)]"> · {c.variantName}</span>
                          )}
                        </span>
                        <span className="tabular-nums">₪{c.soloPrice.toFixed(2)}</span>
                      </div>
                    ))}
                    <div
                      className="flex justify-between pt-1.5 mt-1.5 border-t font-semibold text-[var(--fg)]"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <span className="font-sans text-fs-xs uppercase tracking-[.06em] text-[var(--fg-subtle)]">
                        {t('savingsBreakdownStepTotalLabel')}
                      </span>
                      <span className="tabular-nums">₪{step.stepTotal.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </section>
          ))}

          {/* Summary math */}
          <section className="space-y-1.5">
            <h4 className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)]">
              {breakdown.steps.length + 1}. {t('savingsBreakdownSavingsLabel')}
            </h4>
            <div
              className="rounded-r-md p-[var(--s-3)] font-mono text-fs-sm space-y-1"
              style={{ background: 'var(--surface-2)' }}
            >
              <div className="flex justify-between text-[var(--fg)]">
                <span>{t('savingsBreakdownSoloTotalLabel')}</span>
                <span className="tabular-nums">₪{breakdown.soloTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[var(--fg)]">
                <span>− {t('savingsBreakdownComboPriceLabel')}</span>
                <span className="tabular-nums">₪{breakdown.basePrice.toFixed(2)}</span>
              </div>
              <div
                className="flex justify-between pt-1.5 mt-1.5 border-t font-semibold tabular-nums items-center"
                style={{
                  borderColor: 'var(--line)',
                  color:
                    state === 'saves' ? 'var(--success-500)'
                    : state === 'surcharge' ? 'var(--warning-500)'
                    : 'var(--fg)',
                }}
              >
                <span className="font-sans text-fs-xs uppercase tracking-[.06em] flex items-center gap-1">
                  {state === 'surcharge' && <AlertTriangle className="w-3.5 h-3.5" />}
                  {state === 'saves' ? t('savingsBreakdownSavingsLabel')
                    : state === 'surcharge' ? t('savingsBreakdownSurchargeLabel')
                    : t('savingsBreakdownEvenLabel')}
                </span>
                <span>
                  {state === 'saves' && <>−₪{absSavings.toFixed(2)} · {absPct}%</>}
                  {state === 'surcharge' && <>+₪{absSavings.toFixed(2)} · {absPct}%</>}
                  {state === 'even' && <>±₪0</>}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center justify-end shrink-0 bg-[var(--surface)]">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 px-3 rounded-r-sm text-fs-sm font-medium border border-[var(--line-strong)] text-[var(--fg)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
          >
            {t('savingsBreakdownClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
