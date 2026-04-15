'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  setRecipeSteps,
  updateRecipeMeta,
  setRecipeYield,
  getRecipeSteps,
  MenuItem, MenuItemIngredient, PrepItem, RecipeStepInput, StockItem,
  OptionSet, ItemOptionOverride,
} from '@/lib/api';
import MenuItemIngredientsEditor from '@/components/food-cost/MenuItemIngredientsEditor';
import RecipeImportModal from '@/app/[restaurantId]/kitchen/RecipeImportModal';
import FormSection from '@/components/FormSection';
import {
  PrinterIcon, SparklesIcon, ClockIcon, PlusIcon, TrashIcon,
  ChevronUpIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

export interface MenuItemRecipeTabHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

interface Props {
  rid: number;
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onIngredientsSaved: (ings: MenuItemIngredient[]) => void;
  // Invoked after save so the shell can reload the item (yield may have changed).
  onRecipeSaved?: () => void;
  // Recipe configuration (yield + portion) — owned by the shell so this tab
  // and the rest of the modal share one state.
  yieldValue: number;
  yieldUnit: string;
  onYieldChange: (qty: number, unit: string) => void;
  portionSize: number;
  portionSizeUnit: string;
  onPortionChange: (qty: number, unit: string) => void;
  // Variant context for the ingredient matrix. The list of attached OptionSets
  // (typically the "Tailles" set with Normal/Grand rows) drives one column per
  // variant in the ingredient editor; overrides let the user set a different
  // quantity per variant (e.g. 200 g beef for Normal vs 400 g for Grand).
  attachedOptionSets: OptionSet[];
  itemOptionOverrides: ItemOptionOverride[];
}

// Recipe tab — replaces the standalone Recipe detail page. Owns:
// - ingredients (via MenuItemIngredientsEditor, which auto-saves on its own)
// - yield + portion
// - recipe steps
// - prep time + chef notes
// - AI import + print
//
// Exposes an imperative handle so the FormModal's Save button can flush the
// steps/meta buffer alongside the Details tab's updateMenuItem.
const MenuItemRecipeTab = forwardRef<MenuItemRecipeTabHandle, Props>(function MenuItemRecipeTab(
  { rid, item, ingredients, stockItems, prepItems, onIngredientsSaved, onRecipeSaved,
    yieldValue, yieldUnit, onYieldChange,
    portionSize, portionSizeUnit, onPortionChange,
    attachedOptionSets, itemOptionOverrides },
  ref,
) {
  const { t } = useI18n();

  const [steps, setSteps] = useState<RecipeStepInput[]>([]);
  const [prepTime, setPrepTime] = useState(item.prep_time_mins ?? 0);
  const [notes, setNotes] = useState(item.recipe_notes ?? '');
  const [showImportModal, setShowImportModal] = useState(false);
  const [loadedSteps, setLoadedSteps] = useState<RecipeStepInput[]>([]);

  // Load existing steps from the server
  useEffect(() => {
    let cancel = false;
    getRecipeSteps(rid, item.id)
      .then((raw) => {
        if (cancel) return;
        const mapped: RecipeStepInput[] = raw.length > 0
          ? raw.map((s) => ({
              step_number: s.step_number,
              instruction: s.instruction,
              image_url: s.image_url || '',
              duration_mins: s.duration_mins || 0,
            }))
          : [];
        setSteps(mapped);
        setLoadedSteps(mapped);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [rid, item.id]);

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { step_number: prev.length + 1, instruction: '', image_url: '', duration_mins: 0 },
    ]);
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };
  const updateStep = (idx: number, field: keyof RecipeStepInput, value: string | number) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  // Yield is owned by the shell; the Details tab's updateMenuItem call writes
  // it. This tab no longer touches recipe_yield to avoid two writers racing.
  const isDirty = () =>
    prepTime !== (item.prep_time_mins ?? 0)
    || notes !== (item.recipe_notes ?? '')
    || JSON.stringify(steps) !== JSON.stringify(loadedSteps);

  const save = async () => {
    const numbered = steps.map((s, i) => ({ ...s, step_number: i + 1 }));
    await Promise.all([
      setRecipeSteps(rid, item.id, numbered),
      updateRecipeMeta(rid, item.id, { prep_time_mins: prepTime, recipe_notes: notes }),
    ]);
    setLoadedSteps(numbered);
    onRecipeSaved?.();
  };

  useImperativeHandle(ref, () => ({ save, isDirty }), [save, isDirty]);

  return (
    <div className="space-y-5">
      {/* Top actions: Import / Print */}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--divider)] text-brand-500 hover:bg-brand-500/5 transition-colors"
        >
          <SparklesIcon className="h-4 w-4" />
          {t('importRecipe')}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--divider)] text-fg-secondary hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <PrinterIcon className="h-4 w-4" />
          {t('printRecipe')}
        </button>
      </div>

      {/* Recipe type + portion + yield — the full kitchen-economics config
          for this item. Replaces the old "Gestion des stocks" section from
          the Details tab (now its home). */}
      {(() => {
        const isPerItem = yieldValue === 0;
        const hasVariants = attachedOptionSets.length > 0
          || (item.variant_groups ?? []).some((g) => (g.variants ?? []).length > 0);
        return (
          <FormSection title={t('recipeType')}>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  onYieldChange(0, 'kg');
                  if ((portionSize ?? 0) <= 0) onPortionChange(1, 'unit');
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
                    onYieldChange(1, 'kg');
                    if ((portionSize ?? 0) <= 0) onPortionChange(0, 'g');
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

            {/* Yield — only in batch mode */}
            {!isPerItem && (
              <div className="mb-4">
                <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('recipeYield')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="any" min={0}
                    className="input w-32 py-1.5 text-sm text-right"
                    value={yieldValue || ''}
                    onChange={(e) => onYieldChange(+e.target.value, yieldUnit)}
                  />
                  <select
                    className="input w-20 py-1.5 text-sm"
                    value={yieldUnit}
                    onChange={(e) => onYieldChange(yieldValue, e.target.value)}
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">l</option>
                    <option value="ml">ml</option>
                    <option value="unit">unit</option>
                  </select>
                </div>
              </div>
            )}

            {/* Portion par défaut — base serving size for variant scaling. Hidden
                only when a batch recipe delegates per-variant portions to its
                variants (each variant picks its own serving size). */}
            <div>
              <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1.5">{t('defaultPortion')}</label>
              {!isPerItem && hasVariants ? (
                <p className="text-sm text-fg-secondary py-1.5 opacity-60">{t('portionFromVariants')}</p>
              ) : (
                <>
                  <p className="text-xs text-fg-tertiary mb-2">
                    {isPerItem ? t('portionPerItemDesc') : t('portionBulkDesc')}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" step="any" min={0}
                      className="input w-32 py-1.5 text-sm text-right"
                      value={portionSize || ''}
                      onChange={(e) => onPortionChange(+e.target.value, portionSizeUnit)}
                    />
                    <select
                      className="input w-20 py-1.5 text-sm"
                      value={portionSizeUnit}
                      onChange={(e) => onPortionChange(portionSize, e.target.value)}
                    >
                      <option value="unit">unit</option>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </FormSection>
        );
      })()}

      {/* Ingredients editor — matrix view, one column per variant */}
      <FormSection title={t('foodCostIngredients')}>
        <MenuItemIngredientsEditor
          rid={rid}
          menuItem={item}
          initialIngredients={ingredients}
          stockItems={stockItems}
          prepItems={prepItems}
          onSaved={onIngredientsSaved}
          effectiveYield={yieldValue}
        />
      </FormSection>

      {/* Prep time */}
      <FormSection title={t('prepTime')}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            className="input text-sm w-24"
            value={prepTime || ''}
            onChange={(e) => setPrepTime(+e.target.value)}
          />
          <span className="text-xs text-fg-secondary">min</span>
        </div>
      </FormSection>

      {/* Steps */}
      <FormSection title={t('recipeInstructions')}>
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div key={idx} className="rounded-lg border border-[var(--divider)] bg-[var(--surface-subtle)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                  {t('recipeStepNumber').replace('{n}', String(idx + 1))}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'down')}
                    disabled={idx === steps.length - 1}
                    className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <textarea
                value={step.instruction}
                onChange={(e) => updateStep(idx, 'instruction', e.target.value)}
                placeholder={t('recipeStepInstruction')}
                rows={3}
                className="input w-full text-sm resize-none"
              />
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-fg-secondary" />
                <input
                  type="number"
                  min={0}
                  value={step.duration_mins || ''}
                  onChange={(e) => updateStep(idx, 'duration_mins', Number(e.target.value))}
                  placeholder={t('recipeStepDuration')}
                  className="input w-24 text-sm"
                />
                <span className="text-xs text-fg-secondary">min</span>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addStep}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-[var(--divider)] text-sm text-fg-secondary hover:border-brand-500 hover:text-brand-500 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            {t('addRecipeStep')}
          </button>
        </div>
      </FormSection>

      {/* Chef notes */}
      <FormSection title={t('recipeNotes')}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('recipeNotesPlaceholder')}
          rows={4}
          className="input text-sm w-full resize-none"
        />
      </FormSection>

      {showImportModal && (
        <RecipeImportModal
          rid={rid}
          menuItem={item}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            onRecipeSaved?.();
          }}
        />
      )}
    </div>
  );
});

export default MenuItemRecipeTab;
