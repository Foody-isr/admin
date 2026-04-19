'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, createMenuItem,
  MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  MagnifyingGlassIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon,
  PhotoIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';

// ─── Flat item with category name for table display ────────────────────────

interface FlatItem extends MenuItem {
  category_name: string;
}

function flattenItems(categories: MenuCategory[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const cat of categories) {
    for (const item of cat.items ?? []) {
      items.push({ ...item, category_name: cat.name });
    }
  }
  return items;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function ItemLibraryPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // Selection for checkboxes
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Variant accordion
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpandedItemIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Quick create
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [qcName, setQcName] = useState('');
  const [qcPrice, setQcPrice] = useState('');
  const [qcCategoryId, setQcCategoryId] = useState(0);
  const [qcSaving, setQcSaving] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────

  const reload = useCallback(() => {
    return getAllCategories(rid).then(setCategories).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // ─── Derived data ─────────────────────────────────────────────────

  const allItems = flattenItems(categories);
  const filtered = allItems.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && item.category_name !== categoryFilter) return false;
    if (statusFilter === 'active' && !item.is_active) return false;
    if (statusFilter === 'inactive' && item.is_active) return false;
    return true;
  });

  const categoryNames = Array.from(new Set(categories.map((c) => c.name)));

  // ─── Item actions ─────────────────────────────────────────────────

  const handleDeleteItem = async (id: number) => {
    if (!confirm(t('delete') + '?')) return;
    await deleteMenuItem(rid, id);
    reload();
  };

  const handleToggleAvailability = async (item: FlatItem) => {
    await updateMenuItem(rid, item.id, { is_active: !item.is_active });
    reload();
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleQuickCreate = async () => {
    if (!qcName.trim()) return;
    setQcSaving(true);
    try {
      await createMenuItem(rid, {
        name: qcName.trim(),
        price: parseFloat(qcPrice) || 0,
        category_id: qcCategoryId || categories[0]?.id,
        is_active: true,
      });
      setQcName('');
      setQcPrice('');
      setQcCategoryId(0);
      setQuickCreateOpen(false);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setQcSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 text-sm h-11 w-full rounded-full"
          />
        </div>

        {/* Category filter */}
        <FilterDropdown
          label={t('category')}
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[{ value: '', label: t('all') }, ...categoryNames.map((n) => ({ value: n, label: n }))]}
        />

        {/* Status filter */}
        <FilterDropdown
          label={t('status')}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: t('all') },
            { value: 'active', label: t('active') },
            { value: 'inactive', label: t('inactive') },
          ]}
        />

        <div className="flex-1" />

        {/* Actions dropdown */}
        <ActionsDropdown
          actions={[
            { label: t('refresh'), onClick: reload, icon: <ArrowPathIcon className="w-4 h-4" /> },
          ]}
        />

        {/* Create item button */}
        <button
          onClick={() => router.push(`/${rid}/menu/items/new`)}
          className="btn-primary rounded-full px-5 py-2 flex items-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          {t('createItem')}
        </button>
      </div>

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <PhotoIcon className="w-12 h-12 text-fg-tertiary" />
          <p className="text-base text-fg-secondary text-center max-w-md">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
          {allItems.length === 0 && (
            <button
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="btn-primary mt-2 rounded-full"
            >
              {t('createItem')}
            </button>
          )}
        </div>
      ) : (
        <div>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider">
                <th className="py-3 px-2 font-medium w-14 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-[var(--divider)]"
                  />
                </th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('item')}</th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('category')}</th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('availability')}</th>
                <th className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('price')}</th>
                <th className="py-3 px-2 font-medium w-10 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary" />
              </tr>
            </thead>
            <tbody>
              {/* Quick Create row */}
              {!quickCreateOpen ? (
                <tr
                  className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors [&>td]:border-b [&>td]:border-[var(--divider)]"
                  onClick={() => { setQuickCreateOpen(true); if (!qcCategoryId && categories.length > 0) setQcCategoryId(categories[0].id); }}
                >
                  <td colSpan={6} className="py-3 px-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-brand-500">
                      <PlusIcon className="w-4 h-4" /> {t('quickCreate')}
                    </span>
                  </td>
                </tr>
              ) : (
                <tr className="bg-[var(--surface-subtle)] [&>td]:border-b [&>td]:border-[var(--divider)]">
                  <td className="py-3 px-2" />
                  <td className="py-3 px-2">
                    <input
                      autoFocus
                      value={qcName}
                      onChange={(e) => setQcName(e.target.value)}
                      placeholder={t('nameRequired')}
                      className="input text-sm py-1.5 rounded-lg"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') setQuickCreateOpen(false); }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <select
                      value={qcCategoryId}
                      onChange={(e) => setQcCategoryId(Number(e.target.value))}
                      className="input text-sm py-1.5 rounded-lg"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-2" />
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={qcPrice}
                      onChange={(e) => setQcPrice(e.target.value)}
                      placeholder="0.00"
                      className="input text-sm py-1.5 text-right rounded-lg"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') setQuickCreateOpen(false); }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleQuickCreate}
                        disabled={qcSaving || !qcName.trim()}
                        className="btn-primary text-xs px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {qcSaving ? '...' : t('save')}
                      </button>
                      <button
                        onClick={() => setQuickCreateOpen(false)}
                        className="text-xs text-fg-tertiary hover:text-fg-primary px-2 py-1.5 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const variantOpts = (item.variant_groups ?? []).flatMap((g) => (g.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: v.price, is_active: v.is_active })));
                const optionSetOpts = (item.option_sets ?? []).flatMap((os) => (os.options ?? []).map((o) => ({ id: o.id, name: o.name, price: o.price, is_active: o.is_active })));
                const variants = [...variantOpts, ...optionSetOpts].filter((v) => v.is_active);
                const hasVariants = variants.length > 0;
                const isExpanded = expandedItemIds.has(item.id);

                return (
                  <React.Fragment key={item.id}>
                    {/* Parent item row */}
                    <tr
                      className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors [&>td]:border-b [&>td]:border-[var(--divider)]"
                      onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}
                    >
                      <td className="py-3.5 px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded border-[var(--divider)]"
                          />
                          {hasVariants && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="w-5 h-5 flex items-center justify-center text-fg-tertiary hover:text-fg-primary"
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                              <PhotoIcon className="w-5 h-5 text-fg-tertiary" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-fg-primary">{item.name}</span>
                            {item.item_type === 'combo' && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-brand-500/15 text-brand-500">Combo</span>
                            )}
                            {hasVariants && (
                              <span className="text-xs text-fg-tertiary ml-2">{variants.length} {t('variants').toLowerCase()}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-2 text-fg-secondary">{item.category_name}</td>
                      <td className="py-3.5 px-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleAvailability(item); }}
                          className={`text-sm font-medium ${item.is_active ? 'text-status-ready' : 'text-fg-secondary'}`}
                        >
                          {item.is_active ? t('available') : t('unavailable')}
                        </button>
                      </td>
                      <td className="py-3.5 px-2 text-right text-fg-primary font-semibold">
                        {hasVariants ? '-' : `₪${(item.price ?? 0).toFixed(2)}/ea`}
                      </td>
                      <td className="py-3.5 px-2" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            { label: t('edit'), onClick: () => router.push(`/${rid}/menu/items/${item.id}`) },
                            { label: t('delete'), onClick: () => handleDeleteItem(item.id), variant: 'danger' },
                          ]}
                        />
                      </td>
                    </tr>

                    {/* Variant child rows (expanded) */}
                    {hasVariants && isExpanded && variants.map((v) => (
                      <tr
                        key={`${item.id}-v-${v.id}`}
                        className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors [&>td]:border-b [&>td]:border-[var(--divider)] bg-[var(--surface-subtle)]/30"
                        onClick={() => router.push(`/${rid}/menu/items/${item.id}/variants`)}
                      >
                        <td className="py-2.5 px-2" />
                        <td className="py-2.5 px-2 pl-16">
                          <span className="text-sm text-fg-secondary">{v.name}</span>
                        </td>
                        <td className="py-2.5 px-2" />
                        <td className="py-2.5 px-2">
                          <span className={`text-xs font-medium ${v.is_active ? 'text-status-ready' : 'text-fg-tertiary'}`}>
                            {v.is_active ? t('available') : t('unavailable')}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right text-fg-secondary text-sm">
                          ₪{(v.price ?? 0).toFixed(2)}/ea
                        </td>
                        <td className="py-2.5 px-2" />
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected.size >= 1 && (() => {
        const count = selected.size;
        const MIN = 2;
        const MAX = 6;
        const disabled = count < MIN || count > MAX;
        const hint =
          count < MIN ? t('compareMinHint') || 'Select at least 2 items to compare'
          : count > MAX ? t('compareMaxHint') || 'Select up to 6 items'
          : '';
        const go = () => {
          if (disabled) return;
          const ids = Array.from(selected).join(',');
          router.push(`/${rid}/menu/items/compare?ids=${ids}`);
        };
        return (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 border-t bg-[var(--surface)] px-6 py-3 flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--divider)', boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-fg-primary">
                {(t('selectedCount') || '{n} selected').replace('{n}', String(count))}
              </span>
              {hint && <span className="text-fg-tertiary">{hint}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="btn-secondary text-sm px-4 py-2 rounded-full"
              >
                {t('clearSelection') || 'Clear'}
              </button>
              <button
                onClick={go}
                disabled={disabled}
                className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(t('compareCosts') || 'Compare costs')}
                {count >= MIN && count <= MAX && ` (${count})`}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = options.find((o) => o.value === value)?.label ?? 'All';

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
      >
        {label} <span className="font-semibold text-fg-primary">{display}</span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden z-30">
          {options.map((opt) => (
            <button key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${value === opt.value ? 'text-brand-500 font-medium bg-[var(--surface-subtle)]' : 'text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

