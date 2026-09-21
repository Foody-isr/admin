'use client';

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  LightbulbIcon,
  SaveIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ds';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { CostSummary, DraftPayload, Recommendation } from '../types';

export function IntelligencePanel({
  payload,
  canManage,
  submitting,
  onSave,
  onRefine,
}: {
  payload: DraftPayload;
  canManage: boolean;
  submitting: boolean;
  onSave: () => void;
  onRefine: () => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const metrics = payload.metrics;
  const creative = payload.creative;
  const summary = payload.cost_summary;
  const recommendations = metrics?.recommendations ?? [];
  const foodCostPct = summary.food_cost_pct == null ? null : summary.food_cost_pct * 100;
  const targetPct = summary.target_pct * 100;
  const progress = foodCostPct == null ? 0 : Math.min(100, (foodCostPct / Math.max(targetPct, 1)) * 100);
  const verdict = verdictCopy(summary, t);

  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
      <div className="border-b border-[var(--line)] px-5 py-5">
        <p className="text-xs font-medium text-[var(--fg-muted)]">{t('labDecisionTitle')}</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className={`text-5xl font-semibold tracking-[-0.055em] tabular-nums ${verdict.tone}`}>
              {foodCostPct == null ? '—' : `${foodCostPct.toFixed(0)}%`}
            </p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('labFoodCostPct')} · {t('labTargetLabel')} ≤ {targetPct.toFixed(0)}%</p>
          </div>
          <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${verdict.badge}`}>
            {verdict.ok && <CheckCircle2Icon className="h-3.5 w-3.5" />}
            {!verdict.ok && <AlertTriangleIcon className="h-3.5 w-3.5" />}
            {verdict.label}
          </span>
        </div>

        <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <span
            className={`absolute inset-y-0 start-0 rounded-full ${verdict.bar}`}
            style={{ width: `${progress}%` }}
          />
          <span className="absolute inset-y-[-3px] end-0 w-px bg-[var(--fg-muted)]" aria-hidden />
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">{verdict.description}</p>

        {summary.suggested_min_price != null && summary.verdict !== 'ok' && (
          <p className="mt-2 text-sm font-medium text-[var(--fg)]">{t('labSuggestedMinPrice')} {money(summary.suggested_min_price, { decimals: 0 })}</p>
        )}
      </div>

      {creative?.rationale && (
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <LightbulbIcon className="h-4 w-4 text-[var(--brand-500)]" /> {t('labWhyThisRecipe')}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{creative.rationale}</p>
          {creative.menu_fit_notes && <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{creative.menu_fit_notes}</p>}
        </div>
      )}

      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="space-y-3">
          <Score label={t('labMenuFit')} value={metrics?.menu_fit_score ?? 0} />
          <Score label={t('labStockReuse')} value={metrics?.stock_reuse_pct ?? 0} />
          <Score label={t('labOperational')} value={metrics?.operational_score ?? 0} />
        </div>

        {recommendations.length > 0 ? (
          <div className="mt-4 space-y-2">
            {recommendations.map((item) => <RecommendationRow key={item.code} item={item} />)}
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--success-500)]">
            <CheckCircle2Icon className="h-4 w-4" /> {t('labNoWarnings')}
          </p>
        )}
      </div>

      {canManage && (
        <div className="space-y-2 bg-[var(--surface-2)] p-4">
          <Button size="lg" className="w-full" onClick={onSave} disabled={submitting}>
            <SaveIcon /> {submitting ? t('labSaving') : t('labSaveRecipe')}
          </Button>
          <Button variant="secondary" size="md" className="w-full" onClick={onRefine} disabled={submitting}>
            <SparklesIcon /> {t('labRefineTitle')}
          </Button>
          <p className="px-2 pt-1 text-center text-[11px] leading-4 text-[var(--fg-muted)]">{t('labSaveHelp')}</p>
        </div>
      )}
    </section>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  const tone = value >= 75 ? 'bg-[var(--success-500)]' : value >= 50 ? 'bg-[var(--warning-500)]' : 'bg-[var(--danger-500)]';
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[var(--fg-muted)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--fg)]">{Math.round(value)}<span className="font-normal text-[var(--fg-subtle)]">/100</span></span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function RecommendationRow({ item }: { item: Recommendation }) {
  const critical = item.severity === 'critical';
  const warning = item.severity === 'warning';
  return (
    <div className="flex gap-2.5 rounded-[9px] border p-3" style={{ borderColor: critical ? 'color-mix(in oklab, var(--danger-500) 35%, var(--line))' : warning ? 'color-mix(in oklab, var(--warning-500) 35%, var(--line))' : 'var(--line)' }}>
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: critical ? 'var(--danger-500)' : warning ? 'var(--warning-500)' : 'var(--fg-muted)' }} />
      <div>
        <p className="text-xs font-semibold text-[var(--fg)]">{item.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--fg-muted)]">{item.message}</p>
      </div>
    </div>
  );
}

function verdictCopy(summary: CostSummary, t: (key: string) => string) {
  if (summary.verdict === 'ok') {
    return { ok: true, label: t('labOnTarget'), description: t('labWithinTargetDescription'), tone: 'text-[var(--success-500)]', badge: 'bg-[var(--success-50)] text-[var(--success-500)]', bar: 'bg-[var(--success-500)]' };
  }
  if (summary.verdict === 'loss_making') {
    return { ok: false, label: t('labLossMaking'), description: t('labLossDescription'), tone: 'text-[var(--danger-500)]', badge: 'bg-[var(--danger-50)] text-[var(--danger-500)]', bar: 'bg-[var(--danger-500)]' };
  }
  if (summary.verdict === 'over_budget') {
    return { ok: false, label: t('labOverBudget'), description: t('labOverTargetDescription'), tone: 'text-[var(--warning-500)]', badge: 'bg-[var(--warning-50)] text-[var(--warning-500)]', bar: 'bg-[var(--warning-500)]' };
  }
  return { ok: false, label: t('labSetSellingPrice'), description: t('labNoPriceDescription'), tone: 'text-[var(--fg)]', badge: 'bg-[var(--surface-2)] text-[var(--fg-muted)]', bar: 'bg-[var(--fg-subtle)]' };
}
