'use client';

import { useState } from 'react';
import { NumberInput } from '@/components/ui/NumberInput';
import { setProductionTarget, type KitchenSummary, type PrepItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Objectives are optional and saved only after the chef explicitly confirms. */
export default function ProductionObjectives({ rid, reportId, items, summary, onSaved }: {
  rid: number; reportId: number; items: PrepItem[]; summary: KitchenSummary | null; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  if (!selected) return null;
  return <details className="border-t border-[var(--line)]">
    <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-brand-500">{t('chefEditObjectives')}</summary>
    <div className="space-y-2 px-5 pb-4"><p className="max-w-2xl text-xs text-fg-secondary">{t('chefObjectivesHint')}</p>
      <label className="block text-xs text-fg-secondary">{t('preparation')}<select className="input mt-1 w-full max-w-md" value={selected.id} onChange={(event) => setSelectedId(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {[selected].map((item) => {
        const saved = summary?.preparations?.find((row) => row.prep_item_id === item.id)?.target_qty;
        const value = values[item.id] ?? saved ?? undefined;
        return <form key={item.id} className="flex flex-wrap items-end gap-3 py-2" onSubmit={async (event) => {
          event.preventDefault(); if (value === undefined || !Number.isFinite(value) || value < 0) return;
          setSaving(item.id); setError('');
          try { await setProductionTarget(rid, reportId, item.id, value); await onSaved(); }
          catch { setError(t('saveFailed')); } finally { setSaving(null); }
        }}><label className="min-w-0 flex-1 text-sm">{item.name}<span className="ms-2 text-xs text-fg-secondary">({item.unit})</span><NumberInput aria-label={`${item.name} (${item.unit})`} value={value} format={String} min={0} onChange={(qty) => setValues((current) => ({ ...current, [item.id]: qty }))} placeholder="—" className="input mt-1 w-full max-w-40" /></label>
          <button type="submit" disabled={saving !== null || value === undefined} className="btn-secondary text-xs">{saving === item.id ? t('saving') : t('save')}</button></form>;
      })}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  </details>;
}
