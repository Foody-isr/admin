'use client';

import { AlertTriangleIcon, CheckCircle2Icon, GaugeIcon, LightbulbIcon, PackageCheckIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { DraftPayload, Recommendation } from '../types';

export function IntelligencePanel({ payload }: { payload: DraftPayload }) {
  const { t } = useI18n();
  const metrics = payload.metrics;
  const creative = payload.creative;
  const recommendations = metrics?.recommendations ?? [];

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <GaugeIcon className="h-4 w-4 text-[var(--brand-500)]" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">{t('labGuidance')}</h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Score label={t('labMenuFit')} value={metrics?.menu_fit_score ?? 0} />
        <Score label={t('labStockReuse')} value={metrics?.stock_reuse_pct ?? 0} icon={<PackageCheckIcon className="h-3 w-3" />} />
        <Score label={t('labOperational')} value={metrics?.operational_score ?? 0} />
      </div>

      {creative?.rationale && (
        <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]">
            <LightbulbIcon className="h-3.5 w-3.5" /> {t('labWhyThisRecipe')}
          </p>
          <p className="text-xs leading-relaxed text-[var(--fg-muted)]">{creative.rationale}</p>
          {creative.menu_fit_notes && <p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">{creative.menu_fit_notes}</p>}
        </div>
      )}

      {recommendations.length > 0 ? (
        <div className="mt-4 space-y-2">
          {recommendations.map((item) => <RecommendationRow key={item.code} item={item} />)}
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2Icon className="h-4 w-4" /> {t('labNoWarnings')}
        </p>
      )}
    </section>
  );
}

function Score({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  const color = value >= 75 ? 'rgb(22,101,52)' : value >= 50 ? 'rgb(161,98,7)' : 'rgb(185,28,28)';
  return (
    <div className="rounded-lg border border-[var(--line)] p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] text-[var(--fg-muted)]">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{Math.round(value)}<span className="text-[10px] font-normal">/100</span></div>
    </div>
  );
}

function RecommendationRow({ item }: { item: Recommendation }) {
  const critical = item.severity === 'critical';
  const warning = item.severity === 'warning';
  return (
    <div className="flex gap-2 rounded-lg border p-2.5" style={{ borderColor: critical ? 'rgba(220,38,38,.35)' : warning ? 'rgba(202,138,4,.35)' : 'var(--line)' }}>
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: critical ? 'rgb(185,28,28)' : warning ? 'rgb(161,98,7)' : 'var(--fg-muted)' }} />
      <div>
        <p className="text-xs font-semibold text-[var(--fg)]">{item.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-muted)]">{item.message}</p>
      </div>
    </div>
  );
}
