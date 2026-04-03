'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  MenuCategory, Menu, ModifierSet,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, ChevronDownIcon, ArrowUpTrayIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

export default function NewItemPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const defaultCatId = searchParams.get('category') ? Number(searchParams.get('category')) : 0;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCatId);
  const [isActive, setIsActive] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Categories search
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Menus / Cartes state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());
  const [menuSearch, setMenuSearch] = useState('');
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  // Modifier sets state
  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [selectedModifierSetIds, setSelectedModifierSetIds] = useState<Set<number>>(new Set());
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      getAllCategories(rid),
      listMenus(rid),
      listModifierSets(rid),
    ]).then(([cats, m, ms]) => {
      setCategories(cats);
      if (!categoryId && cats.length > 0) setCategoryId(cats[0].id);
      setMenus(m);
      setAllModifierSets(ms ?? []);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  /** Creates the item and returns the new item ID, or null on failure. */
  const saveItem = async (): Promise<number | null> => {
    setSaving(true);
    try {
      const item = await createMenuItem(rid, {
        name: name.trim() || t('createItem'),
        description,
        price: parseFloat(price) || 0,
        is_active: isActive,
        category_id: categoryId || categories[0]?.id,
      });
      // Upload image if pending
      if (pendingImage) {
        const url = await uploadMenuItemImage(rid, item.id, pendingImage);
        await updateMenuItem(rid, item.id, { image_url: url });
      }
      // Assign to selected menus
      for (const menuId of Array.from(selectedMenuIds)) {
        const menu = menus.find((m) => m.id === menuId);
        const groups = menu?.groups ?? [];
        let groupId: number;
        if (groups.length > 0) {
          groupId = groups[0].id;
        } else {
          const newGroup = await createGroup(rid, { menu_id: menuId, name: menu?.name ?? 'Default' });
          groupId = newGroup.id;
        }
        await addItemsToGroup(rid, groupId, [item.id]);
      }
      // Attach selected modifier sets
      for (const setId of Array.from(selectedModifierSetIds)) {
        await attachModifierSetToItems(rid, setId, [item.id]);
      }
      return item.id;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const itemId = await saveItem();
    if (itemId) router.push(`/${rid}/menu/items`);
  };

  const handleAddVariants = async () => {
    const itemId = await saveItem();
    if (itemId) router.push(`/${rid}/menu/items/${itemId}/variants`);
  };

  const handleFileSelect = (file: File) => {
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button onClick={goBack}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">{t('createItem')}</span>
        <button onClick={handleSave} disabled={saving || !name.trim() || !price}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-fg-primary mb-8">{t('createItem')}</h1>

        <div className="flex gap-8">
          {/* Left column — main form */}
          <div className="flex-1 space-y-5">
            {/* Name */}
            <input
              autoFocus
              placeholder={t('nameRequired')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full text-base"
            />

            {/* Price */}
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t('price')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input w-full text-base pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary">ea</span>
            </div>

            {/* Description */}
            <textarea
              placeholder={t('customerDescription')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="input w-full text-sm resize-y"
            />

            {/* Image upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {imagePreview ? (
              <div
                className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-[var(--divider)]"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <img src={imagePreview} alt="Preview" className="w-full h-52 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-base font-medium">{t('dropImagesHere')}</span>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-[var(--divider)] rounded-xl p-10 flex flex-col items-center gap-3 text-fg-tertiary cursor-pointer hover:border-brand-500 hover:text-brand-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <ArrowUpTrayIcon className="w-10 h-10" />
                <p className="text-base text-center">
                  {t('dropImagesHere')}, <span className="text-brand-500 font-medium underline hover:text-brand-600">{t('browse')}</span>
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="h-1 bg-[var(--divider)] rounded-full" />

            {/* Variants */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('variants')}</h3>
                <button
                  onClick={handleAddVariants}
                  disabled={saving}
                  className="text-base font-medium underline text-fg-primary shrink-0 disabled:opacity-50"
                >
                  {t('add')}
                </button>
              </div>
              <p className="text-sm text-fg-tertiary">{t('variantsDescription')}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--divider)]" />

            {/* Modifiers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('modifiers')}</h3>
                <button
                  onClick={() => setModifierModalOpen(true)}
                  className="text-base font-medium underline text-fg-primary shrink-0"
                >
                  {t('add')}
                </button>
              </div>
              <p className="text-sm text-fg-tertiary">{t('modifiersDescription')}</p>
              {/* Show selected modifier sets */}
              {selectedModifierSetIds.size > 0 && (
                <div className="rounded-xl border border-[var(--divider)] overflow-hidden mt-3">
                  {allModifierSets
                    .filter((ms) => selectedModifierSetIds.has(ms.id))
                    .map((ms) => (
                    <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
                      <div>
                        <span className="text-sm font-medium text-fg-primary">{ms.name}</span>
                        <span className="text-xs text-fg-tertiary ml-2">
                          {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const next = new Set(selectedModifierSetIds);
                          next.delete(ms.id);
                          setSelectedModifierSetIds(next);
                        }}
                        className="text-sm text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        {t('remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column — sidebar cards */}
          <div className="w-72 space-y-4 shrink-0">
            {/* Status */}
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-fg-primary">{t('status')}</h3>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1 ${
                    isActive ? 'text-status-ready' : 'text-fg-secondary'
                  }`}
                  style={{ background: isActive ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}
                >
                  {isActive ? t('available') : t('unavailable')}
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Categories */}
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-3">
              <h3 className="font-bold text-fg-primary">{t('categories')}</h3>
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('addToCategories')}
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  onFocus={() => setCategoryDropdownOpen(true)}
                  className="input text-sm w-full pl-9"
                />
              </div>
              {categoryDropdownOpen && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {categories
                    .filter((c) => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                    .map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="category"
                        checked={categoryId === cat.id}
                        onChange={() => { setCategoryId(cat.id); setCategorySearch(cat.name); setCategoryDropdownOpen(false); }}
                        className="rounded-full border-[var(--divider)] text-brand-500"
                      />
                      <span className="text-sm text-fg-primary">{cat.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Cartes / Menus */}
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-3">
              <h3 className="font-bold text-fg-primary">{t('menus')}</h3>
              <p className="text-xs text-fg-tertiary">{t('cartesDescription')}</p>
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('addToMenus')}
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  onFocus={() => setMenuDropdownOpen(true)}
                  className="input text-sm w-full pl-9"
                />
              </div>
              {menuDropdownOpen && menus.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {menus
                    .filter((m) => !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase()))
                    .map((menu) => (
                    <label key={menu.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedMenuIds.has(menu.id)}
                        onChange={() => {
                          const next = new Set(selectedMenuIds);
                          if (next.has(menu.id)) next.delete(menu.id);
                          else next.add(menu.id);
                          setSelectedMenuIds(next);
                        }}
                        className="rounded border-[var(--divider)]"
                      />
                      <span className="text-sm text-fg-primary">{menu.name}</span>
                    </label>
                  ))}
                </div>
              ) : menuDropdownOpen ? (
                <p className="text-xs text-fg-tertiary italic">{t('noMenusAvailable') || 'No menus available'}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Modifier Sets Modal */}
      {modifierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[var(--divider)]">
            {/* Modal header */}
            <div className="p-6 pb-4 flex items-center justify-between">
              <button
                onClick={() => setModifierModalOpen(false)}
                className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setModifierModalOpen(false)}
                className="btn-secondary rounded-full px-5 py-2 text-sm font-medium"
              >
                {t('done')}
              </button>
            </div>
            <div className="px-6 pb-4">
              <h2 className="text-xl font-bold text-fg-primary mb-2">{t('modifiers')}</h2>
              <p className="text-sm text-fg-tertiary">{t('modifiersDescription')}</p>
            </div>
            <div className="mx-6 border-t-2 border-fg-primary" />
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {allModifierSets.length > 0 ? (
                allModifierSets.map((ms) => (
                  <label
                    key={ms.id}
                    className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-base font-medium text-fg-primary">{ms.name}</span>
                      <p className="text-sm text-fg-tertiary truncate">
                        {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedModifierSetIds.has(ms.id)}
                      onChange={() => {
                        const next = new Set(selectedModifierSetIds);
                        if (next.has(ms.id)) next.delete(ms.id);
                        else next.add(ms.id);
                        setSelectedModifierSetIds(next);
                      }}
                      className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0"
                    />
                  </label>
                ))
              ) : (
                <p className="text-sm text-fg-tertiary text-center py-8">{t('noModifiersForItem')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
