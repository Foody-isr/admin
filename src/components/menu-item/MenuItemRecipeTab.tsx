'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  setRecipeSteps,
  updateRecipeMeta,
  setRecipeYield,
  getRecipeSteps,
  MenuItem, MenuItemIngredient, PrepItem, RecipeStepInput, StockItem,
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
  { rid, item, ingredients, stockItems, prepItems, onIngredientsSaved, onRecipeSaved },
  ref,
) {
  const { t } = useI18n();

  const [steps, setSteps] = useState<RecipeStepInput[]>([]);
  const [prepTime, setPrepTime] = useState(item.prep_time_mins ?? 0);
  const [notes, setNotes] = useState(item.recipe_notes ?? '');
  const [yieldValue, setYieldValue] = useState(item.recipe_yield ?? 0);
  const [yieldUnit, setYieldUnit] = useState(item.recipe_yield_unit || 'kg');
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

  const isDirty = () =>
    prepTime !== (item.prep_time_mins ?? 0)
    || notes !== (item.recipe_notes ?? '')
    || yieldValue !== (item.recipe_yield ?? 0)
    || yieldUnit !== (item.recipe_yield_unit || 'kg')
    || JSON.stringify(steps) !== JSON.stringify(loadedSteps);

  const save = async () => {
    const numbered = steps.map((s, i) => ({ ...s, step_number: i + 1 }));
    await Promise.all([
      setRecipeSteps(rid, item.id, numbered),
      updateRecipeMeta(rid, item.id, { prep_time_mins: prepTime, recipe_notes: notes }),
      (yieldValue !== (item.recipe_yield ?? 0) || yieldUnit !== (item.recipe_yield_unit || 'kg'))
        ? setRecipeYield(rid, item.id, yieldValue, yieldUnit)
        : Promise.resolve(),
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

      {/* Recipe yield (whole batch). Portion size lives on the Details tab's
          Stock Management section — single source of truth. */}
      <FormSection title={t('recipeYield')}>
        <div className="flex gap-2 max-w-sm">
          <input
            type="number"
            step="any"
            min={0}
            className="input text-sm flex-1"
            value={yieldValue || ''}
            onChange={(e) => setYieldValue(+e.target.value)}
          />
          <select
            className="input text-sm w-24"
            value={yieldUnit}
            onChange={(e) => setYieldUnit(e.target.value)}
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="unit">unit</option>
          </select>
        </div>
      </FormSection>

      {/* Ingredients editor */}
      <FormSection title={t('foodCostIngredients')}>
        <MenuItemIngredientsEditor
          rid={rid}
          menuItem={item}
          initialIngredients={ingredients}
          stockItems={stockItems}
          prepItems={prepItems}
          onSaved={onIngredientsSaved}
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
