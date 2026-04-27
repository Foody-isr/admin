'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteModifier, uploadMenuItemImage,
  detachModifierSetFromItem,
  listMenus, addItemsToGroup, removeItemFromGroup, createGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, detachOptionSetFromItem, getItemOptionPrices,
  listStockItems, listPrepItems, getMenuItemIngredients, setMenuItemIngredients,
  MenuCategory, MenuItem, ModifierSet, Menu,
  OptionSet, ItemOptionOverride, ItemType, ComboStepInput,
  StockItem, PrepItem, MenuItemIngredient,
} from '@/lib/api';
import { getRestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemTabDetails from '@/components/menu-item/MenuItemTabDetails';
import MenuItemTabOptions from '@/components/menu-item/MenuItemTabOptions';
import MenuItemTabRecipe, { MenuItemTabRecipeHandle } from '@/components/menu-item/MenuItemTabRecipe';
import MenuItemTabCost from '@/components/menu-item/MenuItemTabCost';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import CompositionTab from '@/components/menu-item/combo/CompositionTab';
import TypeSwitchConfirm, { TypeSwitchLossSummary } from '@/components/menu-item/combo/TypeSwitchConfirm';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import { Badge } from '@/components/ds';
import { Boxes } from 'lucide-react';
import { computeItemCostSummary } from '@/lib/cost-utils';
import { XIcon } from 'lucide-react';

const VALID_TABS: MenuItemSection[] = ['details', 'modifiers', 'composition', 'recipe', 'cost'];

export default function EditItemPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  // Hydrate from sessionStorage cache set by the list page's openEditor helper.
  // When the user clicks an item in the library, the MenuItem is stashed
  // before navigation so the modal renders populated on the first frame —
  // mirroring the stock-editor UX where the item is passed inline. Background
  // fetch still runs below for freshness. Falls back to full loading state
  // for deep-links that bypass the list page.
  const [item, setItem] = useState<MenuItem | null>(() => {
    if (typeof window === 'undefined' || !Number.isFinite(iid)) return null;
    try {
      const raw = sessionStorage.getItem(`foody.menuItem.${iid}`);
      if (!raw) return null;
      sessionStorage.removeItem(`foody.menuItem.${iid}`);
      return JSON.parse(raw) as MenuItem;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(() => item == null);

  const initialTab = (() => {
    const raw = searchParams.get('tab');
    return raw && VALID_TABS.includes(raw as MenuItemSection) ? (raw as MenuItemSection) : 'details';
  })();
  const [activeTab, setActiveTab] = useState<MenuItemSection>(initialTab);

  // Form state — seeded from the hydrated MenuItem (if present) so the
  // Details tab shows populated fields immediately on modal open, matching
  // the stock-editor UX. Background fetch below overwrites with fresh values.
  const [name, setName] = useState(() => item?.name ?? '');
  const [price, setPrice] = useState(() => (item?.price != null ? String(item.price) : ''));
  const [description, setDescription] = useState(() => item?.description ?? '');
  const [categoryId, setCategoryId] = useState(() => item?.category_id ?? 0);
  const [isActive, setIsActive] = useState(() => item?.is_active ?? true);
  const [itemType, setItemType] = useState<ItemType>(
    () => (item?.item_type as ItemType) || 'food_and_beverage',
  );
  const [imageUrl, setImageUrl] = useState(() => item?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo steps — shape now imported from combo/types.ts (shared between
  // create + edit pages).
  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  // Type-switch confirmation. The picker requests a switch; if any
  // type-specific data exists, this holds the pending target until the user
  // confirms. See `requestTypeChange` below.
  const [pendingType, setPendingType] = useState<ItemType | null>(null);

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

  const recipeRef = useRef<MenuItemTabRecipeHandle>(null);

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

  // Loss summary used by the type-switch confirmation modal. We count the
  // currently-attached items the user might lose visibility of when changing
  // type. Note: server records are not auto-deleted; the user can clean
  // them up via their respective UIs after switching.
  const variantsCountFromItem = useMemo(() => {
    if (!item) return 0;
    const fromGroups = (item.variant_groups ?? []).reduce(
      (sum, g) => sum + (g.variants ?? []).length,
      0,
    );
    return fromGroups + attachedOptionSets.reduce(
      (sum, os) => sum + (os.options ?? []).length,
      0,
    );
  }, [item, attachedOptionSets]);

  const lossSummary: TypeSwitchLossSummary = useMemo(() => ({
    recipeCount: ingredients.length,
    variantsCount: variantsCountFromItem,
    modifiersCount: (item?.modifier_sets?.length ?? 0) + (item?.modifiers?.length ?? 0),
    stepsCount: comboSteps.length,
  }), [ingredients, variantsCountFromItem, item, comboSteps]);

  const requestTypeChange = (next: ItemType) => {
    if (next === itemType) return;
    const wouldLose = next === 'combo'
      ? (lossSummary.recipeCount ?? 0) + (lossSummary.variantsCount ?? 0) + (lossSummary.modifiersCount ?? 0)
      : (lossSummary.stepsCount ?? 0);
    if (wouldLose > 0) {
      setPendingType(next);
    } else {
      setItemType(next);
      if (next === 'combo' && (activeTab === 'modifiers' || activeTab === 'recipe')) {
        setActiveTab('details');
      } else if (next !== 'combo' && activeTab === 'composition') {
        setActiveTab('details');
      }
    }
  };

  const confirmTypeChange = () => {
    if (pendingType == null) return;
    // Drop UI state for the type that's going away. Server records remain
    // until the user explicitly cleans them up.
    if (pendingType === 'combo') {
      // No client-side wipe of recipe/variants/modifiers — they'd need API
      // calls to delete from the server. We just hide them from the form.
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

  // Render the modal shell immediately — matches the stock-editor UX where
  // the dimmed backdrop + inset container appear in one frame, then the body
  // populates. Prevents the full-screen white/black flash that happened while
  // the item data was still being fetched on route navigation.
  if (loading || !item) {
    return (
      <MenuItemShell
        title={loading ? (t('loading') || 'Chargement…') : (t('itemNotFound') || 'Article introuvable')}
        onClose={goBack}
        onSave={() => {}}
        saving={false}
        saveDisabled
        sidebar={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-5 h-5 border-2 border-[var(--brand-500)] border-t-transparent rounded-full" />
          </div>
        }
      >
        <div className="flex-1 flex items-center justify-center">
          {loading ? (
            <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
          ) : (
            <div className="flex flex-col items-center gap-[var(--s-3)]">
              <p className="text-fs-sm text-[var(--fg-muted)]">
                {t('itemNotFound') || 'Article introuvable'}
              </p>
              <button
                onClick={goBack}
                className="text-fs-sm text-[var(--brand-500)] hover:underline"
              >
                {t('back') || 'Retour'}
              </button>
            </div>
          )}
        </div>
      </MenuItemShell>
    );
  }

  // Tab set adapts to item type. Combos: details · composition · cost.
  // Articles: details · modifiers · recipe · cost.
  const tabs: TabBarItem[] = itemType === 'combo'
    ? [
        { id: 'details', label: t('tabDetails') },
        { id: 'composition', label: t('tabComposition'), count: comboSteps.length },
        { id: 'cost', label: t('tabCost'), warning: costSummary?.costPct != null && costSummary.costPct > 0.35 },
      ]
    : [
        { id: 'details', label: t('tabDetails') },
        { id: 'modifiers', label: t('tabModifiers') },
        { id: 'recipe', label: t('tabRecipe') },
        { id: 'cost', label: t('tabCost'), warning: costSummary?.costPct != null && costSummary.costPct > 0.35 },
      ];

  const typeBadgeTrailing = (
    <Badge tone="brand" className="h-6 px-2.5 font-semibold tracking-[.04em]">
      <Boxes className="w-3 h-3" />
      {itemType === 'combo' ? t('typeBadgeCombo') : t('typeBadgeArticle')}
    </Badge>
  );

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
        <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg)]">
          {/* Tab bar — transparent banner that blends with modal bg,
              matching the food-cost page layout where tabs sit directly on the page bg */}
          <div className="px-[var(--s-6)] py-[var(--s-4)] border-b border-[var(--line)] shrink-0">
            <MenuItemTabBar
              tabs={tabs}
              active={activeTab}
              onChange={setActiveTab}
              trailing={typeBadgeTrailing}
            />
          </div>

          {/* Tab content — same vertical rhythm as food-cost page */}
          <div className="flex-1 overflow-y-auto p-[var(--s-6)]">
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
              />
            )}

            {/* ── Tab: Modificateurs & Variantes — articles only ─── */}
            {activeTab === 'modifiers' && itemType !== 'combo' && (
              <>
                <MenuItemTabOptions
                  item={item}
                  attachedModifierSets={item.modifier_sets ?? []}
                  attachedOptionSets={attachedOptionSets}
                  itemOptionOverrides={itemOptionOverrides}
                  onAddModifierSet={() => setModifierModalOpen(true)}
                  onDetachModifierSet={async (id) => {
                    if (!confirm('Unlink this modifier set from item?')) return;
                    await detachModifierSetFromItem(rid, id, iid);
                    loadData();
                  }}
                  onDeleteModifier={handleDeleteModifier}
                  onAddVariantGroup={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  onEditVariantGroup={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  onDeleteVariantGroup={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  onAddOptionSet={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  onEditOptionSet={() => router.push(`/${restaurantId}/menu/items/${iid}/variants`)}
                  onDetachOptionSet={async (id) => {
                    if (!confirm(t('remove') + '?')) return;
                    await detachOptionSetFromItem(rid, id, iid);
                    loadData();
                  }}
                />
              </>
            )}

            {/* ── Tab: Recette — Figma:323 ─────────────────────── */}
            {activeTab === 'recipe' && (
              <MenuItemTabRecipe
                ref={recipeRef}
                rid={rid}
                item={item}
                ingredients={ingredients}
                stockItems={stockItems}
                prepItems={prepItems}
                variants={attachedOptionSets.flatMap((os) =>
                  (os.options ?? [])
                    .filter((o) => o.is_active)
                    .map((o) => ({ option_id: o.id, name: o.name })),
                )}
                onAddIngredient={async (input) => {
                  const next = [
                    ...ingredients.map((ing) => ({
                      stock_item_id: ing.stock_item_id,
                      prep_item_id: ing.prep_item_id,
                      quantity_needed: ing.quantity_needed,
                      unit: ing.unit,
                      scales_with_variant: ing.scales_with_variant,
                      option_id: ing.option_id,
                      variant_overrides: ing.variant_overrides,
                    })),
                    input,
                  ];
                  const saved = await setMenuItemIngredients(rid, iid, next);
                  setIngredients(saved);
                }}
                onDeleteIngredient={async (id) => {
                  if (!confirm(t('delete') + '?')) return;
                  const next = ingredients.filter((i) => i.id !== id);
                  const saved = await setMenuItemIngredients(
                    rid,
                    iid,
                    next.map((ing) => ({
                      stock_item_id: ing.stock_item_id,
                      prep_item_id: ing.prep_item_id,
                      quantity_needed: ing.quantity_needed,
                      unit: ing.unit,
                      scales_with_variant: ing.scales_with_variant,
                      option_id: ing.option_id,
                      variant_overrides: ing.variant_overrides,
                    })),
                  );
                  setIngredients(saved);
                }}
                onUpdateIngredient={async (id, patch) => {
                  const next = ingredients.map((i) =>
                    i.id === id ? { ...i, ...patch } : i,
                  );
                  const saved = await setMenuItemIngredients(
                    rid,
                    iid,
                    next.map((ing) => ({
                      stock_item_id: ing.stock_item_id,
                      prep_item_id: ing.prep_item_id,
                      quantity_needed: ing.quantity_needed,
                      unit: ing.unit,
                      scales_with_variant: ing.scales_with_variant,
                      option_id: ing.option_id,
                      variant_overrides: ing.variant_overrides,
                    })),
                  );
                  setIngredients(saved);
                }}
                onRefreshLists={async () => {
                  // Re-fetch only the lists the composer searches over —
                  // cheaper than full loadData() on every inline create.
                  const [stock, prep] = await Promise.all([
                    listStockItems(rid),
                    listPrepItems(rid),
                  ]);
                  setStockItems(stock ?? []);
                  setPrepItems(prep ?? []);
                }}
              />
            )}

            {/* ── Tab: Coût — Figma MenuItemDetails.tsx:644 ─────── */}
            {activeTab === 'cost' && item && (
              <MenuItemTabCost
                rid={rid}
                item={item}
                ingredients={ingredients}
                itemOptionOverrides={itemOptionOverrides}
                vatRate={vatRate}
                price={parseFloat(price) || 0}
                onChangesApplied={loadData}
              />
            )}
          </div>
        </div>
      </MenuItemShell>

      {/* Modifier Sets Modal */}
      {modifierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-neutral-200 dark:border-neutral-700">
            <div className="p-6 pb-4 flex items-center justify-between">
              <button
                onClick={() => setModifierModalOpen(false)}
                className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center"
              >
                <XIcon className="w-5 h-5 text-neutral-900 dark:text-white" />
              </button>
              <button
                onClick={() => setModifierModalOpen(false)}
                className="bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-[#3f3f46] text-neutral-900 dark:text-white rounded-full px-5 py-2 text-[14px] font-medium"
              >
                {t('done')}
              </button>
            </div>
            <div className="px-6 pb-4">
              <h2 className="text-[20px] font-bold text-neutral-900 dark:text-white mb-2">{t('modifiers')}</h2>
              <p className="text-[14px] text-neutral-600 dark:text-neutral-400">{t('modifiersDescription')}</p>
            </div>
            <div className="mx-6 border-t-2 border-[#fafafa]" />
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {allModifierSets.length > 0 ? (
                allModifierSets.map((ms) => {
                  const alreadyAttached = (item.modifier_sets ?? []).some((ims: ModifierSet) => ims.id === ms.id);
                  return (
                    <label
                      key={ms.id}
                      className="w-full flex items-center gap-3 py-4 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:bg-[#1a1a1a] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[16px] font-medium text-neutral-900 dark:text-white">{ms.name}</span>
                        <p className="text-[14px] text-neutral-600 dark:text-neutral-400 truncate">
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
                        className="w-5 h-5 rounded border-2 border-neutral-200 dark:border-neutral-700 accent-orange-500 shrink-0"
                      />
                    </label>
                  );
                })
              ) : (
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
    </>
  );
}
