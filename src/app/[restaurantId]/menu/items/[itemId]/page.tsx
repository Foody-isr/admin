'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteModifier, uploadMenuItemImage,
  detachModifierSetFromItem,
  listMenus, addItemsToGroup, removeItemFromGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, detachOptionSetFromItem, getItemOptionPrices,
  listStockItems, listPrepItems, getMenuItemIngredients,
  MenuCategory, MenuItem, ModifierSet, Menu,
  OptionSet, ItemOptionOverride, ItemType, ComboStepInput,
  StockItem, PrepItem, MenuItemIngredient,
} from '@/lib/api';
import { getRestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemRecipeTab, { MenuItemRecipeTabHandle } from '@/components/menu-item/MenuItemRecipeTab';
import MenuItemCostPanel from '@/components/menu-item/MenuItemCostPanel';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import { SectionCard, Field, FormInput, FormTextarea } from '@/components/menu-item/MenuItemForm';
import { computeItemCostSummary } from '@/lib/cost-utils';
import SearchableListField from '@/components/SearchableListField';
import {
  XMarkIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon,
  MagnifyingGlassIcon, PlusIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

const VALID_TABS: MenuItemSection[] = ['details', 'modifiers', 'recipe', 'cost'];

export default function EditItemPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);

  const initialTab = (() => {
    const raw = searchParams.get('tab');
    return raw && VALID_TABS.includes(raw as MenuItemSection) ? (raw as MenuItemSection) : 'details';
  })();
  const [activeTab, setActiveTab] = useState<MenuItemSection>(initialTab);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [itemType, setItemType] = useState<ItemType>('food_and_beverage');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo steps
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

  // Food cost / ingredients state
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [vatRate, setVatRate] = useState(18);

  const recipeRef = useRef<MenuItemRecipeTabHandle>(null);

  const loadData = useCallback(async () => {
    try {
      const [cats, allMenus, ms, optSets, optOverrides, stock, prep, ings] = await Promise.all([
        getAllCategories(rid),
        listMenus(rid),
        listModifierSets(rid),
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
        listStockItems(rid),
        listPrepItems(rid),
        getMenuItemIngredients(rid, iid),
      ]);
      setCategories(cats);
      setMenus(allMenus);
      setAllModifierSets(ms ?? []);
      setItemOptionOverrides(optOverrides ?? []);
      setStockItems(stock ?? []);
      setPrepItems(prep ?? []);
      setIngredients(ings ?? []);
      setAttachedOptionSets((optSets ?? []).filter((os) =>
        (os.menu_items ?? []).some((mi) => mi.id === iid)
      ));
      for (const cat of cats) {
        const found = (cat.items ?? []).find((i) => i.id === iid);
        if (found) {
          setItem(found);
          setName(found.name);
          setPrice(String(found.price));
          setDescription(found.description ?? '');
          setCategoryId(found.category_id);
          setIsActive(found.is_active);
          setItemType(found.item_type || 'food_and_beverage');
          setImageUrl(found.image_url ?? '');
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
  useEffect(() => {
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
  }, [rid]);

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
    const picks = new Map<PickKey, PickInfo>();
    const deltas = new Map<PickKey, number>();
    const expand = new Set<number>();
    for (const si of step.items) {
      const key = si.pick_key || `item:${si.menu_item_id}`;
      picks.set(key, { menuItemId: si.menu_item_id, variantId: si.variant_id, name: si.item_name || `Item #${si.menu_item_id}`, price: 0 });
      if (si.price_delta !== 0) deltas.set(key, si.price_delta);
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
      setComboSteps((prev) => prev.map((s) => s.key === editingStepKey ? draft : s));
    } else {
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
        portion_size: 0,
        portion_size_unit: '',
        recipe_yield: 0,
        recipe_yield_unit: '',
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
      const updated = await updateMenuItem(rid, iid, updatePayload as Parameters<typeof updateMenuItem>[2]);
      setItem((prev) => prev ? { ...prev, ...updated } : prev);
      if (recipeRef.current?.isDirty()) {
        await recipeRef.current.save();
      }
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
    try {
      const url = await uploadMenuItemImage(rid, iid, file);
      setImageUrl(url);
      await updateMenuItem(rid, iid, { image_url: url });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleDeleteModifier = async (modId: number) => {
    if (!confirm(t('deleteThisModifier'))) return;
    await deleteModifier(rid, modId);
    loadData();
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  const costSummary = useMemo(() => {
    if (!item || ingredients.length === 0) return null;
    const s = computeItemCostSummary({
      item,
      ingredients,
      overrides: itemOptionOverrides,
      vatRate,
      showCostsExVat: true,
    });
    return { foodCost: s.foodCost, costPct: s.costPct, margin: s.margin };
  }, [item, ingredients, itemOptionOverrides, vatRate]);

  const activeCategoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name,
    [categories, categoryId],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090b] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#f54900] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col items-center justify-center gap-4">
        <p className="text-[#9f9fa9]">Item not found</p>
        <button onClick={goBack} className="text-[#f54900] hover:underline">{t('back')}</button>
      </div>
    );
  }

  const tabs: TabBarItem[] = [
    { id: 'details', label: t('tabDetails') },
    { id: 'modifiers', label: t('tabModifiers') },
    { id: 'recipe', label: t('tabRecipe') },
    { id: 'cost', label: t('tabCost'), warning: costSummary?.costPct != null && costSummary.costPct > 0.35 },
  ];

  const rail = (
    <MenuItemSummaryRail
      imageUrl={imageUrl}
      name={name}
      price={parseFloat(price) || 0}
      activeStatus={isActive}
      categoryName={activeCategoryName}
      costSummary={costSummary}
      onImageClick={() => fileInputRef.current?.click()}
    />
  );

  return (
    <>
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

      <MenuItemShell
        title={t('editItem')}
        onClose={goBack}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!name.trim() || !price}
        sidebar={rail}
      >
        <div className="flex flex-col gap-2">
          <MenuItemTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

          <div className="pt-6">
            {/* ── Tab: Détails ─────────────────────────────────── */}
            {activeTab === 'details' && (
              <SectionCard title={t('tabDetails')}>
                {itemType === 'combo' && (
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] text-[#9f9fa9]">{t('itemType')}</span>
                    <span className="px-3 py-1 rounded-full text-[12px] leading-[16px] bg-[rgba(245,73,0,0.15)] text-[#f54900]">
                      {t('combo')}
                    </span>
                  </div>
                )}

                {/* Row 1 — Name | Category (Figma 0:102) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={t('itemNameLabel')}>
                    <FormInput
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('nameRequired')}
                    />
                  </Field>
                  <Field label={t('category')}>
                    <CategorySelect
                      value={categoryId}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      onChange={setCategoryId}
                      placeholder={t('addToCategories')}
                    />
                  </Field>
                </div>

                {/* Row 2 — Price | VAT | Status (Figma 0:119) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t('sellingPriceLabel')}>
                    <div className="relative">
                      <FormInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder={t('price')}
                        className="pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-[#9f9fa9] pointer-events-none">₪</span>
                    </div>
                  </Field>
                  <Field label={t('vat')}>
                    <FormInput
                      type="text"
                      value={`${vatRate}%`}
                      readOnly
                      className="cursor-not-allowed"
                      title={`${t('vat')} — ${vatRate}%`}
                    />
                  </Field>
                  <Field label={t('status')}>
                    <button
                      type="button"
                      onClick={() => setIsActive(!isActive)}
                      className="h-10 inline-flex items-center gap-2 text-[14px] leading-[20px] text-[#fafafa] rounded-[6px] self-start"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-[#00c950]' : 'bg-[#9f9fa9]'}`} />
                      {isActive ? t('active') : t('unavailable')}
                    </button>
                  </Field>
                </div>

                <Field label={t('description')}>
                  <FormTextarea
                    placeholder={t('addDescription')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </Field>

                {/* Menus assignment — not in Figma but required for the feature.
                    Kept at the bottom with lighter visual weight. */}
                <Field label={t('menus')} hint={t('cartesDescription')}>
                  <SearchableListField
                    mode="multi"
                    placeholder={t('addToMenus')}
                    emptyLabel={t('noMenusAvailable') || 'No menus available'}
                    options={menus.map((m) => ({ value: String(m.id), label: m.name }))}
                    values={Array.from(selectedMenuIds).map(String)}
                    onChange={(vs) => setSelectedMenuIds(new Set(vs.map(Number)))}
                  />
                </Field>
              </SectionCard>
            )}

            {/* ── Tab: Modificateurs & Variantes ───────────────── */}
            {activeTab === 'modifiers' && (
              <SectionCard title={t('tabModifiers')}>
                {itemType === 'combo' && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#fafafa]">{t('buildThisCombo')}</h3>
                      <p className="text-[14px] text-[#9f9fa9] mt-0.5">{t('comboBuilderDescription')}</p>
                    </div>

                    {comboSteps.length > 0 && (
                      <div>
                        <div className="flex items-center text-[12px] font-medium text-[#9f9fa9] uppercase tracking-wider mb-1 border-b border-[rgba(255,255,255,0.1)] pb-2">
                          <span className="flex-1">{t('comboChoice')}</span>
                          <span className="w-16 text-center">{t('required')}</span>
                          <span className="w-14" />
                        </div>
                        {comboSteps.map((step) => (
                          <div key={step.key} className="border-b border-[rgba(255,255,255,0.1)] py-2.5">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditStepModal(step)}>
                                <span className="text-[14px] font-medium text-[#f54900] hover:underline">{step.name}</span>
                                <div className="text-[12px] text-[#9f9fa9] truncate mt-0.5">
                                  {step.items.length > 0
                                    ? step.items.map((si) => si.item_name || `#${si.menu_item_id}`).join(', ')
                                    : `${step.items.length} ${t('options')}`}
                                </div>
                              </div>
                              <span className="w-16 text-center text-[14px] text-[#9f9fa9] shrink-0">{step.min_picks}</span>
                              <div className="w-14 flex items-center justify-end gap-1 shrink-0">
                                <button onClick={() => removeComboStep(step.key)} className="p-1 text-[#9f9fa9] hover:text-red-400">
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={openAddOptionsModal}
                      className="flex items-center gap-2 text-[14px] font-medium text-[#f54900] hover:text-[#e04300]">
                      <PlusIcon className="w-4 h-4" />
                      {t('addOptions')}
                    </button>
                  </div>
                )}

                {(item.modifiers ?? []).length > 0 && (
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#fafafa] mb-3">{t('modifiers')}</h3>
                    <div className="flex flex-col gap-2">
                      {(item.modifiers ?? []).map((mod) => (
                        <div key={mod.id} className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-[#27272a]">
                          <div>
                            <span className="text-[14px] font-medium text-[#fafafa]">{mod.name}</span>
                            <span className="text-[12px] text-[#9f9fa9] ml-2">({mod.action})</span>
                            {mod.category && <span className="text-[12px] text-[#9f9fa9] ml-2">· {mod.category}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            {mod.price_delta !== 0 && (
                              <span className="text-[14px] text-[#9f9fa9]">
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[16px] font-semibold text-[#fafafa]">{t('modifiers')}</h3>
                    <button
                      onClick={() => setModifierModalOpen(true)}
                      className="text-[14px] font-medium underline text-[#fafafa] shrink-0"
                    >
                      {t('add')}
                    </button>
                  </div>
                  <p className="text-[14px] text-[#9f9fa9] mb-3">{t('modifiersDescription')}</p>
                  {(item.modifier_sets ?? []).length > 0 ? (
                    <div className="rounded-[8px] border border-[rgba(255,255,255,0.1)] overflow-hidden">
                      {(item.modifier_sets ?? []).map((ms: ModifierSet) => (
                        <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.1)] last:border-b-0 hover:bg-[#27272a] transition-colors">
                          <div>
                            <span className="text-[14px] font-medium text-[#fafafa]">{ms.name}</span>
                            <span className="text-[12px] text-[#9f9fa9] ml-2">
                              {ms.modifiers?.length ?? 0} modifiers
                            </span>
                            {ms.is_required && (
                              <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-md text-[12px] bg-[#27272a] text-[#9f9fa9]">required</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => router.push(`/${restaurantId}/menu/modifier-sets/${ms.id}`)}
                              className="text-[14px] text-[#f54900] hover:underline font-medium"
                            >
                              {t('edit')}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('Unlink this modifier set from item?')) return;
                                await detachModifierSetFromItem(rid, ms.id, iid);
                                loadData();
                              }}
                              className="text-[14px] text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
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
                      className="w-full py-3 rounded-[8px] text-[14px] text-[#9f9fa9] hover:text-[#fafafa] transition-colors border border-dashed border-[rgba(255,255,255,0.1)]"
                    >
                      + {t('add')}
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[16px] font-semibold text-[#fafafa]">{t('variants')}</h3>
                    <button
                      onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                      className="text-[14px] font-medium underline text-[#fafafa] shrink-0"
                    >
                      {t('add')}
                    </button>
                  </div>
                  <p className="text-[14px] text-[#9f9fa9] mb-3">{t('variantsDescription')}</p>
                  {attachedOptionSets.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {attachedOptionSets.map((os) => (
                        <div key={os.id} className="rounded-[8px] border border-[rgba(255,255,255,0.1)] overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[#27272a]">
                            <span className="text-[14px] font-semibold text-[#fafafa]">{os.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                                className="text-[14px] text-[#f54900] hover:underline font-medium"
                              >
                                {t('edit')}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(t('remove') + '?')) return;
                                  await detachOptionSetFromItem(rid, os.id, iid);
                                  loadData();
                                }}
                                className="text-[14px] text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                              >
                                {t('remove')}
                              </button>
                            </div>
                          </div>
                          {(os.options ?? []).map((opt) => {
                            const override = itemOptionOverrides.find((ov) => ov.option_id === opt.id);
                            const optPrice = override?.price ?? opt.price;
                            const portionSize = override?.portion_size ?? 0;
                            const portionUnit = override?.portion_size_unit ?? '';
                            const active = override?.is_active ?? opt.is_active;
                            return (
                              <div key={opt.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[rgba(255,255,255,0.1)]">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[14px] text-[#fafafa] truncate">{opt.name}</span>
                                    {!active && (
                                      <span className="px-2 py-0.5 rounded-md text-[12px] bg-[#27272a] text-[#9f9fa9] shrink-0">
                                        {t('unavailable')}
                                      </span>
                                    )}
                                  </div>
                                  {portionSize > 0 && (
                                    <div className="text-[12px] text-[#9f9fa9] mt-0.5">
                                      {portionSize}{portionUnit ? ` ${portionUnit}` : ''}
                                    </div>
                                  )}
                                </div>
                                <span className="text-[14px] font-semibold text-[#fafafa] shrink-0">₪{optPrice.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                      className="w-full py-3 rounded-[8px] text-[14px] text-[#9f9fa9] hover:text-[#fafafa] transition-colors border border-dashed border-[rgba(255,255,255,0.1)]"
                    >
                      + {t('addVariants')}
                    </button>
                  )}
                </div>
              </SectionCard>
            )}

            {/* ── Tab: Recette ─────────────────────────────────── */}
            {activeTab === 'recipe' && (
              <SectionCard title={t('tabRecipe')}>
                <MenuItemRecipeTab
                  ref={recipeRef}
                  rid={rid}
                  item={item}
                  ingredients={ingredients}
                  stockItems={stockItems}
                  prepItems={prepItems}
                  onIngredientsSaved={(ings) => setIngredients(ings)}
                  onRecipeSaved={loadData}
                  attachedOptionSets={attachedOptionSets}
                  itemOptionOverrides={itemOptionOverrides}
                />
              </SectionCard>
            )}

            {/* ── Tab: Coût ────────────────────────────────────── */}
            {activeTab === 'cost' && (
              <SectionCard title={t('tabCost')}>
                <MenuItemCostPanel
                  rid={rid}
                  item={item}
                  ingredients={ingredients}
                  prepItems={prepItems}
                  stockItems={stockItems}
                  vatRate={vatRate}
                  itemOptionOverrides={itemOptionOverrides}
                  onGoToRecipe={() => setActiveTab('recipe')}
                />
              </SectionCard>
            )}
          </div>
        </div>
      </MenuItemShell>

      {/* Modifier Sets Modal */}
      {modifierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50">
          <div className="bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[rgba(255,255,255,0.1)]">
            <div className="p-6 pb-4 flex items-center justify-between">
              <button
                onClick={() => setModifierModalOpen(false)}
                className="w-10 h-10 rounded-full bg-[#27272a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center"
              >
                <XMarkIcon className="w-5 h-5 text-[#fafafa]" />
              </button>
              <button
                onClick={() => setModifierModalOpen(false)}
                className="bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] rounded-full px-5 py-2 text-[14px] font-medium"
              >
                {t('done')}
              </button>
            </div>
            <div className="px-6 pb-4">
              <h2 className="text-[20px] font-bold text-[#fafafa] mb-2">{t('modifiers')}</h2>
              <p className="text-[14px] text-[#9f9fa9]">{t('modifiersDescription')}</p>
            </div>
            <div className="mx-6 border-t-2 border-[#fafafa]" />
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {allModifierSets.length > 0 ? (
                allModifierSets.map((ms) => {
                  const alreadyAttached = (item.modifier_sets ?? []).some((ims: ModifierSet) => ims.id === ms.id);
                  return (
                    <label
                      key={ms.id}
                      className="w-full flex items-center gap-3 py-4 border-b border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#27272a] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[16px] font-medium text-[#fafafa]">{ms.name}</span>
                        <p className="text-[14px] text-[#9f9fa9] truncate">
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
                        className="w-5 h-5 rounded border-2 border-[rgba(255,255,255,0.1)] accent-[#f54900] shrink-0"
                      />
                    </label>
                  );
                })
              ) : (
                <p className="text-[14px] text-[#9f9fa9] text-center py-8">{t('noModifiersForItem')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Combo Add Options Modal */}
      {comboModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setComboModalOpen(false)}>
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            {modalStep === 'select' && (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <button onClick={() => setComboModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-[#27272a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <XMarkIcon className="w-4 h-4 text-[#fafafa]" />
                  </button>
                  <button onClick={() => { if (modalPicks.size > 0) setModalStep('pricing'); }}
                    disabled={modalPicks.size === 0}
                    className="bg-[#f54900] hover:bg-[#e04300] text-[#fff7ed] text-[14px] px-5 py-2 rounded-lg disabled:opacity-40">{t('next')}</button>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-[18px] font-bold text-[#fafafa]">{t('addOptions')}</h2>
                  <p className="text-[14px] text-[#9f9fa9] mt-1">{t('addOptionsDesc')}</p>
                </div>
                <div className="flex mx-5 rounded-lg overflow-hidden mb-4 shrink-0 border border-[rgba(255,255,255,0.1)]">
                  <button onClick={() => { setModalTab('items'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-[14px] font-semibold transition-colors ${modalTab === 'items' ? 'bg-[#27272a] text-[#fafafa] border-b-2 border-[#f54900]' : 'text-[#9f9fa9] hover:text-[#fafafa]'}`}>
                    {t('items')}
                  </button>
                  <button onClick={() => { setModalTab('categories'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-[14px] font-semibold transition-colors ${modalTab === 'categories' ? 'bg-[#27272a] text-[#fafafa] border-b-2 border-[#f54900]' : 'text-[#9f9fa9] hover:text-[#fafafa]'}`}>
                    {t('categories')}
                  </button>
                </div>

                {modalTab === 'items' ? (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9f9fa9] pointer-events-none" />
                        <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder={t('searchItems')}
                          className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] text-[14px] px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-[#f54900] placeholder:text-[#9f9fa9]" />
                      </div>
                      <select value={modalCategoryFilter ?? ''} onChange={(e) => setModalCategoryFilter(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] text-[14px] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#f54900]">
                        <option value="">{t('showAllCategories')}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center text-[12px] font-semibold text-[#9f9fa9] uppercase tracking-wider px-1 mb-1 pb-2 border-b border-[rgba(255,255,255,0.1)]">
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
                                <div className="flex items-center gap-3 px-1 py-3 border-b border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#27272a] transition-colors rounded-sm"
                                  onClick={() => toggleExpand(mi.id)}>
                                  <button className="w-5 h-5 flex items-center justify-center shrink-0 text-[#9f9fa9]">
                                    {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                  </button>
                                  <span className="flex-1 text-[14px] font-medium text-[#fafafa]">
                                    {mi.name}
                                    <span className="text-[12px] text-[#9f9fa9] ml-2">{variants.length} {t('variants').toLowerCase()}</span>
                                  </span>
                                  <span className="w-20 text-right text-[14px] text-[#9f9fa9]">-</span>
                                </div>
                                {isExpanded && variants.map((v) => {
                                  const vKey = `variant:${mi.id}:${v.id}`;
                                  return (
                                    <label key={vKey} className="flex items-center gap-3 pl-8 pr-1 py-2.5 border-b border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#27272a] transition-colors rounded-sm">
                                      <input type="checkbox" checked={modalPicks.has(vKey)}
                                        onChange={() => togglePick(vKey, { menuItemId: mi.id, variantId: v.id, name: `${mi.name} - ${v.name}`, price: v.price })}
                                        className="w-4 h-4 rounded border-2 border-[rgba(255,255,255,0.1)] accent-[#f54900] shrink-0" />
                                      <span className="flex-1 text-[14px] text-[#fafafa]">{v.name}</span>
                                      <span className="w-20 text-right text-[14px] text-[#9f9fa9]">₪{v.price.toFixed(2)}</span>
                                    </label>
                                  );
                                })}
                              </>
                            ) : (
                              <label className="flex items-center gap-3 px-1 py-3 border-b border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#27272a] transition-colors rounded-sm">
                                <input type="checkbox" checked={modalPicks.has(itemKey)}
                                  onChange={() => togglePick(itemKey, { menuItemId: mi.id, name: mi.name, price: mi.price })}
                                  className="w-4 h-4 rounded border-2 border-[rgba(255,255,255,0.1)] accent-[#f54900] shrink-0" />
                                <span className="flex-1 text-[14px] text-[#fafafa]">{mi.name}</span>
                                <span className="w-20 text-right text-[14px] text-[#9f9fa9]">₪{mi.price.toFixed(2)}</span>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    {modalPicks.size > 0 && (
                      <div className="flex items-center gap-3 pt-3 text-[14px]">
                        <span className="text-[#f54900] font-medium">{modalPicks.size} {t('selected')}</span>
                        <button onClick={() => setModalPicks(new Map())} className="text-[#f54900] font-medium hover:underline">{t('deselectAll')}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="relative mb-3">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9f9fa9] pointer-events-none" />
                      <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder={t('searchCategories')}
                        className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] text-[14px] px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-[#f54900] placeholder:text-[#9f9fa9]" />
                    </div>
                    {categories
                      .filter((c) => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((cat) => (
                        <label key={cat.id} className="flex items-center gap-3 px-1 py-3 border-b border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[#27272a] transition-colors rounded-sm">
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
                            className="w-4 h-4 accent-[#f54900] shrink-0" />
                          <span className="flex-1 text-[14px] text-[#fafafa]">{cat.name}</span>
                          <span className="w-16 text-right text-[14px] text-[#9f9fa9]">{(cat.items ?? []).length}</span>
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
                    className="w-9 h-9 rounded-full bg-[#27272a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-[#fafafa]" />
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setModalStep('configure')} className="text-[14px] px-4 py-2 rounded-lg text-[#9f9fa9] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors">{t('skip')}</button>
                    <button onClick={() => setModalStep('configure')} className="bg-[#f54900] hover:bg-[#e04300] text-[#fff7ed] text-[14px] px-5 py-2 rounded-lg">{t('next')}</button>
                  </div>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-[18px] font-bold text-[#fafafa]">{t('addDiscountsOrUpcharges')}</h2>
                  <p className="text-[14px] text-[#9f9fa9] mt-1">{t('addDiscountsDesc')}</p>
                </div>
                <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                  {[...modalPicksList].sort((a, b) => b.price - a.price).map((pick) => (
                    <div key={pick.key} className="flex items-center border-b border-[rgba(255,255,255,0.1)] py-3 px-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-[#fafafa]">{pick.name}</div>
                        <div className="text-[12px] text-[#9f9fa9]">₪{pick.price.toFixed(2)}</div>
                      </div>
                      <div className="w-28">
                        <input type="number" step="0.01" value={modalItemDeltas.get(pick.key) ?? 0}
                          onChange={(e) => setModalItemDeltas((prev) => { const next = new Map(prev); next.set(pick.key, parseFloat(e.target.value) || 0); return next; })}
                          className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] text-[14px] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#f54900] placeholder:text-[#9f9fa9]" placeholder="₪0.00" />
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
                    className="w-9 h-9 rounded-full bg-[#27272a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-[#fafafa]" />
                  </button>
                  <button onClick={handleModalAdd} className="bg-[#f54900] hover:bg-[#e04300] text-[#fff7ed] text-[14px] px-5 py-2 rounded-lg">{t('add')}</button>
                </div>
                <div className="px-5 pb-5 flex flex-col gap-5">
                  <h2 className="text-[18px] font-bold text-[#fafafa]">{t('nameThisGroup')}</h2>
                  <div>
                    <label className="block text-[14px] font-medium text-[#9f9fa9] mb-1.5">{t('name')}</label>
                    <input value={modalGroupName} onChange={(e) => setModalGroupName(e.target.value)} placeholder={t('comboNamePlaceholder')}
                      className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f54900] placeholder:text-[#9f9fa9]" />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-[#9f9fa9] mb-1.5">{t('howManySelections')}</label>
                    <input type="number" min={0} value={modalRequired} onChange={(e) => setModalRequired(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f54900]" />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-[#9f9fa9] mb-1.5">{t('setDefaultOption')}</label>
                    <select value={modalDefaultKey} onChange={(e) => setModalDefaultKey(e.target.value)}
                      className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#27272a] text-[#fafafa] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f54900]">
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
    </>
  );
}

// ── Local helpers ────────────────────────────────────────────────────────

// Split-button category picker: styled like a native select but shows a
// separate chevron button on the right, matching Figma node 0:112.
function CategorySelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex items-center gap-2 w-full">
      <div className="relative flex-1 min-w-0">
        <select
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value))}
          className="appearance-none w-full h-9 rounded-[6px] bg-[#27272a] px-3 py-[9.5px] text-[14px] text-[#fafafa] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-[#f54900] cursor-pointer"
        >
          {!value && <option value="" disabled>{placeholder ?? ''}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#27272a] text-[#fafafa]">
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div
        aria-hidden
        className="h-9 w-9 bg-[#09090b] border border-[rgba(255,255,255,0.1)] rounded-[6px] flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] pointer-events-none"
      >
        <ChevronDownIcon className="w-4 h-4 text-[#fafafa]" />
      </div>
    </div>
  );
}
