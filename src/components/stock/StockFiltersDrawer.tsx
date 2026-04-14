'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

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
  const { t, direction } = useI18n();
  const isRtl = direction === 'rtl';

  const [view, setView] = useState<FilterView>(initialView);
  const [entryView, setEntryView] = useState<FilterView>(initialView);
  const [categorySearch, setCategorySearch] = useState('');

  useEffect(() => {
    if (open) {
      setView(initialView);
      setEntryView(initialView);
      setCategorySearch('');
    }
  }, [open, initialView]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const toggleCategory = (name: string) => {
    const next = new Set(selectedCategories);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onCategoryChange(next);
  };

  const resetAll = () => {
    onCategoryChange(new Set());
    onStatusChange?.(new Set());
  };

  const toggleStatus = (value: string) => {
    if (!onStatusChange) return;
    const next = new Set(selectedStatuses ?? new Set<string>());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onStatusChange(next);
  };

  const statusText = statusLabel ?? t('status');

  const goBack = () => {
    if (view === entryView) {
      onClose();
    } else {
      setView(entryView);
    }
  };

  const BackIcon = isRtl ? ChevronRightIcon : ChevronLeftIcon;
  const ForwardIcon = isRtl ? ChevronLeftIcon : ChevronRightIcon;

  const showBackButton = view !== 'index' && entryView === 'index';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 bottom-0 z-50 w-[400px] max-w-full flex flex-col transition-transform duration-300 ease-in-out ${
          isRtl ? 'left-0' : 'right-0'
        } ${
          open
            ? 'translate-x-0'
            : isRtl
            ? '-translate-x-full'
            : 'translate-x-full'
        }`}
        style={{
          background: 'var(--surface)',
          borderLeft: isRtl ? 'none' : '1px solid var(--divider)',
          borderRight: isRtl ? '1px solid var(--divider)' : 'none',
        }}
      >
        <div
          className="flex items-center justify-between px-4 h-14 border-b shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {showBackButton ? (
              <button
                onClick={goBack}
                className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
                aria-label={t('back') || 'Back'}
              >
                <BackIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
                aria-label={t('close') || 'Close'}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="text-xs font-medium text-fg-secondary hover:text-fg-primary transition-colors px-2 py-1"
            >
              {t('reset')}
            </button>
            <button
              onClick={onClose}
              className="text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 rounded-full px-3 py-1.5 transition-colors"
            >
              {t('apply')}
            </button>
          </div>
        </div>

        {view === 'index' && (
          <div className="flex-1 overflow-auto">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-lg font-semibold text-fg-primary">{t('filterBy')}</h2>
            </div>
            <ul>
              <li>
                <button
                  type="button"
                  onClick={() => setView('category')}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[var(--surface-subtle)] transition-colors text-left border-t"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fg-primary">{t('category')}</div>
                    <div className="text-xs text-fg-secondary truncate">
                      {selectedCategories.size === 0
                        ? t('allCategories')
                        : Array.from(selectedCategories).join(', ')}
                    </div>
                  </div>
                  <ForwardIcon className="w-4 h-4 text-fg-secondary shrink-0" />
                </button>
              </li>
              {statuses && statuses.length > 0 && onStatusChange && (
                <li>
                  <button
                    type="button"
                    onClick={() => setView('status')}
                    className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[var(--surface-subtle)] transition-colors text-left border-t"
                    style={{ borderColor: 'var(--divider)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg-primary">{statusText}</div>
                      <div className="text-xs text-fg-secondary truncate">
                        {(selectedStatuses?.size ?? 0) === 0
                          ? t('all')
                          : statuses
                              .filter((s) => selectedStatuses?.has(s.value))
                              .map((s) => s.label)
                              .join(', ')}
                      </div>
                    </div>
                    <ForwardIcon className="w-4 h-4 text-fg-secondary shrink-0" />
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}

        {view === 'status' && statuses && onStatusChange && (
          <>
            <div className="px-4 pt-4 pb-2 shrink-0">
              <h2 className="text-lg font-semibold text-fg-primary">{statusText}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <ul>
                {statuses.map((s) => {
                  const isSelected = selectedStatuses?.has(s.value) ?? false;
                  return (
                    <li key={s.value}>
                      <button
                        type="button"
                        onClick={() => toggleStatus(s.value)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors text-left"
                      >
                        {s.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: s.color }}
                          />
                        )}
                        <span className="flex-1 text-sm text-fg-primary truncate">
                          {s.label}
                        </span>
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500'
                              : 'border border-fg-secondary/40'
                          }`}
                        >
                          {isSelected && (
                            <CheckIcon className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {view === 'category' && (
          <>
            <div className="px-4 pt-4 pb-2 shrink-0">
              <h2 className="text-lg font-semibold text-fg-primary">{t('category')}</h2>
            </div>
            <div className="px-4 pb-3 shrink-0">
              <div className="relative">
                <MagnifyingGlassIcon
                  className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-fg-secondary pointer-events-none z-10 ${
                    isRtl ? 'right-3' : 'left-3'
                  }`}
                />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder={t('searchCategories')}
                  className={`input py-2 text-sm w-full ${isRtl ? '!pr-9 !pl-3' : '!pl-9 !pr-3'}`}
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {filteredCategories.length === 0 ? (
                <div className="p-6 text-center text-sm text-fg-secondary">
                  {t('noData') || '—'}
                </div>
              ) : (
                <ul>
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategories.has(cat.name);
                    return (
                      <li key={cat.name}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.name)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: cat.color || '#999' }}
                          />
                          <span className="flex-1 text-sm text-fg-primary truncate">
                            {cat.name}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-brand-500 border-brand-500'
                                : 'border border-fg-secondary/40'
                            }`}
                          >
                            {isSelected && (
                              <CheckIcon className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
