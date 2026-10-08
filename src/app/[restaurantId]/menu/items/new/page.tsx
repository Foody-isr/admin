'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup,
  listModifierSets, attachModifierSetToItems,
  listOptionSets,
  syncItemVariants,
  getRestaurantSettings,
  MenuCategory, Menu, MenuItem, ModifierSet, OptionSet,
  ItemType, PricingMode, MenuItemCustomerFacts, normalizeMenuItemCustomerFacts,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  loadItemDraft,
  saveItemDraft,
  clearItemDraft,
  isMeaningfulDraft,
  type ItemDraft,
} from '@/lib/itemDraft';
import type { MenuItemSection } from '@/components/menu-item/TabBar';
import MenuItemDistribution from '@/components/menu-item/MenuItemDistribution';
import MenuItemPhoto from '@/components/menu-item/MenuItemPhoto';
import MenuItemEditorForm from '@/components/menu-item/MenuItemEditorForm';
import MenuItemShell from '@/components/menu-item/MenuItemShell';
import CompositionTab from '@/components/menu-item/combo/CompositionTab';
import TypeSwitchConfirm, { TypeSwitchLossSummary } from '@/components/menu-item/combo/TypeSwitchConfirm';
import ComboSavingsBreakdownModal from '@/components/menu-item/combo/ComboSavingsBreakdownModal';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import { toComboStepInputs } from '@/components/menu-item/combo/serialize';
import { computeComboSavingsBreakdown } from '@/components/menu-item/combo/pricing';
import { Button, ConfirmDialog, FullScreenEditor } from '@/components/ds';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import VariantsEditor, {
  VariantGroupState,
  toVariantSyncPayload,
  hasMeaningfulVariants,
} from '@/components/menu-item/VariantsEditor';
import { History } from 'lucide-react';
import { PlusIcon } from 'lucide-react';

/** Resets draft and request state when the active restaurant changes. */
export default function NewItemPage() {
  const { restaurantId } = useParams();
  return <NewItemEditor key={String(restaurantId)} />;
}

function NewItemEditor() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const defaultCatId = searchParams.get('category') ? Number(searchParams.get('category')) : 0;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [leave, setLeave] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const progress = useRef({ id: 0, imageUrl: '', imageSaved: false, groups: new Set<number>(), modifiers: new Set<number>(), variants: false });
  const busy = useRef(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);
  const modifierSearch = useRef<HTMLInputElement>(null);
  const [modifierQuery, setModifierQuery] = useState('');

  const [initialSection, setInitialSection] = useState<MenuItemSection>('details');

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [pricingMode, setPricingMode] = useState<PricingMode>('standard');
  const [pricePerKg, setPricePerKg] = useState<number>(0);
  const [estimatedWeightGrams, setEstimatedWeightGrams] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [customerFacts, setCustomerFacts] = useState<MenuItemCustomerFacts>(() => normalizeMenuItemCustomerFacts());
  const [portion, setPortion] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCatId);
  const [isActive, setIsActive] = useState(true);
  const [allowNotes, setAllowNotes] = useState(true);
  const [comboAllowQuantity, setComboAllowQuantity] = useState(true);
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
    portion,
    categoryId,
    isActive,
    itemType,
    comboSteps,
    selectedGroupIds: Array.from(selectedGroupIds),
    selectedModifierSetIds: Array.from(selectedModifierSetIds),
    variantGroups,
    activeTab: initialSection, pricingMode, pricePerKg, estimatedWeightGrams, aiContext, customerFacts, allowNotes, comboAllowQuantity,
  }), [name, price, description, portion, categoryId, isActive, itemType, comboSteps, selectedGroupIds, selectedModifierSetIds, variantGroups, initialSection, pricingMode, pricePerKg, estimatedWeightGrams, aiContext, customerFacts, allowNotes, comboAllowQuantity]);

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
    if (createdId) { clearItemDraft(rid); return; }
    if (!autosaveEnabled || !canEdit) return;
    if (!Number.isFinite(rid) || rid <= 0) return;
    setDraftStorageError(!saveItemDraft(rid, draftSnapshot));
  }, [autosaveEnabled, rid, draftSnapshot, createdId, canEdit]);

  const handleResumeDraft = () => {
    if (!bannerDraft) return;
    setPricingMode(bannerDraft.pricingMode ?? 'standard');
    setPricePerKg(bannerDraft.pricePerKg ?? 0);
    setEstimatedWeightGrams(bannerDraft.estimatedWeightGrams ?? 0);
    setAiContext(bannerDraft.aiContext ?? '');
    setCustomerFacts(normalizeMenuItemCustomerFacts(bannerDraft.customerFacts));
    setAllowNotes(bannerDraft.allowNotes ?? true);
    setComboAllowQuantity(bannerDraft.comboAllowQuantity ?? true);
    setName(bannerDraft.name);
    setPrice(bannerDraft.price);
    setDescription(bannerDraft.description);
    setPortion(bannerDraft.portion ?? '');
    setCategoryId(bannerDraft.categoryId);
    setIsActive(bannerDraft.isActive);
    setItemType(bannerDraft.itemType);
    setComboSteps(bannerDraft.comboSteps);
    setSelectedGroupIds(new Set(bannerDraft.selectedGroupIds));
    setSelectedModifierSetIds(new Set(bannerDraft.selectedModifierSetIds));
    setVariantGroups(bannerDraft.variantGroups);
    // Drafts persisted before the editor was simplified may carry a removed
    // tab id ('modifiers' / 'cost'); fall back to the Article tab in that case.
    const validTabs: MenuItemSection[] = ['details', 'composition', 'recipe', 'availability'];
    setInitialSection(validTabs.includes(bannerDraft.activeTab) ? bannerDraft.activeTab : 'details');
    setBannerDraft(null);
    setAutosaveEnabled(true);
  };

  const handleDiscardDraft = () => {
    clearItemDraft(rid);
    setBannerDraft(null);
    setAutosaveEnabled(true);
  };

  const load = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true); setLoadError('');
    try {
      const [cats, loadedMenus, modifiers, options, settings] = await Promise.all([
        getAllCategories(rid), listMenus(rid), listModifierSets(rid), listOptionSets(rid), getRestaurantSettings(rid),
      ]);
      if (!guard.isCurrent(token)) return;
      setCategories(cats);
      setCategoryId(current => current || cats[0]?.id || 0);
      setMenus(loadedMenus); setAllModifierSets(modifiers); setAllOptionSets(options);
      setVatRate(settings.vat_rate ?? 18);
    } catch (cause) { if (guard.isCurrent(token)) setLoadError(cause instanceof Error ? cause.message : 'libraryOperationFailed'); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid]);
  useEffect(() => { const guard = requestGuard.current; void load(); return () => guard.invalidate(); }, [load]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  // Price single-source-of-truth — see the edit page for rationale. When an
  // article has meaningful sizes, the Details base-price field hides and the
  // first size's price becomes the saved base price.
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

  // A by-weight item is priced per kg (not a flat base), so its validity keys
  // off price_per_kg rather than the base price.
  const isByWeight = itemType !== 'combo' && pricingMode === 'by_weight';
  const priceOk = isByWeight ? pricePerKg > 0 : effectivePrice > 0;

  const handleSave = async (continueTo?: 'recipe' | 'availability') => {
    if (!canEdit || busy.current || loading || loadError || !name.trim() || !priceOk) return;
    busy.current = true; setSaving(true); setSaveError('');
    try {
      const createPayload: Parameters<typeof createMenuItem>[1] = {
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
        category_id: categoryId || categories[0]?.id,
      };
      if (itemType === 'combo' && comboSteps.length > 0) {
        (createPayload as Record<string, unknown>).combo_steps = toComboStepInputs(comboSteps);
      }
      const completed = progress.current;
      if (!completed.id) {
        const item = await createMenuItem(rid, createPayload);
        completed.id = item.id;
        setCreatedId(item.id);
      }
      if (pendingImage && !completed.imageSaved) {
        if (!completed.imageUrl) completed.imageUrl = await uploadMenuItemImage(rid, completed.id, pendingImage);
        await updateMenuItem(rid, completed.id, { image_url: completed.imageUrl });
        completed.imageSaved = true;
      }
      for (const groupId of Array.from(selectedGroupIds)) {
        if (completed.groups.has(groupId)) continue;
        await addItemsToGroup(rid, groupId, [completed.id]);
        completed.groups.add(groupId);
      }
      for (const setId of Array.from(selectedModifierSetIds)) {
        if (completed.modifiers.has(setId)) continue;
        await attachModifierSetToItems(rid, setId, [completed.id]);
        completed.modifiers.add(setId);
      }
      if (hasMeaningfulVariants(variantGroups) && !completed.variants) {
        await syncItemVariants(rid, completed.id, { groups: toVariantSyncPayload(variantGroups) });
        completed.variants = true;
      }
      clearItemDraft(rid);
      router.push(continueTo ? `/${rid}/menu/items/${progress.current.id}?tab=${continueTo}` : `/${rid}/menu/items`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('libraryOperationFailed'));
    } finally {
      busy.current = false; setSaving(false);
    }
  };

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
      // Switch to Article if the active tab is no longer in the new tab set.
      if (next === 'combo' && initialSection === 'recipe') {
        setInitialSection('details');
      } else if (next !== 'combo' && initialSection === 'composition') {
        setInitialSection('details');
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
    if (pendingType === 'combo' && initialSection === 'recipe') {
      setInitialSection('details');
    } else if (pendingType !== 'combo' && initialSection === 'composition') {
      setInitialSection('details');
    }
    setPendingType(null);
  };

  const handleFileSelect = (file: File) => {
    if (!canEdit || busy.current || progress.current.id) return;
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const hasDraft = isMeaningfulDraft(draftSnapshot) || !!pendingImage || !!aiContext || pricingMode !== 'standard' || !allowNotes || !comboAllowQuantity || JSON.stringify(customerFacts) !== JSON.stringify(normalizeMenuItemCustomerFacts());
  const goBack = () => { if (busy.current) return; if (hasDraft) setLeave(true); else router.push(`/${rid}/menu/items`); };
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (hasDraft) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [hasDraft]);



  // Compute combo savings for the rail. The same pure helper backs the
  // PricingCard inside CompositionTab, so the two stay in sync. Hooks must
  // run unconditionally — declared here, *above* the loading early return.
  const comboItemsById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const cat of categories) for (const it of cat.items ?? []) m.set(it.id, it);
    return m;
  }, [categories]);

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

  if (loading || loadError) return <FullScreenEditor open onOpenChange={open => { if (!open) router.push(`/${rid}/menu/items`); }} title={t('createItem')} showCancel={false}>
    {loading ? <p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p> : <div role="alert" className="mx-auto max-w-3xl space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[var(--danger-500)]">{t(loadError)}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>}
  </FullScreenEditor>;

  const rail = (
    <MenuItemDistribution
      categories={categories}
      categoryId={categoryId}
      setCategoryId={setCategoryId}
      menus={menus}
      selectedGroupIds={selectedGroupIds}
      setSelectedGroupIds={setSelectedGroupIds}
      isActive={isActive}
      setIsActive={setIsActive}
      disabled={saving || !!createdId}
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
          const f = e.target.files?.[0];
          if (f) handleFileSelect(f);
        }}
      />

      <MenuItemShell
        title={t('createItem')}
        onClose={goBack}
        onSave={canEdit ? () => void handleSave() : () => {}}
        saving={saving}
        saveDisabled={!canEdit || !name.trim() || !priceOk}
        sidebar={rail}
        initialSection={initialSection}
        dirty={isMeaningfulDraft(draftSnapshot) || !!pendingImage}
      >
        <div className="flex min-w-0 flex-col ">
          {draftStorageError && (
            <p
              role="status"
              className="shrink-0 border-b border-[var(--line)] bg-[var(--warning-50)] p-4 text-sm text-[var(--fg)]"
            >
              {t('itemDraftStorageUnavailable')}
            </p>
          )}
          {saveError && (
            <div
              role="alert"
              className="shrink-0 border-b border-[var(--danger-200)] bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]"
            >
              <p>{saveError}</p>
              {createdId && <p className="mt-2">{t('itemCreationPartial')}</p>}
            </div>
          )}
          {bannerDraft && (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]">
              <History className="size-5 shrink-0" />
              <div className="min-w-0 flex-[1_1_180px]">
                <h2 className="text-sm font-semibold">
                  {t('draftBannerTitle')}
                </h2>
                <p className="break-words text-xs">
                  {bannerDraft.name.trim() || t('draftBannerUnnamed')} ·{' '}
                  {draftSavedAgo}
                </p>
              </div>
              <Button variant="ghost" onClick={handleDiscardDraft}>
                {t('discard')}
              </Button>
              <Button variant="secondary" onClick={handleResumeDraft}>
                {t('resumeDraft')}
              </Button>
            </div>
          )}

          <fieldset
            disabled={!canEdit || saving || !!createdId}
            className="min-w-0"
          >
            <MenuItemEditorForm
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
              aiContext={aiContext}
              setAiContext={setAiContext}
              portion={portion}
              setPortion={setPortion}
              allowNotes={allowNotes}
              setAllowNotes={setAllowNotes}
              vatRate={vatRate}
              itemType={itemType}
              onTypeChange={requestTypeChange}
              // Only hide the base-price field once the first size carries a
              // real price; otherwise the owner would have nowhere to set a
              // price (the first size inherits the base when left at 0).
              hideBasePrice={meaningfulVariants && firstVariantPrice > 0}
              photo={
                <MenuItemPhoto
                  imageUrl={imagePreview || undefined}
                  name={name}
                  onImageClick={
                    canEdit && !saving && !createdId
                      ? () => fileInputRef.current?.click()
                      : undefined
                  }
                />
              }
              pricingContent={
                itemType !== 'combo' && !isByWeight ? (
                  <div className="border-t border-[var(--line)] pt-5">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="hidden" />
                      <h3 className="text-base font-semibold text-fg-primary">
                        {t('variants')}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <p className="text-sm text-fg-secondary">
                        {t('variantsDescription')}
                      </p>
                      <VariantsEditor
                        groups={variantGroups}
                        onChange={setVariantGroups}
                        allOptionSets={allOptionSets}
                        itemBasePrice={effectivePrice}
                      />
                    </div>
                  </div>
                ) : undefined
              }
              personalizationContent={
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="hidden" />
                    <h3 className="text-base font-semibold text-fg-primary">
                      {t('modifiers')}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-fg-secondary">
                        {t('modifiersDescription')}
                      </p>
                      {canEdit && (
                        <button
                          onClick={() => setModifierModalOpen(true)}
                          className="btn-secondary min-h-11 px-3"
                        >
                          <PlusIcon className="w-4 h-4" />
                          {t('add')}
                        </button>
                      )}
                    </div>
                    {selectedModifierSetIds.size > 0 && (
                      <div className="rounded-r-lg border border-[var(--line)] overflow-hidden">
                        {allModifierSets
                          .filter((ms) => selectedModifierSetIds.has(ms.id))
                          .map((ms) => (
                            <div
                              key={ms.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--line)] last:border-b-0 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
                            >
                              <div>
                                <span className="text-sm font-medium text-fg-primary">
                                  {ms.name}
                                </span>
                                <span className="text-xs text-fg-secondary ms-2">
                                  {(ms.modifiers ?? [])
                                    .map((m) => m.name)
                                    .join(', ')}
                                </span>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => {
                                    const n = new Set(selectedModifierSetIds);
                                    n.delete(ms.id);
                                    setSelectedModifierSetIds(n);
                                  }}
                                  className="min-h-11 rounded-r-md px-3 text-sm font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                                >
                                  {t('remove')}
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              }
              compositionContent={
                itemType === 'combo' ? (
                  <CompositionTab
                    comboName={name}
                    basePrice={price}
                    steps={comboSteps}
                    onStepsChange={setComboSteps}
                    categories={categories}
                    menus={menus}
                    restaurantId={rid}
                    onShowSavingsDetail={() => setSavingsModalOpen(true)}
                    comboAllowQuantity={comboAllowQuantity}
                    onComboAllowQuantityChange={setComboAllowQuantity}
                  />
                ) : undefined
              }
              availabilityContent={
                <div className="space-y-3">
                  <p className="text-sm text-[var(--fg-muted)]">
                    {t('saveItemFirst')}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={!canEdit || !name.trim() || !priceOk}
                    onClick={() => void handleSave('availability')}
                  >
                    {t('itemSaveAndConfigure')}
                  </Button>
                </div>
              }
              recipeContent={
                <>
                  <p className="text-sm text-[var(--fg-muted)]">
                    {t('saveItemFirst')}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={!canEdit || !name.trim() || !priceOk}
                    onClick={() => void handleSave('recipe')}
                  >
                    {t('itemSaveAndConfigure')}
                  </Button>
                </>
              }
            />
          </fieldset>
        </div>
      </MenuItemShell>

      {modifierModalOpen && (
        <Modal
          title={t('modifiers')}
          subtitle={t('itemModifierDraftHint')}
          initialFocusRef={modifierSearch}
          onClose={() => setModifierModalOpen(false)}
          footer={
            <Button
              variant="primary"
              onClick={() => setModifierModalOpen(false)}
            >
              {t('done')}
            </Button>
          }
        >
          <label className="mb-4 block">
            <span className="sr-only">{t('search')}</span>
            <input
              ref={modifierSearch}
              className="input"
              value={modifierQuery}
              onChange={(event) => setModifierQuery(event.target.value)}
              placeholder={t('search')}
            />
          </label>
          {allModifierSets
            .filter((set) =>
              set.name
                .toLocaleLowerCase()
                .includes(modifierQuery.toLocaleLowerCase().trim()),
            )
            .map((set) => (
              <label
                key={set.id}
                className="flex min-h-16 cursor-pointer items-center gap-3 border-b border-[var(--line)] p-3 hover:bg-[var(--surface-2)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">
                    {set.name}
                  </span>
                  <span className="text-xs text-fg-secondary">
                    {(set.modifiers ?? [])
                      .map((modifier) => modifier.name)
                      .join(', ')}
                  </span>
                </span>
                <input
                  type="checkbox"
                  aria-label={set.name}
                  checked={selectedModifierSetIds.has(set.id)}
                  onChange={() =>
                    setSelectedModifierSetIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(set.id)) next.delete(set.id);
                      else next.add(set.id);
                      return next;
                    })
                  }
                  className="size-5 shrink-0 accent-[var(--brand-500)]"
                />
              </label>
            ))}
          {!allModifierSets.some((set) =>
            set.name
              .toLocaleLowerCase()
              .includes(modifierQuery.toLocaleLowerCase().trim()),
          ) && (
            <p className="py-8 text-center text-sm text-fg-secondary">
              {t('noResults')}
            </p>
          )}
        </Modal>
      )}
      <ConfirmDialog
        open={leave}
        onOpenChange={setLeave}
        title={t('itemLeaveEditor')}
        description={
          createdId ? t('itemCreationPartialLeave') : t('itemDraftLeaveHint')
        }
        confirmLabel={t('close')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          if (createdId) clearItemDraft(rid);
          router.push(`/${rid}/menu/items`);
        }}
      />

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
            comboItemsById,
          )}
          onClose={() => setSavingsModalOpen(false)}
        />
      )}
    </>
  );
}
