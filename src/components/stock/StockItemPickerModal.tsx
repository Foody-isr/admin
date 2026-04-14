'use client';

import { useMemo, useState } from 'react';
import { StockItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import StockFiltersDrawer, {
  FilterView,
  FilterCategory,
} from '@/components/stock/StockFiltersDrawer';
import {
  XMarkIcon, MagnifyingGlassIcon, ChevronDownIcon, PhotoIcon, CheckIcon,
} from '@heroicons/react/24/outline';

export interface StockItemPickerModalProps {
  stockItems: StockItem[];
  mode: 'add' | 'swap';
  excludeIds?: Set<number>;
  initialSelectedId?: number;
  title?: string;
  onConfirm: (selectedIds: number[]) => void;
  onClose: () => void;
}

export default function StockItemPickerModal({
  stockItems,
  mode,
  excludeIds,
  initialSelectedId,
  title,
  onConfirm,
  onClose,
}: StockItemPickerModalProps) {
  const { t } = useI18n();

  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });
  const [picked, setPicked] = useState<Set<number>>(
    () => (initialSelectedId ? new Set([initialSelectedId]) : new Set()),
  );

  const categories: FilterCategory[] = useMemo(
    () =>
      Array.from(new Set(stockItems.map((s) => s.category).filter(Boolean)))
        .sort()
        .map((name) => ({ name })),
    [stockItems],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockItems
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .filter((s) => selectedCategories.size === 0 || selectedCategories.has(s.category))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stockItems, search, selectedCategories]);

  const toggle = (id: number, disabled: boolean) => {
    if (disabled) return;
    setPicked((prev) => {
      if (mode === 'swap') return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    if (picked.size === 0) return;
    onConfirm(Array.from(picked));
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div
          className="rounded-modal shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
          style={{ background: 'var(--surface)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b shrink-0"
            style={{ borderColor: 'var(--divider)' }}
          >
            <h3 className="font-semibold text-fg-primary">{title ?? t('selectIngredients')}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
              aria-label={t('close')}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Filters row */}
          <div className="px-5 py-3 flex items-center gap-2 shrink-0 border-b" style={{ borderColor: 'var(--divider)' }}>
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
              <input
                type="text"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input !pl-10 text-sm h-10 w-full rounded-full"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersDrawer({ open: true, view: 'category' })}
              className="flex items-center gap-2 h-10 px-4 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
            >
              {t('category')}{' '}
              <span className="font-semibold text-fg-primary">
                {selectedCategories.size === 0 ? t('all') : `${selectedCategories.size}`}
              </span>
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-fg-secondary">
                {stockItems.length === 0 ? t('noStockItems') : t('tryAdjustingFilters')}
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {filtered.map((s) => {
                  const disabled = excludeIds?.has(s.id) ?? false;
                  const isPicked = picked.has(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => toggle(s.id, disabled)}
                        disabled={disabled}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                          disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : isPicked
                            ? 'bg-brand-500/10'
                            : 'hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        {s.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                            <PhotoIcon className="w-5 h-5 text-fg-tertiary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-fg-primary truncate">{s.name}</div>
                          <div className="text-xs text-fg-secondary truncate">
                            {s.category || '—'} · {s.unit}
                          </div>
                        </div>
                        {disabled ? (
                          <span className="text-[10px] uppercase tracking-wider text-fg-tertiary font-medium shrink-0">
                            {t('alreadyAdded')}
                          </span>
                        ) : mode === 'swap' ? (
                          <span
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                              isPicked ? 'border-brand-500 bg-brand-500' : 'border-fg-secondary/40'
                            }`}
                          >
                            {isPicked && <span className="w-2 h-2 rounded-full bg-white" />}
                          </span>
                        ) : (
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                              isPicked ? 'bg-brand-500 border-brand-500' : 'border border-fg-secondary/40'
                            }`}
                          >
                            {isPicked && <CheckIcon className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0"
            style={{ borderColor: 'var(--divider)' }}
          >
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={picked.size === 0}
              className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50"
            >
              {mode === 'swap'
                ? t('confirm')
                : t('addSelected').replace('{count}', String(picked.size))}
            </button>
          </div>
        </div>
      </div>

      <StockFiltersDrawer
        open={filtersDrawer.open}
        initialView={filtersDrawer.view}
        onClose={() => setFiltersDrawer((prev) => ({ ...prev, open: false }))}
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
      />
    </>
  );
}
