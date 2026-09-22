'use client';

import { useCallback, useEffect, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { listAllItems, type MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/**
 * MenuItemPicker — modal that lets the user pick one or more menu items
 * from the restaurant's global item catalog to seed a recipe-lab generation.
 */
export function MenuItemPicker({
  restaurantId,
  onPick,
  onClose,
  selectionMode = 'multiple',
  title,
  description,
}: {
  restaurantId: number;
  onPick: (ids: number[]) => void;
  onClose: () => void;
  selectionMode?: 'single' | 'multiple';
  title?: string;
  description?: string;
}) {
  const { t } = useI18n();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const data = await listAllItems(restaurantId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleItem = (id: number) => {
    setSelected((prev) => {
      if (selectionMode === 'single') return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size > 0) onPick(Array.from(selected));
  };

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = normalizedSearch
    ? items.filter((item) => item.name.toLocaleLowerCase().includes(normalizedSearch))
    : items;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 pt-[var(--safe-top)] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      {/* Card — stop backdrop propagation */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-menu-picker-title"
        className="relative flex max-h-[calc(100svh-var(--safe-top))] w-full max-w-xl flex-col overflow-hidden rounded-t-[22px] bg-[var(--surface)] pb-[var(--safe-bottom)] shadow-2xl sm:max-h-[82svh] sm:rounded-[18px] sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-5 sm:px-6">
          <div>
            <h3 id="lab-menu-picker-title" className="text-lg font-semibold tracking-[-0.02em] text-[var(--fg)]">
              {title ?? t('labPickItems')}
            </h3>
            {description && <p className="mt-1 text-sm leading-5 text-[var(--fg-muted)]">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            aria-label={t('cancel')}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="border-b border-[var(--line)] px-5 py-3 sm:px-6">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('labSearchMenuItem')}
              className="h-11 w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 text-base text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] sm:h-10 sm:text-sm"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labLoading')}</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labPickerEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-3 transition-colors ${selected.has(item.id) ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_7%,var(--surface))]' : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-2)]'}`}>
                    <input
                      type={selectionMode === 'single' ? 'radio' : 'checkbox'}
                      name={selectionMode === 'single' ? 'lab-menu-item' : undefined}
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 accent-[var(--brand-500)] cursor-pointer"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--fg)]">{item.name}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-[var(--fg-muted)]">₪{item.price.toFixed(2)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--line)] px-4 py-4 sm:flex sm:items-center sm:justify-end sm:px-5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            {selectionMode === 'single' ? t('labOpenRecipeSheet') : t('labConfirm')} {selectionMode === 'multiple' && selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
