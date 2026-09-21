'use client';

import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, SaveIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { DraftPayload } from '../types';

/** Deterministic completion and margin guidance for the no-AI manual flow. */
export function ManualValidationPanel({
  payload,
  canManage,
  submitting,
  onSave,
}: {
  payload: DraftPayload;
  canManage: boolean;
  submitting: boolean;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const summary = payload.cost_summary;
  const hasIngredients = payload.components.length > 0;
  const hasSellingPrice = (summary.selling_price ?? 0) > 0;
  const costsComplete = summary.unknown_cost_count === 0;
  const foodCostPct = summary.food_cost_pct == null ? null : summary.food_cost_pct * 100;
  const targetPct = summary.target_pct * 100;
  const withinTarget = summary.verdict === 'ok';
  const canSave = hasIngredients && !submitting;

  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
      <div className="border-b border-[var(--line)] px-5 py-5">
        <p className="text-sm font-semibold text-[var(--fg)]">{t('labManualValidationTitle')}</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className={`text-5xl font-semibold tracking-[-0.055em] tabular-nums ${withinTarget ? 'text-[var(--success-500)]' : foodCostPct == null ? 'text-[var(--fg)]' : 'text-[var(--warning-500)]'}`}>
              {foodCostPct == null ? '—' : `${foodCostPct.toFixed(0)}%`}
            </p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('labFoodCostPct')} · {t('labTargetLabel')} ≤ {targetPct.toFixed(0)}%</p>
          </div>
          {withinTarget ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-50)] px-2.5 py-1 text-xs font-semibold text-[var(--success-500)]"><CheckCircle2Icon className="h-3.5 w-3.5" />{t('labOnTarget')}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-50)] px-2.5 py-1 text-xs font-semibold text-[var(--warning-500)]"><AlertTriangleIcon className="h-3.5 w-3.5" />{summary.verdict === 'no_price' ? t('labSetSellingPrice') : t('labOverBudget')}</span>
          )}
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">
          {withinTarget ? t('labManualWithinTarget') : summary.verdict === 'no_price' ? t('labNoPriceDescription') : t('labManualOverTarget')}
        </p>
        {summary.suggested_min_price != null && summary.verdict !== 'ok' && (
          <p className="mt-2 text-sm font-semibold text-[var(--fg)]">{t('labSuggestedMinPrice')} {money(summary.suggested_min_price, { decimals: 0 })}</p>
        )}
      </div>

      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="text-xs font-semibold text-[var(--fg-muted)]">{t('labManualChecklistTitle')}</p>
        <div className="mt-3 space-y-3">
          <CheckRow done={hasIngredients} label={hasIngredients ? t('labManualIngredientsDone').replace('{count}', String(payload.components.length)) : t('labManualIngredientsMissing')} />
          <CheckRow done={costsComplete && hasIngredients} label={costsComplete && hasIngredients ? t('labManualCostsDone') : t('labManualCostsMissing').replace('{count}', String(summary.unknown_cost_count))} warning={hasIngredients && !costsComplete} />
          <CheckRow done={hasSellingPrice} label={hasSellingPrice ? t('labManualPriceDone') : t('labManualPriceMissing')} />
          <CheckRow done={payload.recipe_steps.length > 0} label={payload.recipe_steps.length > 0 ? t('labManualMethodDone').replace('{count}', String(payload.recipe_steps.length)) : t('labManualMethodOptional')} />
        </div>
      </div>

      {canManage && (
        <div className="bg-[var(--surface-2)] p-4">
          <Button size="lg" className="w-full" onClick={onSave} disabled={!canSave}>
            <SaveIcon /> {submitting ? t('labSaving') : t('labSaveManualRecipe')}
          </Button>
          <p className="px-2 pt-2 text-center text-[11px] leading-4 text-[var(--fg-muted)]">{hasIngredients ? t('labManualSaveHelp') : t('labManualAddFirst')}</p>
        </div>
      )}
    </section>
  );
}

function CheckRow({ done, label, warning = false }: { done: boolean; label: string; warning?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {done ? <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-500)]" /> : warning ? <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-500)]" /> : <CircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fg-subtle)]" />}
      <span className={done ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}>{label}</span>
    </div>
  );
}
