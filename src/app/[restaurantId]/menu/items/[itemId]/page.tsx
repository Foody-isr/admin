'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteModifier, uploadMenuItemImage,
  detachModifierSetFromItem, setModifierSetItemOverrides,
  listMenus, addItemsToGroup, removeItemFromGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets, getItemOptionPrices,
  syncItemVariants,
  listStockItems, listPrepItems, getMenuItemIngredients, setMenuItemIngredients,
  getRestaurant,
  retranslateMenuItem,
  MenuCategory, MenuItem, ModifierSet, Menu,
  ModifierSetItemOverridesInput,
  OptionSet, ItemOptionOverride, ItemType, PricingMode,
  StockItem, PrepItem, MenuItemIngredient, IngredientInput,
  TranslationMap, MenuItemCustomerFacts, normalizeMenuItemCustomerFacts,
} from '@/lib/api';
import { getRestaurantSettings } from '@/lib/api';
import type { Locale } from '@/components/i18n/LocaleTabs';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemTabBar, { TabBarItem } from '@/components/menu-item/MenuItemTabBar';
import MenuItemTabDetails from '@/components/menu-item/MenuItemTabDetails';
import MenuItemTabOptions from '@/components/menu-item/MenuItemTabOptions';
import VariantsEditor, {
  VariantGroupState,
  variantGroupsFromOptionSets,
  toVariantSyncPayload,
  hasMeaningfulVariants,
} from '@/components/menu-item/VariantsEditor';
import MenuItemTabRecipe, { MenuItemTabRecipeHandle } from '@/components/menu-item/MenuItemTabRecipe';
import MenuItemTabCost from '@/components/menu-item/MenuItemTabCost';
import ItemAvailabilityPanel, { ItemAvailabilityPanelHandle } from '@/components/menu-item/ItemAvailabilityPanel';
import MenuItemSummaryRail from '@/components/menu-item/MenuItemSummaryRail';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import type { SimulatorReceipt } from '@/components/menu-item/WhatIfSimulator';
import CompositionTab from '@/components/menu-item/combo/CompositionTab';
import TypeSwitchConfirm, { TypeSwitchLossSummary } from '@/components/menu-item/combo/TypeSwitchConfirm';
import ComboSavingsBreakdownModal from '@/components/menu-item/combo/ComboSavingsBreakdownModal';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import { deriveStepKind } from '@/components/menu-item/combo/types';
import { toComboStepInputs } from '@/components/menu-item/combo/serialize';
import { computeComboSavings, computeComboSavingsBreakdown } from '@/components/menu-item/combo/pricing';
import { Badge, Button, ConfirmDialog } from '@/components/ds';
import { keyedRecipeIngredients } from '@/lib/recipe-editor-rows';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Boxes } from 'lucide-react';
import { computeItemCostSummary } from '@/lib/cost-utils';
import Modal from '@/components/Modal';
import AIImageGeneratorModal from '@/components/menu-item/AIImageGeneratorModal';

const VALID_TABS: MenuItemSection[] = ['details', 'composition', 'recipe', 'availability'];

// Legacy deep links: the old 'modifiers' tab merged into 'details' (Article)
// and the old 'cost' tab merged into 'recipe'. Remap so existing ?tab links
// still land somewhere sensible.
function remapLegacyTab(raw: string | null): MenuItemSection | null {
  if (!raw) return null;
  const mapped = raw === 'modifiers' ? 'details' : raw === 'cost' ? 'recipe' : raw;
  return VALID_TABS.includes(mapped as MenuItemSection) ? (mapped as MenuItemSection) : null;
}

/** Keeps cached content and outstanding requests scoped to the active item. */
export default function EditItemPage() {
  const { restaurantId, itemId } = useParams();
  return <EditItemEditor key={`${restaurantId}.${itemId}`} />;
}

function EditItemEditor() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const canEditRecipe = canEdit && hasAnyPermission('kitchen.manage');

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
      const raw = sessionStorage.getItem(`foody.menuItem.${rid}.${iid}`);
      if (!raw) return null;
      sessionStorage.removeItem(`foody.menuItem.${rid}.${iid}`);
      return JSON.parse(raw) as MenuItem;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const initialized = useRef(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const initialTab = remapLegacyTab(searchParams.get('tab')) ?? 'details';
  const [activeTab, setActiveTab] = useState<MenuItemSection>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set<MenuItemSection>([initialTab]));
  useEffect(() => { setVisitedTabs(previous => previous.has(activeTab) ? previous : new Set([...Array.from(previous), activeTab])); }, [activeTab]);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [simulationState, setSimulationState] = useState({dirty:false, busy:false});

  // Return address. Pages that open the editor (e.g. a carte detail page)
  // pass ?from=<path> so Back and post-save land where the user came from.
  // Only internal absolute paths are honored; everything else falls back to
  // the item library.
  const fromParam = searchParams.get('from');
  const backTarget = fromParam && fromParam.startsWith('/') && !fromParam.startsWith('//')
    ? fromParam
    : `/${rid}/menu/items`;

  // Form state — seeded from the hydrated MenuItem (if present) so the
  // Details tab shows populated fields immediately on modal open, matching
  // the stock-editor UX. Background fetch below overwrites with fresh values.
  const [name, setName] = useState(() => item?.name ?? '');
  const [price, setPrice] = useState<number>(() => item?.price ?? 0);
  const [pricingMode, setPricingMode] = useState<PricingMode>(() => item?.pricing_mode ?? 'standard');
  const [pricePerKg, setPricePerKg] = useState<number>(() => item?.price_per_kg ?? 0);
  const [estimatedWeightGrams, setEstimatedWeightGrams] = useState<number>(() => item?.estimated_weight_grams ?? 0);
  const [description, setDescription] = useState(() => item?.description ?? '');
  const [aiContext, setAiContext] = useState(() => item?.ai_context ?? '');
  const [customerFacts, setCustomerFacts] = useState<MenuItemCustomerFacts>(() =>
    normalizeMenuItemCustomerFacts(item?.customer_facts),
  );
  const [portion, setPortion] = useState(() => item?.portion ?? '');
  const [translations, setTranslations] = useState<TranslationMap>(() => item?.translations ?? {});
  // The restaurant's source language. Loaded with the categories below.
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [categoryId, setCategoryId] = useState(() => item?.category_id ?? 0);
  const [isActive, setIsActive] = useState(() => item?.is_active ?? true);
  const [allowNotes, setAllowNotes] = useState<boolean>(() => item?.allow_notes ?? true);
  const [comboAllowQuantity, setComboAllowQuantity] = useState<boolean>(() => item?.combo_allow_quantity ?? true);
  const [itemType, setItemType] = useState<ItemType>(
    () => (item?.item_type as ItemType) || 'food_and_beverage',
  );
  const [imageUrl, setImageUrl] = useState(() => item?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Combo steps — shape now imported from combo/types.ts (shared between
  // create + edit pages).
  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  // Type-switch confirmation. The picker requests a switch; if any
  // type-specific data exists, this holds the pending target until the user
  // confirms. See `requestTypeChange` below.
  const [pendingType, setPendingType] = useState<ItemType | null>(null);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);

  // Modifier sets modal
  const [allModifierSets, setAllModifierSets] = useState<ModifierSet[]>([]);
  const [modifierModalOpen, setModifierModalOpen] = useState(false);
  const [modifierQuery, setModifierQuery] = useState('');
  const modifierSearch = useRef<HTMLInputElement>(null);
  const [modifierError, setModifierError] = useState('');
  const [modifierBusy, setModifierBusy] = useState(false);
  const modifierLock = useRef(false);
  const modifierConfirmed = useRef(new Map<number, boolean>());
  const [modifierRemoval, setModifierRemoval] = useState<{ kind: 'set' | 'modifier'; id: number } | null>(null);
  const [removalSaved, setRemovalSaved] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const imageLock = useRef(false);

  // Option sets (attached to this item) + the full restaurant list (used by
  // the inline VariantsEditor's autocomplete to suggest re-using an existing
  // option set when the operator types a matching title).
  const [attachedOptionSets, setAttachedOptionSets] = useState<OptionSet[]>([]);
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [itemOptionOverrides, setItemOptionOverrides] = useState<ItemOptionOverride[]>([]);

  // Inline-editable variant groups. Seeded from attachedOptionSets +
  // overrides on each loadData() run; user edits flow through onChange and
  // get persisted via syncItemVariants() when the main Save button fires.
  const [variantGroups, setVariantGroups] = useState<VariantGroupState[]>([]);
  const [variantsDirty, setVariantsDirty] = useState(false);

  // Menus / Cartes state — selection is at the *group* level so the operator
  // can pick the exact group inside each carte. The previous menu-only model
  // dropped items into whichever group happened to be first on save.
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [initialGroupIds, setInitialGroupIds] = useState<Set<number>>(new Set());

  // Food cost / ingredients state
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const ingredientsCurrent = useRef<MenuItemIngredient[]>([]);
  const ingredientQueue = useRef<Promise<void>>(Promise.resolve());
  const [ingredientRemoval, setIngredientRemoval] = useState<string | null>(null);
  const [ingredientRemovalBusy, setIngredientRemovalBusy] = useState(false);
  const [ingredientRemovalError, setIngredientRemovalError] = useState('');
  const ingredientRemovalLock = useRef(false);
  const persistIngredients = (change: (current: MenuItemIngredient[]) => IngredientInput[]) => {
    const pending = ingredientQueue.current.then(async () => {
      const saved = await setMenuItemIngredients(rid, iid, change(ingredientsCurrent.current));
      ingredientsCurrent.current = saved; setIngredients(saved);
    });
    ingredientQueue.current = pending.catch(() => {});
    return pending;
  };
  const ingredientInput = (ingredient: MenuItemIngredient): IngredientInput => ({
    stock_item_id: ingredient.stock_item_id, prep_item_id: ingredient.prep_item_id,
    quantity_needed: ingredient.quantity_needed, unit: ingredient.unit,
    option_id: ingredient.option_id, variant_overrides: ingredient.variant_overrides,
  });
  const removeIngredient = async () => {
    if (!canEditRecipe || ingredientRemoval === null || ingredientRemovalLock.current) return;
    ingredientRemovalLock.current = true; setIngredientRemovalBusy(true); setIngredientRemovalError('');
    try { await persistIngredients(current => keyedRecipeIngredients(current).filter(value => value.key !== ingredientRemoval).map(value => ingredientInput(value.ingredient))); setIngredientRemoval(null); }
    catch (cause) { setIngredientRemovalError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { ingredientRemovalLock.current = false; setIngredientRemovalBusy(false); }
  };
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [vatRate, setVatRate] = useState(18);
  const [defaultStockUnit, setDefaultStockUnit] = useState<'' | 'g' | 'kg'>('');

  const recipeRef = useRef<MenuItemTabRecipeHandle>(null);
  const availabilityRef = useRef<ItemAvailabilityPanelHandle>(null);

  const formSnapshot = JSON.stringify({ name, price, pricingMode, pricePerKg, estimatedWeightGrams,
    description, aiContext, customerFacts, portion, translations, categoryId, isActive, allowNotes,
    comboAllowQuantity, itemType, comboSteps, variantGroups, groups: Array.from(selectedGroupIds).sort((a,b) => a-b) });
  const initialSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (initialized.current && !loading && !loadError && initialSnapshot.current === null) initialSnapshot.current = formSnapshot;
  }, [formSnapshot, loading, loadError]);
  const hasUnsavedChanges = useCallback(() => simulationState.dirty || (canEdit && (
    (initialSnapshot.current !== null && initialSnapshot.current !== formSnapshot)
    || recipeRef.current?.isDirty() || availabilityRef.current?.isDirty()
  )), [canEdit, formSnapshot, simulationState.dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges() || simulationState.busy || saveLock.current || modifierLock.current || imageLock.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges, simulationState.busy]);

  const loadData = useCallback(async () => {
    const guard = requestGuard.current;
    const request = guard.begin(rid);
    if (!initialized.current) setLoading(true);
    setLoadError('');
    try {
      const [cats, allMenus, ms, optSets, optOverrides, stock, prep, ings, restaurant, settings] = await Promise.all([
        getAllCategories(rid),
        listMenus(rid),
        listModifierSets(rid),
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
        listStockItems(rid),
        listPrepItems(rid),
        getMenuItemIngredients(rid, iid),
        getRestaurant(rid),
        getRestaurantSettings(rid),
      ]);
      if (!guard.isCurrent(request)) return;
      const foundItem = cats.flatMap(category => category.items ?? []).find(value => value.id === iid);
      if (!foundItem) throw new Error('itemNotFound');
      setVatRate(settings.vat_rate ?? 18);
      setDefaultStockUnit((settings.default_stock_unit as '' | 'g' | 'kg') ?? '');
      const defaultLocale = restaurant.default_locale;
      if (defaultLocale === 'en' || defaultLocale === 'he' || defaultLocale === 'fr') {
        setSourceLocale(defaultLocale);
      }
      setCategories(cats);
      setMenus(allMenus);
      setAllModifierSets(ms ?? []);
      setItemOptionOverrides(optOverrides ?? []);
      setStockItems(stock ?? []);
      setPrepItems(prep ?? []);
      ingredientsCurrent.current = ings ?? [];
      setIngredients(ings ?? []);
      const attached = (optSets ?? []).filter((os) =>
        (os.menu_items ?? []).some((mi) => mi.id === iid)
      );
      setAllOptionSets(optSets ?? []);
      setAttachedOptionSets(attached);
      if (!initialized.current) {
        setVariantGroups(variantGroupsFromOptionSets(attached, optOverrides ?? [], iid));
        setVariantsDirty(false);
      }
      for (const cat of cats) {
        const found = (cat.items ?? []).find((i) => i.id === iid);
        if (found) {
          setItem(found);
          if (!initialized.current) {
          setName(found.name);
          setPrice(found.price ?? 0);
          setPricingMode(found.pricing_mode ?? 'standard');
          setPricePerKg(found.price_per_kg ?? 0);
          setEstimatedWeightGrams(found.estimated_weight_grams ?? 0);
          setDescription(found.description ?? '');
          setAiContext(found.ai_context ?? '');
          setCustomerFacts(normalizeMenuItemCustomerFacts(found.customer_facts));
          setPortion(found.portion ?? '');
          setTranslations(found.translations ?? {});
          setCategoryId(found.category_id);
          setIsActive(found.is_active);
          setAllowNotes(found.allow_notes ?? true);
          setComboAllowQuantity(found.combo_allow_quantity ?? true);
          setItemType(found.item_type || 'food_and_beverage');
          setImageUrl(found.image_url ?? '');
          if (found.item_type === 'combo' && found.combo_steps) {
            setComboSteps(found.combo_steps.map((s) => {
              const draft: ComboStepDraft = {
                key: crypto.randomUUID(),
                name: s.name,
                description: s.description ?? '',
                min_picks: s.min_picks,
                max_picks: s.max_picks,
                // Legacy "category" steps are coerced to explicit (category mode
                // was removed); the operator rebuilds them as group/explicit.
                source_type: s.source_type === 'group' ? 'group' : 'explicit',
                source_group_id: s.source_group_id ?? undefined,
                source_variant_label: s.source_variant_label ?? undefined,
                variant_rules: (s.variant_rules ?? []).map((r) => ({
                  variant_label: r.variant_label,
                  min_picks: r.min_picks,
                  max_picks: r.max_picks,
                })),
                max_per_item: s.max_per_item ?? 0,
                item_limits: (s.item_limits ?? []).map((l) => ({
                  menu_item_id: l.menu_item_id,
                  max_qty: l.max_qty,
                })),
                items: s.items.map((si) => ({
                  menu_item_id: si.menu_item_id,
                  price_delta: si.price_delta,
                  // Server defaults this column to TRUE on migration, so any
                  // missing value (older response shape) is treated as "force
                  // include" — preserves the customer-visible status quo for
                  // existing combos.
                  force_off_carte: si.force_off_carte ?? true,
                  item_name: si.menu_item?.name,
                  variant_id: si.option_id ?? undefined,
                  pick_key: si.option_id ? `variant:${si.menu_item_id}:${si.option_id}` : `item:${si.menu_item_id}`,
                })),
              };
              draft.kind = deriveStepKind(draft);
              return draft;
            }));
          }
          }
          break;
        }
      }
      const gIds = new Set<number>();
      for (const menu of allMenus) {
        for (const group of menu.groups ?? []) {
          if ((group.items ?? []).some((i) => i.id === iid)) {
            gIds.add(group.id);
          }
        }
      }
      if (!initialized.current) {
        setSelectedGroupIds(gIds);
        setInitialGroupIds(new Set(gIds));
      }
      initialized.current = true;
    } catch (cause) {
      if (guard.isCurrent(request)) {
        if (initialized.current) setSaveError(cause instanceof Error ? cause.message : 'libraryOperationFailed');
        else setLoadError(cause instanceof Error ? cause.message : 'libraryOperationFailed');
      }
    } finally {
      if (guard.isCurrent(request)) setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { const guard = requestGuard.current; void loadData(); return () => guard.invalidate(); }, [loadData]);

  const refreshCostData = async (receipt: SimulatorReceipt) => {
    const [cats, overrides, nextIngredients, stock, prep] = await Promise.all([
      getAllCategories(rid), getItemOptionPrices(rid,iid), getMenuItemIngredients(rid,iid), listStockItems(rid), listPrepItems(rid),
    ]);
    const fresh = cats.flatMap(category => category.items ?? []).find(value => value.id === iid);
    if (!fresh) throw new Error(t('itemNotFound'));
    setCategories(cats); setItem(fresh); setItemOptionOverrides(overrides);
    ingredientsCurrent.current = nextIngredients; setIngredients(nextIngredients);
    setStockItems(stock); setPrepItems(prep);
    if (receipt.price != null) {
      const nextPrice = receipt.price;
      const optionId = receipt.variantId?.startsWith('opt:') ? Number(receipt.variantId.slice(4)) : null;
      const patchGroups = (groups: VariantGroupState[]) => groups.map(group => ({...group,rows:group.rows.map(row => row.optionId === optionId ? {...row,price:nextPrice} : row)}));
      if (optionId != null) setVariantGroups(patchGroups);
      else setPrice(nextPrice);
      // Mark only the directly applied price as saved; preserve all other drafts.
      if (initialSnapshot.current) {
        const baseline = JSON.parse(initialSnapshot.current);
        if (optionId != null) baseline.variantGroups = patchGroups(baseline.variantGroups);
        else baseline.price = nextPrice;
        initialSnapshot.current = JSON.stringify(baseline);
      }
    }
  };

  const allMenuItems = categories.flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name, category_id: c.id }))
  );

  // Loss summary used by the type-switch confirmation modal. We count the
  // currently-attached items the user might lose visibility of when changing
  // type. Note: server records are not auto-deleted; the user can clean
  // them up via their respective UIs after switching.
  const variantsCountFromItem = useMemo(() => {
    if (!item) return 0;
    const fromLegacyGroups = (item.variant_groups ?? []).reduce(
      (sum, g) => sum + (g.variants ?? []).length,
      0,
    );
    const fromEditor = variantGroups.reduce(
      (sum, g) => sum + g.rows.filter((r) => r.name.trim()).length,
      0,
    );
    return fromLegacyGroups + fromEditor;
  }, [item, variantGroups]);

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
      // 'recipe' is article-only; 'composition' is combo-only. Bounce to the
      // shared 'details' (Article) tab when the active one leaves the new set.
      if (next === 'combo' && activeTab === 'recipe') {
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
    if (pendingType === 'combo' && activeTab === 'recipe') {
      setActiveTab('details');
    } else if (pendingType !== 'combo' && activeTab === 'composition') {
      setActiveTab('details');
    }
    setPendingType(null);
  };

  // Price single-source-of-truth. When an article has meaningful sizes, the
  // base-price field in the Details tab is hidden (see hideBasePrice) and the
  // price is owned by the size rows. We mirror the first size's price into the
  // saved base price so the data model stays valid and the rail / cost use the
  // right number. Combos keep their own explicit base price.
  const meaningfulVariants = itemType !== 'combo' && hasMeaningfulVariants(variantGroups);
  const firstVariantPrice = useMemo(() => {
    for (const g of variantGroups) {
      for (const r of g.rows) {
        if (r.name.trim() && !r.isComboOnly) return r.price;
      }
    }
    return 0;
  }, [variantGroups]);
  const effectivePrice = meaningfulVariants && firstVariantPrice > 0 ? firstVariantPrice : price;

  // A by-weight item has no flat base price — its price comes from ₪/kg × the
  // weighed amount, so validity keys off price_per_kg instead of effectivePrice.
  const isByWeight = itemType !== 'combo' && pricingMode === 'by_weight';
  const priceOk = isByWeight ? pricePerKg > 0 : effectivePrice > 0;

  const handleSave = async () => {
    if (!canEdit || loading || loadError || simulationState.busy || saveLock.current || modifierLock.current || imageLock.current || !name.trim() || !priceOk) return;
    if (simulationState.dirty) { setSaveError(t('simulatorFinishHint')); return; }
    saveLock.current = true; setSaving(true);
    setSaveError('');
    try {
      const updatePayload: Record<string, unknown> = {
        name: name.trim(),
        description,
        ai_context: aiContext,
        customer_facts: {
          ...customerFacts,
          ingredients: customerFacts.ingredients.filter((ingredient) => ingredient.name.trim()),
        },
        portion,
        price: effectivePrice,
        pricing_mode: pricingMode,
        price_per_kg: pricingMode === 'by_weight' ? pricePerKg : 0,
        estimated_weight_grams: pricingMode === 'by_weight' ? estimatedWeightGrams : 0,
        is_active: isActive,
        allow_notes: allowNotes,
        combo_allow_quantity: comboAllowQuantity,
        item_type: itemType,
        category_id: categoryId,
        image_url: imageUrl,
        translations,
      };
      if (itemType === 'combo') {
        updatePayload.combo_steps = toComboStepInputs(comboSteps);
      }
      const updated = await updateMenuItem(rid, iid, updatePayload as Parameters<typeof updateMenuItem>[2]);
      setItem((prev) => prev ? { ...prev, ...updated } : prev);
      if (itemType !== 'combo' && recipeRef.current?.isDirty()) {
        await recipeRef.current.save();
      }
      // Stock & disponibilité tab is transactional: it stages edits locally and
      // only persists here on Save (never on change/blur), so Annuler discards.
      if (availabilityRef.current?.isDirty()) {
        await availabilityRef.current.save();
      }
      if (variantsDirty && itemType !== 'combo') {
        await syncItemVariants(rid, iid, {
          groups: toVariantSyncPayload(variantGroups),
        });
      }
      const addedGroups = Array.from(selectedGroupIds).filter((id) => !initialGroupIds.has(id));
      const removedGroups = Array.from(initialGroupIds).filter((id) => !selectedGroupIds.has(id));
      for (const groupId of addedGroups) {
        await addItemsToGroup(rid, groupId, [iid]);
      }
      for (const groupId of removedGroups) {
        await removeItemFromGroup(rid, groupId, iid);
      }
      router.push(backTarget);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      saveLock.current = false; setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!canEdit || saving || modifierLock.current || imageLock.current) return;
    imageLock.current = true; setImageBusy(true); setImageError('');
    try {
      const url = await uploadMenuItemImage(rid, iid, file);
      await updateMenuItem(rid, iid, { image_url: url });
      setImageUrl(url);
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { imageLock.current = false; setImageBusy(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Immediate modifier writes refresh only their records, retaining the form draft.
  const refreshModifiers = async () => {
    const cats = await getAllCategories(rid);
    const refreshed = cats.flatMap(category => category.items ?? []).find(value => value.id === iid);
    if (!refreshed) throw new Error(t('itemNotFound'));
    setCategories(cats); setItem(refreshed);
  };
  const toggleModifierSet = async (setId: number, attached: boolean) => {
    if (!canEdit || modifierLock.current || saving || imageLock.current) return;
    modifierLock.current = true; setModifierBusy(true); setModifierError('');
    try {
      if (modifierConfirmed.current.get(setId) !== !attached) {
        if (attached) await detachModifierSetFromItem(rid, setId, iid);
        else await attachModifierSetToItems(rid, setId, [iid]);
        modifierConfirmed.current.set(setId, !attached);
      }
      await refreshModifiers();
    } catch (cause) { setModifierError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { modifierLock.current = false; setModifierBusy(false); }
  };
  const removeModifier = async () => {
    if (!canEdit || !modifierRemoval || modifierLock.current || saving || imageLock.current) return;
    modifierLock.current = true; setModifierBusy(true); setModifierError('');
    try {
      if (!removalSaved) {
        if (modifierRemoval.kind === 'set') await detachModifierSetFromItem(rid, modifierRemoval.id, iid);
        else await deleteModifier(rid, modifierRemoval.id);
        setRemovalSaved(true);
      }
      await refreshModifiers(); setModifierRemoval(null);
    } catch (cause) { setModifierError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { modifierLock.current = false; setModifierBusy(false); }
  };
  const requestModifierRemoval = (kind: 'set' | 'modifier', id: number) => {
    setRemovalSaved(false); setModifierError(''); setModifierRemoval({kind,id});
  };

  const navigateAway = (target: string) => {
    if (simulationState.busy || saveLock.current || modifierLock.current || imageLock.current) return;
    if (hasUnsavedChanges()) setLeaveTarget(target);
    else router.push(target);
  };
  const goBack = () => navigateAway(backTarget);

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

  // Combo savings for the rail. Mirrors the PricingCard math via the same
  // pure helper, so the two stay in sync. Hooks must run unconditionally —
  // declared here, *above* the loading early return below.
  const railItemsById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const cat of categories) for (const it of cat.items ?? []) m.set(it.id, it);
    return m;
  }, [categories]);
  const railComboSummary = itemType === 'combo'
    ? computeComboSavings(price, comboSteps, railItemsById)
    : null;

  // Render the modal shell immediately — matches the stock-editor UX where
  // the dimmed backdrop + inset container appear in one frame, then the body
  // populates. Prevents the full-screen white/black flash that happened while
  // the item data was still being fetched on route navigation.
  if (loading || loadError || !item) {
    return (
      <MenuItemShell
        title={loading ? t('loading') : t(loadError || 'itemNotFound')}
        onClose={goBack}
        onSave={() => {}}
        saving={false}
        saveDisabled
        sidebar={
          <div className="flex items-center justify-center h-full">
            {loading && <div aria-hidden className="animate-spin w-5 h-5 border-2 border-[var(--brand-500)] border-t-transparent rounded-full" />}
          </div>
        }
      >
        <div className="flex-1 flex items-center justify-center">
          {loading ? (
            <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
          ) : (
            <div role="alert" className="flex flex-col items-center gap-[var(--s-3)] p-5 text-center">
              <p className="text-fs-sm text-[var(--fg-muted)]">
                {t(loadError || 'itemNotFound')}
              </p>
              <Button variant="secondary" onClick={() => void loadData()}>{t('retry')}</Button>
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

  // Tab set adapts to item type, and is intentionally limited to three:
  //   Articles → Article (identity + price + sizes + modifiers) · Recette
  //              (recipe + folded-in cost) · Stock & disponibilité.
  //   Combos   → Article · Composition · Stock & disponibilité.
  // The cost-over-target warning now rides on the Recette tab (cost lives
  // there), since the standalone Coût tab was removed.
  const costWarning = costSummary?.costPct != null && costSummary.costPct > 0.35;
  const tabs: TabBarItem[] = itemType === 'combo'
    ? [
        { id: 'details', label: t('tabArticle') },
        { id: 'composition', label: t('tabComposition'), count: comboSteps.length },
        { id: 'availability', label: t('tabStock') },
      ]
    : [
        { id: 'details', label: t('tabArticle') },
        { id: 'recipe', label: t('tabRecipe'), warning: costWarning },
        { id: 'availability', label: t('tabStock') },
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
      imageUrl={imageUrl}
      name={name}
      price={effectivePrice}
      activeStatus={isActive}
      availabilityState={item?.availability_state}
      availabilityBottleneck={item?.availability_bottleneck}
      categoryName={activeCategoryName}
      // Hide the food-cost summary for combos — it doesn't apply (a combo's
      // cost is the sum of its constituent items' costs, not its own recipe).
      costSummary={itemType === 'combo' ? null : costSummary}
      comboSummary={railComboSummary}
      onShowComboSavingsDetail={itemType === 'combo' ? () => setSavingsModalOpen(true) : undefined}
      onImageClick={canEdit && !imageBusy && !saving && !modifierBusy ? () => fileInputRef.current?.click() : undefined}
      onAiImageClick={canEdit && !imageBusy && !saving && !modifierBusy ? () => setAiModalOpen(true) : undefined}
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

      <AIImageGeneratorModal
        restaurantId={rid}
        itemId={iid}
        itemName={name}
        itemDescription={description}
        categoryName={activeCategoryName}
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={(url, updated) => {
          setImageUrl(url);
          setItem((prev) => (prev ? { ...prev, ...updated } : prev));
        }}
      />

      <MenuItemShell
        title={t('editItem')}
        onClose={goBack}
        onSave={canEdit ? handleSave : () => {}}
        saving={saving}
        saveDisabled={!canEdit || simulationState.busy || imageBusy || modifierBusy || loading || !!loadError || !name.trim() || !priceOk}
        sidebar={rail}
      >
        <div className="flex min-w-0 flex-col md:flex-1 md:overflow-hidden bg-[var(--bg)]">
          {imageBusy && <p role="status" className="p-4 text-sm text-fg-secondary">{t('loading')}</p>}
          {imageError && <p role="alert" className="p-4 text-sm text-[var(--danger-500)]">{imageError}</p>}
          {saveError && <p role="alert" className="mx-6 mt-4 p-3 rounded-r-md bg-[var(--danger-50)] text-[var(--danger-500)] text-sm">{saveError}</p>}
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
          <fieldset disabled={saving || imageBusy || modifierBusy} className="min-w-0 p-4 sm:p-6 md:flex-1 md:overflow-y-auto" onClickCapture={event => {
            const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
            if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (link.origin === window.location.origin && hasUnsavedChanges()) { event.preventDefault(); event.stopPropagation(); navigateAway(link.pathname + link.search + link.hash); }
          }}>
            {/* ── Tab: Article (identity + price + sizes + modifiers) ── */}
            {activeTab === 'details' && (
              <div className="space-y-[var(--s-6)]">
                <MenuItemTabDetails
                  name={name}
                  setName={setName}
                  price={price}
                  setPrice={setPrice}
                  pricingMode={pricingMode}
                  setPricingMode={setPricingMode}
                  pricePerKg={pricePerKg}
                  setPricePerKg={setPricePerKg}
                  estimatedWeightGrams={estimatedWeightGrams}
                  setEstimatedWeightGrams={setEstimatedWeightGrams}
                  description={description}
                  setDescription={setDescription}
                  customerFacts={customerFacts}
                  setCustomerFacts={setCustomerFacts}
                  suggestedCustomerIngredients={ingredients
                    .map((ingredient) => ingredient.stock_item?.name ?? ingredient.prep_item?.name ?? '')
                    .filter(Boolean)}
                  aiContext={aiContext}
                  setAiContext={setAiContext}
                  portion={portion}
                  setPortion={setPortion}
                  categoryId={categoryId}
                  setCategoryId={setCategoryId}
                  isActive={isActive}
                  setIsActive={setIsActive}
                  allowNotes={allowNotes}
                  setAllowNotes={setAllowNotes}
                  vatRate={vatRate}
                  categories={categories}
                  menus={menus}
                  selectedGroupIds={selectedGroupIds}
                  setSelectedGroupIds={setSelectedGroupIds}
                  itemType={itemType}
                  sourceLocale={sourceLocale}
                  translations={translations}
                  setTranslations={setTranslations}
                  onRetranslate={(fields) => retranslateMenuItem(rid, iid, fields)}
                  onTypeChange={requestTypeChange}
                  comboStepsCount={comboSteps.length}
                  onJumpToComposition={() => setActiveTab('composition')}
                  // Only hide the base-price field once the first size carries
                  // a real price; otherwise the owner would have nowhere to set
                  // a price (the first size inherits the base when left at 0).
                  hideBasePrice={meaningfulVariants && firstVariantPrice > 0}
                />

                {/* Sizes / variants — pricing lives here when present, which is
                    why the base-price field above hides itself (no more "same
                    price shown twice"). Combos price via the Composition tab.
                    By-weight items are priced per kg, not by size, so the sizes
                    editor is hidden for them. */}
                {itemType !== 'combo' && !isByWeight && (
                  <section className="max-w-4xl bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
                    <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-3)]">
                      <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
                      <h3 className="text-fs-xl font-semibold text-[var(--fg)]">
                        {t('variants') || 'Variantes'}
                      </h3>
                    </div>
                    <p className="text-fs-xs text-[var(--fg-muted)] mb-[var(--s-4)]">
                      {t('variantsDesc') ||
                        'Tailles ou options liées (Normal, Grand…). Le prix du variant remplace le prix de base.'}
                    </p>
                    <VariantsEditor
                      groups={variantGroups}
                      onChange={(g) => { setVariantGroups(g); setVariantsDirty(true); }}
                      allOptionSets={allOptionSets}
                      itemBasePrice={effectivePrice}
                    />
                  </section>
                )}

                {/* Modifiers — add-ons (sans coriandre, sauce à part…) */}
                {itemType !== 'combo' && (
                  <MenuItemTabOptions
                    item={item}
                    attachedModifierSets={item.modifier_sets ?? []}
                    allModifierSets={allModifierSets}
                    attachedOptionSets={attachedOptionSets}
                    itemOptionOverrides={itemOptionOverrides}
                    onAddModifierSet={canEdit ? () => { setModifierError(''); setModifierQuery(''); setModifierModalOpen(true); } : () => {}}
                    onDetachModifierSet={canEdit ? id => requestModifierRemoval('set',id) : () => {}}
                    onSaveModifierSetOverrides={canEdit ? async (setId: number, input: ModifierSetItemOverridesInput) => {
                      await setModifierSetItemOverrides(rid, setId, iid, input);
                      await refreshModifiers();
                    } : undefined}
                    onDeleteModifier={canEdit ? id => requestModifierRemoval('modifier',id) : () => {}}
                    // Variants render in their own section just above, so these
                    // handlers are no-ops kept to satisfy the prop contract.
                    onAddVariantGroup={() => {}}
                    onEditVariantGroup={() => {}}
                    onDeleteVariantGroup={() => {}}
                    onAddOptionSet={() => {}}
                    onEditOptionSet={() => {}}
                    onDetachOptionSet={() => {}}
                    hideVariantsSection
                  />
                )}
              </div>
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
                restaurantId={rid}
                onShowSavingsDetail={() => setSavingsModalOpen(true)}
                comboAllowQuantity={comboAllowQuantity}
                onComboAllowQuantityChange={setComboAllowQuantity}
              />
            )}

            {/* ── Tab: Recette (recipe + folded-in cost readout) ─── */}
            {visitedTabs.has('recipe') && (
              <div hidden={activeTab !== 'recipe' || itemType === 'combo'}>
              <MenuItemTabRecipe
                ref={recipeRef}
                rid={rid}
                item={item}
                ingredients={ingredients}
                stockItems={stockItems}
                prepItems={prepItems}
                variants={variantGroups.flatMap((g) =>
                  g.rows
                    .filter((r) => r.isActive && r.optionId != null && r.name.trim())
                    .map((r) => ({ option_id: r.optionId!, name: r.name })),
                )}
                onAddIngredient={input => canEditRecipe ? persistIngredients(current => [...current.map(ingredientInput), input]) : Promise.resolve()}
                onDeleteIngredient={id => { if (canEditRecipe) { setIngredientRemovalError(''); setIngredientRemoval(id); } }}
                onUpdateIngredient={(id, patch) => canEditRecipe ? persistIngredients(current => keyedRecipeIngredients(current).map(({ingredient,key}) => ingredientInput(key === id ? {...ingredient,...patch} : ingredient))) : Promise.resolve()}
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
                onImported={async () => {
                  const [nextIngredients, stock, prep] = await Promise.all([getMenuItemIngredients(rid, iid), listStockItems(rid), listPrepItems(rid)]);
                  setIngredients(nextIngredients); ingredientsCurrent.current = nextIngredients;
                  setStockItems(stock); setPrepItems(prep);
                }}
              />
              </div>
            )}

            {/* Cost is fully derived from the recipe above + price, so it lives
                here as a readout under the recipe instead of a separate tab. */}
            {visitedTabs.has('recipe') && item && (
              <div hidden={activeTab !== 'recipe'} className="mt-[var(--s-6)]">
                <MenuItemTabCost
                  rid={rid}
                  item={item}
                  ingredients={ingredients}
                  itemOptionOverrides={itemOptionOverrides}
                  vatRate={vatRate}
                  price={effectivePrice}
                  onChangesApplied={refreshCostData}
                  onSimulationStateChange={setSimulationState}
                  onNavigate={navigateAway}
                  collapsible
                />
              </div>
            )}

            {/* ── Tab: Stock & disponibilité ───────────────────── */}
            {visitedTabs.has('availability') && item && (
              <div hidden={activeTab !== 'availability'}>
              <ItemAvailabilityPanel
                ref={availabilityRef}
                rid={rid}
                itemId={iid}
                item={item}
                defaultStockUnit={defaultStockUnit}
              />
              </div>
            )}
          </fieldset>
        </div>
      </MenuItemShell>

      <ConfirmDialog open={leaveTarget !== null} onOpenChange={open => { if (!open) setLeaveTarget(null); }} title={t('discardUnsavedChanges')} description={t('itemExistingLeaveHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={() => { if (leaveTarget) router.push(leaveTarget); }} />

      {modifierModalOpen && <Modal title={t('modifiers')} subtitle={t('itemModifiersImmediate')} initialFocusRef={modifierSearch} onClose={() => { if (!modifierLock.current) setModifierModalOpen(false); }} footer={<Button variant="primary" disabled={modifierBusy} onClick={() => setModifierModalOpen(false)}>{t('done')}</Button>}>
        <fieldset disabled={modifierBusy} className="min-w-0 space-y-4"><label className="block"><span className="sr-only">{t('search')}</span><input ref={modifierSearch} className="input" value={modifierQuery} onChange={event => setModifierQuery(event.target.value)} placeholder={t('search')} /></label>
          {allModifierSets.filter(set => set.name.toLocaleLowerCase().includes(modifierQuery.toLocaleLowerCase().trim())).map(set => <label key={set.id} className="flex min-h-16 cursor-pointer items-center gap-3 border-b border-[var(--line)] p-3 text-sm hover:bg-[var(--surface-2)]"><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{set.name}</span><span className="text-xs text-fg-secondary">{set.modifiers?.map(modifier=>modifier.name).join(', ')}</span></span><input type="checkbox" aria-label={set.name} checked={item.modifier_sets?.some(attached => attached.id===set.id) ?? false} onChange={() => void toggleModifierSet(set.id,item.modifier_sets?.some(attached=>attached.id===set.id) ?? false)} className="size-5 shrink-0 accent-[var(--brand-500)]" /></label>)}
          {!allModifierSets.some(set => set.name.toLocaleLowerCase().includes(modifierQuery.toLocaleLowerCase().trim())) && <p className="py-6 text-center text-sm text-fg-secondary">{t('noResults')}</p>}
        </fieldset>{modifierError && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{modifierError}</p>}
      </Modal>}
      {ingredientRemoval !== null && <Modal title={t('itemRemoveIngredient')} onClose={() => { if (!ingredientRemovalLock.current) setIngredientRemoval(null); }} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={ingredientRemovalBusy} onClick={() => setIngredientRemoval(null)}>{t('cancel')}</Button><Button variant="danger" disabled={ingredientRemovalBusy} onClick={() => void removeIngredient()}>{t(ingredientRemovalBusy ? 'saving' : 'remove')}</Button></div>}><p className="text-sm text-fg-secondary">{t('itemRemoveIngredientHint')}</p>{ingredientRemovalError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{ingredientRemovalError}</p>}</Modal>}
      {modifierRemoval && <Modal title={t(modifierRemoval.kind==='set' ? 'itemDetachModifierSet' : 'deleteThisModifier')} onClose={() => { if (!modifierLock.current) setModifierRemoval(null); }} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={modifierBusy} onClick={() => setModifierRemoval(null)}>{t('cancel')}</Button><Button variant="danger" disabled={modifierBusy} onClick={() => void removeModifier()}>{t(modifierBusy ? 'saving' : modifierRemoval.kind==='set' ? 'detach' : 'delete')}</Button></div>}>
        <p className="text-sm text-fg-secondary">{t(modifierRemoval.kind==='set' ? 'itemDetachModifierSetHint' : 'itemModifiersImmediate')}</p>{modifierError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{modifierError}</p>}
      </Modal>}

      {/* ── Type-switch confirmation modal ─────────────────────── */}
      {pendingType && (
        <TypeSwitchConfirm
          fromType={itemType}
          toType={pendingType}
          loss={lossSummary}
          existingItem
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
            railItemsById,
          )}
          onClose={() => setSavingsModalOpen(false)}
        />
      )}
    </>
  );
}
