'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, FlaskConicalIcon, PackageIcon, SearchIcon } from 'lucide-react';
import {
  listPrepItems,
  listStockItems,
  type PrepItem,
  type StockItem,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { Button, Tabs, TabsList, Tab, TabsContent } from '@/components/ds';
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
  const { t, direction } = useI18n();
  const field=useRef<HTMLInputElement>(null);
  const request=useRef({value:0});
  const { money } = useCurrency();
  const [tab, setTab] = useState<LibraryTab>('stock');
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sequence=++request.current.value;
    setLoading(true);
    setError(null);
    try {
      const [stockItems, prepItems] = await Promise.all([
        listStockItems(restaurantId, { is_active: true }),
        listPrepItems(restaurantId, { is_active: true }),
      ]);
      if(sequence!==request.current.value)return;
      setStocks(stockItems);
      setPreps(prepItems);
    } catch (cause) {
      console.error('Failed to load recipe library', cause);
      if(sequence===request.current.value)setError(t('labLibraryLoadFailed'));
    } finally {
      if(sequence===request.current.value)setLoading(false);
    }
  }, [restaurantId, t]);

  useEffect(()=>{const scope=request.current;void load();return()=>{scope.value+=1;};},[load]);

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

  return <Modal title={t('labAddFromLibrary')} subtitle={t('labAddFromLibraryHelp')} size="2xl" onClose={onClose} initialFocusRef={field}>
    <Tabs dir={direction} value={tab} onValueChange={value=>setTab(value as LibraryTab)}><TabsList className="grid grid-cols-2 overflow-visible" aria-label={t('labLibraryTabs')}><Tab value="stock" className="min-h-11 min-w-0 whitespace-normal px-2"><PackageIcon />{t('labStockTab')} ({stocks.length})</Tab><Tab value="prep" className="min-h-11 min-w-0 whitespace-normal px-2"><FlaskConicalIcon />{t('labPrepTab')} ({preps.length})</Tab></TabsList>
          <label className="relative my-4 block">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input ref={field} aria-label={t('labSearchIngredient')} dir="auto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('labSearchIngredient')} className="h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 text-base text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] sm:h-11 sm:text-sm" />
          </label>

        <div className="min-h-[260px] flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? <p className="p-5 text-sm text-[var(--fg-muted)]">{t('labLoading')}</p> : error ? (
            <div role="alert" className="p-5"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button variant="secondary" size="sm" className="mt-3" onClick={load}>{t('retry')}</Button></div>
          ) : <><TabsContent value="stock">
            <LibraryList items={visibleStocks} usedIds={usedStockIds} money={money} emptyLabel={t('labNoStockMatches')} addedLabel={t('labAlreadyAdded')} addLabel={t('labAddIngredient')} onAdd={addStock} />
          </TabsContent><TabsContent value="prep">
            <LibraryList items={visiblePreps} usedIds={usedPrepIds} money={money} emptyLabel={t('labNoPrepMatches')} addedLabel={t('labAlreadyAdded')} addLabel={t('labAddIngredient')} onAdd={addPrep} />
          </TabsContent></>}
        </div>
    </Tabs></Modal>;
}

function LibraryList<T extends StockItem | PrepItem>({ items, usedIds, money, emptyLabel, addedLabel, addLabel, onAdd }: { items: T[]; usedIds: Set<string>; money: (amount: number, options?: { decimals?: number }) => string; emptyLabel: string; addedLabel: string; addLabel: string; onAdd: (item: T) => void }) {
  if (items.length === 0) return <p className="p-6 text-center text-sm text-[var(--fg-muted)]">{emptyLabel}</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const used = usedIds.has(String(item.id));
        return (
          <li key={item.id}>
            <button type="button" disabled={used} onClick={() => onAdd(item)} className="group flex w-full items-center gap-3 rounded-[8px] border border-transparent px-3 py-3 text-start hover:border-[var(--line)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default disabled:opacity-60">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${used ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--surface-2)] text-[var(--fg-muted)] group-hover:bg-[var(--surface)]'}`}>{used ? <CheckIcon className="h-4 w-4" /> : <PackageIcon className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-[var(--fg)]">{item.name}</span>
                <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">{item.category || '—'} · {money(item.cost_per_unit, { decimals: 2 })}/{item.unit}</span>
              </span>
              <span className={`text-xs font-semibold ${used ? 'text-[var(--success-500)]' : 'text-[var(--brand-ink)]'}`}>{used ? addedLabel : addLabel}</span>
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
