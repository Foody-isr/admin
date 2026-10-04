'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPrepItem, updatePrepItem, getPrepItem, getPrepIngredients, setPrepIngredients, getPrepRecipeSteps, setPrepRecipeSteps, updatePrepRecipeMeta, type PrepItem, type PrepItemInput, type PrepIngredientInput, type PrepRecipeStepInput, type StockItem, type StockUnit } from '@/lib/api';
import SearchableListField from '@/components/SearchableListField';
import StatusPill from '@/components/StatusPill';
import StockItemPickerModal from '@/components/stock/StockItemPickerModal';
import { FullScreenEditor, EditorSectionHead, Badge, Field, Input, NumberField, Textarea, Button, ConfirmDialog, Tabs, TabsList, Tab, TabsContent } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
import { Layers as LayersIcon, Trash as TrashIcon, Plus as PlusIcon, Sparkles as SparklesIcon, Image as ImageIcon } from 'lucide-react';
import RecipeStepsEditor, { splitInstruction, joinInstruction, type StepView } from '@/components/recipe/RecipeStepsEditor';
import RecipeImportModal from '@/app/[restaurantId]/kitchen/RecipeImportModal';
import { PrepDeleteDialog } from './PrepOperations';
import { useKitchenMutation } from '@/components/kitchen/useKitchenMutation';
import { useI18n, useCurrency } from '@/lib/i18n';
import { prepIngredientBaseQuantity, prepIngredientUnitOptions } from '@/lib/prep-ingredient-units';

const UNITS: StockUnit[] = ['kg','g','l','ml','unit','pack','box','bag','dose','other'];

/** Edit a preparation and its recipe while retaining each confirmed save step. */
export default function PrepItemEditor({
  rid, editing, categories, stockItems, onClose, onSaved,
}: {
  rid: number; editing?: PrepItem; categories: string[]; stockItems: StockItem[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { money } = useCurrency();
  const { t, locale } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [unit, setUnit] = useState<StockUnit>(editing?.unit ?? 'unit');
  const [quantity, setQuantity] = useState(editing?.quantity ?? 0);
  const [yieldPerBatch, setYieldPerBatch] = useState(editing?.yield_per_batch ?? 0);
  const [reorder, setReorder] = useState(editing?.reorder_threshold ?? 0);
  const [shelfLife, setShelfLife] = useState(editing?.shelf_life_hours ?? 0);
  const [category, setCategory] = useState(editing?.category ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  const [ingredients, setIngredients] = useState<PrepIngredientInput[]>([]);
  const [loadingIngs, setLoadingIngs] = useState(!!editing);


  // Cooking instructions (Recette tab). Steps are loaded for an existing prep;
  // a new prep starts empty and is saved after the item is created.
  const [tab, setTab] = useState<'details' | 'recipe'>('details');
  const [steps, setSteps] = useState<(StepView & { image_url?: string })[]>([]);
  const [prepTime, setPrepTime] = useState<number>(editing?.prep_time_mins ?? 0);
  const [loadingSteps, setLoadingSteps] = useState(!!editing);
  const [importOpen, setImportOpen] = useState(false);
  const [importGuard,setImportGuard]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [summaryOpen,setSummaryOpen]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(min-width: 768px)');const sync=()=>setSummaryOpen(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
  const [loadError,setLoadError]=useState('');
  const generation=useRef(0);
  const baselineReady=useRef(!editing);
  const [phase,setPhase]=useState(0);
  const action=useRef<'save'|'duplicate'>('save');
  const progress=useRef({id:editing?.id??0,details:false,ingredients:false,steps:false,meta:false});
  const fingerprint=JSON.stringify({name,unit,quantity,yieldPerBatch,reorder,shelfLife,category,notes,isActive,ingredients,steps,prepTime});
  const session=useKitchenMutation<void>(fingerprint,onClose);
  const canManage=session.canManage;
  const blocked=session.frozen||phase>0||loadingIngs||loadingSteps||!!loadError;
  useEffect(()=>{if(!baselineReady.current&&!loadingIngs&&!loadingSteps&&!loadError){baselineReady.current=true;session.acceptBaseline();}},[loadingIngs,loadingSteps,loadError,session]);

  // Load (and reload, e.g. after an AI import) the existing prep's recipe:
  // prep time, ingredients and cooking steps.
  const reloadRecipe = useCallback(async () => {
    if (!editing) return;
    const current=++generation.current;setLoadingIngs(true);setLoadingSteps(true);setLoadError('');
    try {
      const [item, ings, stepData] = await Promise.all([
        getPrepItem(rid, editing.id),
        getPrepIngredients(rid, editing.id),
        getPrepRecipeSteps(rid, editing.id),
      ]);
      if(current!==generation.current)return;
      setPrepTime(item.prep_time_mins ?? 0);setYieldPerBatch(item.yield_per_batch);setUnit(item.unit);
      setIngredients(ings.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity_needed: i.recipe_quantity > 0 ? i.recipe_quantity : i.quantity_needed,
        unit: i.recipe_unit || i.stock_item?.unit || stockItems.find((s) => s.id === i.stock_item_id)?.unit,
      })));
      setSteps((stepData ?? []).map((s) => {
        const parts = splitInstruction(s.instruction);
        return { title: parts.title, description: parts.description, duration_mins: s.duration_mins ?? 0, image_url:s.image_url };
      }));
    } catch(cause) {
      if(current===generation.current)setLoadError(cause instanceof Error?cause.message:t('loadFailed'));
      throw cause;
    } finally {
      if(current===generation.current){setLoadingIngs(false);setLoadingSteps(false);}
    }
  }, [rid, editing, stockItems,t]);

  useEffect(() => { void reloadRecipe().catch(()=>{});const current=generation;return()=>{current.current++;}; }, [reloadRecipe]);

  const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, patch: Partial<PrepIngredientInput>) => {
    setIngredients(ingredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'add' | 'swap'>('add');
  const [pickerSwapIdx, setPickerSwapIdx] = useState<number | null>(null);

  const openAddPicker = () => {
    setPickerMode('add');
    setPickerSwapIdx(null);
    setPickerOpen(true);
  };
  const openSwapPicker = (idx: number) => {
    setPickerMode('swap');
    setPickerSwapIdx(idx);
    setPickerOpen(true);
  };
  const onPickerConfirm = (ids: number[]) => {
    if (pickerMode === 'swap' && pickerSwapIdx != null) {
      if (ids[0] != null) updateIngredient(pickerSwapIdx, {
        stock_item_id: ids[0], quantity_needed: 0,
        unit: stockItems.find((item) => item.id === ids[0])?.unit,
      });
    } else {
      setIngredients((prev) => [
        ...prev,
        ...ids.map((id) => ({ stock_item_id: id, quantity_needed: 0, unit: stockItems.find((item) => item.id === id)?.unit })),
      ]);
    }
  };

  const handleSubmit = (intent:'save'|'duplicate'='save') => {
    if(!canManage||loadingIngs||loadingSteps||loadError||!name.trim())return;
    if(phase===0)action.current=intent;
    void session.run(async()=>{
      const duplicate=action.current==='duplicate';
      for(const ingredient of ingredients){
        const stock=stockItems.find(item=>item.id===ingredient.stock_item_id);
        if(!stock||!Number.isFinite(ingredient.quantity_needed)||ingredient.quantity_needed<=0)throw new Error(t('prepIngredientQuantityRequired'));
        if(prepIngredientBaseQuantity(stock,ingredient.quantity_needed,ingredient.unit||stock.unit)===null)throw new Error(t('prepIngredientConversionMissing'));
      }
      if(!duplicate&&editing&&quantity===0&&editing.quantity>0)throw new Error(t('prepZeroStockHint'));
      const receipt=progress.current;
      if(!receipt.details){
        const payload:PrepItemInput={name:duplicate?t('prepCopyName').replace('{name}',name):name,unit,quantity:duplicate?0:quantity,yield_per_batch:yieldPerBatch,reorder_threshold:reorder,shelf_life_hours:shelfLife,category,notes,is_active:duplicate?false:isActive};
        if(editing&&!duplicate){await updatePrepItem(rid,editing.id,payload);receipt.id=editing.id;}
        else{receipt.id=(await createPrepItem(rid,payload)).id;}
        receipt.details=true;setPhase(1);
      }
      if(!receipt.ingredients){await setPrepIngredients(rid,receipt.id,ingredients);receipt.ingredients=true;setPhase(2);}
      if(!receipt.steps){
        const payload:PrepRecipeStepInput[]=steps.map((step,index)=>({step_number:index+1,instruction:joinInstruction(step.title,step.description),duration_mins:step.duration_mins,image_url:step.image_url}));
        await setPrepRecipeSteps(rid,receipt.id,payload);receipt.steps=true;setPhase(3);
      }
      if(!receipt.meta){await updatePrepRecipeMeta(rid,receipt.id,{prep_time_mins:prepTime,notes});receipt.meta=true;setPhase(4);}
    },onSaved);
  };

  // Per-unit cost estimate for the rail hero
  const costTotal = ingredients.reduce((s, ing) => {
    const si = stockItems.find((x) => x.id === ing.stock_item_id);
    if (!si) return s;
    const baseQuantity = prepIngredientBaseQuantity(si, ing.quantity_needed, ing.unit || si.unit);
    return s + si.cost_per_unit * (baseQuantity ?? 0);
  }, 0);
  const perUnit = yieldPerBatch > 0 ? costTotal / yieldPerBatch : 0;

  const rail = (
    <details open={summaryOpen} onToggle={event=>setSummaryOpen(event.currentTarget.open)} className="min-w-0"><summary className="mb-3 cursor-pointer rounded-r-sm py-3 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-ring">{t('summary')} · <bdi>{money(perUnit)}</bdi></summary><fieldset disabled={blocked} className="min-w-0">
      {/* Icon tile instead of photo */}
      <div
        className="grid h-20 w-full place-items-center rounded-r-md bg-[var(--info-50)] text-[var(--info-500)] md:h-36"
      >
        <LayersIcon className="size-12" strokeWidth={1.5} />
      </div>

      <div className="mt-[var(--s-4)]">
        <div className="text-fs-xl font-semibold -tracking-[0.01em] text-[var(--fg)]">
          {name || (t('addPrepItem') || 'Nouvelle préparation')}
        </div>
        <div className="flex items-center gap-[var(--s-2)] mt-1.5">
          {category && <Badge tone="neutral">{category.toUpperCase()}</Badge>}
          <Badge tone={isActive ? 'success' : 'neutral'} dot>
            {isActive ? t('active') : t('inactive')}
          </Badge>
        </div>
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Cost summary — key metric */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-3)]">
        {t('costPerUnit') || 'Coût de revient'}
      </div>
      <div className="flex items-baseline gap-1 font-display text-fs-2xl font-semibold tabular-nums -tracking-[0.02em]">
        {money(perUnit)}
        <span className="text-fs-sm text-[var(--fg-muted)] font-normal font-sans">/ {unit}</span>
      </div>
      <div className="text-fs-xs text-[var(--fg-subtle)] mt-1">
        {t('yieldLabel') || 'Rendement'} {yieldPerBatch || 0} {unit} · {t('totalLabel') || 'total'} {money(costTotal)}
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Status toggle */}
      {canManage && (
        <div className="flex items-center justify-between">
          <span className="text-fs-sm text-[var(--fg-muted)]">{t('status')}</span>
          <StatusPill
            active={isActive}
            onToggle={() => setIsActive(!isActive)}
            activeLabel={t('active')}
            inactiveLabel={t('inactive')}
          />
        </div>
      )}

      {editing && (
        <>
          <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />
          {/* Utilisation summary */}
          <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-3)]">
            {t('usageHeader') || 'Utilisation'}
          </div>
          <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">{t('ingredients')}</span>
              <span className="font-mono tabular-nums">{ingredients.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">{t('lastUpdated') || 'Dernière MAJ'}</span>
              <span className="text-fs-xs">
                {new Date(editing.updated_at).toLocaleDateString(locale)}
              </span>
            </div>
            {editing.shelf_life_hours > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-muted)]">{t('shelfLifeHours') || 'DLC'}</span>
                <span className="font-mono tabular-nums text-fs-xs">
                  {editing.shelf_life_hours}h
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Notes */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-2)]">
        {t('notes')}
      </div>
      <Textarea
        aria-label={t('notes')}
        dir="auto"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('notes')}
        className="text-fs-sm"
      />

      {editing && canManage && <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-5"><Button size="lg" variant="secondary" onClick={()=>handleSubmit('duplicate')}><LayersIcon/>{t('duplicate')}</Button><Button size="lg" variant="ghost" onClick={()=>setDeleting(true)}><TrashIcon/>{t('delete')}</Button></div>}
    </fieldset></details>
  );

  return (<>
    <FullScreenEditor
      open
      onOpenChange={(v) => { if (!v) session.close(); }}
      closeDisabled={session.busy||importOpen||deleting}
      title={editing ? t('editPrepItem') : t('addPrepItem')}
      subtitle={editing ? `${t('editingItem') || 'Modification'} · ${editing.name}` : undefined}
      showCancel={false}
      footer={<div className="space-y-3">{phase>0&&!session.saved&&<p role="status" className="text-sm">{t('prepSavePartial')}</p>}{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button>{canManage&&<Button size="lg" disabled={session.busy||loadingIngs||loadingSteps||!!loadError||!name.trim()} onClick={()=>handleSubmit()}>{t(session.busy?'saving':phase>0?'retry':editing?'update':'create')}</Button>}</div></div>}
      rail={rail}
    >
      {loadError&&<div role="alert" className="mb-5 space-y-3"><p className="text-sm text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" onClick={()=>void reloadRecipe().catch(()=>{})}>{t('retry')}</Button></div>}
      {(loadingIngs||loadingSteps)&&<p role="status" className="mb-5 text-sm text-fg-secondary">{t('loading')}</p>}
      <Tabs value={tab} onValueChange={value=>setTab(value as 'details'|'recipe')} variant="underline" dir={locale==='he'?'rtl':'ltr'}><TabsList className="mb-5 max-w-3xl"><Tab value="details" className="min-h-11">{t('tabDetails')}</Tab><Tab value="recipe" className="min-h-11">{t('tabRecipe')}</Tab></TabsList>
      <fieldset disabled={blocked} className="min-w-0">
      <TabsContent value="details" className="max-w-3xl">
        <EditorSectionHead title={t('identityAndYield') || 'Identité & rendement'} />

        {/* Name */}
        <div className="mb-[var(--s-5)]">
          <Field label={t('nameLabel') || "Nom de la préparation"}>
            <Input
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nameLabel') + ' *'}
              autoFocus
            />
          </Field>
        </div>

        {/* Classification */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-3)]">
            {t('classification') || 'Classification'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
            <Field label={t('category')}>
              <SearchableListField
                mode="single"
                allowCustom
                placeholder={t('category')}
                options={categories.map((c) => ({ value: c, label: c }))}
                value={category}
                onChange={setCategory}
              />
            </Field>
            <Field label={t('shelfLifeHours') || 'DLC (heures)'}>
              <NumberField
                min={0}
                value={shelfLife}
                onChange={setShelfLife}
              />
            </Field>
            <Field label={t('reorderThreshold') || 'Seuil'}>
              <NumberField
                min={0}
                value={reorder}
                onChange={setReorder}
              />
            </Field>
          </div>
        </div>

        {/* Yield + quantity */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-3)]">
            {t('yieldAndStock') || 'Rendement & stock'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
            <Field label={t('unitLabel') || 'Unité'}>
              <select
                className="min-h-11 w-full px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as StockUnit)}
              >
                {Array.from(new Set([...UNITS,unit])).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label={t('yieldPerBatchLabel') || 'Rendement / batch'}>
              <NumberField
                min={0}
                value={yieldPerBatch}
                onChange={setYieldPerBatch}
              />
            </Field>
<Field label={t('currentStock')} hint={editing?t('prepZeroStockHint'):undefined}>
              <NumberField
                min={0}
                value={quantity}
                onChange={setQuantity}
              />
            </Field>
          </div>
        </div>

      </TabsContent>

      <TabsContent value="recipe" className="max-w-3xl">
          {/* AI import shortcut — like the article recipe tab. Only for an
              existing prep (it replaces this prep's recipe; creating a new prep
              from a recipe is done from the page's Actions menu). */}
          {editing && canManage && (
            <div className="flex justify-end mb-[var(--s-4)]">
              <button
                type="button"
                onClick={()=>{if(session.dirty)setImportGuard(true);else setImportOpen(true);}}
                className="inline-flex min-h-11 items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-sm border border-[var(--line-strong)] text-[var(--brand-ink)] hover:bg-[var(--brand-500)]/5 transition-colors"
              >
                <SparklesIcon className="w-4 h-4" />
                {t('importRecipe') || 'Importer une recette'}
              </button>
            </div>
          )}

          {/* Ingredients — same layout as the article recipe tab (RecipeTable),
              adapted to preps (stock-only ingredients, no variants). */}
          <div className="mb-[var(--s-6)]">
            <div className="flex items-center justify-between mb-[var(--s-3)]">
              <div>
                <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
                  {t('ingredients') || 'Ingrédients'}
                  <span className="text-[var(--fg-muted)] font-normal ms-1.5">
                    · {ingredients.length} {t('items')}
                  </span>
                </h4>
                <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
                  {(yieldPerBatch ?? 0) > 0
                    ? t('rawIngredientsDesc').replace('{yield}', String(yieldPerBatch)).replace('{unit}', unit)
                    : (t('prepIngredientsSubtitle') || 'Saisissez la quantité de chaque ingrédient pour 1 batch.')}
                </p>
                <p className="text-fs-xs text-[var(--fg-muted)] mt-1">{t('prepIngredientUnitHint')}</p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={openAddPicker}
                  className="inline-flex min-h-11 items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-ink)] hover:underline"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {t('addIngredient') || 'Ajouter un ingrédient'}
                </button>
              )}
            </div>

            {loadingIngs ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            ) : ingredients.length === 0 ? (
              <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border-2 border-dashed border-[var(--line-strong)]">
                {t('noIngredients') || 'Aucun ingrédient ajouté.'}
              </p>
            ) : (
              <div role="region" aria-label={t('ingredients')} tabIndex={0} className="overflow-x-auto rounded-r-md border border-[var(--line)] bg-[var(--surface)]">
                <table className="w-full min-w-[560px] text-fs-sm">
                  <thead className="bg-[var(--surface-2)]">
                    <tr>
                      <th className="text-start px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider">
                        {t('ingredient')}
                      </th>
                      <th className="text-start px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider w-[140px]">
                        {t('unit')}
                      </th>
                      <th className="text-end px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider">
                        {t('quantity')}
                      </th>
                      <th className="w-10" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, idx) => {
                      const si = stockItems.find((s) => s.id === ing.stock_item_id);
                      const selectedUnit = ing.unit || si?.unit || '';
                      const options = si ? prepIngredientUnitOptions(si) : [];
                      const baseQuantity = si ? prepIngredientBaseQuantity(si, ing.quantity_needed, selectedUnit) : null;
                      return (
                        <tr key={idx} className="border-t border-[var(--line)] hover:bg-[var(--surface-2)]/50 transition-colors">
                          <td className="px-[var(--s-3)] py-[var(--s-2)]">
                            <button
                              type="button"
                              onClick={() => openSwapPicker(idx)}
                              aria-label={`${t('replace')} — ${si?.name||ing.stock_item_id}`} className="flex min-h-11 items-center gap-[var(--s-2)] min-w-0 text-start"
                            >
                              {si?.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={si.image_url} alt="" className="w-7 h-7 rounded-r-sm object-cover shrink-0" />
                              ) : (
                                <div className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-white" style={{ background: 'var(--brand-700)' }} aria-hidden>
                                  <ImageIcon className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <span className="text-fs-sm font-medium text-[var(--fg)] break-words hover:underline">
                                {si?.name || '—'}
                              </span>
                            </button>
                          </td>
                          <td className="px-[var(--s-3)] py-[var(--s-2)] text-[var(--fg-muted)]">
                            <select
                              value={selectedUnit}
                              onChange={(event) => updateIngredient(idx, { unit: event.target.value })}
                              aria-label={`${t('prepIngredientUnit')} — ${si?.name||ing.stock_item_id}`}
                              className="min-h-11 w-full bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm px-1.5 py-1 text-fs-sm text-[var(--fg)]"
                            >
                              {!options.some((option) => option.unit === selectedUnit) && selectedUnit && (
                                <option value={selectedUnit}>{selectedUnit}</option>
                              )}
                              {options.map((option) => (
                                <option key={option.unit} value={option.unit}>
                                  {['pack', 'carton', 'crate', 'sack', 'case'].includes(option.unit)
                                    ? t(`ct_${option.unit}`)
                                    : ['packet', 'box', 'sachet', 'can', 'jar', 'brick'].includes(option.unit)
                                      ? t(`ut_${option.unit}`)
                                      : option.unit}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-[var(--s-3)] py-[var(--s-2)] text-end">
                            <NumberInput
                              min={0}
                              value={ing.quantity_needed}
                              onChange={(v) => updateIngredient(idx, { quantity_needed: v })}
                              aria-label={`${t('quantity')} — ${si?.name||ing.stock_item_id}`}
                              placeholder="0"
                              className="min-h-11 w-full max-w-[100px] px-[var(--s-2)] py-1 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm text-fs-sm text-[var(--fg)] text-end font-mono tabular-nums focus:outline-none focus:border-[var(--brand-500)]"
                            />
                            {si && baseQuantity !== null && selectedUnit !== si.unit && ing.quantity_needed > 0 && (
                              <span className="block mt-1 text-fs-xs text-[var(--fg-muted)] font-mono tabular-nums">
                                <bdi dir="ltr">≈ {Number(baseQuantity.toFixed(4))} {si.unit}</bdi>
                              </span>
                            )}
                            {si && baseQuantity === null && ing.quantity_needed > 0 && (
                              <span className="block mt-1 text-fs-xs text-[var(--danger-500)]">
                                {t('prepIngredientConversionMissing')}
                              </span>
                            )}
                          </td>
                          <td className="px-[var(--s-2)] py-[var(--s-2)] text-end">
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => removeIngredient(idx)}
                                className="min-h-11 min-w-11 p-2 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                                aria-label={`${t('delete')} — ${si?.name||ing.stock_item_id}`}
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[var(--surface-2)]">
                    <tr className="border-t-2 border-[var(--line-strong)]">
                      <td className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]" colSpan={2}>
                        {t('recipeCost')}
                      </td>
                      <td className="px-[var(--s-3)] py-[var(--s-2)] text-end font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                        {costTotal > 0 ? money(costTotal) : '—'}
                      </td>
                      <td aria-hidden />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Instructions — shared with the article recipe tab */}
          {loadingSteps ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <RecipeStepsEditor
              steps={steps}
              prepTime={prepTime}
              showNotes={false}
              readOnly={blocked}
              onStepsChange={setSteps}
              onPrepTimeChange={setPrepTime}
            />
          )}
      </TabsContent>
      </fieldset></Tabs>

      {pickerOpen && (
        <StockItemPickerModal
          stockItems={stockItems}
          mode={pickerMode}
          excludeIds={
            pickerMode === 'add'
              ? new Set(ingredients.map((i) => i.stock_item_id))
              : undefined
          }
          initialSelectedId={
            pickerMode === 'swap' && pickerSwapIdx != null
              ? ingredients[pickerSwapIdx]?.stock_item_id
              : undefined
          }
          onConfirm={onPickerConfirm}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {importOpen && editing && (
        <RecipeImportModal
          rid={rid}
          stockItems={stockItems}
          mode={{ kind: 'prep', prepItem: editing }}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            await reloadRecipe();
            await onSaved();
          }}
        />
      )}
    </FullScreenEditor>{session.confirmation}
    <ConfirmDialog open={importGuard} onOpenChange={setImportGuard} title={t('prepImportDraftTitle')} description={t('prepImportDraftHint')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={()=>{setImportGuard(false);setImportOpen(true);}}/>
    {deleting&&editing&&<PrepDeleteDialog rid={rid} items={[editing]} onClose={()=>setDeleting(false)} onSaved={async()=>{await onSaved();onClose();}}/>}
  </>);
}

