'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, createMenuItem,
  MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  MagnifyingGlassIcon, PlusIcon, ChevronDownIcon,
  EllipsisHorizontalIcon, PhotoIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

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
    <div className="space-y-5">
      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-2 text-sm w-full"
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
        <ActionsDropdown onRefresh={reload} />

        {/* Create item button */}
        <button
          onClick={() => router.push(`/${rid}/menu/items/new`)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {t('createItem')}
        </button>
      </div>

      {/* Items table — borderless Square-style */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">👋</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('noItemsFound')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
          {allItems.length === 0 && (
            <button
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="btn-primary mt-2"
            >
              {t('createItem')}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-normal w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="py-3 px-4 font-normal">{t('item')}</th>
                <th className="py-3 px-4 font-normal">{t('category')}</th>
                <th className="py-3 px-4 font-normal">{t('availability')}</th>
                <th className="py-3 px-4 font-normal text-right">{t('price')}</th>
                <th className="py-3 px-4 font-normal w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                  onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}
                >
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-subtle)' }}>
                          <PhotoIcon className="w-5 h-5 text-fg-secondary" />
                        </div>
                      )}
                      <span className="font-medium text-fg-primary">{item.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-fg-secondary">{item.category_name}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleAvailability(item); }}
                      className={`text-sm font-medium ${item.is_active ? 'text-status-ready' : 'text-fg-secondary'}`}
                    >
                      {item.is_active ? t('available') : t('unavailable')}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right text-fg-primary font-medium">
                    ₪{(item.price ?? 0).toFixed(2)}/ea
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <ItemRowMenu
                      onEdit={() => router.push(`/${rid}/menu/items/${item.id}`)}
                      onDelete={() => handleDeleteItem(item.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        {label} <span className="font-semibold text-fg-primary">{display}</span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 rounded-standard py-1 min-w-[140px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
          {options.map((opt) => (
            <button key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm transition-colors ${value === opt.value ? 'text-brand-500 font-medium' : 'text-fg-secondary hover:text-fg-primary'}`}
              style={value === opt.value ? { background: 'var(--surface-subtle)' } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Actions Dropdown ────────────────────────────────────────────────────────

function ActionsDropdown({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="btn-secondary flex items-center gap-2">
        {t('actions')} <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 rounded-standard py-1 min-w-[200px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
          <button
            onClick={() => { onRefresh(); setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <ArrowPathIcon className="w-4 h-4" /> {t('refresh')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Item Row Menu (···) ─────────────────────────────────────────────────────

function ItemRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-[var(--surface-subtle)]">
        <EllipsisHorizontalIcon className="w-5 h-5 text-fg-secondary" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 rounded-standard py-1 min-w-[120px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
          <button onClick={() => { onEdit(); setOpen(false); }}
            className="block w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]">
            {t('edit')}
          </button>
          <button onClick={() => { onDelete(); setOpen(false); }}
            className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
            {t('delete')}
          </button>
        </div>
      )}
    </div>
  );
}

