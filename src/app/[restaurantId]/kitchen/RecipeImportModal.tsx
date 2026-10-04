'use client';

import { useState, useEffect, useRef } from 'react';
import {
  importRecipesFromFile, importRecipesFromText, confirmRecipes, confirmPrepRecipe,
  getRestaurantSettings,
  RecipeExtraction, ExtractedRecipe, ConfirmRecipeItemInput, ConfirmPrepRecipeInput,
  StockItem, MenuItem, PrepItem,
} from '@/lib/api';
import {
  SparklesIcon, TrashIcon, FileTextIcon,
  AlertTriangleIcon, InfoIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import SearchableSelect from '@/components/SearchableSelect';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog, Field, Select, Textarea } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
import StockQuantityForm, {
  StockInput, BaseUnit, defaultStockInput, deriveTotals,
} from '@/components/stock/StockQuantityForm';
import { classifyUnits, convertUnit, formatConverted } from '@/lib/stock/unit-compat';
import RecipeStepsEditor, { joinInstruction, type StepView } from '@/components/recipe/RecipeStepsEditor';

const BASE_SET: Set<string> = new Set(['g', 'kg', 'ml', 'l', 'unit']);
function coerceBaseUnit(u: string): BaseUnit {
  return (BASE_SET.has(u) ? (u as BaseUnit) : 'kg');
}

function isolatedUnits(text: string, values: Record<string, string>) {
  return text.split(/(\{(?:ingUnit|stockUnit|example|yield)\})/g).map((part,index) => {
    const key = part.slice(1,-1);
    return part.startsWith('{') && Object.prototype.hasOwnProperty.call(values,key) ? <bdi key={index} dir="ltr">{values[key]}</bdi> : part;
  });
}

export type RecipeImportModalMode =
  | { kind: 'menu-item'; menuItem: MenuItem }
  // prepItem set = import into that existing prep (replace its recipe);
  // omitted = create a new prep from the imported recipe.
  | { kind: 'prep'; prepItem?: PrepItem };

interface RecipeImportModalProps {
  rid: number;
  stockItems: StockItem[];
  mode: RecipeImportModalMode;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

/** Review an extracted recipe and confirm its existing API transaction explicitly. */
export default function RecipeImportModal({ rid, stockItems, mode, onClose, onImported }: RecipeImportModalProps) {
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [tab, setTab] = useState<'text' | 'upload'>('text');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Review state
  const [extraction, setExtraction] = useState<RecipeExtraction | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedYield, setEditedYield] = useState(0);
  const [editedYieldUnit, setEditedYieldUnit] = useState('kg');
  const [editedIngredients, setEditedIngredients] = useState<Array<{
    stock_item_id?: number | null;
    name: string;
    original_name: string;
    quantity_needed: number;
    unit: string;
    category: string;
    cost_per_unit: number;
    price_includes_vat: boolean;
    is_new: boolean;
    /** Captured packaging/pricing form state for new items (UI-only, not persisted). */
    stockForm?: StockInput;
  }>>([]);
  // Extracted cooking instructions (prep mode only). Reviewed/edited before confirm.
  const [editedSteps, setEditedSteps] = useState<StepView[]>([]);
  const [editedPrepTime, setEditedPrepTime] = useState(0);
  const [vatRate, setVatRate] = useState(18);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [selectedRecipe, setSelectedRecipe] = useState(0);
  const [leaveAction, setLeaveAction] = useState<'close' | 'back' | null>(null);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(false);
  const lock = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setSettingsReady(false); setSettingsError('');
    getRestaurantSettings(rid).then(settings => {
      if (active) { setVatRate(settings.vat_rate ?? 18); setSettingsReady(true); }
    }).catch(cause => { if (active) setSettingsError(cause instanceof Error ? cause.message : t('loadFailed')); });
    return () => { active = false; };
  }, [rid, settingsAttempt, t]);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => { if (step === 'review') reviewHeading.current?.focus(); else inputRef.current?.focus(); }, [step]);

  const requestLeave = (action: 'close' | 'back') => {
    if (lock.current) return;
    if (savedRef.current) { onClose(); return; }
    if (text.trim() || file || step === 'review') setLeaveAction(action);
    else onClose();
  };

  const seedRecipe = (recipe: ExtractedRecipe) => {
    const existingPrep = mode.kind === 'prep' ? mode.prepItem : undefined;
        setEditedName(recipe.dish_name || existingPrep?.name || '');
        // Prefer the document's yield; fall back to the existing prep's batch yield.
        setEditedYield(recipe.total_yield || existingPrep?.yield_per_batch || 0);
        setEditedYieldUnit(recipe.total_yield_unit || existingPrep?.unit || 'kg');
        setEditedIngredients(recipe.ingredients.map((ing) => {
          const matched = ing.matched_item_id ? stockItems.find((s) => s.id === ing.matched_item_id) : null;
          const isNew = ing.is_new || !matched;
          return {
            stock_item_id: matched?.id ?? null,
            name: ing.translated_name || ing.original_name,
            original_name: ing.original_name,
            quantity_needed: ing.quantity,
            unit: ing.unit,
            category: matched?.category || '',
            cost_per_unit: matched?.cost_per_unit || 0,
            price_includes_vat: matched?.price_includes_vat || false,
            is_new: isNew,
            stockForm: isNew
              ? defaultStockInput({ type: 'simple', quantity: 0, unit: coerceBaseUnit(ing.unit), totalPrice: 0 })
              : undefined,
          };
        }));
        setEditedSteps((recipe.steps ?? []).map((s) => ({
          title: s.title || '',
          description: s.description || '',
          duration_mins: s.duration_mins ?? 0,
        })));
        setEditedPrepTime(existingPrep?.prep_time_mins ?? 0);

  };

  const handleExtract = async () => {
    if (!canManage || lock.current || !settingsReady || (tab === 'upload' ? !file : !text.trim())) return;
    lock.current = true; setLoading(true); setError('');
    try {
      const result = tab === 'upload' && file
        ? await importRecipesFromFile(rid, file, locale)
        : await importRecipesFromText(rid, text, locale);
      if (!result.recipes.length) throw new Error(t('recipeImportEmpty'));
      setExtraction(result); setSelectedRecipe(0); seedRecipe(result.recipes[0]); setStep('review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('recipeImportExtractFailed')); }
    finally { lock.current = false; setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!canManage || lock.current || !settingsReady || !editedIngredients.length) return;
    lock.current = true; setLoading(true);
    setError('');
    try {
      const ingredients = editedIngredients.map((ing) => ({
        stock_item_id: ing.stock_item_id ?? null,
        name: ing.name,
        original_name: ing.original_name,
        quantity_needed: ing.quantity_needed,
        unit: ing.unit,
        category: ing.category,
        cost_per_unit: ing.cost_per_unit,
        price_includes_vat: ing.price_includes_vat,
      }));
      if (!savedRef.current) {
      if (mode.kind === 'menu-item') {
        const input: ConfirmRecipeItemInput = {
          menu_item_id: mode.menuItem.id,
          ingredients,
        };
        await confirmRecipes(rid, { recipes: [input] });
      } else {
        const existingPrep = mode.prepItem;
        // Name is only user-entered when creating; for an existing prep we keep
        // its name and just replace the recipe.
        if (!existingPrep && !editedName.trim()) {
          setError(t('nameLabel') + ' *');
          setLoading(false);
          return;
        }
        const input: ConfirmPrepRecipeInput = {
          prep_item_id: existingPrep?.id ?? null,
          name: existingPrep ? existingPrep.name : editedName.trim(),
          yield: editedYield,
          yield_unit: editedYieldUnit,
          prep_time_mins: editedPrepTime,
          ingredients,
          steps: editedSteps.map((s) => ({
            instruction: joinInstruction(s.title, s.description),
            duration_mins: s.duration_mins,
          })),
        };
        await confirmPrepRecipe(rid, input);
      }
      savedRef.current = true; setSaved(true);
      }
      await onImported();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
    } finally {
      lock.current = false; setLoading(false);
    }
  };

  const updateIngredient = (idx: number, patch: Partial<typeof editedIngredients[0]>) => {
    setEditedIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const stockOptions = stockItems.map((s) => ({ value: String(s.id), label: s.name, sublabel: s.unit }));
  const existingCategories = Array.from(new Set(stockItems.map((s) => s.category).filter(Boolean)));
  const vatMultiplier = 1 + vatRate / 100;

  const targetName = mode.kind === 'menu-item' ? mode.menuItem.name : mode.prepItem?.name;
  const hasDocumentPreview = tab === 'upload' && previewUrl;
  const confirmLabel = saved ? 'retry' : loading ? 'saving' : 'confirmImport';
  const replacementHint = mode.kind === 'menu-item' ? 'recipeImportReplaceItem' : mode.prepItem ? 'recipeImportReplacePrep' : 'recipeImportCreatePrep';
  return <>
    <Modal title={t('importRecipe')} subtitle={targetName ? <bdi>{targetName}</bdi> : t('recipeImportCreatePrep')}
      icon={<SparklesIcon/>} size={step === 'input' ? 'xl' : '5xl'} initialFocusRef={inputRef}
      closeDisabled={loading} onClose={() => requestLeave('close')}
      footer={<div className="space-y-3">
        {step === 'review' && <p className="text-sm text-fg-secondary">{t(replacementHint)}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="lg" variant="secondary" disabled={loading} onClick={() => requestLeave('close')}>{t('cancel')}</Button>
          {step === 'review' && !saved && <Button size="lg" variant="secondary" disabled={loading} onClick={() => requestLeave('back')}>{t('back')}</Button>}
          {canManage && (step === 'input'
            ? <Button size="lg" onClick={() => void handleExtract()} disabled={loading || !settingsReady || (tab === 'text' ? !text.trim() : !file)}><SparklesIcon/>{t(loading ? 'extracting' : 'extractRecipe')}</Button>
            : <Button size="lg" onClick={() => void handleConfirm()} disabled={loading || !settingsReady || !editedIngredients.length || editedIngredients.some(ing => !ing.stock_item_id && !ing.name.trim()) || (mode.kind === 'prep' && !mode.prepItem && !editedName.trim())}>{t(confirmLabel)}</Button>)}
        </div>
      </div>}>
      {settingsError && <div className="mb-4 space-y-2"><p role="alert" className="text-sm text-[var(--danger-500)]">{t('recipeImportSettingsFailed')} {settingsError}</p><Button variant="secondary" onClick={() => setSettingsAttempt(value => value + 1)}>{t('retry')}</Button></div>}
      {!settingsReady && !settingsError && <p role="status" className="mb-4 text-sm text-fg-secondary">{t('loading')}</p>}
      {error && <p role="alert" className="mb-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      {saved && <p role="status" className="mb-4 rounded-r-md bg-[var(--info-50)] p-3 text-sm text-[var(--info-500)]">{t('recipeImportSavedRefresh')}</p>}
      {step === 'input' ? <fieldset disabled={loading || !canManage} className="min-w-0 space-y-4">
        <div role="group" aria-label={t('recipeImportSource')} className="flex flex-wrap gap-2">
          {(['text', 'upload'] as const).map(value => <Button size="lg" key={value} variant="secondary" aria-pressed={tab === value} onClick={() => setTab(value)} className={tab === value ? 'border-[var(--action)] bg-[var(--brand-soft)] text-[var(--brand-ink)]' : ''}>{t(value === 'text' ? 'pasteRecipeText' : 'uploadRecipeFile')}</Button>)}
        </div>
        {tab === 'text' ? <Field label={t('pasteRecipeText')}><Textarea ref={inputRef} aria-label={t('pasteRecipeText')} rows={8} dir="auto" placeholder={t('pasteRecipePlaceholder')} value={text} onChange={event => setText(event.target.value)}/></Field>
          : <Field label={t('uploadRecipeFile')} hint={t('recipeImportFileHint')}>
            <input aria-label={t('uploadRecipeFile')} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="input min-h-11 w-full min-w-0 py-2 text-sm" onChange={event => {
              const next = event.target.files?.[0] ?? null;
              if (next && (!['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(next.type) || next.size > 10 * 1024 * 1024)) { event.target.value = ''; setFile(null); setError(t('recipeImportFileHint')); return; }
              setFile(next); setError('');
            }}/>
          </Field>}
        {/* Local previews use object URLs, revoked when the file changes. */}
        {/* eslint-disable @next/next/no-img-element */}
        {tab === 'upload' && file && <div className="space-y-2 rounded-r-md border border-[var(--line)] p-3">
          <p className="flex items-center gap-2 break-all text-sm"><FileTextIcon className="size-4 shrink-0"/><bdi>{file.name}</bdi></p>
          {file.type.startsWith('image/') && previewUrl && <img src={previewUrl} alt={t('originalDocument')} className="max-h-40 w-full object-contain"/>}
        </div>}
      </fieldset> : <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <details open className="self-start rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)]">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">{t(hasDocumentPreview ? 'originalDocument' : 'originalText')}</summary>
          <div className="max-h-64 overflow-auto border-t border-[var(--line)] p-4 lg:max-h-[60vh]">
            {hasDocumentPreview ? file?.type.startsWith('image/') ? <img src={previewUrl!} alt={t('originalDocument')} className="h-auto w-full"/> : <iframe src={previewUrl!} title={t('originalDocument')} className="h-64 w-full lg:h-[55vh]"/> : <pre className="whitespace-pre-wrap break-words font-sans text-sm" dir="auto">{text}</pre>}
          </div>
        </details>
        <div className="min-w-0">
          <h3 ref={reviewHeading} tabIndex={-1} className="mb-4 text-lg font-semibold">{t('ingredients')} · {editedIngredients.length}</h3>
          <fieldset disabled={loading || saved || !canManage || !settingsReady} className="min-w-0">
            {extraction && extraction.recipes.length > 1 && <Field className="mb-4" label={t('recipeImportSelection')} hint={t('recipeImportSelectionHint')}><Select className="min-h-11" aria-label={t('recipeImportSelection')} value={selectedRecipe} onChange={event => { const index = Number(event.target.value); setSelectedRecipe(index); seedRecipe(extraction.recipes[index]); }}>{extraction.recipes.map((recipe,index) => <option key={index} value={index}>{index + 1} · {recipe.dish_name}</option>)}</Select></Field>}
          {/* Prep name (only when creating a new prep item) */}
          {mode.kind === 'prep' && !mode.prepItem && (
            <div className="flex flex-wrap items-center gap-3 mb-3 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <label className="text-sm text-fg-secondary font-medium shrink-0">{t('nameLabel')}:</label>
              <input
                aria-label={t('nameLabel')} type="text"
                className="input min-h-11 flex-1 py-1.5 text-sm"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder={t('addPrepItem')}
                autoFocus
              />
            </div>
          )}

          {mode.kind === 'prep' ? <>
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
            <label className="text-sm text-fg-secondary font-medium">
              {mode.kind === 'prep' ? t('yieldPerBatch') : t('recipeYield')}:
            </label>
            <NumberInput min={0} className="input min-h-11 w-24 py-1.5 text-sm text-end"
              aria-label={mode.kind === 'prep' ? t('yieldPerBatch') : t('recipeYield')} value={editedYield} onChange={setEditedYield} />
            <select aria-label={t('recipeImportYieldUnit')} className="input min-h-11 w-24 py-1.5 text-sm" value={editedYieldUnit} onChange={(e) => setEditedYieldUnit(e.target.value)}>
              <option value="kg">kg</option><option value="g">g</option>
              <option value="l">l</option><option value="ml">ml</option>
              <option value="unit">unit</option>
            </select>
          </div>
          </> : <p className="mb-4 text-sm text-fg-secondary">{isolatedUnits(t('recipeImportItemYield'), {yield:`${editedYield} ${editedYieldUnit}`})}</p>}

          {/* Ingredients list */}
          <div className="space-y-3">
            {editedIngredients.map((ing, idx) => {
              const matched = ing.stock_item_id ? stockItems.find((s) => s.id === ing.stock_item_id) : null;
              const stockUnit = matched?.unit || '';
              const compat = matched ? classifyUnits(ing.unit, stockUnit) : 'same';
              // Cost display: stock cost is ₪/stockUnit; convert to ₪/recipeUnit
              // so "total for N recipe units" is correct. Null when units are
              // incompatible (e.g. g ↔ l).
              const costPerRecipeUnit = (() => {
                if (!matched || !(ing.cost_per_unit > 0)) return null;
                if (compat === 'same') return ing.cost_per_unit;
                const factor = convertUnit(1, ing.unit, stockUnit);
                return factor == null ? null : ing.cost_per_unit * factor;
              })();
              const convertedExample = (() => {
                if (compat !== 'convertible' || ing.quantity_needed <= 0) return '';
                const c = convertUnit(ing.quantity_needed, ing.unit, stockUnit);
                if (c == null) return '';
                return `${ing.quantity_needed} ${ing.unit} = ${formatConverted(c, stockUnit)}`;
              })();
              return (
                <div key={idx} className="min-w-0 rounded-r-lg border border-[var(--line)] p-4 space-y-4" style={{ background: 'var(--surface-subtle)' }}>
                  {/* Row 1: Name + badge + delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg-primary">{ing.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${matched ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--warning-50)] text-[var(--warning-500)]'}`}>
                        {matched ? t('existing') : t('new')}
                      </span>
                      <button type="button" aria-label={`${t('itemRemoveIngredient')} — ${ing.name}`} onClick={() => setEditedIngredients(prev => prev.filter((_, i) => i !== idx))}
                        className="grid size-11 shrink-0 place-items-center rounded-r-md text-[var(--danger-500)] hover:bg-[var(--danger-50)]">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Original name */}
                  {ing.original_name && ing.original_name !== ing.name && (
                    <p className="text-xs text-fg-secondary" dir="auto">
                      <span className="text-fg-tertiary">{t('originalName')}:</span> {ing.original_name}
                    </p>
                  )}

                  {/* Row 2: Stock item match */}
                  <div>
                    <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('matchToStockItem')}</label>
                    <SearchableSelect
                      value={ing.stock_item_id ? String(ing.stock_item_id) : ''}
                      onChange={(val) => {
                        if (val) {
                          const si = stockItems.find((s) => s.id === +val);
                          updateIngredient(idx, {
                            stock_item_id: +val, is_new: false,
                            // Keep recipe's unit — server converts at deduction time
                            // for same-dimension pairs (g↔kg, ml↔l). Cross-dimension
                            // mismatches are surfaced as a warning below so the user
                            // can correct them before saving.
                            cost_per_unit: si?.cost_per_unit || ing.cost_per_unit,
                            price_includes_vat: si?.price_includes_vat || false,
                            category: si?.category || ing.category,
                            stockForm: undefined,
                          });
                        } else {
                          updateIngredient(idx, {
                            stock_item_id: null,
                            is_new: true,
                            stockForm: ing.stockForm ?? defaultStockInput({ type: 'simple', quantity: 0, unit: coerceBaseUnit(ing.unit), totalPrice: 0 }),
                          });
                        }
                      }}
                      options={[{value:'',label:`${t('newItem')}: ${ing.name}`},...stockOptions]}
                      placeholder={`${t('matchToStockItem')} — ${ing.name}`}
                      className="min-h-11"
                    />
                  </div>

                  {/* Unit-compatibility hint (matched items with a unit difference) */}
                  {matched && compat === 'convertible' && (
                    <div className="flex items-start gap-2 p-2 rounded-lg text-sm text-[var(--info-500)] bg-[var(--info-50)]">
                      <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {isolatedUnits(t('unitAutoConvertHint'), {ingUnit:ing.unit,stockUnit,example:convertedExample || `${ing.unit} → ${stockUnit}`})}
                      </span>
                    </div>
                  )}
                  {matched && compat === 'incompatible' && (
                    <div className="flex items-start gap-2 p-2 rounded-lg text-sm text-[var(--warning-500)] bg-[var(--warning-50)]">
                      <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {isolatedUnits(t('unitIncompatibleHint'), {ingUnit:ing.unit,stockUnit})}
                      </span>
                    </div>
                  )}

                  {/* Row 3: Category (new items only) */}
                  {!matched && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                        <input aria-label={`${t('name')} — ${idx + 1}`} className="input min-h-11 w-full py-1.5 text-sm" value={ing.name}
                          onChange={(e) => updateIngredient(idx, { name: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('category')}</label>
                        <select aria-label={`${t('category')} — ${ing.name}`} className="input min-h-11 w-full py-1.5 text-sm" value={ing.category}
                          onChange={(e) => updateIngredient(idx, { category: e.target.value })}>
                          <option value="">{t('category')}</option>
                          {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                          {ing.category && !existingCategories.includes(ing.category) && (
                            <option value={ing.category}>{ing.category}</option>
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Quantity needed per serving */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-fg-secondary font-medium mb-1 block">
                        {t('quantityNeededPerServing') || `${t('quantity')} / ${t('recipeYield') || 'serving'}`}
                      </label>
                      <NumberInput
                        min={0} className="input min-h-11 w-full py-1.5 text-sm text-end"
                        aria-label={`${t('quantityNeededPerServing')} — ${ing.name}`} value={ing.quantity_needed}
                        onChange={(v) => updateIngredient(idx, { quantity_needed: v })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('unit')}</label>
                      <select
                        className="input min-h-11 w-full py-1.5 text-sm"
                        aria-label={`${t('unit')} — ${ing.name}`} value={ing.unit}
                        onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                      >
                        <option value="g">g</option><option value="kg">kg</option>
                        <option value="ml">ml</option><option value="l">l</option>
                        <option value="unit">unit</option>
                        {ing.unit && !['g', 'kg', 'ml', 'l', 'unit'].includes(ing.unit) && (
                          <option value={ing.unit}>{ing.unit}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Matched: cost pulled from stock (converted to recipe unit) */}
                  {matched && costPerRecipeUnit != null && costPerRecipeUnit > 0 && (
                    <div className="p-3 rounded-lg text-xs text-fg-secondary" style={{ background: 'var(--surface)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{t('costPerUnit')} ({t('fromStock') || 'from stock'})</span>
                        <span className="font-semibold text-fg-primary">
                          {costPerRecipeUnit.toFixed(4)} &#8362;/{ing.unit} {t('exVat')} | {(costPerRecipeUnit * vatMultiplier).toFixed(4)} &#8362;/{ing.unit} {t('incVat')}
                        </span>
                      </div>
                      {ing.quantity_needed > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-1 pt-1 border-t border-[var(--divider)]">
                          <span>{t('totalPrice')} ({ing.quantity_needed} {ing.unit})</span>
                          <span>
                            {(costPerRecipeUnit * ing.quantity_needed).toFixed(2)} &#8362; {t('exVat')} | {(costPerRecipeUnit * ing.quantity_needed * vatMultiplier).toFixed(2)} &#8362; {t('incVat')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* New item: define stock (same UX as manual add) */}
                  {!matched && ing.stockForm && (
                    <div className="pt-2 mt-2 border-t border-[var(--divider)]">
                      <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-2 block">
                        {t('defineStockItem') || t('addStockItem')}
                      </label>
                      <StockQuantityForm
                        value={ing.stockForm}
                        onChange={(v) => {
                          const d = deriveTotals(v);
                          updateIngredient(idx, {
                            stockForm: v,
                            unit: d.baseUnit,
                            cost_per_unit: d.costPerBase || ing.cost_per_unit,
                          });
                        }}
                        vatRate={vatRate}
                        compact
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cooking instructions extracted by the AI — review before confirm (prep only) */}
          {mode.kind === 'prep' && (
            <div className="mt-6 pt-6 border-t border-[var(--divider)]">
              <p className="text-xs text-fg-secondary mb-4">
                {t('importStepsReviewHint') || 'Vérifiez les étapes extraites avant de confirmer.'}
              </p>
              <RecipeStepsEditor
                steps={editedSteps}
                prepTime={editedPrepTime}
                showNotes={false}
                readOnly={loading || saved || !canManage}
                onStepsChange={setEditedSteps}
                onPrepTimeChange={setEditedPrepTime}
              />
            </div>
          )}

          </fieldset>
        </div>
      </div>}
    </Modal>
    <ConfirmDialog open={leaveAction !== null} onOpenChange={open => { if (!open) setLeaveAction(null); }}
      title={t('discardUnsavedChanges')} description={t(leaveAction === 'back' ? 'recipeImportBackHint' : 'recipeImportCloseHint')}
      confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={() => {
        if (leaveAction === 'back') { setStep('input'); setError(''); setLeaveAction(null); }
        else onClose();
      }}/>
  </>;
}
