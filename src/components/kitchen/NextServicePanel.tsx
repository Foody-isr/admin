'use client';

import { useState } from 'react';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { serviceProductionNeed } from '@/lib/kitchen-service-plan';
import type { DailyPlanItem, PrepItem } from '@/lib/api';

/** Gives the chef a temporary lunch/dinner coverage simulation using live stock. */
export default function NextServicePanel({ items, canProduce, onProduce }: {
  items: PrepItem[]; canProduce: boolean; onProduce: (item: DailyPlanItem) => void;
}) {
  const { t } = useI18n();
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  return (
    <details className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <summary className="cursor-pointer px-5 py-4 font-semibold">{t('dailyServiceTitle')}</summary>
      <div className="space-y-3 px-5 pb-5">
        <p className="max-w-3xl text-sm text-fg-secondary">{t('dailyServiceHint')}</p>
        <label className="block text-xs text-fg-secondary">{t('preparation')}<select value={selected?.id ?? ''} onChange={(event) => setSelectedId(Number(event.target.value))} className="input mt-1 w-full max-w-md">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div>
          {selected && [selected].map((item) => {
            const target = targets[item.id];
            const need = target === undefined ? null : serviceProductionNeed(item, target);
            return (
              <div key={item.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_150px_180px] sm:items-center">
                <div><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-fg-secondary">{t('current')}: {item.quantity} {item.unit}</p></div>
                <label className="text-xs text-fg-secondary">{t('dailyServiceTarget')} ({item.unit})
                  <NumberInput min={0} value={target ?? ''} integer={item.unit === 'unit'} placeholder="—" className="input mt-1 w-full" onChange={(value) => setTargets((current) => ({ ...current, [item.id]: value }))} />
                </label>
                <div className="text-sm">{need && <><p className={need.shortfall_qty > 0 ? 'text-[var(--warning-500)]' : 'text-[var(--success-500)]'}>{t('dailyServiceMissing')}: {need.shortfall_qty.toFixed(2)} {item.unit}</p>
                  {item.quantity < 0 ? <p className="mt-1 text-xs text-[var(--warning-500)]">{t('chefNegativePrep')}</p> : canProduce && need.batches_needed > 0 && <button onClick={() => onProduce(need)} className="btn-secondary mt-2 text-xs">{t('dailyConfirmProduction')}</button>}
                  {need.shortfall_qty > 0 && item.yield_per_batch <= 0 && <p className="mt-1 text-xs text-red-500">{t('yieldPerBatch')}</p>}</>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
