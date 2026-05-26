'use client';

import { useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
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
import RecipeTable, { type VariantColumn } from './RecipeTable';
import RecipeImportModal from '@/app/[restaurantId]/kitchen/RecipeImportModal';
import RecipeStepsEditor, {
  splitInstruction,
  joinInstruction,
  type StepView,
} from '@/components/recipe/RecipeStepsEditor';

export interface VariantRef {
  option_id: number;
  name: string;
}

// Figma MenuItemDetails.tsx:323-642 — Recette tab.
// Expandable ingredient cards with 2-mode quantity system:
//   fixed  → quantity_needed + unit apply to every variant
//   custom → variant_overrides[] supplies a per-variant quantity

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
  /** Re-fetch the full item + ingredients after the AI import flow attaches
   *  new ingredients server-side. Triggers a full reload on the parent. */
  onImported?: () => Promise<void> | void;
}

const MenuItemTabRecipe = forwardRef<MenuItemTabRecipeHandle, Props>(function MenuItemTabRecipe(
  {
    rid, item, ingredients, stockItems, prepItems, variants,
    onAddIngredient, onDeleteIngredient, onUpdateIngredient, onRefreshLists, onImported,
  }: Props,
  ref,
) {
  const { t } = useI18n();

  // Per-size quantities are an advanced case — most recipes use the same
  // quantity for every size. Default to a single column and only reveal the
  // per-variant grid when the item actually has sizes AND the owner opts in.
  // If the recipe already carries per-variant overrides, start expanded so
  // existing data stays visible (the owner can still collapse it).
  const hasVariants = variants.length > 0;
  const hasOverrides = ingredients.some((i) =>
    (i.variant_overrides ?? []).some((o) => (o.quantity ?? 0) > 0),
  );
  const [perSize, setPerSize] = useState(false);
  useEffect(() => {
    if (hasOverrides) setPerSize(true);
  }, [hasOverrides]);
  const tableVariants: VariantRef[] = perSize ? variants : [];

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
  // Local view shape (StepView) splits `instruction` into title + description.
  const [steps, setSteps] = useState<StepView[]>([]);
  const [prepTime, setPrepTime] = useState<number>(item.prep_time_mins ?? 0);
  const [notes, setNotes] = useState<string>(item.recipe_notes ?? '');
  const [dirty, setDirty] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleStepsChange = (next: StepView[]) => {
    setSteps(next);
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent + AI import shortcut */}
      <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-5)]">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
          <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabRecipe') || 'Recette'}</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-sm border border-[var(--line-strong)] text-[var(--brand-500)] hover:bg-[var(--brand-500)]/5 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {t('importRecipe') || 'Importer une recette'}
        </button>
      </div>

      {/* Ingrédients — table editor (one row per ingredient × one column per variant).
          The picker appears *above* the table when adding so the user keeps
          context on what's already in the recipe while choosing what to add. */}
      <div className="mb-[var(--s-6)] flex flex-col gap-[var(--s-4)]">
        {hasVariants && (
          <label className="inline-flex items-center gap-[var(--s-2)] text-fs-sm text-[var(--fg-muted)] cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={perSize}
              onChange={(e) => setPerSize(e.target.checked)}
              className="w-4 h-4 accent-[var(--brand-500)]"
            />
            {t('recipePerSize') || 'Quantités différentes par taille ?'}
          </label>
        )}
        {addingDraft && (
          <SimpleIngredientPicker
            rid={rid}
            menuItemName={item.name}
            stockItems={stockItems}
            prepItems={prepItems}
            variants={tableVariants}
            saving={draftSaving}
            onAdd={handleAddFromDraft}
            onCancel={() => setAddingDraft(false)}
            onRefreshLists={onRefreshLists}
          />
        )}
        <RecipeTable
            item={item}
            ingredients={ingredients}
            variants={tableVariants.map((v): VariantColumn => ({
              optionId: v.option_id,
              name: v.name,
            }))}
            onUpdate={onUpdateIngredient}
            onDelete={onDeleteIngredient}
            onAddClick={() => setAddingDraft(true)}
          />
      </div>

      {/* Instructions de préparation — shared with the prep recipe tab */}
      <RecipeStepsEditor
        steps={steps}
        prepTime={prepTime}
        notes={notes}
        onStepsChange={handleStepsChange}
        onPrepTimeChange={(n) => {
          setPrepTime(n);
          setDirty(true);
        }}
        onNotesChange={(v) => {
          setNotes(v);
          setDirty(true);
        }}
      />
      </section>

      {showImportModal && (
        <RecipeImportModal
          rid={rid}
          mode={{ kind: 'menu-item', menuItem: item }}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            setShowImportModal(false);
            await onImported?.();
          }}
        />
      )}
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

  // New ingredients start with no variant overrides — the chef types each
  // variant cell in the recipe table (or uses the bulk-fill multiplier helper).
  const seedOverrides = (_unit: string): IngredientVariantOverride[] => [];

  const submit = async (input: IngredientInput) => {
    await onAdd(input);
  };

  const handlePickBrut = async (s: StockItem) => {
    const unit = s.unit ?? 'g';
    await submit({
      stock_item_id: s.id,
      quantity_needed: 0,
      unit,
      variant_overrides: seedOverrides(unit),
    });
  };

  const handlePickPrep = async (p: PrepItem) => {
    const unit = p.unit ?? 'portion';
    await submit({
      prep_item_id: p.id,
      quantity_needed: 0,
      unit,
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

