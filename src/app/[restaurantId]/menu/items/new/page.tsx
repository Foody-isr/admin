'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets,
  syncItemVariants,
  getRestaurantSettings,
  MenuCategory, Menu, MenuItem, ModifierSet, OptionSet,
  ItemType, ComboStepInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  loadItemDraft,
  saveItemDraft,
  clearItemDraft,
  isMeaningfulDraft,
  type ItemDraft,
} from '@/lib/itemDraft';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemTabDetails from '@/components/menu-item/MenuItemTabDetails';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import CompositionTab from '@/components/menu-item/combo/CompositionTab';
import TypeSwitchConfirm, { TypeSwitchLossSummary } from '@/components/menu-item/combo/TypeSwitchConfirm';
import ComboSavingsBreakdownModal from '@/components/menu-item/combo/ComboSavingsBreakdownModal';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import { computeComboSavings, computeComboSavingsBreakdown } from '@/components/menu-item/combo/pricing';
import { Badge } from '@/components/ds';
import VariantsEditor, {
  VariantGroupState,
  toVariantSyncPayload,
  hasMeaningfulVariants,
} from '@/components/menu-item/VariantsEditor';
import { Boxes, History } from 'lucide-react';
import { XIcon, PlusIcon } from 'lucide-react';

export default function NewItemPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();

  const defaultCatId = searchParams.get('category') ? Number(searchParams.get('category')) : 0;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<MenuItemSection>('details');

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
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
  // Selected menu_group IDs the new item should be added to. (Previously the
  // picker only tracked menu IDs and silently used groups[0] on save.)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());

  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [selectedModifierSetIds, setSelectedModifierSetIds] = useState<Set<number>>(new Set());
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  const [variantGroups, setVariantGroups] = useState<VariantGroupState[]>([]);

  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);

  // Draft recovery: load any in-progress item from a previous session.
  // Autosave stays off until the user engages (resume / discard / type)
  // so an unanswered banner doesn't wipe the persisted draft on first paint.
  const [bannerDraft, setBannerDraft] = useState<ItemDraft | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(rid) || rid <= 0) return;
    const d = loadItemDraft(rid);
    if (d && isMeaningfulDraft(d)) {
      setBannerDraft(d);
    } else {
      setAutosaveEnabled(true);
    }
  }, [rid]);

  // Snapshot of all draftable form fields. Pulled into a memo so the autosave
  // effect depends on a single value, and the engagement effect can reuse it.
  const draftSnapshot = useMemo(() => ({
    name,
    price,
    description,
    categoryId,
    isActive,
    itemType,
    comboSteps,
    selectedGroupIds: Array.from(selectedGroupIds),
    selectedModifierSetIds: Array.from(selectedModifierSetIds),
    variantGroups,
    activeTab,
  }), [name, price, description, categoryId, isActive, itemType, comboSteps, selectedGroupIds, selectedModifierSetIds, variantGroups, activeTab]);

  // First meaningful edit while the banner is up = "starting fresh."
  // Auto-dismiss the banner and turn autosave on so the new typing is captured.
  useEffect(() => {
    if (autosaveEnabled) return;
    if (isMeaningfulDraft(draftSnapshot)) {
      setBannerDraft(null);
      setAutosaveEnabled(true);
    }
  }, [autosaveEnabled, draftSnapshot]);

  useEffect(() => {
    if (!autosaveEnabled) return;
    if (!Number.isFinite(rid) || rid <= 0) return;
    saveItemDraft(rid, draftSnapshot);
  }, [autosaveEnabled, rid, draftSnapshot]);

  const handleResumeDraft = () => {
    if (!bannerDraft) return;
    setName(bannerDraft.name);
    setPrice(bannerDraft.price);
    setDescription(bannerDraft.description);
    setCategoryId(bannerDraft.categoryId);
    setIsActive(bannerDraft.isActive);
    setItemType(bannerDraft.itemType);
    setComboSteps(bannerDraft.comboSteps);
    setSelectedGroupIds(new Set(bannerDraft.selectedGroupIds));
    setSelectedModifierSetIds(new Set(bannerDraft.selectedModifierSetIds));
    setVariantGroups(bannerDraft.variantGroups);
    setActiveTab(bannerDraft.activeTab);
    setBannerDraft(null);
    setAutosaveEnabled(true);
  };

  const handleDiscardDraft = () => {
    clearItemDraft(rid);
    setBannerDraft(null);
    setAutosaveEnabled(true);
  };

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
    if (!name.trim() || price <= 0) return;
    setSaving(true);
    try {
      const createPayload: Parameters<typeof createMenuItem>[1] = {
        name: name.trim(),
        description,
        price,
        is_active: isActive,
        item_type: itemType,
        category_id: categoryId || categories[0]?.id,
      };
      if (itemType === 'combo' && comboSteps.length > 0) {
        (createPayload as Record<string, unknown>).combo_steps = comboSteps.map((s, i): ComboStepInput => ({
          name: s.name || `Choice ${i + 1}`,
          description: s.description || '',
          min_picks: s.min_picks,
          max_picks: s.max_picks,
          sort_order: i,
          source_type: s.source_type,
          source_category_id: s.source_type === 'category' ? s.source_category_id : undefined,
          items: s.source_type === 'category'
            ? []
            : s.items.map((si) => ({ menu_item_id: si.menu_item_id, option_id: si.variant_id || undefined, price_delta: si.price_delta })),
        }));
      }
      const item = await createMenuItem(rid, createPayload);
      if (pendingImage) {
        const url = await uploadMenuItemImage(rid, item.id, pendingImage);
        await updateMenuItem(rid, item.id, { image_url: url });
      }
      for (const groupId of Array.from(selectedGroupIds)) {
        await addItemsToGroup(rid, groupId, [item.id]);
      }
      for (const setId of Array.from(selectedModifierSetIds)) {
        await attachModifierSetToItems(rid, setId, [item.id]);
      }
      if (hasMeaningfulVariants(variantGroups)) {
        await syncItemVariants(rid, item.id, {
          groups: toVariantSyncPayload(variantGroups),
        });
      }
      clearItemDraft(rid);
      router.push(`/${rid}/menu/items`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
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
    variantsCount: variantGroups.reduce((sum, g) => sum + g.rows.filter((r) => r.name.trim()).length, 0),
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
    ? computeComboSavings(price, comboSteps, itemsByIdForSummary)
    : null;

  const draftSavedAgo = useMemo(() => {
    if (!bannerDraft) return '';
    const diff = bannerDraft.savedAt - Date.now();
    const minutes = Math.round(diff / 60_000);
    const hours = Math.round(diff / 3_600_000);
    const days = Math.round(diff / 86_400_000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(days, 'day');
  }, [bannerDraft, locale]);

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

  // Hidden on mobile: tab bar is tight on phones, and the orange brand badge
  // visually competes with the active-tab pill. The type is already chosen
  // explicitly via the picker cards in the Details tab.
  const typeBadgeTrailing = (
    <Badge tone="brand" className="hidden md:inline-flex h-6 px-2.5 font-semibold tracking-[.04em]">
      <Boxes className="w-3 h-3" />
      {itemType === 'combo' ? t('typeBadgeCombo') : t('typeBadgeArticle')}
    </Badge>
  );

  const rail = (
    <MenuItemSummaryRail
      imageUrl={imagePreview || undefined}
      name={name}
      price={price}
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
        saveDisabled={!name.trim() || price <= 0}
        sidebar={rail}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          {bannerDraft && (
            <div className="px-8 py-3 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-500/30 shrink-0 flex items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center shrink-0">
                  <History className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                    {t('draftBannerTitle')}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                    {bannerDraft.name.trim()
                      ? `${bannerDraft.name.trim()} · ${draftSavedAgo}`
                      : `${t('draftBannerUnnamed')} · ${draftSavedAgo}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDiscardDraft}
                  className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  {t('discard')}
                </button>
                <button
                  onClick={handleResumeDraft}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  {t('resumeDraft')}
                </button>
              </div>
            </div>
          )}

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
                selectedGroupIds={selectedGroupIds}
                setSelectedGroupIds={setSelectedGroupIds}
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
                menus={menus}
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
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {t('variantsDescription')}
                    </p>
                    <VariantsEditor
                      groups={variantGroups}
                      onChange={setVariantGroups}
                      allOptionSets={allOptionSets}
                      itemBasePrice={price}
                    />
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
            price,
            comboSteps,
            itemsByIdForSummary,
          )}
          onClose={() => setSavingsModalOpen(false)}
        />
      )}
    </>
  );
}
