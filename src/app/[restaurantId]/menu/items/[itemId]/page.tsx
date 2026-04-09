'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteModifier, uploadMenuItemImage,
  detachModifierSetFromItem,
  listMenus, addItemsToGroup, removeItemFromGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, detachOptionSetFromItem, getItemOptionPrices,
  MenuCategory, MenuItem, MenuItemModifier, ModifierSet, Menu,
  OptionSet, ItemOptionOverride, ItemType, ComboStepInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, PhotoIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon,
  ArrowUpTrayIcon, MagnifyingGlassIcon, PlusIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

export default function EditItemPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [itemType, setItemType] = useState<ItemType>('food_and_beverage');
  const [imageUrl, setImageUrl] = useState('');
  const [portionSize, setPortionSize] = useState(0);
  const [portionSizeUnit, setPortionSizeUnit] = useState('g');
  const [recipeYieldValue, setRecipeYieldValue] = useState(0);
  const [recipeYieldUnit, setRecipeYieldUnit] = useState('kg');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo steps (only used when itemType === 'combo')
  interface ComboStepDraft {
    key: string;
    name: string;
    min_picks: number;
    max_picks: number;
    items: { menu_item_id: number; price_delta: number; item_name?: string; variant_id?: number; pick_key?: string }[];
  }
  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  // Combo modal state
  type PickKey = string;
  type PickInfo = { menuItemId: number; variantId?: number; name: string; price: number };
  const [comboModalOpen, setComboModalOpen] = useState(false);
  type ModalStep = 'select' | 'pricing' | 'configure';
  const [modalStep, setModalStep] = useState<ModalStep>('select');
  const [modalTab, setModalTab] = useState<'items' | 'categories'>('items');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategoryFilter, setModalCategoryFilter] = useState<number | null>(null);
  const [modalPicks, setModalPicks] = useState<Map<PickKey, PickInfo>>(new Map());
  const [modalItemDeltas, setModalItemDeltas] = useState<Map<PickKey, number>>(new Map());
  const [modalGroupName, setModalGroupName] = useState('');
  const [modalRequired, setModalRequired] = useState(1);
  const [modalDefaultKey, setModalDefaultKey] = useState<PickKey | ''>('');
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());

  // Categories search
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Modifier sets modal
  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  // Option sets (attached to this item)
  const [attachedOptionSets, setAttachedOptionSets] = useState<OptionSet[]>([]);
  const [itemOptionOverrides, setItemOptionOverrides] = useState<ItemOptionOverride[]>([]);

  // Menus / Cartes state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());
  const [initialMenuIds, setInitialMenuIds] = useState<Set<number>>(new Set());
  const [menuGroupMap, setMenuGroupMap] = useState<Map<number, number>>(new Map());
  const [menuSearch, setMenuSearch] = useState('');
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cats, allMenus, ms, optSets, optOverrides] = await Promise.all([
        getAllCategories(rid),
        listMenus(rid),
        listModifierSets(rid),
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
      ]);
      setCategories(cats);
      setMenus(allMenus);
      setAllModifierSets(ms ?? []);
      setItemOptionOverrides(optOverrides ?? []);
      // Find option sets attached to this item
      setAttachedOptionSets((optSets ?? []).filter((os) =>
        (os.menu_items ?? []).some((mi) => mi.id === iid)
      ));
      // Find the item across all categories
      for (const cat of cats) {
        const found = (cat.items ?? []).find((i) => i.id === iid);
        if (found) {
          setItem(found);
          setName(found.name);
          setPrice(String(found.price));
          setDescription(found.description ?? '');
          setCategoryId(found.category_id);
          const foundCat = cats.find((c) => c.id === found.category_id);
          if (foundCat) setCategorySearch(foundCat.name);
          setIsActive(found.is_active);
          setItemType(found.item_type || 'food_and_beverage');
          setImageUrl(found.image_url ?? '');
          setPortionSize(found.portion_size ?? 0);
          setPortionSizeUnit(found.portion_size_unit || 'g');
          setRecipeYieldValue(found.recipe_yield ?? 0);
          setRecipeYieldUnit(found.recipe_yield_unit || 'kg');
          // Load combo steps if this is a combo item
          if (found.item_type === 'combo' && found.combo_steps) {
            setComboSteps(found.combo_steps.map((s) => ({
              key: crypto.randomUUID(),
              name: s.name,
              min_picks: s.min_picks,
              max_picks: s.max_picks,
              items: s.items.map((si) => ({
                menu_item_id: si.menu_item_id,
                price_delta: si.price_delta,
                item_name: si.menu_item?.name,
                variant_id: si.option_id ?? undefined,
                pick_key: si.option_id ? `variant:${si.menu_item_id}:${si.option_id}` : `item:${si.menu_item_id}`,
              })),
            })));
          }
          break;
        }
      }
      // Determine which menus contain this item
      const mIds = new Set<number>();
      const gMap = new Map<number, number>();
      for (const menu of allMenus) {
        for (const group of menu.groups ?? []) {
          if ((group.items ?? []).some((i) => i.id === iid)) {
            mIds.add(menu.id);
            gMap.set(menu.id, group.id);
            break;
          }
        }
      }
      setSelectedMenuIds(mIds);
      setInitialMenuIds(new Set(mIds));
      setMenuGroupMap(gMap);
    } finally {
      setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Combo helpers ──
  const allMenuItems = categories.flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name, category_id: c.id }))
  );

  const removeComboStep = (key: string) => setComboSteps((prev) => prev.filter((s) => s.key !== key));

  const resetModal = () => {
    setModalStep('select');
    setModalTab('items');
    setModalSearch('');
    setModalCategoryFilter(null);
    setModalPicks(new Map());
    setModalItemDeltas(new Map());
    setModalGroupName('');
    setModalRequired(1);
    setModalDefaultKey('');
    setExpandedItemIds(new Set());
  };

  const [editingStepKey, setEditingStepKey] = useState<string | null>(null);

  const openAddOptionsModal = () => { resetModal(); setEditingStepKey(null); setComboModalOpen(true); };

  const openEditStepModal = (step: ComboStepDraft) => {
    resetModal();
    setEditingStepKey(step.key);
    setModalGroupName(step.name);
    setModalRequired(step.min_picks);
    // Rebuild picks from existing step items using stored pick_key
    const picks = new Map<PickKey, PickInfo>();
    const deltas = new Map<PickKey, number>();
    const expand = new Set<number>();
    for (const si of step.items) {
      const key = si.pick_key || `item:${si.menu_item_id}`;
      picks.set(key, { menuItemId: si.menu_item_id, variantId: si.variant_id, name: si.item_name || `Item #${si.menu_item_id}`, price: 0 });
      if (si.price_delta !== 0) deltas.set(key, si.price_delta);
      // Auto-expand items that have variant picks so user sees them checked
      if (si.variant_id) expand.add(si.menu_item_id);
    }
    setModalPicks(picks);
    setModalItemDeltas(deltas);
    setExpandedItemIds(expand);
    setModalStep('select');
    setComboModalOpen(true);
  };

  const togglePick = (key: PickKey, info: PickInfo) => {
    setModalPicks((prev) => { const next = new Map(prev); next.has(key) ? next.delete(key) : next.set(key, info); return next; });
  };

  const toggleExpand = (itemId: number) => {
    setExpandedItemIds((prev) => { const next = new Set(prev); next.has(itemId) ? next.delete(itemId) : next.add(itemId); return next; });
  };

  const modalPicksList = Array.from(modalPicks.entries()).map(([key, info]) => ({ key, ...info }));

  const handleModalAdd = () => {
    const draft: ComboStepDraft = {
      key: editingStepKey || crypto.randomUUID(),
      name: modalGroupName || `Choice ${comboSteps.length + 1}`,
      min_picks: modalRequired,
      max_picks: modalRequired,
      items: modalPicksList.map((p) => ({
        menu_item_id: p.menuItemId,
        price_delta: modalItemDeltas.get(p.key) ?? 0,
        item_name: p.name,
        variant_id: p.variantId,
        pick_key: p.key,
      })),
    };
    if (editingStepKey) {
      // Update existing step
      setComboSteps((prev) => prev.map((s) => s.key === editingStepKey ? draft : s));
    } else {
      // Add new step
      setComboSteps((prev) => [...prev, draft]);
    }
    setComboModalOpen(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      const updatePayload: Record<string, unknown> = {
        name: name.trim(),
        description,
        price: parseFloat(price),
        is_active: isActive,
        item_type: itemType,
        category_id: categoryId,
        image_url: imageUrl,
        portion_size: portionSize,
        portion_size_unit: portionSizeUnit,
        recipe_yield: recipeYieldValue,
        recipe_yield_unit: recipeYieldUnit,
      };
      if (itemType === 'combo') {
        updatePayload.combo_steps = comboSteps.map((s, i): ComboStepInput => ({
          name: s.name || `Choice ${i + 1}`,
          min_picks: s.min_picks,
          max_picks: s.max_picks,
          sort_order: i,
          items: s.items.map((si) => ({ menu_item_id: si.menu_item_id, option_id: si.variant_id || undefined, price_delta: si.price_delta })),
        }));
      }
      await updateMenuItem(rid, iid, updatePayload as Parameters<typeof updateMenuItem>[2]);
      // Handle menu assignment diffs
      const added = Array.from(selectedMenuIds).filter((id) => !initialMenuIds.has(id));
      const removed = Array.from(initialMenuIds).filter((id) => !selectedMenuIds.has(id));
      for (const menuId of added) {
        const menu = menus.find((m) => m.id === menuId);
        const groups = menu?.groups ?? [];
        let groupId: number;
        if (groups.length > 0) {
          groupId = groups[0].id;
        } else {
          const newGroup = await createGroup(rid, { menu_id: menuId, name: menu?.name ?? 'Default' });
          groupId = newGroup.id;
        }
        await addItemsToGroup(rid, groupId, [iid]);
      }
      for (const menuId of removed) {
        const groupId = menuGroupMap.get(menuId);
        if (groupId) await removeItemFromGroup(rid, groupId, iid);
      }
      router.push(`/${rid}/menu/items`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadMenuItemImage(rid, iid, file);
      setImageUrl(url);
      await updateMenuItem(rid, iid, { image_url: url });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageUpload(file);
  };

  const handleDeleteModifier = async (modId: number) => {
    if (!confirm(t('deleteThisModifier'))) return;
    await deleteModifier(rid, modId);
    loadData();
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-20">
        <p className="text-fg-secondary">Item not found</p>
        <button onClick={goBack} className="mt-4 text-brand-500 hover:underline">{t('back')}</button>
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
        <span className="text-sm font-bold text-fg-primary">{t('editItem')}</span>
        <button onClick={handleSave} disabled={saving || !name.trim() || !price}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-fg-primary mb-8">{t('editItem')}</h1>

        <div className="flex gap-8">
          {/* Left column — main form */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Item Type (read-only badge) */}
            {itemType === 'combo' && (
              <div className="border border-[var(--divider)] rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-sm text-fg-tertiary">{t('itemType')}</span>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-brand-500/15 text-brand-500">
                  {t('combo')}
                </span>
              </div>
            )}

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
                if (file) handleImageUpload(file);
              }}
            />
            {imageUrl ? (
              <div
                className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-[var(--divider)]"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <img src={imageUrl} alt={name} className="w-full h-52 object-cover" />
                {uploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                  </div>
                )}
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
                {uploading ? (
                  <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-10 h-10" />
                    <p className="text-base text-center">
                      {t('dropImagesHere')}, <span className="text-brand-500 font-medium underline hover:text-brand-600">{t('browse')}</span>
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Combo Builder (only for combo items) ── */}
            {itemType === 'combo' && (
              <>
                <div className="h-1 bg-[var(--divider)] rounded-full" />
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-fg-primary">{t('buildThisCombo')}</h3>
                    <p className="text-sm text-fg-tertiary mt-0.5">{t('comboBuilderDescription')}</p>
                  </div>

                  {comboSteps.length > 0 && (
                    <div>
                      <div className="flex items-center text-xs font-medium text-fg-tertiary uppercase tracking-wider mb-1 border-b border-[var(--divider)] pb-2">
                        <span className="flex-1">{t('comboChoice')}</span>
                        <span className="w-16 text-center">{t('required')}</span>
                        <span className="w-14" />
                      </div>
                      {comboSteps.map((step) => (
                        <div key={step.key} className="border-b border-[var(--divider)] py-2.5">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditStepModal(step)}>
                              <span className="text-sm font-medium text-brand-500 hover:underline">{step.name}</span>
                              <div className="text-xs text-fg-tertiary truncate mt-0.5">
                                {step.items.length > 0
                                  ? step.items.map((si) => si.item_name || `#${si.menu_item_id}`).join(', ')
                                  : `${step.items.length} ${t('options')}`}
                              </div>
                            </div>
                            <span className="w-16 text-center text-sm text-fg-secondary shrink-0">{step.min_picks}</span>
                            <div className="w-14 flex items-center justify-end gap-1 shrink-0">
                              <button onClick={() => removeComboStep(step.key)} className="p-1 text-fg-tertiary hover:text-red-400">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={openAddOptionsModal}
                    className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-400">
                    <PlusIcon className="w-4 h-4" />
                    {t('addOptions')}
                  </button>
                </div>
              </>
            )}

            {/* Legacy modifiers */}
            {(item.modifiers ?? []).length > 0 && (
              <div>
                <h3 className="text-base font-bold text-fg-primary mb-3">{t('modifiers')}</h3>
                <div className="space-y-2">
                  {(item.modifiers ?? []).map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-[var(--surface-subtle)]">
                      <div>
                        <span className="text-sm font-medium text-fg-primary">{mod.name}</span>
                        <span className="text-xs text-fg-tertiary ml-2">({mod.action})</span>
                        {mod.category && <span className="text-xs text-fg-tertiary ml-2">· {mod.category}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {mod.price_delta !== 0 && (
                          <span className="text-sm text-fg-secondary">
                            {mod.price_delta > 0 ? '+' : ''}₪{mod.price_delta.toFixed(2)}
                          </span>
                        )}
                        <button onClick={() => handleDeleteModifier(mod.id)} className="p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Stock Management ── */}
            <div className="h-1 bg-[var(--divider)] rounded-full" />
            <div className="space-y-4">
              <h3 className="text-base font-bold text-fg-primary">{t('stockManagement')}</h3>

              {/* Default Portion */}
              <div>
                <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('defaultPortion')}</label>
                <p className="text-xs text-fg-tertiary mb-2">{t('defaultPortionDesc')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={portionSize || ''}
                    onChange={(e) => setPortionSize(+e.target.value)}
                    className="input w-24 py-1.5 text-sm text-right"
                  />
                  <select
                    value={portionSizeUnit}
                    onChange={(e) => setPortionSizeUnit(e.target.value)}
                    className="input w-20 py-1.5 text-sm"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="unit">unit</option>
                  </select>
                </div>
              </div>

              {/* Recipe Type */}
              <div>
                <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('recipeType')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setRecipeYieldValue(1); setRecipeYieldUnit('unit'); }}
                    className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                      recipeYieldUnit === 'unit' && recipeYieldValue === 1 ? 'border-brand bg-brand/5' : 'border-[var(--divider)] hover:border-fg-secondary/30'
                    }`}
                  >
                    <p className="text-sm font-semibold text-fg-primary">{t('perItemRecipe')}</p>
                    <p className="text-[11px] text-fg-tertiary mt-0.5">{t('perItemRecipeDesc')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (recipeYieldUnit === 'unit') { setRecipeYieldValue(0); setRecipeYieldUnit('kg'); } }}
                    className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                      recipeYieldUnit !== 'unit' || recipeYieldValue !== 1 ? 'border-brand bg-brand/5' : 'border-[var(--divider)] hover:border-fg-secondary/30'
                    }`}
                  >
                    <p className="text-sm font-semibold text-fg-primary">{t('bulkRecipe')}</p>
                    <p className="text-[11px] text-fg-tertiary mt-0.5">{t('bulkRecipeDesc')}</p>
                  </button>
                </div>
              </div>

              {/* Yield editor — only for bulk recipes */}
              {!(recipeYieldUnit === 'unit' && recipeYieldValue === 1) && (
                <div>
                  <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('recipeYield')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={recipeYieldValue || ''}
                      onChange={(e) => setRecipeYieldValue(+e.target.value)}
                      className="input w-24 py-1.5 text-sm text-right"
                    />
                    <select
                      value={recipeYieldUnit}
                      onChange={(e) => setRecipeYieldUnit(e.target.value)}
                      className="input w-20 py-1.5 text-sm"
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="l">l</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-1 bg-[var(--divider)] rounded-full" />

            {/* Modifier sets */}
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
              <p className="text-sm text-fg-tertiary mb-3">{t('modifiersDescription')}</p>
              {(item.modifier_sets ?? []).length > 0 ? (
                <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
                  {(item.modifier_sets ?? []).map((ms: ModifierSet) => (
                    <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
                      <div>
                        <span className="text-sm font-medium text-fg-primary">{ms.name}</span>
                        <span className="text-xs text-fg-tertiary ml-2">
                          {ms.modifiers?.length ?? 0} modifiers
                        </span>
                        {ms.is_required && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface-subtle)] text-fg-secondary">required</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/${restaurantId}/menu/modifier-sets/${ms.id}`)}
                          className="text-sm text-brand-600 hover:underline font-medium"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Unlink this modifier set from item?')) return;
                            await detachModifierSetFromItem(rid, ms.id, iid);
                            loadData();
                          }}
                          className="text-sm text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                        >
                          {t('remove')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setModifierModalOpen(true)}
                  className="w-full py-3 rounded-xl text-sm text-fg-tertiary hover:text-brand-600 transition-colors border border-dashed border-[var(--divider)]"
                >
                  + {t('add')}
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--divider)]" />

            {/* Variantes (Option Sets) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('variants')}</h3>
                <button
                  onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  className="text-base font-medium underline text-fg-primary shrink-0"
                >
                  {t('add')}
                </button>
              </div>
              <p className="text-sm text-fg-tertiary mb-3">{t('variantsDescription')}</p>
              {attachedOptionSets.length > 0 ? (
                <div className="space-y-3">
                  {attachedOptionSets.map((os) => (
                    <div key={os.id} className="rounded-xl border border-[var(--divider)] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-subtle)]">
                        <span className="text-sm font-bold text-fg-primary">{os.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                            className="text-sm text-brand-600 hover:underline font-medium"
                          >
                            {t('edit')}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(t('remove') + '?')) return;
                              await detachOptionSetFromItem(rid, os.id, iid);
                              loadData();
                            }}
                            className="text-sm text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                          >
                            {t('remove')}
                          </button>
                        </div>
                      </div>
                      {(os.options ?? []).map((opt) => {
                        const override = itemOptionOverrides.find((ov) => ov.option_id === opt.id);
                        const price = override?.price ?? opt.price;
                        return (
                          <div key={opt.id} className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--divider)]">
                            <span className="text-sm text-fg-primary">{opt.name}</span>
                            <span className="text-sm font-semibold text-fg-primary">₪{price.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  className="w-full py-3 rounded-xl text-sm text-fg-tertiary hover:text-brand-600 transition-colors border border-dashed border-[var(--divider)]"
                >
                  + {t('addVariants')}
                </button>
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
                allModifierSets.map((ms) => {
                  const alreadyAttached = (item.modifier_sets ?? []).some((ims: ModifierSet) => ims.id === ms.id);
                  return (
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
                        checked={alreadyAttached}
                        onChange={async () => {
                          if (alreadyAttached) {
                            await detachModifierSetFromItem(rid, ms.id, iid);
                          } else {
                            await attachModifierSetToItems(rid, ms.id, [iid]);
                          }
                          loadData();
                        }}
                        className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0"
                      />
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-fg-tertiary text-center py-8">{t('noModifiersForItem')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Combo Add Options Modal (rendered outside layout to avoid overflow) ── */}
      {comboModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setComboModalOpen(false)}>
          <div className="bg-[var(--surface-subtle)] border border-[var(--divider)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            {modalStep === 'select' && (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <button onClick={() => setComboModalOpen(false)}
                    className="w-9 h-9 rounded-full border border-[var(--divider)] hover:bg-[var(--surface)] transition-colors flex items-center justify-center">
                    <XMarkIcon className="w-4 h-4 text-fg-primary" />
                  </button>
                  <button onClick={() => { if (modalPicks.size > 0) setModalStep('pricing'); }}
                    disabled={modalPicks.size === 0}
                    className="btn-primary text-sm px-5 py-2 rounded-lg disabled:opacity-40">{t('next')}</button>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-lg font-bold text-fg-primary">{t('addOptions')}</h2>
                  <p className="text-sm text-fg-tertiary mt-1">{t('addOptionsDesc')}</p>
                </div>
                <div className="flex mx-5 rounded-lg overflow-hidden mb-4 shrink-0 border border-[var(--divider)]">
                  <button onClick={() => { setModalTab('items'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${modalTab === 'items' ? 'bg-[var(--surface)] text-fg-primary border-b-2 border-brand-500' : 'text-fg-tertiary hover:text-fg-secondary'}`}>
                    {t('items')}
                  </button>
                  <button onClick={() => { setModalTab('categories'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${modalTab === 'categories' ? 'bg-[var(--surface)] text-fg-primary border-b-2 border-brand-500' : 'text-fg-tertiary hover:text-fg-secondary'}`}>
                    {t('categories')}
                  </button>
                </div>

                {modalTab === 'items' ? (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                        <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder={t('searchItems')}
                          className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                      </div>
                      <select value={modalCategoryFilter ?? ''} onChange={(e) => setModalCategoryFilter(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">{t('showAllCategories')}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center text-xs font-semibold text-fg-tertiary uppercase tracking-wider px-1 mb-1 pb-2 border-b border-[var(--divider)]">
                      <span className="w-8" /><span className="flex-1">{t('name')}</span><span className="w-20 text-right">{t('price')}</span>
                    </div>
                    {allMenuItems
                      .filter((i) => {
                        if (modalCategoryFilter && i.category_id !== modalCategoryFilter) return false;
                        if (modalSearch && !i.name.toLowerCase().includes(modalSearch.toLowerCase())) return false;
                        return true;
                      })
                      .map((mi) => {
                        const variantOpts = (mi.variant_groups ?? []).flatMap((g) => (g.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: v.price, is_active: v.is_active })));
                        const optionSetOpts = (mi.option_sets ?? []).flatMap((os) => (os.options ?? []).map((o) => ({ id: o.id, name: o.name, price: o.price, is_active: o.is_active })));
                        const variants = [...variantOpts, ...optionSetOpts].filter((v) => v.is_active);
                        const hasVariants = variants.length > 0;
                        const isExpanded = expandedItemIds.has(mi.id);
                        const itemKey = `item:${mi.id}`;
                        return (
                          <div key={mi.id}>
                            {hasVariants ? (
                              <>
                                <div className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm"
                                  onClick={() => toggleExpand(mi.id)}>
                                  <button className="w-5 h-5 flex items-center justify-center shrink-0 text-fg-tertiary">
                                    {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                  </button>
                                  <span className="flex-1 text-sm font-medium text-fg-primary">
                                    {mi.name}
                                    <span className="text-xs text-fg-tertiary ml-2">{variants.length} {t('variants').toLowerCase()}</span>
                                  </span>
                                  <span className="w-20 text-right text-sm text-fg-tertiary">-</span>
                                </div>
                                {isExpanded && variants.map((v) => {
                                  const vKey = `variant:${mi.id}:${v.id}`;
                                  return (
                                    <label key={vKey} className="flex items-center gap-3 pl-8 pr-1 py-2.5 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
                                      <input type="checkbox" checked={modalPicks.has(vKey)}
                                        onChange={() => togglePick(vKey, { menuItemId: mi.id, variantId: v.id, name: `${mi.name} - ${v.name}`, price: v.price })}
                                        className="w-4 h-4 rounded border-2 border-[var(--divider)] accent-brand-500 shrink-0" />
                                      <span className="flex-1 text-sm text-fg-primary">{v.name}</span>
                                      <span className="w-20 text-right text-sm text-fg-secondary">₪{v.price.toFixed(2)}</span>
                                    </label>
                                  );
                                })}
                              </>
                            ) : (
                              <label className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
                                <input type="checkbox" checked={modalPicks.has(itemKey)}
                                  onChange={() => togglePick(itemKey, { menuItemId: mi.id, name: mi.name, price: mi.price })}
                                  className="w-4 h-4 rounded border-2 border-[var(--divider)] accent-brand-500 shrink-0" />
                                <span className="flex-1 text-sm text-fg-primary">{mi.name}</span>
                                <span className="w-20 text-right text-sm text-fg-secondary">₪{mi.price.toFixed(2)}</span>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    {modalPicks.size > 0 && (
                      <div className="flex items-center gap-3 pt-3 text-sm">
                        <span className="text-brand-500 font-medium">{modalPicks.size} {t('selected')}</span>
                        <button onClick={() => setModalPicks(new Map())} className="text-brand-500 font-medium hover:underline">{t('deselectAll')}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="relative mb-3">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                      <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder={t('searchCategories')}
                        className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                    </div>
                    {categories
                      .filter((c) => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((cat) => (
                        <label key={cat.id} className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
                          <input type="radio" name="combo-cat-edit"
                            checked={modalCategoryFilter === cat.id && (cat.items ?? []).every((ci) => modalPicks.has(`item:${ci.id}`))}
                            onChange={() => {
                              setModalPicks((prev) => {
                                const next = new Map(prev);
                                (cat.items ?? []).forEach((ci) => { const key = `item:${ci.id}`; if (!next.has(key)) next.set(key, { menuItemId: ci.id, name: ci.name, price: ci.price }); });
                                return next;
                              });
                              setModalCategoryFilter(cat.id);
                            }}
                            className="w-4 h-4 accent-brand-500 shrink-0" />
                          <span className="flex-1 text-sm text-fg-primary">{cat.name}</span>
                          <span className="w-16 text-right text-sm text-fg-secondary">{(cat.items ?? []).length}</span>
                        </label>
                      ))}
                  </div>
                )}
              </>
            )}

            {modalStep === 'pricing' && (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <button onClick={() => setModalStep('select')}
                    className="w-9 h-9 rounded-full border border-[var(--divider)] hover:bg-[var(--surface)] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-fg-primary" />
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setModalStep('configure')} className="text-sm px-4 py-2 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface)] transition-colors">{t('skip')}</button>
                    <button onClick={() => setModalStep('configure')} className="btn-primary text-sm px-5 py-2 rounded-lg">{t('next')}</button>
                  </div>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-lg font-bold text-fg-primary">{t('addDiscountsOrUpcharges')}</h2>
                  <p className="text-sm text-fg-tertiary mt-1">{t('addDiscountsDesc')}</p>
                </div>
                <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                  {[...modalPicksList].sort((a, b) => b.price - a.price).map((pick) => (
                    <div key={pick.key} className="flex items-center border-b border-[var(--divider)] py-3 px-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fg-primary">{pick.name}</div>
                        <div className="text-xs text-fg-tertiary">₪{pick.price.toFixed(2)}</div>
                      </div>
                      <div className="w-28">
                        <input type="number" step="0.01" value={modalItemDeltas.get(pick.key) ?? 0}
                          onChange={(e) => setModalItemDeltas((prev) => { const next = new Map(prev); next.set(pick.key, parseFloat(e.target.value) || 0); return next; })}
                          className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" placeholder="₪0.00" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {modalStep === 'configure' && (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <button onClick={() => setModalStep('pricing')}
                    className="w-9 h-9 rounded-full border border-[var(--divider)] hover:bg-[var(--surface)] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-fg-primary" />
                  </button>
                  <button onClick={handleModalAdd} className="btn-primary text-sm px-5 py-2 rounded-lg">{t('add')}</button>
                </div>
                <div className="px-5 pb-5 space-y-5">
                  <h2 className="text-lg font-bold text-fg-primary">{t('nameThisGroup')}</h2>
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-1.5">{t('name')}</label>
                    <input value={modalGroupName} onChange={(e) => setModalGroupName(e.target.value)} placeholder={t('comboNamePlaceholder')}
                      className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-1.5">{t('howManySelections')}</label>
                    <input type="number" min={0} value={modalRequired} onChange={(e) => setModalRequired(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-1.5">{t('setDefaultOption')}</label>
                    <select value={modalDefaultKey} onChange={(e) => setModalDefaultKey(e.target.value)}
                      className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">{t('noDefaultSelection')}</option>
                      {modalPicksList.map((pick) => <option key={pick.key} value={pick.key}>{pick.name}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
