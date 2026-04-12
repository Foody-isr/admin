'use client';

import { useMemo, useState } from 'react';
import { StockCategory } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: StockCategory[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function CategoryFilterDrawer({
  open,
  onClose,
  categories,
  selected,
  onChange,
}: Props) {
  const { t, direction } = useI18n();
  const isRtl = direction === 'rtl';
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  const reset = () => onChange(new Set());

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
          className="flex items-center justify-between px-4 h-14 border-b"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
              aria-label={t('close') || 'Close'}
            >
              {isRtl ? (
                <ChevronRightIcon className="w-4 h-4" />
              ) : (
                <ChevronLeftIcon className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-1 text-sm min-w-0">
              <span className="text-fg-secondary">{t('filterBy')}</span>
              <span className="text-fg-secondary">›</span>
              <span className="font-semibold text-fg-primary truncate">
                {t('category')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
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
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
              aria-label={t('close') || 'Close'}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b" style={{ borderColor: 'var(--divider)' }}>
          <div className="relative">
            <MagnifyingGlassIcon
              className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-fg-secondary ${
                isRtl ? 'right-3' : 'left-3'
              }`}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchCategories')}
              className={`input py-2 text-sm w-full ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-fg-secondary">
              {t('noData') || '—'}
            </div>
          ) : (
            <ul>
              {filtered.map((cat) => {
                const isSelected = selected.has(cat.name);
                return (
                  <li key={cat.name}>
                    <button
                      type="button"
                      onClick={() => toggle(cat.name)}
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
      </div>
    </>
  );
}
