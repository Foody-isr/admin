'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckIcon, FlaskConicalIcon, PackageIcon, SearchIcon, XIcon } from 'lucide-react';
import {
  listPrepItems,
  listStockItems,
  type PrepItem,
  type StockItem,
} from '@/lib/api';
import { Button } from '@/components/ds';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { Component } from '../types';

type LibraryTab = 'stock' | 'prep';

/** Restaurant-scoped stock/preparation picker used by the manual recipe flow. */
export function IngredientLibraryPicker({
  restaurantId,
  usedStockIds,
  usedPrepIds,
  onAdd,
  onClose,
}: {
  restaurantId: number;
  usedStockIds: Set<string>;
  usedPrepIds: Set<string>;
  onAdd: (component: Component) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const [tab, setTab] = useState<LibraryTab>('stock');
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockItems, prepItems] = await Promise.all([
        listStockItems(restaurantId, { is_active: true }),
        listPrepItems(restaurantId, { is_active: true }),
      ]);
      setStocks(stockItems);
      setPreps(prepItems);
    } catch (cause) {
      console.error('Failed to load recipe library', cause);
      setError(t('labLibraryLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const query = search.trim().toLocaleLowerCase();
  const visibleStocks = useMemo(() => stocks.filter((item) => !query || `${item.name} ${item.category}`.toLocaleLowerCase().includes(query)), [stocks, query]);
  const visiblePreps = useMemo(() => preps.filter((item) => !query || `${item.name} ${item.category}`.toLocaleLowerCase().includes(query)), [preps, query]);

  const addStock = (item: StockItem) => {
    if (usedStockIds.has(String(item.id))) return;
    const defaults = quantityDefaults(item.unit);
    const customUnits = (item.unit_conversions ?? []).map((conversion) => conversion.custom_unit?.name).filter((name): name is string => Boolean(name));
    onAdd({
      kind: 'stock_existing', stock_item_id: String(item.id), name_primary: item.name,
      qty: defaults.qty, unit: defaults.unit, waste_pct: 0,
      available_units: unique([...familyUnits(item.unit), ...customUnits]),
      cost_per_unit: item.cost_per_unit, available_quantity: item.quantity,
      cost_status: item.cost_per_unit > 0 ? 'verified' : 'unknown', cost_source: item.cost_per_unit > 0 ? 'stock' : 'missing',
    });
  };

  const addPrep = (item: PrepItem) => {
    if (usedPrepIds.has(String(item.id))) return;
    const defaults = quantityDefaults(item.unit);
    onAdd({
      kind: 'prep_existing', prep_item_id: String(item.id), name_primary: item.name,
      qty: defaults.qty, unit: defaults.unit, waste_pct: 0,
      available_units: familyUnits(item.unit), cost_per_unit: item.cost_per_unit,
      available_quantity: item.quantity, cost_status: item.cost_per_unit > 0 ? 'verified' : 'unknown',
      cost_source: item.cost_per_unit > 0 ? 'preparation' : 'missing',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ingredient-picker-title" className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-5 sm:px-6">
          <div>
            <h3 id="ingredient-picker-title" className="text-lg font-semibold tracking-[-0.02em] text-[var(--fg)]">{t('labAddFromLibrary')}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--fg-muted)]">{t('labAddFromLibraryHelp')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('cancel')} className="rounded-[7px] p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><XIcon className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-[var(--line)] px-5 pt-4 sm:px-6">
          <div className="flex gap-5" role="tablist" aria-label={t('labLibraryTabs')}>
            <TabButton active={tab === 'stock'} onClick={() => setTab('stock')} icon={<PackageIcon className="h-4 w-4" />} label={`${t('labStockTab')} (${stocks.length})`} />
            <TabButton active={tab === 'prep'} onClick={() => setTab('prep')} icon={<FlaskConicalIcon className="h-4 w-4" />} label={`${t('labPrepTab')} (${preps.length})`} />
          </div>
          <label className="relative my-4 block">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('labSearchIngredient')} className="h-10 w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)]" />
          </label>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? <p className="p-5 text-sm text-[var(--fg-muted)]">{t('labLoading')}</p> : error ? (
            <div className="p-5"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button variant="secondary" size="sm" className="mt-3" onClick={load}>{t('retry')}</Button></div>
          ) : tab === 'stock' ? (
            <LibraryList items={visibleStocks} usedIds={usedStockIds} money={money} emptyLabel={t('labNoStockMatches')} addedLabel={t('labAlreadyAdded')} addLabel={t('labAddIngredient')} onAdd={addStock} />
          ) : (
            <LibraryList items={visiblePreps} usedIds={usedPrepIds} money={money} emptyLabel={t('labNoPrepMatches')} addedLabel={t('labAlreadyAdded')} addLabel={t('labAddIngredient')} onAdd={addPrep} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold focus-visible:outline-none ${active ? 'border-[var(--brand-500)] text-[var(--fg)]' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}>{icon}{label}</button>;
}

function LibraryList<T extends StockItem | PrepItem>({ items, usedIds, money, emptyLabel, addedLabel, addLabel, onAdd }: { items: T[]; usedIds: Set<string>; money: (amount: number, options?: { decimals?: number }) => string; emptyLabel: string; addedLabel: string; addLabel: string; onAdd: (item: T) => void }) {
  if (items.length === 0) return <p className="p-6 text-center text-sm text-[var(--fg-muted)]">{emptyLabel}</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const used = usedIds.has(String(item.id));
        return (
          <li key={item.id}>
            <button type="button" disabled={used} onClick={() => onAdd(item)} className="group flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3 py-3 text-start hover:border-[var(--line)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default disabled:opacity-60">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] ${used ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--surface-2)] text-[var(--fg-muted)] group-hover:bg-[var(--surface)]'}`}>{used ? <CheckIcon className="h-4 w-4" /> : <PackageIcon className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--fg)]">{item.name}</span>
                <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">{item.category || '—'} · {money(item.cost_per_unit, { decimals: 2 })}/{item.unit}</span>
              </span>
              <span className={`text-xs font-semibold ${used ? 'text-[var(--success-500)]' : 'text-[var(--brand-500)]'}`}>{used ? addedLabel : addLabel}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function quantityDefaults(unit: string): { qty: number; unit: string } {
  if (unit === 'kg' || unit === 'g') return { qty: 100, unit: 'g' };
  if (unit === 'l' || unit === 'ml') return { qty: 100, unit: 'ml' };
  return { qty: 1, unit };
}

function familyUnits(unit: string): string[] {
  if (unit === 'kg' || unit === 'g') return ['g', 'kg'];
  if (unit === 'l' || unit === 'ml') return ['ml', 'l'];
  return [unit];
}

function unique(values: string[]): string[] { return Array.from(new Set(values.filter(Boolean))); }
