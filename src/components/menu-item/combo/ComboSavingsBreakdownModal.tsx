'use client';

// Drilldown modal for the "Économie client" badge. Shows step-by-step how
// the savings number is built — for each step, the cheapest `picks` options
// at their solo price, then the sum, minus the combo base price.
//
// Mirrors the pattern of `food-cost/CostPctBreakdownModal.tsx` (intro + a
// stack of fixed-width sections + footer with Close).

import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { AlertTriangle, Info } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import type { ComboSavingsBreakdown } from './pricing';

interface Props {
  comboName?: string;
  breakdown: ComboSavingsBreakdown;
  onClose: () => void;
}

export default function ComboSavingsBreakdownModal({ comboName, breakdown, onClose }: Props) {
  const { money } = useCurrency();
  const { t } = useI18n();

  // `incomparable` short-circuits saves/surcharge framing entirely — the
  // soloTotal is built against missing prices, so any "+₪X surcoût" or
  // "−₪Y économie" would be fiction. We replace the summary row with a
  // short explanation in that case.
  const state: 'saves' | 'surcharge' | 'even' | 'incomparable' =
    !breakdown.comparable ? 'incomparable'
    : breakdown.savings > 0 ? 'saves'
    : breakdown.savings < 0 ? 'surcharge'
    : 'even';

  const absSavings = Math.abs(breakdown.savings);
  const absPct = Math.round(Math.abs(breakdown.savingsPct));

  return (
    <Modal title={t('savingsBreakdownTitle')} subtitle={comboName} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>{t('savingsBreakdownClose')}</Button>}>
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
                        <span className="tabular-nums">{money(c.soloPrice)}</span>
                      </div>
                    ))}
                    <div
                      className="flex justify-between pt-1.5 mt-1.5 border-t font-semibold text-[var(--fg)]"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <span className="font-sans text-fs-xs uppercase tracking-[.06em] text-[var(--fg-subtle)]">
                        {t('savingsBreakdownStepTotalLabel')}
                      </span>
                      <span className="tabular-nums">{money(step.stepTotal)}</span>
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
            {state === 'incomparable' ? (
              <div
                className="rounded-r-md p-[var(--s-3)] text-fs-sm flex items-start gap-2"
                style={{ background: 'var(--surface-2)' }}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--warning-500)]" />
                <p className="text-[var(--fg-muted)] leading-relaxed">
                  {t('comboSavingsIncomparable') || 'Comparaison indisponible : certaines options sont vendues uniquement dans ce combo (plats à partager, prix par personne).'}
                </p>
              </div>
            ) : (
              <div
                className="rounded-r-md p-[var(--s-3)] font-mono text-fs-sm space-y-1"
                style={{ background: 'var(--surface-2)' }}
              >
                <div className="flex justify-between text-[var(--fg)]">
                  <span>{t('savingsBreakdownSoloTotalLabel')}</span>
                  <span className="tabular-nums">{money(breakdown.soloTotal)}</span>
                </div>
                <div className="flex justify-between text-[var(--fg)]">
                  <span>− {t('savingsBreakdownComboPriceLabel')}</span>
                  <span className="tabular-nums">{money(breakdown.basePrice)}</span>
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
                    {state === 'saves' && <>−{money(absSavings)} · {absPct}%</>}
                    {state === 'surcharge' && <>+{money(absSavings)} · {absPct}%</>}
                    {state === 'even' && <>±{money(0)}</>}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

    </Modal>
  );
}
