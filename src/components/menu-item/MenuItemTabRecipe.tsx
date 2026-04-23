'use client';

import { useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import {
  ChevronDown, FlaskConical, Info, Package, Pin, Plus, Scale, Settings2, Trash2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  getRecipeSteps,
  setRecipeSteps as apiSetRecipeSteps,
  updateRecipeMeta,
  type MenuItem,
  type MenuItemIngredient,
  type IngredientVariantOverride,
  type StockItem,
  type PrepItem,
  type RecipeStep,
  type RecipeStepInput,
} from '@/lib/api';

export type QuantityMode = 'adapt' | 'fixed' | 'custom';

export interface VariantRef {
  option_id: number;
  name: string;
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
  onOpenIngredientsEditor: () => void;
  onDeleteIngredient: (id: number) => void;
  /** Persist a patched ingredient. Parent rewrites the full list via
   *  setMenuItemIngredients. */
  onUpdateIngredient: (id: number, patch: Partial<MenuItemIngredient>) => Promise<void>;
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

// Preps don't have a stock unit — they're consumed in "portion" by default.
function fallbackUnit(ing: MenuItemIngredient): string {
  if (ing.prep_item_id) return ing.prep_item?.unit || 'portion';
  return ing.stock_item?.unit || '';
}

function formatQty(n: number): string {
  // Drop trailing zeros: 250 → "250", 2.5 → "2.5", 0.75 → "0.75".
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(3));
}

const MenuItemTabRecipe = forwardRef<MenuItemTabRecipeHandle, Props>(function MenuItemTabRecipe(
  {
    rid, item, ingredients, variants,
    onOpenIngredientsEditor, onDeleteIngredient, onUpdateIngredient,
  }: Props,
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
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabRecipe') || 'Recette'}</h3>
      </div>

      {/* Ingrédients */}
      <div className="mb-[var(--s-6)]">
        <div className="flex items-center justify-between mb-[var(--s-3)]">
          <div>
            <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
              {t('ingredients') || 'Ingrédients'}
              <span className="text-[var(--fg-muted)] font-normal ms-1.5">
                · {ingredients.length} {ingredients.length === 1 ? 'élément' : 'éléments'}
              </span>
            </h4>
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('ingredientsSubtitle') || 'Liste des ingrédients nécessaires pour cette recette'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenIngredientsEditor}
            className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addIngredient') || 'Ajouter un ingrédient'}
          </button>
        </div>

        <div className="flex flex-col gap-[var(--s-2)]">
          {ingredients.map((ing) => (
            <RecipeIngredientItem
              key={ing.id}
              ingredient={ing}
              item={item}
              variants={variants}
              onDelete={() => onDeleteIngredient(ing.id)}
              onUpdate={(patch) => onUpdateIngredient(ing.id, patch)}
            />
          ))}
          {ingredients.length === 0 && (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border-2 border-dashed border-[var(--line-strong)]">
              {t('noIngredients') || 'Aucun ingrédient ajouté.'}
            </p>
          )}
        </div>
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
              time={step.duration_mins ? `${step.duration_mins} min` : ''}
              description={step.description ?? ''}
              onTitleChange={(v) => updateStep(idx, { title: v })}
              onTimeChange={(v) => updateStep(idx, { duration_mins: Number(v) || 0 })}
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

// ─── Ingredient card — Figma:435-624 ───────────────────────────

function deriveMode(ing: MenuItemIngredient): QuantityMode {
  if (ing.scales_with_variant) return 'adapt';
  if ((ing.variant_overrides ?? []).length > 0) return 'custom';
  return 'fixed';
}

function RecipeIngredientItem({
  ingredient,
  item,
  variants,
  onDelete,
  onUpdate,
}: {
  ingredient: MenuItemIngredient;
  item: MenuItem;
  variants: VariantRef[];
  onDelete: () => void;
  onUpdate: (patch: Partial<MenuItemIngredient>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const type = ingredientType(ingredient);
  const name = ingredientName(ingredient);
  const description = ingredientDescription(ingredient);
  const mode = deriveMode(ingredient);
  const quantity = ingredient.quantity_needed ?? 0;
  const unit = ingredient.unit ?? '';
  const modeLabel =
    mode === 'adapt'
      ? 'Adapté à la taille'
      : mode === 'fixed'
        ? 'Quantité fixe'
        : 'Personnalisé';

  // Header display — `quantity_needed` is 0 by design for `adapt` (qty derived
  // from the variant portion at cost time) and `custom` (qty lives per
  // variant). Rendering "0 g" in those modes is misleading, so we derive a
  // sensible label instead.
  const headerQty = (() => {
    if (mode === 'fixed') {
      if (quantity > 0) return `${formatQty(quantity)} ${unit || fallbackUnit(ingredient)}`.trim();
      return '\u2014';
    }
    if (mode === 'adapt') {
      // Adapt scales from the item's base portion — show that as the reference
      // so the user sees "250 g" on the Normal portion, not "0 g".
      const p = item.portion_size ?? 0;
      const u = item.portion_size_unit || unit || fallbackUnit(ingredient);
      return p > 0 ? `${formatQty(p)} ${u}`.trim() : '\u2014';
    }
    // custom — sum of all per-variant overrides, in the first override's unit
    const overrides = ingredient.variant_overrides ?? [];
    if (overrides.length === 0) return '\u2014';
    const total = overrides.reduce((acc, o) => acc + (o.quantity || 0), 0);
    const u = overrides[0]?.unit || unit || fallbackUnit(ingredient);
    return total > 0 ? `${formatQty(total)} ${u}`.trim() : '\u2014';
  })();

  const commit = async (patch: Partial<MenuItemIngredient>) => {
    setSaving(true);
    try {
      await onUpdate(patch);
    } finally {
      setSaving(false);
    }
  };

  const handleModeChange = async (next: QuantityMode) => {
    if (next === mode) return;
    if (next === 'adapt') {
      await commit({ scales_with_variant: true, variant_overrides: [] });
    } else if (next === 'fixed') {
      await commit({ scales_with_variant: false, variant_overrides: [] });
    } else {
      // Seed overrides with the current base qty for every attached variant.
      const seeded: IngredientVariantOverride[] = variants.map((v) => ({
        option_id: v.option_id,
        quantity,
        unit,
      }));
      await commit({ scales_with_variant: false, variant_overrides: seeded });
    }
  };

  const handleFixedQtyChange = async (qty: number, nextUnit: string) => {
    await commit({ quantity_needed: qty, unit: nextUnit, scales_with_variant: false, variant_overrides: [] });
  };

  const handleOverrideChange = async (optionId: number, qty: number, nextUnit: string) => {
    const existing = ingredient.variant_overrides ?? [];
    const next = existing.some((o) => o.option_id === optionId)
      ? existing.map((o) => (o.option_id === optionId ? { ...o, quantity: qty, unit: nextUnit } : o))
      : [...existing, { option_id: optionId, quantity: qty, unit: nextUnit }];
    await commit({ scales_with_variant: false, variant_overrides: next });
  };

  return (
    <div className="bg-[var(--surface)] rounded-r-md border border-[var(--line)] shadow-1 hover:border-[var(--line-strong)] transition-colors">
      {/* Header row */}
      <div
        className="flex items-center gap-[var(--s-3)] p-[var(--s-3)_var(--s-4)] cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          className="shrink-0 w-8 h-8 rounded-r-sm grid place-items-center text-white font-bold text-fs-xs"
          style={{
            background:
              type === 'preparation' ? 'var(--cat-5)' : 'var(--cat-4)',
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[var(--s-2)]">
            <span className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</span>
            <span
              className="inline-flex items-center h-[22px] px-2 text-fs-xs font-medium rounded-r-sm"
              style={{
                background: type === 'preparation'
                  ? 'color-mix(in oklab, var(--brand-500) 14%, transparent)'
                  : 'var(--surface-2)',
                color: type === 'preparation'
                  ? 'var(--brand-500)'
                  : 'var(--fg-muted)',
              }}
            >
              {type === 'preparation' ? 'Préparation' : 'Ingrédient brut'}
            </span>
          </div>
          {description && (
            <p className="text-fs-xs text-[var(--fg-muted)] truncate mt-0.5">
              {description}
            </p>
          )}
        </div>

        <div className="shrink-0 text-end">
          <div className="font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
            {headerQty}
          </div>
          <div className="text-fs-xs text-[var(--fg-subtle)]">{modeLabel}</div>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="shrink-0 p-1.5 rounded-r-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label="Toggle"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 p-1.5 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
          aria-label="Delete ingredient"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded: 3-mode selector */}
      {expanded && (
        <div className="px-[var(--s-4)] pb-[var(--s-4)] pt-[var(--s-4)] border-t border-[var(--line)] space-y-[var(--s-4)]">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-neutral-400" />
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Comment cet ingrédient est-il utilisé ?
              </label>
            </div>
            <div className="flex gap-2 flex-wrap">
              <ModeBtn
                icon={<Scale size={16} />}
                label="Adapter à la taille"
                active={mode === 'adapt'}
                onClick={() => handleModeChange('adapt')}
                disabled={saving}
              />
              <ModeBtn
                icon={<Pin size={16} />}
                label="Quantité fixe"
                active={mode === 'fixed'}
                onClick={() => handleModeChange('fixed')}
                disabled={saving}
              />
              <ModeBtn
                icon={<Settings2 size={16} />}
                label="Personnalisé par variante"
                active={mode === 'custom'}
                onClick={() => handleModeChange('custom')}
                disabled={saving || variants.length === 0}
                title={variants.length === 0 ? 'Ajoutez d\'abord des variantes à l\'article' : undefined}
              />
            </div>
          </div>

          {mode === 'adapt' && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300 italic">
                Quantité = portion de chaque variante (ex. Normal = 250 g, Grand = 500 g).
              </p>
            </div>
          )}

          {mode === 'fixed' && (
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 italic">
                Même quantité pour chaque variante.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Qté
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={quantity}
                  disabled={saving}
                  onBlur={(e) => handleFixedQtyChange(Number(e.target.value) || 0, unit)}
                  className="w-24 px-3 py-2 bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <select
                  defaultValue={unit || 'unit'}
                  disabled={saving}
                  onChange={(e) => handleFixedQtyChange(quantity, e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="unit">unit</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                  <option value="portion">portion</option>
                </select>
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 italic">
                Saisissez une quantité par variante. Laissez vide pour ignorer cette variante.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-4 px-3 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase">
                  <div className="col-span-6">Variante</div>
                  <div className="col-span-6 text-right">Qté / unité</div>
                </div>
                {variants.map((v) => {
                  const override = (ingredient.variant_overrides ?? []).find(
                    (o) => o.option_id === v.option_id,
                  );
                  const vqty = override?.quantity ?? quantity;
                  const vunit = override?.unit ?? unit ?? 'unit';
                  return (
                    <div
                      key={v.option_id}
                      className="grid grid-cols-12 gap-4 px-3 py-2 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="col-span-6 flex items-center">
                        <span className="font-medium text-neutral-900 dark:text-white">{v.name}</span>
                      </div>
                      <div className="col-span-6 flex items-center gap-2 justify-end">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          defaultValue={vqty}
                          disabled={saving}
                          placeholder="Qté"
                          onBlur={(e) => handleOverrideChange(v.option_id, Number(e.target.value) || 0, vunit)}
                          className="w-20 px-2 py-1.5 bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                        <select
                          defaultValue={vunit}
                          disabled={saving}
                          onChange={(e) => handleOverrideChange(v.option_id, vqty, e.target.value)}
                          className="px-2 py-1.5 bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        >
                          <option value="unit">unit</option>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="portion">portion</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
                {variants.length === 0 && (
                  <p className="text-xs text-neutral-500 italic">
                    Aucune variante attachée — ajoutez-en dans l&apos;onglet Options.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  icon, label, active, onClick, disabled, title,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
    >
      {icon}
      {label}
    </button>
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
            <input
              type="number"
              min="0"
              value={time.replace(/[^0-9]/g, '') || ''}
              onChange={(e) => onTimeChange(e.target.value)}
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
