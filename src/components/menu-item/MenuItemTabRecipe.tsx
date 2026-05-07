'use client';

import { useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  getRecipeSteps,
  setRecipeSteps as apiSetRecipeSteps,
  updateRecipeMeta,
  type MenuItem,
  type MenuItemIngredient,
  type IngredientInput,
  type IngredientVariantOverride,
  type StockItem,
  type PrepItem,
  type RecipeStep,
  type RecipeStepInput,
} from '@/lib/api';
import { RecipeComposer } from './RecipeComposer';
import CreateStockSheet from './CreateStockSheet';
import CreatePrepSheet from './CreatePrepSheet';
import { NumberInput } from '@/components/ui/NumberInput';
import RecipeTable, { type VariantColumn } from './RecipeTable';

export interface VariantRef {
  option_id: number;
  name: string;
  /** Optional per-variant portion size — when present, used to derive the
   *  default multiplier and to migrate legacy adapt-mode rows on load. */
  portion_size?: number;
  portion_size_unit?: string;
}

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
// Expandable ingredient cards with 3-mode quantity system:
//   adapt  → scales_with_variant = true, no overrides
//   fixed  → scales_with_variant = false, quantity_needed + unit apply to all
//   custom → scales_with_variant = false, variant_overrides[] per variant

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
  /** Attached variants — drives the "Personnalisé par variante" mode UI. */
  variants: VariantRef[];
  /** Append a new ingredient. Parent persists via setMenuItemIngredients. */
  onAddIngredient: (input: IngredientInput) => Promise<void>;
  onDeleteIngredient: (id: number) => void;
  /** Persist a patched ingredient. Parent rewrites the full list via
   *  setMenuItemIngredients. */
  onUpdateIngredient: (id: number, patch: Partial<MenuItemIngredient>) => Promise<void>;
  /** Re-fetch stockItems / prepItems after the composer creates a new one
   *  via a sub-sheet. Optional — composer falls back to the freshly created
   *  item directly even if the lists aren't refreshed. */
  onRefreshLists?: () => Promise<void> | void;
}

const MenuItemTabRecipe = forwardRef<MenuItemTabRecipeHandle, Props>(function MenuItemTabRecipe(
  {
    rid, item, ingredients, stockItems, prepItems, variants,
    onAddIngredient, onDeleteIngredient, onUpdateIngredient, onRefreshLists,
  }: Props,
  ref,
) {
  const { t } = useI18n();

  // Inline "add ingredient" draft. Click the button → a draft card appears
  // at the top of the list, already expanded with mode selection visible.
  // The user picks both the source and the mode before confirming.
  const [addingDraft, setAddingDraft] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  const handleAddFromDraft = async (input: IngredientInput) => {
    setDraftSaving(true);
    try {
      await onAddIngredient(input);
      setAddingDraft(false);
    } finally {
      setDraftSaving(false);
    }
  };

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
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabRecipe') || 'Recette'}</h3>
      </div>

      {/* Ingrédients — table editor (one row per ingredient × one column per variant).
          The picker appears *above* the table when adding so the user keeps
          context on what's already in the recipe while choosing what to add. */}
      <div className="mb-[var(--s-6)] flex flex-col gap-[var(--s-4)]">
        {addingDraft && (
          <SimpleIngredientPicker
            rid={rid}
            menuItemName={item.name}
            stockItems={stockItems}
            prepItems={prepItems}
            variants={variants}
            saving={draftSaving}
            onAdd={handleAddFromDraft}
            onCancel={() => setAddingDraft(false)}
            onRefreshLists={onRefreshLists}
          />
        )}
        <RecipeTable
            item={item}
            ingredients={ingredients}
            variants={variants.map((v): VariantColumn => ({
              optionId: v.option_id,
              name: v.name,
              portionSize: v.portion_size,
              portionSizeUnit: v.portion_size_unit,
            }))}
            onUpdate={onUpdateIngredient}
            onDelete={onDeleteIngredient}
            onAddClick={() => setAddingDraft(true)}
          />
      </div>

      {/* Instructions de préparation */}
      <div>
        <div className="flex items-center justify-between mb-[var(--s-3)]">
          <div>
            <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
              {t('recipeInstructions') || 'Instructions'}
              <span className="text-[var(--fg-muted)] font-normal ms-1.5">
                · {steps.length} {steps.length === 1 ? 'étape' : 'étapes'}
              </span>
            </h4>
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('recipeInstructionsSubtitle') || 'Étapes détaillées pour préparer ce plat'}
            </p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addStep') || 'Ajouter une étape'}
          </button>
        </div>

        <div className="flex flex-col gap-[var(--s-3)]">
          {steps.map((step, idx) => (
            <InstructionItem
              key={idx}
              number={idx + 1}
              title={step.title ?? ''}
              durationMins={step.duration_mins ?? 0}
              description={step.description ?? ''}
              onTitleChange={(v) => updateStep(idx, { title: v })}
              onTimeChange={(n) => updateStep(idx, { duration_mins: n })}
              onDescriptionChange={(v) => updateStep(idx, { description: v })}
              onDelete={() => removeStep(idx)}
            />
          ))}
          {steps.length === 0 && (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border-2 border-dashed border-[var(--line-strong)]">
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
              <NumberInput
                min={0}
                integer
                value={prepTime}
                onChange={(n) => {
                  setPrepTime(n);
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
              className="w-full px-[var(--s-3)] py-[var(--s-3)] bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-r-md text-[var(--fg)] text-fs-sm focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors resize-none"
            />
          </div>
        </div>
      </div>
      </section>
    </div>
  );
});

export default MenuItemTabRecipe;

// ─── Simple picker for the new table editor ─────────────────────
// User clicks "Ajouter un ingrédient" → this picker appears → they
// search/create a stock or prep item → on pick we immediately add
// the ingredient with empty defaults. The user fills the per-variant
// quantities directly in the table after that.

function SimpleIngredientPicker({
  rid,
  menuItemName,
  stockItems,
  prepItems,
  variants,
  saving,
  onAdd,
  onCancel,
  onRefreshLists,
}: {
  rid: number;
  menuItemName: string;
  stockItems: StockItem[];
  prepItems: PrepItem[];
  variants: VariantRef[];
  saving: boolean;
  onAdd: (input: IngredientInput) => Promise<void>;
  onCancel: () => void;
  onRefreshLists?: () => Promise<void> | void;
}) {
  const [createSheet, setCreateSheet] = useState<{ kind: 'brut' | 'prep'; query: string } | null>(
    null,
  );

  // Pre-fill variant cells with each variant's portion_size when we have it.
  // For a "main ingredient = dish weight" case (e.g. chicken in BTSOL
  // MARDNOUSS, where item.portion_size is the chicken weight), this means
  // ZERO typing — the cells already match. For other ingredients (olives,
  // sauce…) the user types in any one cell and the table re-scales the
  // others on blur.
  const seedOverrides = (unit: string) => {
    const overrides: IngredientVariantOverride[] = [];
    for (const v of variants) {
      if (v.portion_size && v.portion_size > 0) {
        overrides.push({
          option_id: v.option_id,
          quantity: v.portion_size,
          unit: v.portion_size_unit || unit,
        });
      }
    }
    return overrides;
  };

  const submit = async (input: IngredientInput) => {
    await onAdd(input);
  };

  const handlePickBrut = async (s: StockItem) => {
    const unit = s.unit ?? 'g';
    await submit({
      stock_item_id: s.id,
      quantity_needed: 0,
      unit,
      scales_with_variant: false,
      variant_overrides: seedOverrides(unit),
    });
  };

  const handlePickPrep = async (p: PrepItem) => {
    const unit = p.unit ?? 'portion';
    await submit({
      prep_item_id: p.id,
      quantity_needed: 0,
      unit,
      scales_with_variant: false,
      variant_overrides: seedOverrides(unit),
    });
  };

  const handleSheetCreatedBrut = async (created: StockItem) => {
    setCreateSheet(null);
    if (onRefreshLists) await onRefreshLists();
    await handlePickBrut(created);
  };
  const handleSheetCreatedPrep = async (created: PrepItem) => {
    setCreateSheet(null);
    if (onRefreshLists) await onRefreshLists();
    await handlePickPrep(created);
  };

  return (
    <>
      <RecipeComposer
        stockItems={stockItems}
        prepItems={prepItems}
        onPickBrut={handlePickBrut}
        onPickPrep={handlePickPrep}
        onCreateBrut={(q) => setCreateSheet({ kind: 'brut', query: q })}
        onCreatePrep={(q) => setCreateSheet({ kind: 'prep', query: q })}
        onClose={onCancel}
        autoFocus
        disabled={saving}
      />
      {createSheet?.kind === 'brut' && (
        <CreateStockSheet
          restaurantId={rid}
          itemName={menuItemName}
          initialName={createSheet.query}
          onCancel={() => setCreateSheet(null)}
          onCreated={handleSheetCreatedBrut}
        />
      )}
      {createSheet?.kind === 'prep' && (
        <CreatePrepSheet
          restaurantId={rid}
          menuItemName={menuItemName}
          initialName={createSheet.query}
          stockItems={stockItems}
          onCancel={() => setCreateSheet(null)}
          onCreated={handleSheetCreatedPrep}
        />
      )}
    </>
  );
}

// ─── Numbered instruction item — Figma:627-642 ─────────────────

function InstructionItem({
  number,
  title,
  durationMins,
  description,
  onTitleChange,
  onTimeChange,
  onDescriptionChange,
  onDelete,
}: {
  number: number;
  title: string;
  durationMins: number;
  description: string;
  onTitleChange: (v: string) => void;
  onTimeChange: (n: number) => void;
  onDescriptionChange: (v: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] shadow-1 p-[var(--s-4)] flex gap-[var(--s-4)]">
      <div
        className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-white font-bold text-fs-sm"
        style={{ background: 'var(--brand-500)' }}
      >
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-2)]">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Étape ${number}`}
            className="flex-1 bg-transparent text-fs-md font-medium text-[var(--fg)] focus:outline-none placeholder:text-[var(--fg-subtle)]"
          />
          <div className="flex items-center gap-1 text-fs-sm text-[var(--fg-muted)] shrink-0">
            <NumberInput
              min={0}
              integer
              value={durationMins}
              onChange={onTimeChange}
              placeholder="0"
              className="w-12 bg-transparent text-right font-mono tabular-nums text-[var(--fg)] focus:outline-none placeholder:text-[var(--fg-subtle)]"
            />
            <span>min</span>
            <button
              type="button"
              onClick={onDelete}
              className="ms-[var(--s-2)] p-1 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
              aria-label="Delete step"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description de l'étape…"
          rows={2}
          className="w-full bg-transparent text-fs-sm text-[var(--fg-muted)] leading-relaxed resize-none focus:outline-none placeholder:text-[var(--fg-subtle)]"
        />
      </div>
    </div>
  );
}
