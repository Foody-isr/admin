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
  MenuCategory, Menu, MenuItem, ModifierSet, OptionSet, VariantInput,
  ItemType, ComboStepInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemTabDetails from '@/components/menu-item/MenuItemTabDetails';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import { FormInput } from '@/components/menu-item/MenuItemForm';
import CompositionTab from '@/components/menu-item/combo/CompositionTab';
import TypeSwitchConfirm, { TypeSwitchLossSummary } from '@/components/menu-item/combo/TypeSwitchConfirm';
import ComboSavingsBreakdownModal from '@/components/menu-item/combo/ComboSavingsBreakdownModal';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import { computeComboSavings, computeComboSavingsBreakdown } from '@/components/menu-item/combo/pricing';
import { Badge } from '@/components/ds';
import { Boxes } from 'lucide-react';
import {
  XIcon, PlusIcon, TrashIcon,
} from 'lucide-react';

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

  // Type-switch confirmation state. The picker requests a switch; if any
  // type-specific data exists, we show the confirmation modal before
  // mutating state. See `requestTypeChange` below.
  const [pendingType, setPendingType] = useState<ItemType | null>(null);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);

  const lossSummary: TypeSwitchLossSummary = useMemo(() => ({
    variantsCount: variantGroups.reduce((sum, g) => sum + g.variants.filter((v) => v.name.trim()).length, 0),
    modifiersCount: selectedModifierSetIds.size,
    stepsCount: comboSteps.length,
    // Recipe doesn't exist on the create page (it's added after first save),
    // so no recipeCount.
  }), [variantGroups, selectedModifierSetIds, comboSteps]);

  const requestTypeChange = (next: ItemType) => {
    if (next === itemType) return;
    const wouldLose = next === 'combo'
      ? (lossSummary.variantsCount ?? 0) + (lossSummary.modifiersCount ?? 0)
      : (lossSummary.stepsCount ?? 0);
    if (wouldLose > 0) {
      setPendingType(next);
    } else {
      setItemType(next);
      // Switch to details if the active tab is no longer in the new tab set.
      if (next === 'combo' && (activeTab === 'modifiers' || activeTab === 'recipe')) {
        setActiveTab('details');
      } else if (next !== 'combo' && activeTab === 'composition') {
        setActiveTab('details');
      }
    }
  };

  const confirmTypeChange = () => {
    if (pendingType == null) return;
    if (pendingType === 'combo') {
      setVariantGroups([]);
      setSelectedModifierSetIds(new Set());
    } else {
      setComboSteps([]);
    }
    setItemType(pendingType);
    if (pendingType === 'combo' && (activeTab === 'modifiers' || activeTab === 'recipe')) {
      setActiveTab('details');
    } else if (pendingType !== 'combo' && activeTab === 'composition') {
      setActiveTab('details');
    }
    setPendingType(null);
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

  // Compute combo savings for the rail. The same pure helper backs the
  // PricingCard inside CompositionTab, so the two stay in sync. Hooks must
  // run unconditionally — declared here, *above* the loading early return.
  const itemsByIdForSummary = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const cat of categories) for (const it of cat.items ?? []) m.set(it.id, it);
    return m;
  }, [categories]);
  const railComboSummary = itemType === 'combo'
    ? computeComboSavings(parseFloat(price) || 0, comboSteps, itemsByIdForSummary)
    : null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Tab set adapts to item type. Combos: details · composition · cost.
  // Articles: details · modifiers · recipe · cost. Recipe/cost are disabled
  // pre-save (the user has to create the item before adding ingredients).
  const tabs: TabBarItem[] = itemType === 'combo'
    ? [
        { id: 'details', label: t('tabDetails') },
        { id: 'composition', label: t('tabComposition'), count: comboSteps.length },
        { id: 'cost', label: t('tabCost'), disabled: true },
      ]
    : [
        { id: 'details', label: t('tabDetails') },
        { id: 'modifiers', label: t('tabModifiers') },
        { id: 'recipe', label: t('tabRecipe'), disabled: true },
        { id: 'cost', label: t('tabCost'), disabled: true },
      ];

  const typeBadgeTrailing = (
    <Badge tone="brand" className="h-6 px-2.5 font-semibold tracking-[.04em]">
      <Boxes className="w-3 h-3" />
      {itemType === 'combo' ? t('typeBadgeCombo') : t('typeBadgeArticle')}
    </Badge>
  );

  const rail = (
    <MenuItemSummaryRail
      imageUrl={imagePreview || undefined}
      name={name}
      price={parseFloat(price) || 0}
      activeStatus={isActive}
      categoryName={activeCategoryName}
      comboSummary={railComboSummary}
      onShowComboSavingsDetail={itemType === 'combo' ? () => setSavingsModalOpen(true) : undefined}
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
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar banner — matches edit page */}
          <div className="px-8 py-4 bg-neutral-100 dark:bg-[#111111] border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <MenuItemTabBar
              tabs={tabs}
              active={activeTab}
              onChange={setActiveTab}
              trailing={typeBadgeTrailing}
            />
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-8">
            {/* ── Tab: Détails ─────────────────────────────────── */}
            {activeTab === 'details' && (
              <MenuItemTabDetails
                name={name}
                setName={setName}
                price={price}
                setPrice={setPrice}
                description={description}
                setDescription={setDescription}
                categoryId={categoryId}
                setCategoryId={setCategoryId}
                isActive={isActive}
                setIsActive={setIsActive}
                vatRate={vatRate}
                categories={categories}
                menus={menus}
                selectedMenuIds={selectedMenuIds}
                setSelectedMenuIds={setSelectedMenuIds}
                itemType={itemType}
                onTypeChange={requestTypeChange}
                comboStepsCount={comboSteps.length}
                onJumpToComposition={() => setActiveTab('composition')}
              />
            )}

            {/* ── Tab: Composition (combo only) ─────────────────── */}
            {activeTab === 'composition' && itemType === 'combo' && (
              <CompositionTab
                comboName={name}
                basePrice={price}
                onBasePriceChange={setPrice}
                steps={comboSteps}
                onStepsChange={setComboSteps}
                categories={categories}
                onShowSavingsDetail={() => setSavingsModalOpen(true)}
              />
            )}

            {/* ── Tab: Modificateurs & Variantes — articles only ─── */}
            {activeTab === 'modifiers' && itemType !== 'combo' && (
              <div className="max-w-4xl">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-orange-500 rounded-full" />
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                      {t('variants')}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {t('variantsDescription')}
                      </p>
                      <button
                        onClick={() => setVariantModalOpen(true)}
                        className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
                      >
                        <PlusIcon className="w-4 h-4" />
                        {t('add')}
                      </button>
                    </div>
                    {variantGroups.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {variantGroups.map((vg) => (
                          <div key={vg.key} className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-[#1a1a1a]">
                              <span className="text-sm font-semibold text-neutral-900 dark:text-white">{vg.title || t('variantGroupTitle')}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => setVariantModalOpen(true)}
                                  className="text-sm text-orange-500 hover:underline font-medium">{t('edit')}</button>
                                <button onClick={() => removeVariantGroup(vg.key)}
                                  className="text-sm text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                                  {t('remove')}
                                </button>
                              </div>
                            </div>
                            {vg.variants.filter((v) => v.name.trim()).map((v) => (
                              <div key={v.key} className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 dark:border-neutral-700">
                                <span className="text-sm text-neutral-900 dark:text-white">{v.name}</span>
                                <span className="text-sm font-semibold text-neutral-900 dark:text-white">₪{(parseFloat(v.price) || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-orange-500 rounded-full" />
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                      {t('modifiers')}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {t('modifiersDescription')}
                      </p>
                      <button
                        onClick={() => setModifierModalOpen(true)}
                        className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
                      >
                        <PlusIcon className="w-4 h-4" />
                        {t('add')}
                      </button>
                    </div>
                    {selectedModifierSetIds.size > 0 && (
                      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                        {allModifierSets.filter((ms) => selectedModifierSetIds.has(ms.id)).map((ms) => (
                          <div key={ms.id} className="flex items-center justify-between px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 bg-neutral-50 dark:bg-[#1a1a1a] hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors">
                            <div>
                              <span className="text-sm font-medium text-neutral-900 dark:text-white">{ms.name}</span>
                              <span className="text-xs text-neutral-600 dark:text-neutral-400 ml-2">
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
              </div>
            )}

            {/* ── Recipe / Cost tabs are disabled until the item is saved ── */}
            {(activeTab === 'recipe' || activeTab === 'cost') && (
              <div className="max-w-4xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1 h-6 bg-orange-500 rounded-full" />
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                    {activeTab === 'recipe' ? t('tabRecipe') : t('tabCost')}
                  </h3>
                </div>
                <div className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {t('saveItemFirst')}
                  </p>
                </div>
              </div>
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
              <XIcon className="w-5 h-5 text-neutral-900 dark:text-white" />
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
                <XIcon className="w-5 h-5 text-neutral-900 dark:text-white" />
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

      {/* ── Type-switch confirmation modal ─────────────────────── */}
      {pendingType && (
        <TypeSwitchConfirm
          fromType={itemType}
          toType={pendingType}
          loss={lossSummary}
          onCancel={() => setPendingType(null)}
          onConfirm={confirmTypeChange}
        />
      )}

      {/* ── Combo savings breakdown modal ──────────────────────── */}
      {savingsModalOpen && itemType === 'combo' && (
        <ComboSavingsBreakdownModal
          comboName={name || undefined}
          breakdown={computeComboSavingsBreakdown(
            parseFloat(price) || 0,
            comboSteps,
            itemsByIdForSummary,
          )}
          onClose={() => setSavingsModalOpen(false)}
        />
      )}
    </>
  );
}
