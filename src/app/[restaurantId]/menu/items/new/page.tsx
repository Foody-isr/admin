'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, attachOptionSetToItems,
  createVariantGroup,
  getRestaurantSettings,
  MenuCategory, Menu, ModifierSet, OptionSet, VariantInput,
  ItemType, ComboStepInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import { SectionCard, Field, FormInput, FormTextarea } from '@/components/menu-item/MenuItemForm';
import SearchableListField from '@/components/SearchableListField';
import {
  XMarkIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon,
  PlusIcon, TrashIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface ComboStepDraft {
  key: string;
  name: string;
  min_picks: number;
  max_picks: number;
  items: { menu_item_id: number; price_delta: number; item_name?: string; variant_id?: number; pick_key?: string }[];
}

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

export default function NewItemPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const defaultCatId = searchParams.get('category') ? Number(searchParams.get('category')) : 0;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<MenuItemSection>('details');

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
  const [vatRate, setVatRate] = useState(18);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());

  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [selectedModifierSetIds, setSelectedModifierSetIds] = useState<Set<number>>(new Set());
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  const [variantGroups, setVariantGroups] = useState<LocalVariantGroup[]>([]);
  const [variantModalOpen, setVariantModalOpen] = useState(false);

  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [selectedOptionSetIds, setSelectedOptionSetIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([
      getAllCategories(rid),
      listMenus(rid),
      listModifierSets(rid),
      listOptionSets(rid),
      getRestaurantSettings(rid),
    ]).then(([cats, m, ms, os, settings]) => {
      setCategories(cats);
      if (!categoryId && cats.length > 0) setCategoryId(cats[0].id);
      setMenus(m);
      setAllModifierSets(ms ?? []);
      setAllOptionSets(os ?? []);
      setVatRate(settings.vat_rate ?? 18);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

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
        portion_size: 0,
        portion_size_unit: '',
      };
      if (itemType === 'combo' && comboSteps.length > 0) {
        (createPayload as Record<string, unknown>).combo_steps = comboSteps.map((s, i): ComboStepInput => ({
          name: s.name || `Choice ${i + 1}`,
          min_picks: s.min_picks,
          max_picks: s.max_picks,
          sort_order: i,
          items: s.items.map((si) => ({ menu_item_id: si.menu_item_id, option_id: si.variant_id || undefined, price_delta: si.price_delta })),
        }));
      }
      const item = await createMenuItem(rid, createPayload);
      if (pendingImage) {
        const url = await uploadMenuItemImage(rid, item.id, pendingImage);
        await updateMenuItem(rid, item.id, { image_url: url });
      }
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
      for (const setId of Array.from(selectedModifierSetIds)) {
        await attachModifierSetToItems(rid, setId, [item.id]);
      }
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

  const allMenuItems = categories.flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name, category_id: c.id }))
  );

  const removeComboStep = (key: string) => setComboSteps((prev) => prev.filter((s) => s.key !== key));

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
    setModalPicks((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, info);
      return next;
    });
  };

  const toggleExpand = (itemId: number) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
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

  const handleFileSelect = (file: File) => {
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  const activeCategoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name,
    [categories, categoryId],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: TabBarItem[] = [
    { id: 'details', label: t('tabDetails') },
    { id: 'modifiers', label: t('tabModifiers') },
    { id: 'recipe', label: t('tabRecipe'), disabled: true },
    { id: 'cost', label: t('tabCost'), disabled: true },
  ];

  const rail = (
    <MenuItemSummaryRail
      imageUrl={imagePreview || undefined}
      name={name}
      price={parseFloat(price) || 0}
      activeStatus={isActive}
      categoryName={activeCategoryName}
      placeholderLabel={t('createItem')}
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
      />

      <MenuItemShell
        title={t('createItem')}
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
                <div className="flex items-center gap-3">
                  <span className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('itemType')}</span>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value as ItemType)}
                    className="h-9 rounded-[6px] bg-neutral-100 dark:bg-[#1a1a1a] px-3 text-[14px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                  >
                    <option value="food_and_beverage">{t('foodAndBeverage')}</option>
                    <option value="combo">{t('combo')}</option>
                  </select>
                </div>

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
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-neutral-600 dark:text-neutral-400 pointer-events-none">₪</span>
                    </div>
                  </Field>
                  <Field label={t('vat')}>
                    <FormInput
                      type="text"
                      value={`${vatRate}%`}
                      readOnly
                      className="cursor-not-allowed"
                    />
                  </Field>
                  <Field label={t('status')}>
                    <button
                      type="button"
                      onClick={() => setIsActive(!isActive)}
                      className="h-10 inline-flex items-center gap-2 text-[14px] leading-[20px] text-neutral-900 dark:text-white rounded-[6px] self-start"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-neutral-400'}`} />
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
                      <h3 className="text-[16px] font-semibold text-neutral-900 dark:text-white">{t('buildThisCombo')}</h3>
                      <p className="text-[14px] text-neutral-600 dark:text-neutral-400 mt-0.5">{t('comboBuilderDescription')}</p>
                    </div>

                    {comboSteps.length > 0 && (
                      <div>
                        <div className="flex items-center text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider mb-1 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                          <span className="flex-1">{t('comboChoice')}</span>
                          <span className="w-16 text-center">{t('required')}</span>
                          <span className="w-14" />
                        </div>
                        {comboSteps.map((step) => (
                          <div key={step.key} className="border-b border-neutral-200 dark:border-neutral-700 py-2.5">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditStepModal(step)}>
                                <span className="text-[14px] font-medium text-orange-500 hover:underline">{step.name}</span>
                                <div className="text-[12px] text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                                  {step.items.length > 0
                                    ? step.items.map((si) => si.item_name || `#${si.menu_item_id}`).join(', ')
                                    : `${step.items.length} ${t('options')}`}
                                </div>
                              </div>
                              <span className="w-16 text-center text-[14px] text-neutral-600 dark:text-neutral-400 shrink-0">{step.min_picks}</span>
                              <div className="w-14 flex items-center justify-end gap-1 shrink-0">
                                <button onClick={() => removeComboStep(step.key)} className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-red-400">
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={openAddOptionsModal}
                      className="flex items-center gap-2 text-[14px] font-medium text-orange-500 hover:text-[#ea580c]">
                      <PlusIcon className="w-4 h-4" />
                      {t('addOptions')}
                    </button>
                  </div>
                )}

                {itemType !== 'combo' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[16px] font-semibold text-neutral-900 dark:text-white">{t('variants')}</h3>
                      <button onClick={() => setVariantModalOpen(true)}
                        className="text-[14px] font-medium underline text-neutral-900 dark:text-white shrink-0">
                        {t('add')}
                      </button>
                    </div>
                    <p className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('variantsDescription')}</p>
                    {variantGroups.length > 0 && (
                      <div className="flex flex-col gap-3 mt-3">
                        {variantGroups.map((vg) => (
                          <div key={vg.key} className="rounded-[8px] border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-neutral-100 dark:bg-[#1a1a1a]">
                              <span className="text-[14px] font-semibold text-neutral-900 dark:text-white">{vg.title || t('variantGroupTitle')}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => setVariantModalOpen(true)}
                                  className="text-[14px] text-orange-500 hover:underline font-medium">{t('edit')}</button>
                                <button onClick={() => removeVariantGroup(vg.key)}
                                  className="text-[14px] text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                                  {t('remove')}
                                </button>
                              </div>
                            </div>
                            {vg.variants.filter((v) => v.name.trim()).map((v) => (
                              <div key={v.key} className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 dark:border-neutral-700">
                                <span className="text-[14px] text-neutral-900 dark:text-white">{v.name}</span>
                                <span className="text-[14px] font-semibold text-neutral-900 dark:text-white">₪{(parseFloat(v.price) || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[16px] font-semibold text-neutral-900 dark:text-white">{t('modifiers')}</h3>
                    <button onClick={() => setModifierModalOpen(true)}
                      className="text-[14px] font-medium underline text-neutral-900 dark:text-white shrink-0">{t('add')}</button>
                  </div>
                  <p className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('modifiersDescription')}</p>
                  {selectedModifierSetIds.size > 0 && (
                    <div className="rounded-[8px] border border-neutral-200 dark:border-neutral-700 overflow-hidden mt-3">
                      {allModifierSets.filter((ms) => selectedModifierSetIds.has(ms.id)).map((ms) => (
                        <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors">
                          <div>
                            <span className="text-[14px] font-medium text-neutral-900 dark:text-white">{ms.name}</span>
                            <span className="text-[12px] text-neutral-600 dark:text-neutral-400 ml-2">
                              {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                            </span>
                          </div>
                          <button onClick={() => { const n = new Set(selectedModifierSetIds); n.delete(ms.id); setSelectedModifierSetIds(n); }}
                            className="text-[14px] text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                            {t('remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {(activeTab === 'recipe' || activeTab === 'cost') && (
              <SectionCard title={activeTab === 'recipe' ? t('tabRecipe') : t('tabCost')}>
                <p className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('saveItemFirst')}</p>
              </SectionCard>
            )}
          </div>
        </div>
      </MenuItemShell>

      {/* ── Variant Editor Modal ───────────────────────────────── */}
      {variantModalOpen && (
        <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0a0a0a] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700 px-6 py-3 flex items-center justify-between">
            <button onClick={() => setVariantModalOpen(false)}
              className="w-11 h-11 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
              <XMarkIcon className="w-5 h-5 text-neutral-900 dark:text-white" />
            </button>
            <span className="text-[14px] font-bold text-neutral-900 dark:text-white">{t('variants')}</span>
            <button onClick={() => setVariantModalOpen(false)}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[14px] px-5 py-2 rounded-full">
              {t('done')}
            </button>
          </div>

          <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8">
            {allOptionSets.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">{t('savedOptionSets') || 'Saved option sets'}</p>
                <div className="flex flex-col gap-2">
                  {allOptionSets.map((os) => (
                    <label key={os.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:bg-[#1a1a1a] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedOptionSetIds.has(os.id)}
                        onChange={() => {
                          const next = new Set(selectedOptionSetIds);
                          if (next.has(os.id)) next.delete(os.id); else next.add(os.id);
                          setSelectedOptionSetIds(next);
                        }}
                        className="w-5 h-5 rounded border-2 border-neutral-200 dark:border-neutral-700 accent-orange-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium text-neutral-900 dark:text-white">{os.name}</span>
                        <p className="text-[12px] text-neutral-600 dark:text-neutral-400 truncate">
                          {(os.options ?? []).map((o) => o.name).join(', ')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {variantGroups.map((vg) => (
              <div key={vg.key} className="flex flex-col gap-4">
                <FormInput placeholder={t('variantGroupTitle')} value={vg.title}
                  onChange={(e) => updateVariantGroup(vg.key, { title: e.target.value })} />

                <div className="grid grid-cols-[1fr_100px_100px_80px_40px] gap-2 items-center px-1">
                  <span className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">{t('variantName')}</span>
                  <span className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">{t('price')}</span>
                  <span className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">{t('onlinePrice')}</span>
                  <span className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">{t('status')}</span>
                  <span />
                </div>
                <div className="border-b-2 border-[#fafafa]" />

                {vg.variants.map((v) => (
                  <div key={v.key} className="grid grid-cols-[1fr_100px_100px_80px_40px] gap-2 items-center">
                    <FormInput placeholder={t('variantName')} value={v.name}
                      onChange={(e) => updateVariant(vg.key, v.key, { name: e.target.value })} />
                    <FormInput type="number" min="0" step="0.01" placeholder="0.00" value={v.price}
                      onChange={(e) => updateVariant(vg.key, v.key, { price: e.target.value })} />
                    <FormInput type="number" min="0" step="0.01" placeholder="0.00" value={v.onlinePrice}
                      onChange={(e) => updateVariant(vg.key, v.key, { onlinePrice: e.target.value })} />
                    <button onClick={() => updateVariant(vg.key, v.key, { isActive: !v.isActive })}
                      className={`text-[12px] font-medium px-2 py-1 rounded-full ${v.isActive ? 'text-green-500 dark:text-green-400' : 'text-neutral-600 dark:text-neutral-400'}`}
                      style={{ background: v.isActive ? 'rgba(5,223,114,0.12)' : '#27272a' }}>
                      {v.isActive ? t('available') : t('unavailable')}
                    </button>
                    <button onClick={() => removeVariant(vg.key, v.key)}
                      className="p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                      <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}

                <button onClick={() => updateVariantGroup(vg.key, { variants: [...vg.variants, newVariant()] })}
                  className="flex items-center gap-2 text-[14px] font-medium text-orange-500 hover:text-[#ea580c] transition-colors">
                  <PlusIcon className="w-4 h-4" /> {t('addVariant')}
                </button>

                <button onClick={() => removeVariantGroup(vg.key)}
                  className="text-[14px] text-red-500 hover:text-red-600 font-medium hover:underline">
                  {t('remove')} {t('variants').toLowerCase()}
                </button>
              </div>
            ))}

            <button onClick={() => setVariantGroups([...variantGroups, newVariantGroup()])}
              className="flex items-center gap-2 text-[16px] font-medium text-neutral-900 dark:text-white underline">
              <PlusIcon className="w-4 h-4" /> {t('addAnotherSet')}
            </button>
          </div>
        </div>
      )}

      {/* ── Modifier Sets Modal ──────────────────────────────────── */}
      {modifierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-neutral-200 dark:border-neutral-700">
            <div className="p-6 pb-4 flex items-center justify-between">
              <button onClick={() => setModifierModalOpen(false)}
                className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                <XMarkIcon className="w-5 h-5 text-neutral-900 dark:text-white" />
              </button>
              <button onClick={() => setModifierModalOpen(false)}
                className="bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] text-neutral-900 dark:text-white rounded-full px-5 py-2 text-[14px] font-medium">{t('done')}</button>
            </div>
            <div className="px-6 pb-4">
              <h2 className="text-[20px] font-bold text-neutral-900 dark:text-white mb-2">{t('modifiers')}</h2>
              <p className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('modifiersDescription')}</p>
            </div>
            <div className="mx-6 border-t-2 border-[#fafafa]" />
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {allModifierSets.length > 0 ? allModifierSets.map((ms) => (
                <label key={ms.id}
                  className="w-full flex items-center gap-3 py-4 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="text-[16px] font-medium text-neutral-900 dark:text-white">{ms.name}</span>
                    <p className="text-[14px] text-neutral-600 dark:text-neutral-400 truncate">
                      {(ms.modifiers ?? []).map((m) => m.name).join(', ')}
                    </p>
                  </div>
                  <input type="checkbox" checked={selectedModifierSetIds.has(ms.id)}
                    onChange={() => { const n = new Set(selectedModifierSetIds); if (n.has(ms.id)) n.delete(ms.id); else n.add(ms.id); setSelectedModifierSetIds(n); }}
                    className="w-5 h-5 rounded border-2 border-neutral-200 dark:border-neutral-700 accent-orange-500 shrink-0" />
                </label>
              )) : (
                <p className="text-[14px] text-neutral-600 dark:text-neutral-400 text-center py-8">{t('noModifiersForItem')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Combo Add Options Modal ──────────────────────────────── */}
      {comboModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setComboModalOpen(false)}>
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            {modalStep === 'select' && (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <button onClick={() => setComboModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <XMarkIcon className="w-4 h-4 text-neutral-900 dark:text-white" />
                  </button>
                  <button
                    onClick={() => { if (modalPicks.size > 0) setModalStep('pricing'); }}
                    disabled={modalPicks.size === 0}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-[14px] px-5 py-2 rounded-lg disabled:opacity-40"
                  >
                    {t('next')}
                  </button>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-[18px] font-bold text-neutral-900 dark:text-white">{t('addOptions')}</h2>
                  <p className="text-[14px] text-neutral-600 dark:text-neutral-400 mt-1">{t('addOptionsDesc')}</p>
                </div>

                <div className="flex mx-5 rounded-lg overflow-hidden mb-4 shrink-0 border border-neutral-200 dark:border-neutral-700">
                  <button
                    onClick={() => { setModalTab('items'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-[14px] font-semibold transition-colors ${
                      modalTab === 'items'
                        ? 'bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white border-b-2 border-orange-500'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white'
                    }`}
                  >
                    {t('items')}
                  </button>
                  <button
                    onClick={() => { setModalTab('categories'); setModalSearch(''); }}
                    className={`flex-1 py-2.5 text-[14px] font-semibold transition-colors ${
                      modalTab === 'categories'
                        ? 'bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white border-b-2 border-orange-500'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white'
                    }`}
                  >
                    {t('categories')}
                  </button>
                </div>

                {modalTab === 'items' ? (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 dark:text-neutral-400 pointer-events-none" />
                        <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)}
                          placeholder={t('searchItems')}
                          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white text-[14px] px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-[#f97316] placeholder:text-neutral-600 dark:text-neutral-400" />
                      </div>
                      <select value={modalCategoryFilter ?? ''} onChange={(e) => setModalCategoryFilter(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white text-[14px] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#f97316]">
                        <option value="">{t('showAllCategories')}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center text-[12px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider px-1 mb-1 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="w-8" />
                      <span className="flex-1">{t('name')}</span>
                      <span className="w-20 text-right">{t('price')}</span>
                    </div>

                    {allMenuItems
                      .filter((i) => {
                        if (modalCategoryFilter && i.category_id !== modalCategoryFilter) return false;
                        if (modalSearch && !i.name.toLowerCase().includes(modalSearch.toLowerCase())) return false;
                        return true;
                      })
                      .map((item) => {
                        const variantOpts = (item.variant_groups ?? []).flatMap((g) => (g.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: v.price, is_active: v.is_active })));
                        const optionSetOpts = (item.option_sets ?? []).flatMap((os) => (os.options ?? []).map((o) => ({ id: o.id, name: o.name, price: o.price, is_active: o.is_active })));
                        const variants = [...variantOpts, ...optionSetOpts].filter((v) => v.is_active);
                        const hasVariants = variants.length > 0;
                        const isExpanded = expandedItemIds.has(item.id);
                        const itemKey = `item:${item.id}`;

                        return (
                          <div key={item.id}>
                            {hasVariants ? (
                              <>
                                <div
                                  className="flex items-center gap-3 px-1 py-3 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors rounded-sm"
                                  onClick={() => toggleExpand(item.id)}
                                >
                                  <button className="w-5 h-5 flex items-center justify-center shrink-0 text-neutral-600 dark:text-neutral-400">
                                    {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                  </button>
                                  <span className="flex-1 text-[14px] font-medium text-neutral-900 dark:text-white">
                                    {item.name}
                                    <span className="text-[12px] text-neutral-600 dark:text-neutral-400 ml-2">{variants.length} {t('variants').toLowerCase()}</span>
                                  </span>
                                  <span className="w-20 text-right text-[14px] text-neutral-600 dark:text-neutral-400">-</span>
                                </div>
                                {isExpanded && variants.map((v) => {
                                  const vKey = `variant:${item.id}:${v.id}`;
                                  return (
                                    <label key={vKey} className="flex items-center gap-3 pl-8 pr-1 py-2.5 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors rounded-sm">
                                      <input type="checkbox"
                                        checked={modalPicks.has(vKey)}
                                        onChange={() => togglePick(vKey, {
                                          menuItemId: item.id,
                                          variantId: v.id,
                                          name: `${item.name} - ${v.name}`,
                                          price: v.price,
                                        })}
                                        className="w-4 h-4 rounded border-2 border-neutral-200 dark:border-neutral-700 accent-orange-500 shrink-0" />
                                      <span className="flex-1 text-[14px] text-neutral-900 dark:text-white">{v.name}</span>
                                      <span className="w-20 text-right text-[14px] text-neutral-600 dark:text-neutral-400">₪{v.price.toFixed(2)}</span>
                                    </label>
                                  );
                                })}
                              </>
                            ) : (
                              <label className="flex items-center gap-3 px-1 py-3 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors rounded-sm">
                                <input type="checkbox"
                                  checked={modalPicks.has(itemKey)}
                                  onChange={() => togglePick(itemKey, {
                                    menuItemId: item.id,
                                    name: item.name,
                                    price: item.price,
                                  })}
                                  className="w-4 h-4 rounded border-2 border-neutral-200 dark:border-neutral-700 accent-orange-500 shrink-0" />
                                <span className="flex-1 text-[14px] text-neutral-900 dark:text-white">{item.name}</span>
                                <span className="w-20 text-right text-[14px] text-neutral-600 dark:text-neutral-400">₪{item.price.toFixed(2)}</span>
                              </label>
                            )}
                          </div>
                        );
                      })}

                    {modalPicks.size > 0 && (
                      <div className="flex items-center gap-3 pt-3 text-[14px]">
                        <span className="text-orange-500 font-medium">{modalPicks.size} {t('selected')}</span>
                        <button onClick={() => setModalPicks(new Map())} className="text-orange-500 font-medium hover:underline">{t('deselectAll') || 'Deselect all'}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                    <div className="relative mb-3">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 dark:text-neutral-400 pointer-events-none" />
                      <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)}
                        placeholder={t('searchCategories')}
                        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white text-[14px] px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-[#f97316] placeholder:text-neutral-600 dark:text-neutral-400" />
                    </div>
                    <div className="flex items-center text-[12px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider px-1 mb-1 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="w-8" />
                      <span className="flex-1">{t('name')}</span>
                      <span className="w-16 text-right">{t('items')}</span>
                    </div>
                    {categories
                      .filter((c) => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((cat) => (
                        <label key={cat.id} className="flex items-center gap-3 px-1 py-3 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors rounded-sm">
                          <input type="radio" name="combo-cat"
                            checked={modalCategoryFilter === cat.id && (cat.items ?? []).every((ci) => modalPicks.has(`item:${ci.id}`))}
                            onChange={() => {
                              setModalPicks((prev) => {
                                const next = new Map(prev);
                                (cat.items ?? []).forEach((ci) => {
                                  const key = `item:${ci.id}`;
                                  if (!next.has(key)) next.set(key, { menuItemId: ci.id, name: ci.name, price: ci.price });
                                });
                                return next;
                              });
                              setModalCategoryFilter(cat.id);
                            }}
                            className="w-4 h-4 accent-orange-500 shrink-0" />
                          <span className="flex-1 text-[14px] text-neutral-900 dark:text-white">{cat.name}</span>
                          <span className="w-16 text-right text-[14px] text-neutral-600 dark:text-neutral-400">{(cat.items ?? []).length}</span>
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
                    className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-neutral-900 dark:text-white" />
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setModalStep('configure')}
                      className="text-[14px] px-4 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors">{t('skip')}</button>
                    <button onClick={() => setModalStep('configure')}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-[14px] px-5 py-2 rounded-lg">{t('next')}</button>
                  </div>
                </div>
                <div className="px-5 pb-4 shrink-0">
                  <h2 className="text-[18px] font-bold text-neutral-900 dark:text-white">{t('addDiscountsOrUpcharges')}</h2>
                  <p className="text-[14px] text-neutral-600 dark:text-neutral-400 mt-1">{t('addDiscountsDesc')}</p>
                </div>
                <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                  <div className="flex items-center text-[12px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider px-1 mb-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                    <span className="flex-1">{t('name')}</span>
                    <span className="w-28 text-right">{t('discountOrUpcharge')}</span>
                  </div>
                  {[...modalPicksList]
                    .sort((a, b) => b.price - a.price)
                    .map((pick) => (
                      <div key={pick.key} className="flex items-center border-b border-neutral-200 dark:border-neutral-700 py-3 px-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium text-neutral-900 dark:text-white">{pick.name}</div>
                          <div className="text-[12px] text-neutral-600 dark:text-neutral-400">₪{pick.price.toFixed(2)}</div>
                        </div>
                        <div className="w-28">
                          <input type="number" step="0.01"
                            value={modalItemDeltas.get(pick.key) ?? 0}
                            onChange={(e) => setModalItemDeltas((prev) => {
                              const next = new Map(prev);
                              next.set(pick.key, parseFloat(e.target.value) || 0);
                              return next;
                            })}
                            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white text-[14px] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#f97316] placeholder:text-neutral-600 dark:text-neutral-400"
                            placeholder="₪0.00" />
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
                    className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center">
                    <ArrowLeftIcon className="w-4 h-4 text-neutral-900 dark:text-white" />
                  </button>
                  <button onClick={handleModalAdd} className="bg-orange-500 hover:bg-orange-600 text-white text-[14px] px-5 py-2 rounded-lg">{t('add')}</button>
                </div>
                <div className="px-5 pb-5 flex flex-col gap-5">
                  <h2 className="text-[18px] font-bold text-neutral-900 dark:text-white">{t('nameThisGroup')}</h2>

                  <div>
                    <label className="block text-[14px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">{t('name')}</label>
                    <input value={modalGroupName} onChange={(e) => setModalGroupName(e.target.value)}
                      placeholder={t('comboNamePlaceholder')}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] placeholder:text-neutral-600 dark:text-neutral-400" />
                  </div>

                  <div>
                    <label className="block text-[14px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">{t('howManySelections')}</label>
                    <input type="number" min={0} value={modalRequired}
                      onChange={(e) => setModalRequired(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                  </div>

                  <div>
                    <label className="block text-[14px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">{t('setDefaultOption')}</label>
                    <select value={modalDefaultKey} onChange={(e) => setModalDefaultKey(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]">
                      <option value="">{t('noDefaultSelection')}</option>
                      {modalPicksList.map((pick) => (
                        <option key={pick.key} value={pick.key}>{pick.name}</option>
                      ))}
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

// Split-button category picker (matches Figma node 0:112).
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
          className="appearance-none w-full h-9 rounded-[6px] bg-neutral-100 dark:bg-[#1a1a1a] px-3 py-[9.5px] text-[14px] text-neutral-900 dark:text-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-[#f97316] cursor-pointer"
        >
          {!value && <option value="" disabled>{placeholder ?? ''}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-900 dark:text-white">
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div
        aria-hidden
        className="h-9 w-9 bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-700 rounded-[6px] flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] pointer-events-none"
      >
        <ChevronDownIcon className="w-4 h-4 text-neutral-900 dark:text-white" />
      </div>
    </div>
  );
}
