'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getMenu, createCategory, updateCategory, deleteCategory,
  createMenuItem, updateMenuItem, deleteMenuItem,
  createModifier, deleteModifier,
  importMenuAI, confirmMenuImport,
  MenuCategory, MenuItem, MenuItemModifier, MenuExtraction,
  ModifierInput,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import {
  MagnifyingGlassIcon, PlusIcon, ChevronDownIcon,
  XMarkIcon, EllipsisHorizontalIcon, PhotoIcon,
  SparklesIcon, ArrowPathIcon,
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

export default function MenuPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // Modals/overlays
  const [itemOverlay, setItemOverlay] = useState<{ open: boolean; editing?: MenuItem; categoryId?: number }>({ open: false });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });
  const [modifierModal, setModifierModal] = useState<{ open: boolean; itemId?: number }>({ open: false });
  const [importModal, setImportModal] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────

  const reload = useCallback(() => {
    return getMenu(rid).then(setCategories).finally(() => setLoading(false));
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
        <ActionsDropdown
          onImportAI={() => setImportModal(true)}
          onRefresh={reload}
        />

        {/* Create dropdown */}
        <CreateDropdown
          onCreateItem={() => setItemOverlay({ open: true })}
          onCreateCategory={() => { setCategoryModal({ open: true }); }}
          onCreateModifier={() => { setModifierModal({ open: true }); }}
        />
      </div>

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16 space-y-3">
          <p className="text-lg font-semibold text-fg-primary">{t('noItemsFound')}</p>
          <p className="text-sm text-fg-secondary">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-medium">{t('item')}</th>
                <th className="py-3 px-4 font-medium">{t('category')}</th>
                <th className="py-3 px-4 font-medium">{t('availability')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('price')}</th>
                <th className="py-3 px-4 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                  onClick={() => setItemOverlay({ open: true, editing: item })}
                >
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
                      onEdit={() => setItemOverlay({ open: true, editing: item })}
                      onDelete={() => handleDeleteItem(item.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full-page item create/edit overlay */}
      {itemOverlay.open && (
        <ItemOverlay
          restaurantId={rid}
          categories={categories}
          editing={itemOverlay.editing}
          defaultCategoryId={itemOverlay.categoryId}
          onClose={() => setItemOverlay({ open: false })}
          onSaved={() => { setItemOverlay({ open: false }); reload(); }}
        />
      )}

      {/* Category modal */}
      {categoryModal.open && (
        <CategoryModal
          restaurantId={rid}
          editing={categoryModal.editing}
          onClose={() => setCategoryModal({ open: false })}
          onSaved={() => { setCategoryModal({ open: false }); reload(); }}
        />
      )}

      {/* Modifier modal */}
      {modifierModal.open && (
        <ModifierModal
          restaurantId={rid}
          categories={categories}
          onClose={() => setModifierModal({ open: false })}
          onSaved={() => { setModifierModal({ open: false }); reload(); }}
        />
      )}

      {/* AI Import modal */}
      {importModal && (
        <AIImportModal
          restaurantId={rid}
          onClose={() => setImportModal(false)}
          onImported={() => { setImportModal(false); reload(); }}
        />
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

function ActionsDropdown({ onImportAI, onRefresh }: { onImportAI: () => void; onRefresh: () => void }) {
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
            onClick={() => { onImportAI(); setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <SparklesIcon className="w-4 h-4" /> {t('importMenuWithAI')}
          </button>
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

// ─── Create Dropdown ─────────────────────────────────────────────────────────

function CreateDropdown({ onCreateItem, onCreateCategory, onCreateModifier }: {
  onCreateItem: () => void; onCreateCategory: () => void; onCreateModifier: () => void;
}) {
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
      <button onClick={() => setOpen(!open)} className="btn-primary flex items-center gap-2">
        {t('createItem')} <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 rounded-standard py-1 min-w-[180px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
          <button onClick={() => { onCreateItem(); setOpen(false); }}
            className="block w-full text-left px-4 py-2.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors">
            {t('createItem')}
          </button>
          <button onClick={() => { onCreateCategory(); setOpen(false); }}
            className="block w-full text-left px-4 py-2.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors">
            {t('createCategory')}
          </button>
          <button onClick={() => { onCreateModifier(); setOpen(false); }}
            className="block w-full text-left px-4 py-2.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors">
            {t('createModifier')}
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

// ─── Full-page Item Overlay (Create/Edit) ────────────────────────────────────

function ItemOverlay({ restaurantId, categories, editing, defaultCategoryId, onClose, onSaved }: {
  restaurantId: number;
  categories: MenuCategory[];
  editing?: MenuItem;
  defaultCategoryId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? 0);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description,
        price: parseFloat(price),
        is_active: isActive,
        category_id: categoryId,
      };
      if (editing) {
        await updateMenuItem(restaurantId, editing.id, payload);
      } else {
        await createMenuItem(restaurantId, payload as Parameters<typeof createMenuItem>[1]);
      }
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
          style={{ border: '1px solid var(--divider)' }}>
          <XMarkIcon className="w-5 h-5" />
        </button>
        <button onClick={handleSave} disabled={saving || !name.trim() || !price}
          className="btn-primary px-6 disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-fg-primary mb-8">
          {editing ? t('editItem') : t('createItem')}
        </h1>

        <div className="flex gap-8">
          {/* Left column — main form */}
          <div className="flex-1 space-y-5">
            {/* Name */}
            <div>
              <input
                autoFocus
                placeholder={t('nameRequired')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input text-base py-3"
              />
            </div>

            {/* Price */}
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t('price')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input text-base py-3 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-secondary">ea</span>
            </div>

            {/* Description */}
            <textarea
              placeholder={t('customerDescription')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="input resize-y text-sm"
            />

            {/* Image placeholder / existing image */}
            {editing?.image_url ? (
              <div className="relative rounded-card overflow-hidden cursor-pointer group"
                style={{ border: '2px solid var(--divider)' }}>
                <img src={editing.image_url} alt={editing.name} className="w-full h-48 object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                  <PhotoIcon className="w-8 h-8 text-white mb-2" />
                  <p className="text-sm text-white">
                    {t('dropImagesHere')}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center py-12 rounded-card cursor-pointer"
                style={{ border: '2px dashed var(--divider)' }}
              >
                <PhotoIcon className="w-8 h-8 text-fg-secondary mb-2" />
                <p className="text-sm text-fg-secondary">
                  {t('dropImagesHere')}
                </p>
              </div>
            )}

            {/* Modifiers section for existing items */}
            {editing && (
              <div>
                <h3 className="text-base font-bold text-fg-primary mb-3">{t('modifiers')}</h3>
                {(editing.modifiers ?? []).length === 0 ? (
                  <p className="text-sm text-fg-secondary">{t('noModifiersForItem')}</p>
                ) : (
                  <div className="space-y-2">
                    {(editing.modifiers ?? []).map((mod) => (
                      <div key={mod.id} className="flex items-center justify-between py-2 px-3 rounded-standard" style={{ background: 'var(--surface-subtle)' }}>
                        <div>
                          <span className="text-sm font-medium text-fg-primary">{mod.name}</span>
                          <span className="text-xs text-fg-secondary ml-2">({mod.action})</span>
                          {mod.category && <span className="text-xs text-fg-secondary ml-2">· {mod.category}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {mod.price_delta !== 0 && (
                            <span className="text-sm text-fg-secondary">
                              {mod.price_delta > 0 ? '+' : ''}₪{mod.price_delta.toFixed(2)}
                            </span>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(t('deleteThisModifier'))) return;
                              await deleteModifier(restaurantId, mod.id);
                              // Reload will happen on overlay close
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            {t('remove')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column — sidebar cards */}
          <div className="w-72 space-y-4 flex-shrink-0">
            {/* Status card */}
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-fg-primary">{t('status')}</h3>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`text-sm font-medium px-3 py-1 rounded-standard flex items-center gap-1 ${
                    isActive ? 'text-status-ready' : 'text-fg-secondary'
                  }`}
                  style={{ background: isActive ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}
                >
                  {isActive ? t('available') : t('unavailable')}
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Categories card */}
            <div className="card space-y-3">
              <h3 className="font-bold text-fg-primary">{t('categories')}</h3>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="input text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category Modal ──────────────────────────────────────────────────────────

function CategoryModal({ restaurantId, editing, onClose, onSaved }: {
  restaurantId: number; editing?: MenuCategory; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(restaurantId, editing.id, { name });
      } else {
        await createCategory(restaurantId, { name });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('editCategory') : t('newCategory')} onClose={onClose}>
      <label className="block text-sm font-medium text-fg-secondary mb-1">{t('categoryName')}</label>
      <input autoFocus className="input" value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modifier Modal ──────────────────────────────────────────────────────────

function ModifierModal({ restaurantId, categories, onClose, onSaved }: {
  restaurantId: number; categories: MenuCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const allItems = flattenItems(categories);
  const [itemId, setItemId] = useState(allItems[0]?.id ?? 0);
  const [name, setName] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [category, setCategory] = useState('');
  const [priceDelta, setPriceDelta] = useState('0');
  const [isRequired, setIsRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !itemId) return;
    setSaving(true);
    try {
      const input: ModifierInput = {
        menu_item_id: itemId,
        name: name.trim(),
        action,
        category,
        price_delta: parseFloat(priceDelta) || 0,
        is_required: isRequired,
      };
      await createModifier(restaurantId, input);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('newModifier')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('menuItem')}</label>
          <select className="input text-sm" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            {allItems.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.category_name})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('modifierName')}</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('action')}</label>
            <select className="input text-sm" value={action} onChange={(e) => setAction(e.target.value as 'add' | 'remove')}>
              <option value="add">{t('add')}</option>
              <option value="remove">{t('remove')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('priceDelta')}</label>
            <input type="number" step="0.01" className="input" value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('categoryGroupName')}</label>
          <input className="input" placeholder={t('categoryGroupPlaceholder')} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded" />
          <span className="text-sm font-medium text-fg-secondary">{t('requiredModifier')}</span>
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </Modal>
  );
}

// ─── AI Import Modal ─────────────────────────────────────────────────────────

function AIImportModal({ restaurantId, onClose, onImported }: {
  restaurantId: number; onClose: () => void; onImported: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<'upload' | 'review' | 'importing'>('upload');
  const [extraction, setExtraction] = useState<MenuExtraction | null>(null);
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setExtracting(true);
    try {
      const result = await importMenuAI(restaurantId, file);
      setExtraction(result);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!extraction) return;
    setConfirming(true);
    try {
      await confirmMenuImport(restaurantId, extraction);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create menu');
    } finally {
      setConfirming(false);
    }
  };

  const totalItems = extraction?.categories.reduce((sum, c) => sum + c.items.length, 0) ?? 0;

  return (
    <Modal title={t('importMenuWithAI')} onClose={onClose}>
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            {t('uploadMenuAI')}
          </p>

          <div
            className="flex flex-col items-center justify-center py-12 rounded-card cursor-pointer"
            style={{ border: '2px dashed var(--divider)' }}
            onClick={() => fileRef.current?.click()}
          >
            {extracting ? (
              <>
                <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mb-3" />
                <p className="text-sm text-fg-secondary">{t('analyzingMenuAI')}</p>
              </>
            ) : (
              <>
                <SparklesIcon className="w-8 h-8 text-brand-500 mb-2" />
                <p className="text-sm text-fg-secondary">
                  {t('clickToUpload')}
                </p>
                <p className="text-xs text-fg-secondary mt-1">{t('imageFormats')}</p>
              </>
            )}
          </div>

          <input ref={fileRef} type="file" className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}

      {step === 'review' && extraction && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary"
            dangerouslySetInnerHTML={{
              __html: t('foundCategoriesItems')
                .replace('{categories}', `<strong>${extraction.categories.length}</strong>`)
                .replace('{items}', `<strong>${totalItems}</strong>`),
            }}
          />

          <div className="max-h-80 overflow-y-auto space-y-3">
            {extraction.categories.map((cat, ci) => (
              <div key={ci}>
                <h4 className="text-sm font-bold text-fg-primary mb-1">{cat.name}</h4>
                <div className="space-y-1">
                  {cat.items.map((item, ii) => (
                    <div key={ii} className="flex items-center justify-between text-sm py-1 px-2 rounded"
                      style={{ background: 'var(--surface-subtle)' }}>
                      <span className="text-fg-primary">{item.name}</span>
                      <span className="text-fg-secondary">₪{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setStep('upload'); setExtraction(null); }}>
              {t('reUpload')}
            </button>
            <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
              {confirming ? t('creating') : t('importItems').replace('{count}', String(totalItems))}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
