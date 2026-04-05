'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, attachOptionSetToItems,
  createVariantGroup,
  MenuCategory, Menu, ModifierSet, OptionSet, VariantGroupInput, VariantInput,
  MenuItem, ItemType, ComboStepInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, ChevronDownIcon, ArrowUpTrayIcon, MagnifyingGlassIcon,
  PlusIcon, TrashIcon,
} from '@heroicons/react/24/outline';

/* ── Combo step draft (local, submitted on Save) ────────────────────── */

interface ComboStepDraft {
  key: string;
  name: string;
  min_picks: number;
  max_picks: number;
  items: { menu_item_id: number; price_delta: number; item_name?: string }[];
}

function newComboStep(): ComboStepDraft {
  return { key: crypto.randomUUID(), name: '', min_picks: 1, max_picks: 1, items: [] };
}

/* ── Local variant types (not yet persisted) ─────────────────────────── */

interface LocalVariant {
  key: string;
  name: string;
  price: string;
  onlinePrice: string;
  isActive: boolean;
}

interface LocalVariantGroup {
  key: string;
  title: string;
  variants: LocalVariant[];
}

function newVariant(): LocalVariant {
  return { key: crypto.randomUUID(), name: '', price: '', onlinePrice: '', isActive: true };
}

function newVariantGroup(): LocalVariantGroup {
  return { key: crypto.randomUUID(), title: '', variants: [newVariant()] };
}

/* ── Page ─────────────────────────────────────────────────────────────── */

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
  const [itemType, setItemType] = useState<ItemType>('food_and_beverage');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo steps (only used when itemType === 'combo')
  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  // Categories search
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Menus / Cartes state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());
  const [menuSearch, setMenuSearch] = useState('');
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  // Modifier sets (local selection, submitted on Save)
  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [selectedModifierSetIds, setSelectedModifierSetIds] = useState<Set<number>>(new Set());
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  // Variant groups (local, submitted on Save)
  const [variantGroups, setVariantGroups] = useState<LocalVariantGroup[]>([]);
  const [variantModalOpen, setVariantModalOpen] = useState(false);

  // Option sets (reusable, selected to attach on Save)
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [selectedOptionSetIds, setSelectedOptionSetIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([
      getAllCategories(rid),
      listMenus(rid),
      listModifierSets(rid),
      listOptionSets(rid),
    ]).then(([cats, m, ms, os]) => {
      setCategories(cats);
      if (!categoryId && cats.length > 0) setCategoryId(cats[0].id);
      setMenus(m);
      setAllModifierSets(ms ?? []);
      setAllOptionSets(os ?? []);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  /* ── Save (the ONLY place that validates + calls API) ────────────── */

  const handleSave = async () => {
    if (!name.trim() || !parseFloat(price)) return;
    setSaving(true);
    try {
      const createPayload: Parameters<typeof createMenuItem>[1] = {
        name: name.trim(),
        description,
        price: parseFloat(price),
        is_active: isActive,
        item_type: itemType,
        category_id: categoryId || categories[0]?.id,
      };
      if (itemType === 'combo' && comboSteps.length > 0) {
        (createPayload as Record<string, unknown>).combo_steps = comboSteps.map((s, i): ComboStepInput => ({
          name: s.name || `Choice ${i + 1}`,
          min_picks: s.min_picks,
          max_picks: s.max_picks,
          sort_order: i,
          items: s.items.map((si) => ({ menu_item_id: si.menu_item_id, price_delta: si.price_delta })),
        }));
      }
      const item = await createMenuItem(rid, createPayload);
      // Upload image
      if (pendingImage) {
        const url = await uploadMenuItemImage(rid, item.id, pendingImage);
        await updateMenuItem(rid, item.id, { image_url: url });
      }
      // Assign to menus
      for (const menuId of Array.from(selectedMenuIds)) {
        const menu = menus.find((m) => m.id === menuId);
        const groups = menu?.groups ?? [];
        let groupId: number;
        if (groups.length > 0) {
          groupId = groups[0].id;
        } else {
          const g = await createGroup(rid, { menu_id: menuId, name: menu?.name ?? 'Default' });
          groupId = g.id;
        }
        await addItemsToGroup(rid, groupId, [item.id]);
      }
      // Attach modifier sets
      for (const setId of Array.from(selectedModifierSetIds)) {
        await attachModifierSetToItems(rid, setId, [item.id]);
      }
      // Create variant groups
      for (let gi = 0; gi < variantGroups.length; gi++) {
        const vg = variantGroups[gi];
        const variants: VariantInput[] = vg.variants
          .filter((v) => v.name.trim())
          .map((v, vi) => ({
            name: v.name.trim(),
            price: parseFloat(v.price) || 0,
            online_price: v.onlinePrice ? parseFloat(v.onlinePrice) : null,
            is_active: v.isActive,
            sort_order: vi,
          }));
        if (variants.length > 0 || vg.title.trim()) {
          await createVariantGroup(rid, item.id, {
            title: vg.title.trim(),
            sort_order: gi,
            variants,
          });
        }
      }
      // Attach option sets
      for (const setId of Array.from(selectedOptionSetIds)) {
        await attachOptionSetToItems(rid, setId, [item.id]);
      }
      router.push(`/${rid}/menu/items`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /* ── Variant helpers ─────────────────────────────────────────────── */

  const updateVariantGroup = (key: string, patch: Partial<LocalVariantGroup>) => {
    setVariantGroups((prev) => prev.map((g) => g.key === key ? { ...g, ...patch } : g));
  };

  const updateVariant = (groupKey: string, variantKey: string, patch: Partial<LocalVariant>) => {
    setVariantGroups((prev) => prev.map((g) => {
      if (g.key !== groupKey) return g;
      return { ...g, variants: g.variants.map((v) => v.key === variantKey ? { ...v, ...patch } : v) };
    }));
  };

  const removeVariant = (groupKey: string, variantKey: string) => {
    setVariantGroups((prev) => prev.map((g) => {
      if (g.key !== groupKey) return g;
      return { ...g, variants: g.variants.filter((v) => v.key !== variantKey) };
    }));
  };

  const removeVariantGroup = (key: string) => {
    setVariantGroups((prev) => prev.filter((g) => g.key !== key));
  };

  /* ── Combo step helpers ──────────────────────────────────────────── */

  const allMenuItems = categories.flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name }))
  );

  const addComboStep = () => setComboSteps((prev) => [...prev, newComboStep()]);

  const removeComboStep = (key: string) => setComboSteps((prev) => prev.filter((s) => s.key !== key));

  const updateComboStep = (key: string, patch: Partial<ComboStepDraft>) => {
    setComboSteps((prev) => prev.map((s) => s.key === key ? { ...s, ...patch } : s));
  };

  const addItemToComboStep = (stepKey: string, item: { id: number; name: string }) => {
    setComboSteps((prev) =>
      prev.map((s) => {
        if (s.key !== stepKey) return s;
        if (s.items.some((si) => si.menu_item_id === item.id)) return s;
        return { ...s, items: [...s.items, { menu_item_id: item.id, price_delta: 0, item_name: item.name }] };
      })
    );
  };

  const removeItemFromComboStep = (stepKey: string, menuItemId: number) => {
    setComboSteps((prev) =>
      prev.map((s) =>
        s.key !== stepKey ? s : { ...s, items: s.items.filter((si) => si.menu_item_id !== menuItemId) }
      )
    );
  };

  const updateStepItemDelta = (stepKey: string, menuItemId: number, delta: number) => {
    setComboSteps((prev) =>
      prev.map((s) =>
        s.key !== stepKey
          ? s
          : { ...s, items: s.items.map((si) => si.menu_item_id === menuItemId ? { ...si, price_delta: delta } : si) }
      )
    );
  };

  /* ── Misc handlers ───────────────────────────────────────────────── */

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
            {/* Item Type Selector */}
            <div className="border border-[var(--divider)] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-fg-tertiary">{t('itemType') || 'Item type'}</span>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
                className="input flex-1 text-base border-0 py-0 bg-transparent"
              >
                <option value="food_and_beverage">{t('foodAndBeverage') || 'Food & Beverage'}</option>
                <option value="combo">{t('combo') || 'Combo'}</option>
              </select>
            </div>

            <input autoFocus placeholder={t('nameRequired')} value={name}
              onChange={(e) => setName(e.target.value)} className="input w-full text-base" />

            <div className="relative">
              <input type="number" min="0" step="0.01" placeholder={t('price')} value={price}
                onChange={(e) => setPrice(e.target.value)} className="input w-full text-base pr-16" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary">ea</span>
            </div>

            <textarea placeholder={t('customerDescription')} value={description}
              onChange={(e) => setDescription(e.target.value)} rows={4} className="input w-full text-sm resize-y" />

            {/* Image upload */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-[var(--divider)]"
                onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                <img src={imagePreview} alt="Preview" className="w-full h-52 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-base font-medium">{t('dropImagesHere')}</span>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-[var(--divider)] rounded-xl p-10 flex flex-col items-center gap-3 text-fg-tertiary cursor-pointer hover:border-brand-500 hover:text-brand-500 transition-colors"
                onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                <ArrowUpTrayIcon className="w-10 h-10" />
                <p className="text-base text-center">
                  {t('dropImagesHere')}, <span className="text-brand-500 font-medium underline hover:text-brand-600">{t('browse')}</span>
                </p>
              </div>
            )}

            <div className="h-1 bg-[var(--divider)] rounded-full" />

            {/* ── Combo Builder (only for combo items) ──────────── */}
            {itemType === 'combo' && (
              <div className="border-2 border-brand-500/30 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-fg-primary">{t('buildThisCombo') || 'Build this combo'}</h3>
                  <p className="text-sm text-fg-tertiary mt-1">
                    {t('comboBuilderDescription') || 'Add item options so your customers can customize this combo.'}
                  </p>
                </div>

                {/* Step list */}
                {comboSteps.map((step, stepIdx) => (
                  <div key={step.key} className="border border-[var(--divider)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        placeholder={t('comboChoiceName') || `Choice ${stepIdx + 1}`}
                        value={step.name}
                        onChange={(e) => updateComboStep(step.key, { name: e.target.value })}
                        className="input flex-1 text-sm"
                      />
                      <button onClick={() => removeComboStep(step.key)}
                        className="p-1.5 text-red-400 hover:text-red-300">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-fg-tertiary">{t('minRequired') || 'Min required'}</label>
                        <input type="number" min={0} value={step.min_picks}
                          onChange={(e) => updateComboStep(step.key, { min_picks: parseInt(e.target.value) || 0 })}
                          className="input w-full text-sm mt-1" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-fg-tertiary">{t('maxAllowed') || 'Max allowed'}</label>
                        <input type="number" min={0} value={step.max_picks}
                          onChange={(e) => updateComboStep(step.key, { max_picks: parseInt(e.target.value) || 0 })}
                          className="input w-full text-sm mt-1" />
                      </div>
                    </div>

                    {/* Items in this step */}
                    {step.items.length > 0 && (
                      <div className="space-y-1">
                        {step.items.map((si) => (
                          <div key={si.menu_item_id} className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-subtle)] rounded-lg">
                            <span className="text-sm text-fg-primary flex-1">{si.item_name || `Item #${si.menu_item_id}`}</span>
                            <input type="number" step="0.01" value={si.price_delta}
                              onChange={(e) => updateStepItemDelta(step.key, si.menu_item_id, parseFloat(e.target.value) || 0)}
                              className="input w-24 text-xs text-center" placeholder="Delta" />
                            <button onClick={() => removeItemFromComboStep(step.key, si.menu_item_id)}
                              className="text-red-400 hover:text-red-300">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Item picker dropdown */}
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          const itemId = parseInt(e.target.value);
                          const menuItem = allMenuItems.find((i) => i.id === itemId);
                          if (menuItem) addItemToComboStep(step.key, menuItem);
                          e.target.value = '';
                        }}
                        className="input w-full text-sm"
                        defaultValue=""
                      >
                        <option value="" disabled>{t('addItemToStep') || '+ Add item...'}</option>
                        {allMenuItems
                          .filter((i) => !step.items.some((si) => si.menu_item_id === i.id))
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} {i.category_name ? `(${i.category_name})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}

                <button onClick={addComboStep}
                  className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-400">
                  <PlusIcon className="w-4 h-4" />
                  {t('addOptions') || 'Add options'}
                </button>
              </div>
            )}

            {/* ── Variants (hidden for combo items) ──────────────── */}
            {itemType !== 'combo' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-fg-primary">{t('variants')}</h3>
                    <button onClick={() => setVariantModalOpen(true)}
                      className="text-base font-medium underline text-fg-primary shrink-0">
                      {t('add')}
                    </button>
                  </div>
                  <p className="text-sm text-fg-tertiary">{t('variantsDescription')}</p>
                  {variantGroups.length > 0 && (
                    <div className="rounded-xl border border-[var(--divider)] overflow-hidden mt-3">
                      {variantGroups.map((vg) => (
                        <div key={vg.key} className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-fg-primary">{vg.title || t('variantGroupTitle')}</span>
                            <span className="text-xs text-fg-tertiary ml-2">
                              {vg.variants.filter((v) => v.name.trim()).map((v) => v.name).join(', ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => setVariantModalOpen(true)}
                              className="text-sm text-brand-600 hover:underline font-medium">{t('edit')}</button>
                            <button onClick={() => removeVariantGroup(vg.key)}
                              className="text-sm text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                              {t('remove')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-[var(--divider)]" />
              </>
            )}

            {/* ── Modifiers ───────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('modifiers')}</h3>
                <button onClick={() => setModifierModalOpen(true)}
                  className="text-base font-medium underline text-fg-primary shrink-0">{t('add')}</button>
              </div>
              <p className="text-sm text-fg-tertiary">{t('modifiersDescription')}</p>
              {selectedModifierSetIds.size > 0 && (
                <div className="rounded-xl border border-[var(--divider)] overflow-hidden mt-3">
                  {allModifierSets.filter((ms) => selectedModifierSetIds.has(ms.id)).map((ms) => (
                    <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
                      <div>
                        <span className="text-sm font-medium text-fg-primary">{ms.name}</span>
                        <span className="text-xs text-fg-tertiary ml-2">
                          {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                        </span>
                      </div>
                      <button onClick={() => { const n = new Set(selectedModifierSetIds); n.delete(ms.id); setSelectedModifierSetIds(n); }}
                        className="text-sm text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                        {t('remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column — sidebar */}
          <div className="w-72 space-y-4 shrink-0">
            {/* Status */}
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-fg-primary">{t('status')}</h3>
                <button onClick={() => setIsActive(!isActive)}
                  className={`text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1 ${isActive ? 'text-status-ready' : 'text-fg-secondary'}`}
                  style={{ background: isActive ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}>
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
                <input type="text" placeholder={t('addToCategories')} value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)} onFocus={() => setCategoryDropdownOpen(true)}
                  className="input text-sm w-full pl-9" />
              </div>
              {categoryDropdownOpen && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {categories.filter((c) => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase())).map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors">
                      <input type="radio" name="category" checked={categoryId === cat.id}
                        onChange={() => { setCategoryId(cat.id); setCategorySearch(cat.name); setCategoryDropdownOpen(false); }}
                        className="rounded-full border-[var(--divider)] text-brand-500" />
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
                <input type="text" placeholder={t('addToMenus')} value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)} onFocus={() => setMenuDropdownOpen(true)}
                  className="input text-sm w-full pl-9" />
              </div>
              {menuDropdownOpen && menus.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {menus.filter((m) => !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase())).map((menu) => (
                    <label key={menu.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors">
                      <input type="checkbox" checked={selectedMenuIds.has(menu.id)}
                        onChange={() => { const n = new Set(selectedMenuIds); if (n.has(menu.id)) n.delete(menu.id); else n.add(menu.id); setSelectedMenuIds(n); }}
                        className="rounded border-[var(--divider)]" />
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

      {/* ── Variant Editor Modal (Square-style full-screen) ──────────── */}
      {variantModalOpen && (
        <div className="fixed inset-0 z-[60] bg-[var(--surface)] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
            <button onClick={() => setVariantModalOpen(false)}
              className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-fg-primary">{t('variants')}</span>
            <button onClick={() => setVariantModalOpen(false)}
              className="btn-primary text-sm px-5 py-2 rounded-full">
              {t('done')}
            </button>
          </div>

          <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
            {/* Saved option sets — select existing to attach */}
            {allOptionSets.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">{t('savedOptionSets') || 'Saved option sets'}</p>
                <div className="space-y-2">
                  {allOptionSets.map((os) => (
                    <label key={os.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--divider)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedOptionSetIds.has(os.id)}
                        onChange={() => {
                          const next = new Set(selectedOptionSetIds);
                          if (next.has(os.id)) next.delete(os.id); else next.add(os.id);
                          setSelectedOptionSetIds(next);
                        }}
                        className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-fg-primary">{os.name}</span>
                        <p className="text-xs text-fg-tertiary truncate">
                          {(os.options ?? []).map((o) => o.name).join(', ')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {variantGroups.map((vg) => (
              <div key={vg.key} className="space-y-4">
                {/* Group title */}
                <input placeholder={t('variantGroupTitle')} value={vg.title}
                  onChange={(e) => updateVariantGroup(vg.key, { title: e.target.value })}
                  className="input w-full text-base" />

                {/* Grid header */}
                <div className="grid grid-cols-[1fr_100px_100px_80px_40px] gap-2 items-center px-1">
                  <span className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">{t('variantName')}</span>
                  <span className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">{t('price')}</span>
                  <span className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">{t('onlinePrice')}</span>
                  <span className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">{t('status')}</span>
                  <span />
                </div>
                <div className="border-b-2 border-fg-primary" />

                {/* Variant rows */}
                {vg.variants.map((v) => (
                  <div key={v.key} className="grid grid-cols-[1fr_100px_100px_80px_40px] gap-2 items-center">
                    <input placeholder={t('variantName')} value={v.name}
                      onChange={(e) => updateVariant(vg.key, v.key, { name: e.target.value })}
                      className="input text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={v.price}
                      onChange={(e) => updateVariant(vg.key, v.key, { price: e.target.value })}
                      className="input text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={v.onlinePrice}
                      onChange={(e) => updateVariant(vg.key, v.key, { onlinePrice: e.target.value })}
                      className="input text-sm" />
                    <button onClick={() => updateVariant(vg.key, v.key, { isActive: !v.isActive })}
                      className={`text-xs font-medium px-2 py-1 rounded-full ${v.isActive ? 'text-status-ready' : 'text-fg-secondary'}`}
                      style={{ background: v.isActive ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}>
                      {v.isActive ? t('available') : t('unavailable')}
                    </button>
                    <button onClick={() => removeVariant(vg.key, v.key)}
                      className="p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                      <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}

                {/* Add variant row */}
                <button onClick={() => updateVariantGroup(vg.key, { variants: [...vg.variants, newVariant()] })}
                  className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors">
                  <PlusIcon className="w-4 h-4" /> {t('addVariant')}
                </button>

                {/* Remove group */}
                <button onClick={() => removeVariantGroup(vg.key)}
                  className="text-sm text-red-500 hover:text-red-600 font-medium hover:underline">
                  {t('remove')} {t('variants').toLowerCase()}
                </button>
              </div>
            ))}

            {/* Add another set */}
            <button onClick={() => setVariantGroups([...variantGroups, newVariantGroup()])}
              className="flex items-center gap-2 text-base font-medium text-fg-primary underline">
              <PlusIcon className="w-4 h-4" /> {t('addAnotherSet')}
            </button>
          </div>
        </div>
      )}

      {/* ── Modifier Sets Modal ──────────────────────────────────────── */}
      {modifierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[var(--divider)]">
            <div className="p-6 pb-4 flex items-center justify-between">
              <button onClick={() => setModifierModalOpen(false)}
                className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
                <XMarkIcon className="w-5 h-5" />
              </button>
              <button onClick={() => setModifierModalOpen(false)}
                className="btn-secondary rounded-full px-5 py-2 text-sm font-medium">{t('done')}</button>
            </div>
            <div className="px-6 pb-4">
              <h2 className="text-xl font-bold text-fg-primary mb-2">{t('modifiers')}</h2>
              <p className="text-sm text-fg-tertiary">{t('modifiersDescription')}</p>
            </div>
            <div className="mx-6 border-t-2 border-fg-primary" />
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {allModifierSets.length > 0 ? allModifierSets.map((ms) => (
                <label key={ms.id}
                  className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="text-base font-medium text-fg-primary">{ms.name}</span>
                    <p className="text-sm text-fg-tertiary truncate">
                      {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                    </p>
                  </div>
                  <input type="checkbox" checked={selectedModifierSetIds.has(ms.id)}
                    onChange={() => { const n = new Set(selectedModifierSetIds); if (n.has(ms.id)) n.delete(ms.id); else n.add(ms.id); setSelectedModifierSetIds(n); }}
                    className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0" />
                </label>
              )) : (
                <p className="text-sm text-fg-tertiary text-center py-8">{t('noModifiersForItem')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
