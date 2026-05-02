'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  CheckCircle,
  ChevronRight,
  Search,
  X,
  ArrowLeft,
} from 'lucide-react';

export type FilterView = 'index' | 'category' | 'status';

export interface FilterCategory {
  name: string;
  color?: string;
}

export interface FilterStatusOption {
  value: string;
  label: string;
  color?: string;
}

interface Props {
  open: boolean;
  initialView: FilterView;
  onClose: () => void;
  categories: FilterCategory[];
  selectedCategories: Set<string>;
  onCategoryChange: (next: Set<string>) => void;
  statuses?: FilterStatusOption[];
  selectedStatuses?: Set<string>;
  onStatusChange?: (next: Set<string>) => void;
  statusLabel?: string;
}

export default function StockFiltersDrawer({
  open,
  initialView,
  onClose,
  categories,
  selectedCategories,
  onCategoryChange,
  statuses,
  selectedStatuses,
  onStatusChange,
  statusLabel,
}: Props) {
  const { t } = useI18n();

  const [view, setView] = useState<FilterView>(initialView);
  const [entryView, setEntryView] = useState<FilterView>(initialView);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setView(initialView);
      setEntryView(initialView);
      setSearch('');
    }
  }, [open, initialView]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const filteredStatuses = useMemo(() => {
    if (!statuses) return [];
    const q = search.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) => s.label.toLowerCase().includes(q));
  }, [statuses, search]);

  if (!open) return null;

  const toggleCategory = (name: string) => {
    const next = new Set(selectedCategories);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onCategoryChange(next);
  };

  const toggleStatus = (value: string) => {
    if (!onStatusChange) return;
    const next = new Set(selectedStatuses ?? new Set<string>());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onStatusChange(next);
  };

  const resetAll = () => {
    onCategoryChange(new Set());
    onStatusChange?.(new Set());
  };

  const goBack = () => {
    if (view === entryView) {
      onClose();
    } else {
      setView(entryView);
      setSearch('');
    }
  };

  const showBackButton = view !== 'index' && entryView === 'index';

  const statusText = statusLabel ?? t('status');

  const title =
    view === 'index'
      ? t('filterBy') || 'Filtrer par'
      : view === 'category'
      ? t('category') || 'Catégorie'
      : statusText;

  const subtitle =
    view === 'index'
      ? t('selectFilter') || 'Sélectionnez un filtre'
      : view === 'category'
      ? t('selectCategory') || 'Sélectionnez une catégorie'
      : t('selectStatus') || 'Sélectionnez un statut';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-[#111111] shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3 min-w-0">
            {showBackButton && (
              <button
                onClick={goBack}
                className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
                aria-label={t('back') || 'Back'}
              >
                <ArrowLeft size={20} className="text-neutral-600 dark:text-neutral-400" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white truncate">{title}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            aria-label={t('close') || 'Close'}
          >
            <X size={20} className="text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Search (category/status views only) */}
        {view !== 'index' && (
          <div className="p-6 border-b border-neutral-200 dark:border-neutral-800">
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
              />
              <input
                type="text"
                placeholder={
                  view === 'category'
                    ? t('searchCategory') || 'Rechercher une catégorie...'
                    : t('searchStatus') || 'Rechercher un statut...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === 'index' && (
            <div className="space-y-2">
              <FilterIndexRow
                label={t('category') || 'Catégorie'}
                summary={
                  selectedCategories.size === 0
                    ? t('allCategories') || 'Toutes'
                    : Array.from(selectedCategories).join(', ')
                }
                count={selectedCategories.size}
                onClick={() => setView('category')}
              />
              {statuses && statuses.length > 0 && onStatusChange && (
                <FilterIndexRow
                  label={statusText}
                  summary={
                    (selectedStatuses?.size ?? 0) === 0
                      ? t('all') || 'Tous'
                      : statuses
                          .filter((s) => selectedStatuses?.has(s.value))
                          .map((s) => s.label)
                          .join(', ')
                  }
                  count={selectedStatuses?.size ?? 0}
                  onClick={() => setView('status')}
                />
              )}
            </div>
          )}

          {view === 'category' && (
            <div className="space-y-2">
              {filteredCategories.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-8">
                  {t('noResults') || 'No results'}
                </p>
              ) : (
                filteredCategories.map((cat) => (
                  <FilterOptionRow
                    key={cat.name}
                    name={cat.name}
                    color={cat.color}
                    active={selectedCategories.has(cat.name)}
                    onClick={() => toggleCategory(cat.name)}
                  />
                ))
              )}
            </div>
          )}

          {view === 'status' && statuses && onStatusChange && (
            <div className="space-y-2">
              {filteredStatuses.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-8">
                  {t('noResults') || 'No results'}
                </p>
              ) : (
                filteredStatuses.map((s) => (
                  <FilterOptionRow
                    key={s.value}
                    name={s.label}
                    color={s.color}
                    active={selectedStatuses?.has(s.value) ?? false}
                    onClick={() => toggleStatus(s.value)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 flex gap-3">
          <button
            onClick={resetAll}
            className="flex-1 px-4 py-2.5 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors font-medium text-neutral-700 dark:text-neutral-300"
          >
            {t('reset') || 'Réinitialiser'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium"
          >
            {t('apply') || 'Appliquer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Index row (filter category → opens sub-view) ──────────────

function FilterIndexRow({
  label,
  summary,
  count,
  onClick,
}: {
  label: string;
  summary: string;
  count: number;
  onClick: () => void;
}) {
  const active = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left ${
        active
          ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
          : 'bg-neutral-50 dark:bg-[#1a1a1a] border-2 border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">{label}</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">{summary}</p>
      </div>
      {count > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-orange-500 text-white text-xs font-semibold">
          {count}
        </span>
      )}
      <ChevronRight size={18} className="text-neutral-400 shrink-0" />
    </button>
  );
}

// ─── Option row (selectable in category/status views) ──────────

function FilterOptionRow({
  name,
  color,
  active,
  onClick,
}: {
  name: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left ${
        active
          ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
          : 'bg-neutral-50 dark:bg-[#1a1a1a] border-2 border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      {color && (
        <span
          className="size-3 rounded-full shrink-0"
          style={{ background: color }}
        />
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">{name}</h3>
      </div>
      {active && <CheckCircle size={20} className="text-orange-500 shrink-0" />}
    </button>
  );
}
