'use client';

import { useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import {
  ChevronDown, FlaskConical, Package, Plus, Trash2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  getRecipeSteps,
  setRecipeSteps as apiSetRecipeSteps,
  updateRecipeMeta,
  type MenuItem,
  type MenuItemIngredient,
  type StockItem,
  type PrepItem,
  type RecipeStep,
  type RecipeStepInput,
} from '@/lib/api';

// Backend stores a single `instruction` string per step. Figma shows a
// title + description. We split on the first newline: line 1 is the title,
// remainder is the description.
function splitInstruction(src: string): { title: string; description: string } {
  const [first, ...rest] = (src ?? '').split('\n');
  return { title: first ?? '', description: rest.join('\n') };
}
function joinInstruction(title: string, description: string): string {
  if (!description) return title;
  return `${title}\n${description}`;
}

// Figma MenuItemDetails.tsx:323-642 — Recette tab.
// Renders ingredients + numbered instructions matching Figma exactly.
// The 3-mode quantity system (adapt/fixed/custom) is NOT ported — our
// backend uses `scales_with_variant` which maps to adapt vs fixed only.

export interface MenuItemTabRecipeHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

interface Props {
  rid: number;
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onOpenIngredientsEditor: () => void;
  onDeleteIngredient: (id: number) => void;
}

function ingredientType(ing: MenuItemIngredient): 'preparation' | 'brut' {
  return ing.prep_item_id ? 'preparation' : 'brut';
}

function ingredientName(ing: MenuItemIngredient): string {
  return (
    ing.prep_item?.name
    || ing.stock_item?.name
    || `#${ing.prep_item_id ?? ing.stock_item_id ?? '?'}`
  );
}

function ingredientDescription(ing: MenuItemIngredient): string {
  if (ing.prep_item) return ing.prep_item.category ?? '';
  if (ing.stock_item) return ing.stock_item.category ?? '';
  return '';
}

const MenuItemTabRecipe = forwardRef<MenuItemTabRecipeHandle, Props>(function MenuItemTabRecipe(
  { rid, item, ingredients, onOpenIngredientsEditor, onDeleteIngredient }: Props,
  ref,
) {
  const { t } = useI18n();

  // Recipe steps state — loaded from API, mutated locally, saved on main form save.
  // Local view shape: split `instruction` into title + description for the Figma card.
  interface StepView {
    title: string;
    description: string;
    duration_mins: number;
  }
  const [steps, setSteps] = useState<StepView[]>([]);
  const [prepTime, setPrepTime] = useState<number>(item.prep_time_mins ?? 0);
  const [notes, setNotes] = useState<string>(item.recipe_notes ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    getRecipeSteps(rid, item.id)
      .then((data) => {
        if (alive) {
          setSteps(
            (data ?? []).map((s: RecipeStep) => {
              const parts = splitInstruction(s.instruction);
              return {
                title: parts.title,
                description: parts.description,
                duration_mins: s.duration_mins ?? 0,
              };
            }),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rid, item.id]);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (!dirty) return;
        const payload: RecipeStepInput[] = steps.map((s, i) => ({
          step_number: i + 1,
          instruction: joinInstruction(s.title, s.description),
          duration_mins: s.duration_mins,
        }));
        await apiSetRecipeSteps(rid, item.id, payload);
        await updateRecipeMeta(rid, item.id, {
          prep_time_mins: prepTime,
          recipe_notes: notes,
        });
        setDirty(false);
      },
      isDirty: () => dirty,
    }),
    [dirty, rid, item.id, steps, prepTime, notes],
  );

  const addStep = () => {
    setSteps((s) => [...s, { title: '', description: '', duration_mins: 0 }]);
    setDirty(true);
  };

  const updateStep = (idx: number, patch: Partial<StepView>) => {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
    setDirty(true);
  };

  const removeStep = (idx: number) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t('tabRecipe')}
        </h3>
      </div>

      {/* Ingrédients */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white">
              {t('ingredients') || 'Ingrédients'} • {ingredients.length} {ingredients.length === 1 ? 'élément' : 'éléments'}
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {t('ingredientsSubtitle') || 'Liste des ingrédients nécessaires pour cette recette'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenIngredientsEditor}
            className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            {t('addIngredient') || 'Ajouter un ingrédient'}
          </button>
        </div>

        <div className="space-y-3">
          {ingredients.map((ing) => (
            <RecipeIngredientItem
              key={ing.id}
              ingredient={ing}
              onDelete={() => onDeleteIngredient(ing.id)}
            />
          ))}
          {ingredients.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl">
              {t('noIngredients') || 'Aucun ingrédient ajouté.'}
            </p>
          )}
        </div>
      </div>

      {/* Instructions de préparation */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white">
              {t('recipeInstructions') || 'Instructions de préparation'} • {steps.length} {steps.length === 1 ? 'étape' : 'étapes'}
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {t('recipeInstructionsSubtitle') || 'Étapes détaillées pour préparer ce plat'}
            </p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            {t('addStep') || 'Ajouter une étape'}
          </button>
        </div>

        <div className="space-y-4">
          {steps.map((step, idx) => (
            <InstructionItem
              key={idx}
              number={idx + 1}
              title={step.title ?? ''}
              time={step.duration_mins ? `${step.duration_mins} min` : ''}
              description={step.description ?? ''}
              onTitleChange={(v) => updateStep(idx, { title: v })}
              onTimeChange={(v) => updateStep(idx, { duration_mins: Number(v) || 0 })}
              onDescriptionChange={(v) => updateStep(idx, { description: v })}
              onDelete={() => removeStep(idx)}
            />
          ))}
          {steps.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl">
              {t('noInstructions') || 'Aucune étape définie.'}
            </p>
          )}
        </div>

        {/* Prep time + notes — foody-specific, minimal UI */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('prepTime') || 'Temps de préparation'}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={prepTime}
                onChange={(e) => {
                  setPrepTime(Number(e.target.value) || 0);
                  setDirty(true);
                }}
                className="w-full px-4 py-2.5 pr-14 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-600 dark:text-neutral-400 text-sm pointer-events-none">
                min
              </span>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('recipeNotes') || 'Notes'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              rows={2}
              className="w-full px-4 py-3 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default MenuItemTabRecipe;

// ─── Ingredient card — Figma:435-624 ───────────────────────────

function RecipeIngredientItem({
  ingredient,
  onDelete,
}: {
  ingredient: MenuItemIngredient;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const type = ingredientType(ingredient);
  const name = ingredientName(ingredient);
  const description = ingredientDescription(ingredient);
  const quantity = ingredient.quantity_needed ?? 0;
  const unit = ingredient.unit ?? '';
  const modeLabel = ingredient.scales_with_variant
    ? 'Adapté à la taille'
    : 'Quantité fixe';

  return (
    <div className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 transition-colors">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          className={`flex-shrink-0 size-10 rounded-lg flex items-center justify-center ${
            type === 'preparation'
              ? 'bg-purple-100 dark:bg-purple-900/30'
              : 'bg-blue-100 dark:bg-blue-900/30'
          }`}
        >
          {type === 'preparation' ? (
            <FlaskConical size={20} className="text-purple-600 dark:text-purple-400" />
          ) : (
            <Package size={20} className="text-blue-600 dark:text-blue-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="font-medium text-neutral-900 dark:text-white">{name}</h5>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                type === 'preparation'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}
            >
              {type === 'preparation' ? 'Préparation' : 'Ingrédient brut'}
            </span>
          </div>
          {description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
              {description}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="font-semibold text-neutral-900 dark:text-white">
            {quantity} {unit}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {modeLabel}
          </div>
        </div>

        <ChevronDown
          size={20}
          className={`text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          aria-label="Delete ingredient"
        >
          <Trash2 size={16} className="text-red-500" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-2 text-sm">
          {ingredient.scales_with_variant ? (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300 italic">
                Quantité = portion de chaque variante de l&apos;article.
              </p>
            </div>
          ) : (
            <p className="text-neutral-600 dark:text-neutral-400 italic">
              Même quantité pour chaque variante ({quantity} {unit}).
            </p>
          )}
          {description && (
            <p className="text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">Catégorie: </span>
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Numbered instruction item — Figma:627-642 ─────────────────

function InstructionItem({
  number,
  title,
  time,
  description,
  onTitleChange,
  onTimeChange,
  onDescriptionChange,
  onDelete,
}: {
  number: number;
  title: string;
  time: string;
  description: string;
  onTitleChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 size-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold">
        {number}
      </div>
      <div className="flex-1 bg-neutral-50 dark:bg-[#1a1a1a] rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3 mb-2">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Titre de l'étape"
            className="flex-1 bg-transparent font-semibold text-neutral-900 dark:text-white focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
          <div className="flex items-center gap-1 text-sm text-orange-500">
            <input
              type="number"
              min="0"
              value={time.replace(/[^0-9]/g, '') || ''}
              onChange={(e) => onTimeChange(e.target.value)}
              placeholder="0"
              className="w-14 bg-transparent text-right font-medium focus:outline-none placeholder:text-neutral-400"
            />
            <span>min</span>
            <button
              type="button"
              onClick={onDelete}
              className="ml-2 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              aria-label="Delete step"
            >
              <Trash2 size={14} className="text-red-500" />
            </button>
          </div>
        </div>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description de l'étape…"
          rows={2}
          className="w-full bg-transparent text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed resize-none focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />
      </div>
    </div>
  );
}
