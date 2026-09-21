'use client';

import { CircleCheckIcon, CircleDollarSignIcon, CircleGaugeIcon } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import type { DraftPayload } from '../types';

/** Primary identity and commercial summary for the proposed recipe. */
export function CostSummaryHeader({
  payload,
  onSellingPriceChange,
  canManage,
}: {
  payload: DraftPayload;
  onSellingPriceChange: (price: number | undefined) => void;
  canManage: boolean;
}) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const summary = payload.cost_summary;
  const hasSellPrice = summary.selling_price != null && summary.selling_price > 0;

  return (
    <header className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
      <div className="px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-xs font-medium text-[var(--fg-muted)]">{t('labReviewLabel')}</p>
        <div className="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-[-0.04em] text-[var(--fg)] sm:text-4xl">
              {payload.menu_item.name_primary || payload.menu_item.name_he}
            </h2>
          </div>

          <label className="shrink-0">
            <span className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">{t('labSellingPrice')}</span>
            {canManage ? (
              <SellingPriceField value={summary.selling_price} onChange={onSellingPriceChange} />
            ) : (
              <span className="text-2xl font-semibold tabular-nums text-[var(--fg)]">{money(summary.selling_price ?? 0)}</span>
            )}
          </label>
        </div>

        {!hasSellPrice && (
          <p className="mt-3 text-xs text-[var(--warning-500)]">
            {t('labAskSellingPrice')}{summary.suggested_min_price != null ? ` · ${t('labSuggestedMinPrice')} ${money(summary.suggested_min_price, { decimals: 0 })}` : ''}
          </p>
        )}
      </div>

      <div className="grid border-t border-[var(--line)] bg-[var(--surface-2)] sm:grid-cols-3">
        <SummaryMetric
          icon={<CircleDollarSignIcon className="h-4 w-4" />}
          label={summary.cost_status === 'verified' ? t('labExactFoodCost') : t('labEstFoodCost')}
          value={money(summary.total_estimated_cost)}
          detail={summary.cost_status === 'verified' ? t('labCostVerified') : t('labCostEstimated')}
        />
        <SummaryMetric
          icon={<CircleGaugeIcon className="h-4 w-4" />}
          label={t('labContributionMargin')}
          value={summary.contribution_margin != null ? money(summary.contribution_margin) : '—'}
          detail={summary.margin_pct != null ? `${(summary.margin_pct * 100).toFixed(0)}%` : t('labSetSellingPrice')}
        />
        <SummaryMetric
          icon={<CircleCheckIcon className="h-4 w-4" />}
          label={t('labVerifiedCoverage')}
          value={summary.total_estimated_cost > 0 ? `${Math.round(((summary.verified_cost ?? 0) / summary.total_estimated_cost) * 100)}%` : '—'}
          detail={(summary.estimated_cost ?? 0) > 0 ? `${money(summary.estimated_cost)} ${t('labEstimatedSuffix')}` : t('labAllPricesVerified')}
          last
        />
      </div>
    </header>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  detail,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 px-5 py-4 sm:px-6 ${last ? '' : 'border-b border-[var(--line)] sm:border-b-0 sm:border-e'}`}>
      <span className="mt-0.5 text-[var(--fg-muted)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-[var(--fg-muted)]">{label}</span>
        <span className="mt-0.5 block text-lg font-semibold tabular-nums text-[var(--fg)]">{value}</span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--fg-subtle)]">{detail}</span>
      </span>
    </div>
  );
}

function SellingPriceField({ value, onChange }: { value?: number; onChange: (value: number | undefined) => void }) {
  const { symbol } = useCurrency();
  return (
    <span className="flex h-12 items-center overflow-hidden rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--brand-500)] focus-within:shadow-[var(--focus-ring)]">
      <span className="flex h-full items-center border-e border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--fg-muted)]">{symbol}</span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={value ?? ''}
        onChange={(event) => {
          if (event.target.value === '') return onChange(undefined);
          const parsed = Number.parseFloat(event.target.value);
          onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
        placeholder="—"
        className="h-full w-28 bg-transparent px-3 text-xl font-semibold tabular-nums text-[var(--fg)] outline-none"
      />
    </span>
  );
}
