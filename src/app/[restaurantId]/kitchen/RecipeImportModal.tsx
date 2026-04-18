'use client';

import { useState, useEffect } from 'react';
import {
  importRecipesFromFile, importRecipesFromText, confirmRecipes, confirmPrepRecipe,
  getRestaurantSettings,
  RecipeExtraction, ConfirmRecipeItemInput, ConfirmPrepRecipeInput,
  StockItem, MenuItem,
} from '@/lib/api';
import { SparklesIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import SearchableSelect from '@/components/SearchableSelect';
import StockQuantityForm, {
  StockInput, BaseUnit, defaultStockInput, deriveTotals,
} from '@/components/stock/StockQuantityForm';

const BASE_SET: Set<string> = new Set(['g', 'kg', 'ml', 'l', 'unit']);
function coerceBaseUnit(u: string): BaseUnit {
  return (BASE_SET.has(u) ? (u as BaseUnit) : 'kg');
}

export type RecipeImportModalMode =
  | { kind: 'menu-item'; menuItem: MenuItem }
  | { kind: 'prep' };

interface RecipeImportModalProps {
  rid: number;
  stockItems: StockItem[];
  mode: RecipeImportModalMode;
  onClose: () => void;
  onImported: () => void;
}

export default function RecipeImportModal({ rid, stockItems, mode, onClose, onImported }: RecipeImportModalProps) {
  const { t, locale, direction } = useI18n();
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
  const [vatRate, setVatRate] = useState(18);

  // Load VAT rate
  useEffect(() => {
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
  }, [rid]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleExtract = async () => {
    setLoading(true);
    setError('');
    try {
      let result: RecipeExtraction;
      if (tab === 'upload') {
        if (!file) return;
        result = await importRecipesFromFile(rid, file, locale);
      } else {
        if (!text.trim()) return;
        result = await importRecipesFromText(rid, text, locale);
      }
      setExtraction(result);
      // Auto-select first recipe
      if (result.recipes.length > 0) {
        const recipe = result.recipes[0];
        setEditedName(recipe.dish_name || '');
        setEditedYield(recipe.total_yield || 0);
        setEditedYieldUnit(recipe.total_yield_unit || 'kg');
        setEditedIngredients(recipe.ingredients.map((ing) => {
          const matched = ing.matched_item_id ? stockItems.find((s) => s.id === ing.matched_item_id) : null;
          const isNew = ing.is_new || !matched;
          return {
            stock_item_id: ing.matched_item_id ?? null,
            name: ing.translated_name || ing.original_name,
            original_name: ing.original_name,
            quantity_needed: ing.quantity,
            unit: ing.unit,
            category: matched?.category || '',
            cost_per_unit: matched?.cost_per_unit || 0,
            price_includes_vat: matched?.price_includes_vat || false,
            is_new: ing.is_new,
            stockForm: isNew
              ? defaultStockInput({ type: 'simple', quantity: 0, unit: coerceBaseUnit(ing.unit), totalPrice: 0 })
              : undefined,
          };
        }));
      }
      if (file) setPreviewUrl(URL.createObjectURL(file));
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
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
      if (mode.kind === 'menu-item') {
        const input: ConfirmRecipeItemInput = {
          menu_item_id: mode.menuItem.id,
          recipe_yield: editedYield,
          recipe_yield_unit: editedYieldUnit,
          ingredients,
        };
        await confirmRecipes(rid, { recipes: [input] });
      } else {
        if (!editedName.trim()) {
          setError(t('nameLabel') + ' *');
          setLoading(false);
          return;
        }
        const input: ConfirmPrepRecipeInput = {
          name: editedName.trim(),
          yield: editedYield,
          yield_unit: editedYieldUnit,
          ingredients,
        };
        await confirmPrepRecipe(rid, input);
      }
      onImported();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Confirm failed');
    } finally {
      setLoading(false);
    }
  };

  const updateIngredient = (idx: number, patch: Partial<typeof editedIngredients[0]>) => {
    setEditedIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const stockOptions = stockItems.map((s) => ({ value: String(s.id), label: s.name, sublabel: s.unit }));
  const existingCategories = Array.from(new Set(stockItems.map((s) => s.category).filter(Boolean)));
  const vatMultiplier = 1 + vatRate / 100;

  // ─── Input Step (compact dialog) ──────────────────────────────────────

  if (step === 'input') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-modal shadow-xl p-6 w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-fg-primary flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-brand-500" />
              {t('importRecipe')}{mode.kind === 'menu-item' ? ` — ${mode.menuItem.name}` : ''}
            </h3>
            <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{error}</div>
          )}

          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <button onClick={() => setTab('text')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'text' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}>
                {t('pasteRecipeText')}
              </button>
              <button onClick={() => setTab('upload')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'upload' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}>
                {t('uploadRecipeFile')}
              </button>
            </div>

            {tab === 'text' ? (
              <textarea
                className="input w-full py-3 text-sm"
                rows={8}
                placeholder={t('pasteRecipePlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="input w-full py-2 text-sm"
                />
                {file && file.type.startsWith('image/') && (
                  <div className="rounded-lg overflow-hidden border border-[var(--divider)] max-h-40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                )}
                {file && file.type === 'application/pdf' && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-[var(--divider)] text-sm text-fg-secondary">
                    <DocumentTextIcon className="w-5 h-5" />
                    {file.name}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
              <button
                onClick={handleExtract}
                disabled={loading || (tab === 'text' ? !text.trim() : !file)}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {loading ? (
                  <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> {t('extracting')}</>
                ) : (
                  <><SparklesIcon className="w-4 h-4" /> {t('extractRecipe')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Review Step (full-screen split) ──────────────────────────────────

  const isRtl = direction === 'rtl';
  const hasDocumentPreview = tab === 'upload' && previewUrl;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* ─ Header ─ */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
        <div className="flex items-center gap-3">
          <SparklesIcon className="w-5 h-5 text-brand-500" />
          <h3 className="font-semibold text-fg-primary">{t('importRecipe')}</h3>
          {mode.kind === 'menu-item' && (
            <span className="text-sm text-fg-secondary">— {mode.menuItem.name}</span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
            {editedIngredients.length} {t('ingredients')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setStep('input'); setExtraction(null); }} className="btn-secondary text-sm">{t('back')}</button>
          <button
            onClick={handleConfirm}
            disabled={loading || editedIngredients.length === 0 || (mode.kind === 'prep' && !editedName.trim())}
            className="btn-primary text-sm"
          >
            {loading ? t('saving') : t('confirmImport')}
          </button>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none px-2">&times;</button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-500/10 text-red-500 text-sm">{error}</div>
      )}

      {/* ─ Main content ─ */}
      <div className={`flex flex-1 min-h-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
        {/* ─ Document preview (left) — only for file uploads ─ */}
        {hasDocumentPreview && (
          <div className={`w-1/2 border-[var(--divider)] overflow-auto p-4 flex flex-col ${isRtl ? 'border-l' : 'border-r'}`}>
            <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-3">{t('originalDocument')}</h4>
            <div className="flex-1 rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
              {file?.type.startsWith('image/') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl!} alt="Recipe document" className="w-full h-auto" />
              )}
              {file?.type === 'application/pdf' && (
                <iframe src={previewUrl!} className="w-full h-full min-h-[70vh]" title="Recipe document" />
              )}
            </div>
          </div>
        )}

        {/* ─ For text input, show the original text on the left ─ */}
        {!hasDocumentPreview && tab === 'text' && (
          <div className={`w-1/2 border-[var(--divider)] overflow-auto p-4 flex flex-col ${isRtl ? 'border-l' : 'border-r'}`}>
            <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-3">{t('originalText')}</h4>
            <pre className="flex-1 rounded-lg p-4 text-sm text-fg-primary whitespace-pre-wrap overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }} dir="auto">
              {text}
            </pre>
          </div>
        )}

        {/* ─ Ingredients editor (right) ─ */}
        <div className={`${hasDocumentPreview || tab === 'text' ? 'w-1/2' : 'w-full'} overflow-y-auto p-4`}>
          {/* Prep name (only when creating a new prep item) */}
          {mode.kind === 'prep' && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <label className="text-sm text-fg-secondary font-medium shrink-0">{t('nameLabel')}:</label>
              <input
                type="text"
                className="input flex-1 py-1.5 text-sm"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder={t('addPrepItem')}
                autoFocus
              />
            </div>
          )}

          {/* Recipe yield */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
            <label className="text-sm text-fg-secondary font-medium">
              {mode.kind === 'prep' ? t('yieldPerBatch') : t('recipeYield')}:
            </label>
            <input type="number" step="any" min="0" className="input w-24 py-1.5 text-sm text-right"
              value={editedYield || ''} onChange={(e) => setEditedYield(+e.target.value)} />
            <select className="input w-20 py-1.5 text-sm" value={editedYieldUnit} onChange={(e) => setEditedYieldUnit(e.target.value)}>
              <option value="kg">kg</option><option value="g">g</option>
              <option value="l">l</option><option value="ml">ml</option>
              <option value="unit">unit</option>
            </select>
          </div>

          {/* Ingredients list */}
          <div className="space-y-3">
            {editedIngredients.map((ing, idx) => {
              const matched = ing.stock_item_id ? stockItems.find((s) => s.id === ing.stock_item_id) : null;
              return (
                <div key={idx} className="p-4 rounded-lg space-y-3" style={{ background: 'var(--surface-subtle)' }}>
                  {/* Row 1: Name + badge + delete */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-fg-primary">{ing.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${matched ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {matched ? t('existing') : t('new')}
                      </span>
                      <button onClick={() => setEditedIngredients(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-red-400 hover:text-red-300">
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
                            unit: si?.unit || ing.unit,
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
                      options={stockOptions}
                      placeholder={`${t('newItem')}: ${ing.name}`}
                    />
                  </div>

                  {/* Row 3: Category (new items only) */}
                  {!matched && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                        <input className="input w-full py-1.5 text-sm" value={ing.name}
                          onChange={(e) => updateIngredient(idx, { name: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('category')}</label>
                        <select className="input w-full py-1.5 text-sm" value={ing.category}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-fg-secondary font-medium mb-1 block">
                        {t('quantityNeededPerServing') || `${t('quantity')} / ${t('recipeYield') || 'serving'}`}
                      </label>
                      <input
                        type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                        value={ing.quantity_needed || ''}
                        onChange={(e) => updateIngredient(idx, { quantity_needed: +e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('unit')}</label>
                      <div className="input w-full py-1.5 text-sm bg-[var(--surface)] text-fg-secondary cursor-not-allowed">
                        {ing.unit || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Matched: cost pulled from stock */}
                  {matched && ing.cost_per_unit > 0 && (
                    <div className="p-3 rounded-lg text-xs text-fg-secondary" style={{ background: 'var(--surface)' }}>
                      <div className="flex items-center justify-between">
                        <span>{t('costPerUnit')} ({t('fromStock') || 'from stock'})</span>
                        <span className="font-semibold text-fg-primary">
                          {ing.cost_per_unit.toFixed(4)} &#8362;/{ing.unit} {t('exVat')} | {(ing.cost_per_unit * vatMultiplier).toFixed(4)} &#8362;/{ing.unit} {t('incVat')}
                        </span>
                      </div>
                      {ing.quantity_needed > 0 && (
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--divider)]">
                          <span>{t('totalPrice')} ({ing.quantity_needed} {ing.unit})</span>
                          <span>
                            {(ing.cost_per_unit * ing.quantity_needed).toFixed(2)} &#8362; {t('exVat')} | {(ing.cost_per_unit * ing.quantity_needed * vatMultiplier).toFixed(2)} &#8362; {t('incVat')}
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
        </div>
      </div>
    </div>
  );
}
