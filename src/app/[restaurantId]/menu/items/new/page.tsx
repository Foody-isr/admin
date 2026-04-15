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
import FormModal from '@/components/FormModal';
import FormSection from '@/components/FormSection';
import StatusPill from '@/components/StatusPill';
import SearchableListField from '@/components/SearchableListField';
import {
  XMarkIcon, ChevronDownIcon, ChevronUpIcon, ArrowUpTrayIcon, MagnifyingGlassIcon,
  PlusIcon, TrashIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

/* ── Combo step draft (local, submitted on Save) ────────────────────── */

interface ComboStepDraft {
  key: string;
  name: string;
  min_picks: number;
  max_picks: number;
  items: { menu_item_id: number; price_delta: number; item_name?: string; variant_id?: number; pick_key?: string }[];
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
  const [portionSize, setPortionSize] = useState(0);
  const [portionSizeUnit, setPortionSizeUnit] = useState('g');
  const [recipeYieldValue, setRecipeYieldValue] = useState(0);
  const [recipeYieldUnit, setRecipeYieldUnit] = useState('kg');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo steps (only used when itemType === 'combo')
  const [comboSteps, setComboSteps] = useState<ComboStepDraft[]>([]);

  // Menus / Cartes state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());

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
        portion_size: portionSize,
        portion_size_unit: portionSizeUnit,
        ...(recipeYieldUnit === 'unit' && recipeYieldValue === 1 ? { recipe_yield: 1, recipe_yield_unit: 'unit' } : {}),
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
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name, category_id: c.id }))
  );

  const removeComboStep = (key: string) => setComboSteps((prev) => prev.filter((s) => s.key !== key));

  // ── Add Options Modal (Square-style multi-step) ──
  // Selection key format: "item:123" for plain items, "variant:123:456" for specific variants
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

  const openAddOptionsModal = () => {
    resetModal();
    setEditingStepKey(null);
    setComboModalOpen(true);
  };

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

  const sidebar = (
    <>
      <FormSection>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-fg-primary">{t('status')}</h3>
          <StatusPill
            active={isActive}
            onToggle={() => setIsActive(!isActive)}
            activeLabel={t('available')}
            inactiveLabel={t('unavailable')}
          />
        </div>
      </FormSection>

      <FormSection title={t('categories')}>
        <SearchableListField
          mode="single"
          placeholder={t('addToCategories')}
          options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          value={categoryId ? String(categoryId) : ''}
          onChange={(v) => setCategoryId(v ? Number(v) : 0)}
        />
      </FormSection>

      <FormSection title={t('menus')}>
        <p className="text-xs text-fg-tertiary">{t('cartesDescription')}</p>
        <SearchableListField
          mode="multi"
          placeholder={t('addToMenus')}
          emptyLabel={t('noMenusAvailable') || 'No menus available'}
          options={menus.map((m) => ({ value: String(m.id), label: m.name }))}
          values={Array.from(selectedMenuIds).map(String)}
          onChange={(vs) => setSelectedMenuIds(new Set(vs.map(Number)))}
        />
      </FormSection>
    </>
  );

  return (
    <>
      <FormModal
        title={t('createItem')}
        onClose={goBack}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!name.trim() || !price}
        sidebar={sidebar}
      >
            {/* Item Type Selector */}
            <div className="border border-[var(--divider)] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-fg-tertiary">{t('itemType')}</span>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
                className="input flex-1 text-base border-0 py-0 bg-transparent"
              >
                <option value="food_and_beverage">{t('foodAndBeverage')}</option>
                <option value="combo">{t('combo')}</option>
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
            )}

            {/* ── Add Options Modal (Square-style multi-step) ────── */}
            {comboModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setComboModalOpen(false)}>
                <div className="bg-[var(--surface-subtle)] border border-[var(--divider)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}>

                  {/* ─── Step 1: Select Items / Categories ─── */}
                  {modalStep === 'select' && (
                    <>
                      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                        <button onClick={() => setComboModalOpen(false)}
                          className="w-9 h-9 rounded-full border border-[var(--divider)] hover:bg-[var(--surface)] transition-colors flex items-center justify-center">
                          <XMarkIcon className="w-4 h-4 text-fg-primary" />
                        </button>
                        <button
                          onClick={() => { if (modalPicks.size > 0) setModalStep('pricing'); }}
                          disabled={modalPicks.size === 0}
                          className="btn-primary text-sm px-5 py-2 rounded-lg disabled:opacity-40"
                        >
                          {t('next')}
                        </button>
                      </div>
                      <div className="px-5 pb-4 shrink-0">
                        <h2 className="text-lg font-bold text-fg-primary">{t('addOptions')}</h2>
                        <p className="text-sm text-fg-tertiary mt-1">{t('addOptionsDesc')}</p>
                      </div>

                      {/* Tabs: Items | Categories */}
                      <div className="flex mx-5 rounded-lg overflow-hidden mb-4 shrink-0 border border-[var(--divider)]">
                        <button
                          onClick={() => { setModalTab('items'); setModalSearch(''); }}
                          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                            modalTab === 'items'
                              ? 'bg-[var(--surface)] text-fg-primary border-b-2 border-brand-500'
                              : 'text-fg-tertiary hover:text-fg-secondary'
                          }`}
                        >
                          {t('items')}
                        </button>
                        <button
                          onClick={() => { setModalTab('categories'); setModalSearch(''); }}
                          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                            modalTab === 'categories'
                              ? 'bg-[var(--surface)] text-fg-primary border-b-2 border-brand-500'
                              : 'text-fg-tertiary hover:text-fg-secondary'
                          }`}
                        >
                          {t('categories')}
                        </button>
                      </div>

                      {modalTab === 'items' ? (
                        <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                          {/* Search + category filter */}
                          <div className="flex gap-2 mb-3">
                            <div className="relative flex-1">
                              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                              <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)}
                                placeholder={t('searchItems')}
                                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                            </div>
                            <select value={modalCategoryFilter ?? ''} onChange={(e) => setModalCategoryFilter(e.target.value ? Number(e.target.value) : null)}
                              className="rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500">
                              <option value="">{t('showAllCategories')}</option>
                              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>

                          {/* Column headers */}
                          <div className="flex items-center text-xs font-semibold text-fg-tertiary uppercase tracking-wider px-1 mb-1 pb-2 border-b border-[var(--divider)]">
                            <span className="w-8" />
                            <span className="flex-1">{t('name')}</span>
                            <span className="w-20 text-right">{t('price')}</span>
                          </div>

                          {/* Item rows — with expandable variants */}
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
                                      {/* Parent item row — expand/collapse toggle */}
                                      <div
                                        className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm"
                                        onClick={() => toggleExpand(item.id)}
                                      >
                                        <button className="w-5 h-5 flex items-center justify-center shrink-0 text-fg-tertiary">
                                          {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                        </button>
                                        <span className="flex-1 text-sm font-medium text-fg-primary">
                                          {item.name}
                                          <span className="text-xs text-fg-tertiary ml-2">{variants.length} {t('variants').toLowerCase()}</span>
                                        </span>
                                        <span className="w-20 text-right text-sm text-fg-tertiary">-</span>
                                      </div>
                                      {/* Variant child rows */}
                                      {isExpanded && variants.map((v) => {
                                        const vKey = `variant:${item.id}:${v.id}`;
                                        return (
                                          <label key={vKey} className="flex items-center gap-3 pl-8 pr-1 py-2.5 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
                                            <input type="checkbox"
                                              checked={modalPicks.has(vKey)}
                                              onChange={() => togglePick(vKey, {
                                                menuItemId: item.id,
                                                variantId: v.id,
                                                name: `${item.name} - ${v.name}`,
                                                price: v.price,
                                              })}
                                              className="w-4 h-4 rounded border-2 border-[var(--divider)] accent-brand-500 shrink-0" />
                                            <span className="flex-1 text-sm text-fg-primary">{v.name}</span>
                                            <span className="w-20 text-right text-sm text-fg-secondary">₪{v.price.toFixed(2)}</span>
                                          </label>
                                        );
                                      })}
                                    </>
                                  ) : (
                                    /* Simple item — no variants */
                                    <label className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
                                      <input type="checkbox"
                                        checked={modalPicks.has(itemKey)}
                                        onChange={() => togglePick(itemKey, {
                                          menuItemId: item.id,
                                          name: item.name,
                                          price: item.price,
                                        })}
                                        className="w-4 h-4 rounded border-2 border-[var(--divider)] accent-brand-500 shrink-0" />
                                      <span className="flex-1 text-sm text-fg-primary">{item.name}</span>
                                      <span className="w-20 text-right text-sm text-fg-secondary">₪{item.price.toFixed(2)}</span>
                                    </label>
                                  )}
                                </div>
                              );
                            })}

                          {/* Selection count footer */}
                          {modalPicks.size > 0 && (
                            <div className="flex items-center gap-3 pt-3 text-sm">
                              <span className="text-brand-500 font-medium">{modalPicks.size} {t('selected')}</span>
                              <button onClick={() => setModalPicks(new Map())} className="text-brand-500 font-medium hover:underline">{t('deselectAll') || 'Deselect all'}</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Categories tab */
                        <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                          <div className="relative mb-3">
                            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
                            <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)}
                              placeholder={t('searchCategories')}
                              className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                          </div>
                          <div className="flex items-center text-xs font-semibold text-fg-tertiary uppercase tracking-wider px-1 mb-1 pb-2 border-b border-[var(--divider)]">
                            <span className="w-8" />
                            <span className="flex-1">{t('name')}</span>
                            <span className="w-16 text-right">{t('items')}</span>
                          </div>
                          {categories
                            .filter((c) => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()))
                            .map((cat) => (
                              <label key={cat.id} className="flex items-center gap-3 px-1 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface)] transition-colors rounded-sm">
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
                                  className="w-4 h-4 accent-brand-500 shrink-0" />
                                <span className="flex-1 text-sm text-fg-primary">{cat.name}</span>
                                <span className="w-16 text-right text-sm text-fg-secondary">{(cat.items ?? []).length}</span>
                              </label>
                            ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ─── Step 2: Discounts / Upcharges ─── */}
                  {modalStep === 'pricing' && (
                    <>
                      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                        <button onClick={() => setModalStep('select')}
                          className="w-9 h-9 rounded-full border border-[var(--divider)] hover:bg-[var(--surface)] transition-colors flex items-center justify-center">
                          <ArrowLeftIcon className="w-4 h-4 text-fg-primary" />
                        </button>
                        <div className="flex gap-2">
                          <button onClick={() => setModalStep('configure')}
                            className="text-sm px-4 py-2 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface)] transition-colors">{t('skip')}</button>
                          <button onClick={() => setModalStep('configure')}
                            className="btn-primary text-sm px-5 py-2 rounded-lg">{t('next')}</button>
                        </div>
                      </div>
                      <div className="px-5 pb-4 shrink-0">
                        <h2 className="text-lg font-bold text-fg-primary">{t('addDiscountsOrUpcharges')}</h2>
                        <p className="text-sm text-fg-tertiary mt-1">{t('addDiscountsDesc')}</p>
                      </div>
                      <div className="px-5 flex-1 overflow-y-auto pb-5 min-h-0">
                        <div className="flex items-center text-xs font-semibold text-fg-tertiary uppercase tracking-wider px-1 mb-2 pb-2 border-b border-[var(--divider)]">
                          <span className="flex-1">{t('name')}</span>
                          <span className="w-28 text-right">{t('discountOrUpcharge')}</span>
                        </div>
                        {[...modalPicksList]
                          .sort((a, b) => b.price - a.price)
                          .map((pick) => (
                            <div key={pick.key} className="flex items-center border-b border-[var(--divider)] py-3 px-1">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-fg-primary">{pick.name}</div>
                                <div className="text-xs text-fg-tertiary">₪{pick.price.toFixed(2)}</div>
                              </div>
                              <div className="w-28">
                                <input type="number" step="0.01"
                                  value={modalItemDeltas.get(pick.key) ?? 0}
                                  onChange={(e) => setModalItemDeltas((prev) => {
                                    const next = new Map(prev);
                                    next.set(pick.key, parseFloat(e.target.value) || 0);
                                    return next;
                                  })}
                                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary text-sm px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary"
                                  placeholder="₪0.00" />
                              </div>
                            </div>
                          ))}
                      </div>
                    </>
                  )}

                  {/* ─── Step 3: Name & Configure ─── */}
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
                          <input value={modalGroupName} onChange={(e) => setModalGroupName(e.target.value)}
                            placeholder={t('comboNamePlaceholder')}
                            className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-fg-tertiary" />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-fg-secondary mb-1.5">{t('howManySelections')}</label>
                          <input type="number" min={0} value={modalRequired}
                            onChange={(e) => setModalRequired(parseInt(e.target.value) || 0)}
                            className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-fg-secondary mb-1.5">{t('setDefaultOption')}</label>
                          <select value={modalDefaultKey} onChange={(e) => setModalDefaultKey(e.target.value)}
                            className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-fg-primary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500">
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
                    <div className="space-y-3 mt-3">
                      {variantGroups.map((vg) => (
                        <div key={vg.key} className="rounded-xl border border-[var(--divider)] overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-subtle)]">
                            <span className="text-sm font-bold text-fg-primary">{vg.title || t('variantGroupTitle')}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => setVariantModalOpen(true)}
                                className="text-sm text-brand-600 hover:underline font-medium">{t('edit')}</button>
                              <button onClick={() => removeVariantGroup(vg.key)}
                                className="text-sm text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                                {t('remove')}
                              </button>
                            </div>
                          </div>
                          {vg.variants.filter((v) => v.name.trim()).map((v) => (
                            <div key={v.key} className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--divider)]">
                              <span className="text-sm text-fg-primary">{v.name}</span>
                              <span className="text-sm font-semibold text-fg-primary">₪{(parseFloat(v.price) || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-[var(--divider)]" />
              </>
            )}

            {/* ── Stock Management ── */}
            <div className="h-1 bg-[var(--divider)] rounded-full" />
            {(() => {
              const isPerItem = recipeYieldUnit === 'unit' && recipeYieldValue === 1;
              const hasVariants = variantGroups.some(g => g.variants.length > 0) || selectedOptionSetIds.size > 0;
              return (
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-fg-primary">{t('stockManagement')}</h3>

                  {/* 1. Recipe Type — comes first to drive the rest */}
                  <div>
                    <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('recipeType')}</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecipeYieldValue(1);
                          setRecipeYieldUnit('unit');
                          setPortionSize(1);
                          setPortionSizeUnit('unit');
                        }}
                        className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                          isPerItem ? 'border-brand bg-brand/5' : 'border-[var(--divider)] hover:border-fg-secondary/30'
                        }`}
                      >
                        <p className="text-sm font-semibold text-fg-primary">{t('perItemRecipe')}</p>
                        <p className="text-[11px] text-fg-tertiary mt-0.5">{t('perItemRecipeDesc')}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isPerItem) {
                            setRecipeYieldValue(0);
                            setRecipeYieldUnit('kg');
                            setPortionSize(0);
                            setPortionSizeUnit('g');
                          }
                        }}
                        className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                          !isPerItem ? 'border-brand bg-brand/5' : 'border-[var(--divider)] hover:border-fg-secondary/30'
                        }`}
                      >
                        <p className="text-sm font-semibold text-fg-primary">{t('bulkRecipe')}</p>
                        <p className="text-[11px] text-fg-tertiary mt-0.5">{t('bulkRecipeDesc')}</p>
                      </button>
                    </div>
                  </div>

                  {/* 2. Portion — auto for per-item, disabled when variants exist, editable for bulk */}
                  <div>
                    <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('defaultPortion')}</label>
                    {isPerItem ? (
                      <p className="text-sm text-fg-secondary py-1.5">{t('portionAutoUnit')}</p>
                    ) : hasVariants ? (
                      <p className="text-sm text-fg-secondary py-1.5 opacity-60">{t('portionFromVariants')}</p>
                    ) : (
                      <>
                        <p className="text-xs text-fg-tertiary mb-2">{t('portionBulkDesc')}</p>
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
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                </div>
              );
            })()}

            <div className="h-1 bg-[var(--divider)] rounded-full" />

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

            {/* Food Cost / Ingredients — editable only after the item is created */}
            <div className="space-y-2 pt-6 border-t border-[var(--divider)]">
              <h3 className="font-semibold text-fg-primary">{t('foodCostIngredients')}</h3>
              <p className="text-sm text-fg-secondary">{t('saveItemFirst')}</p>
            </div>
      </FormModal>

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
    </>
  );
}
