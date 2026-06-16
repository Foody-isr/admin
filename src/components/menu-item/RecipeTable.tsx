'use client';

// RecipeTable — chef-friendly recipe editor.
//
// One row per ingredient, one column per variant. Each cell is the quantity
// of that ingredient consumed for a single sale of that variant. A small
// "Même quantité" toggle per row collapses all cells into a single value
// when the ingredient doesn't change with variant size.
//
// Two-mode serialization, derived from cell state at save time:
//   • "Même quantité" toggle on → quantity_needed + unit, no overrides
//   • Cells differ per variant  → variant_overrides[] (one row per variant)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, FlaskConical, Package, Plus, Sparkles, Trash2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import RecipeUnitSelect from './RecipeUnitSelect';
import {
  type IngredientInput,
  type IngredientVariantOverride,
  type MenuItem,
  type MenuItemIngredient,
  type PrepItem,
  type StockItem,
} from '@/lib/api';
import { computePrepUnitCostExVat } from '@/lib/cost-utils';
import { convertToBaseUnit, customUnitFactor, sameUnitFamily, type UnitConversionLike } from '@/lib/units';
import { BRUT_COLOR, PREP_COLOR } from './RecipeComposer';

export interface VariantColumn {
  /** Backend option_id for this variant. */
  optionId: number;
  /** Display name (e.g. "Pour Table 8"). */
  name: string;
}

interface RecipeTableProps {
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  variants: VariantColumn[];
  onUpdate: (id: number, patch: Partial<MenuItemIngredient>) => Promise<void>;
  onDelete: (id: number) => void;
  onAddClick: () => void;
}

// Internal row shape — one per MenuItemIngredient. Drives cell rendering.
interface Row {
  id: number;
  name: string;
  isPrep: boolean;
  unit: string;
  /** When true, all cells display a single base value. */
  sameForAll: boolean;
  /** The base quantity (used when sameForAll, otherwise empty/legacy fallback). */
  baseQty: number;
  /** Per-variant overrides keyed by option_id. */
  cells: Map<number, number>;
  /** Cost reference. Populated from the API ingredient so the table can show
   *  per-variant totals without an extra fetch. `null` when the ingredient
   *  isn't priced (new stock item, prep with zero yield, etc.). */
  costPerUnit: number | null;
  costUnit: string | null;
  /** Stock item's custom-unit conversions, so a custom unit (e.g. "piece")
   *  picked for this row resolves to a real cost/deduction. Empty for preps. */
  conversions: UnitConversionLike[];
  /** Linked stock item id, so the unit picker can deep-link to the stock
   *  editor where conversions are managed. Null for prep rows. */
  stockItemId: number | null;
}

// Resolve unit cost for an ingredient. Stock items expose cost_per_unit
// directly; prep items derive theirs from sub-ingredients × yield. Both
// are returned ex-VAT — VAT is presentation-only and lives in the Coût tab.
function resolveCost(ing: MenuItemIngredient): { cost: number | null; unit: string | null } {
  if (ing.prep_item) {
    const derived = computePrepUnitCostExVat(ing.prep_item);
    const cost = derived ?? ing.prep_item.cost_per_unit ?? null;
    return { cost: cost && cost > 0 ? cost : null, unit: ing.prep_item.unit ?? null };
  }
  if (ing.stock_item) {
    const c = ing.stock_item.cost_per_unit ?? 0;
    return { cost: c > 0 ? c : null, unit: ing.stock_item.unit ?? null };
  }
  return { cost: null, unit: null };
}

function ingredientName(ing: MenuItemIngredient): string {
  return (
    ing.prep_item?.name
    || ing.stock_item?.name
    || `#${ing.prep_item_id ?? ing.stock_item_id ?? '?'}`
  );
}

// Derive a sensible row unit. Priority: ingredient.unit (fixed mode) →
// first override's unit (custom mode) → stock/prep native unit → 'g'.
function rowUnit(ing: MenuItemIngredient): string {
  if (ing.unit) return ing.unit;
  const overrides = ing.variant_overrides ?? [];
  if (overrides[0]?.unit) return overrides[0].unit;
  if (ing.prep_item?.unit) return ing.prep_item.unit;
  if (ing.stock_item?.unit) return ing.stock_item.unit;
  return 'g';
}

// Convert an API ingredient into the table row shape.
function toRow(ing: MenuItemIngredient, _variants: VariantColumn[]): Row {
  const overrides = ing.variant_overrides ?? [];
  const cells = new Map<number, number>();
  if (overrides.length > 0) {
    for (const ov of overrides) cells.set(ov.option_id, ov.quantity);
  }
  // sameForAll = no per-variant data, but a base quantity is set.
  const baseQty = ing.quantity_needed ?? 0;
  const sameForAll = cells.size === 0;
  const { cost, unit: costUnit } = resolveCost(ing);
  return {
    id: ing.id,
    name: ingredientName(ing),
    isPrep: !!ing.prep_item_id,
    unit: rowUnit(ing),
    sameForAll,
    baseQty,
    cells,
    costPerUnit: cost,
    costUnit,
    conversions: ing.stock_item?.unit_conversions ?? [],
    stockItemId: ing.stock_item?.id ?? ing.stock_item_id ?? null,
  };
}

// Translate a row back into an API patch.
//   sameForAll → quantity_needed + unit, no overrides.
//   Otherwise  → variant_overrides[] for EVERY cell (including 0), so the
//                round-trip preserves the "per-variant" mode even when the
//                user has only unchecked the toggle without entering values.
//                Without this, a row with all-zero cells would load back as
//                sameForAll=true and the toggle would visually re-check.
function rowToPatch(row: Row, allVariantIds: number[]): Partial<MenuItemIngredient> {
  if (row.sameForAll) {
    return {
      quantity_needed: row.baseQty,
      unit: row.unit,
      variant_overrides: [],
    };
  }
  const overrides: IngredientVariantOverride[] = [];
  // Emit one entry per known variant — keeps the row's mode stable across
  // round-trips, even when cells are empty.
  for (const optionId of allVariantIds) {
    const qty = row.cells.get(optionId) ?? 0;
    overrides.push({ option_id: optionId, quantity: qty, unit: row.unit });
  }
  return {
    quantity_needed: 0,
    unit: row.unit,
    variant_overrides: overrides,
  };
}

export default function RecipeTable({
  item,
  ingredients,
  variants,
  onUpdate,
  onDelete,
  onAddClick,
}: RecipeTableProps) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  // Build initial row state from the API ingredients. We re-sync whenever
  // the parent passes a new list (after add/delete) but keep local edits
  // until they're committed.
  const initialRows = useMemo(
    () => ingredients.map((ing) => toRow(ing, variants)),
    [ingredients, variants],
  );
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Item without variants → single "Quantité" column.
  const hasVariants = variants.length > 0;

  // Per-variant multipliers, persisted in localStorage. Pure chef
  // productivity helper — bulk-fills empty cells using base × multiplier.
  // The first variant column is the base (locked to 1); the rest are user-
  // typed values. Stored per-item with a v4 key (bumped after the recipe-as-
  // source-of-truth refactor).
  const multStorageKey = `foody.recipeMultipliers.v4.${item.id}`;
  const [userMultipliers, setUserMultipliers] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(multStorageKey);
      return raw ? (JSON.parse(raw) as Record<number, number>) : {};
    } catch {
      return {};
    }
  });
  const multipliers = userMultipliers;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(multStorageKey, JSON.stringify(userMultipliers));
    } catch {
      // Quota or private mode — silently ignore; multipliers are a UX nicety.
    }
  }, [multStorageKey, userMultipliers]);

  // Transient hint shown next to the Apply button when the click was a no-op
  // (e.g. user clicked Apply before entering any base value). Replaces a
  // blocking native alert() that surprised testers as a "browser warning".
  const [applyHint, setApplyHint] = useState<string | null>(null);
  // The per-variant multiplier tool is an occasional bulk-fill helper, so it
  // stays tucked behind a disclosure link to keep the recipe view calm.
  const [showMultipliers, setShowMultipliers] = useState(false);
  useEffect(() => {
    if (!applyHint) return;
    const timer = window.setTimeout(() => setApplyHint(null), 4000);
    return () => window.clearTimeout(timer);
  }, [applyHint]);

  // Memoised list of variant IDs for serialisation. Used by rowToPatch so
  // every override is emitted (even zeros) when sameForAll is off.
  const allVariantIds = useMemo(() => variants.map((v) => v.optionId), [variants]);

  // Update local state and commit synchronously with the freshly-computed
  // row. Avoids the stale-closure trap where a deferred commit captures the
  // pre-mutation state — historically, that caused the "Même quantité"
  // checkbox to re-check after a save.
  const updateAndCommit = (
    id: number,
    mutate: (r: Row) => Row,
    options: { commit: boolean } = { commit: true },
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = mutate(r);
        if (options.commit) void onUpdate(id, rowToPatch(next, allVariantIds));
        return next;
      }),
    );
  };

  // Commit current state for a row by id (used on blur). Smart auto-scaling:
  //
  //   • If the row's cells already form a consistent ratio (all cells = base
  //     × their multiplier for some base), the row is "scale-locked". This
  //     happens after auto-fill on add, or after a previous auto-scale.
  //   • When the user edits ONE cell in a scale-locked row (typing a value
  //     that breaks the ratio), the row re-scales: new base = typed value /
  //     its multiplier, then every OTHER cell updates to base × its multiplier.
  //   • If the user has manually set cells to non-uniform values (intentional
  //     non-linear recipe), the row is NOT scale-locked and edits only touch
  //     the cell typed.
  //
  // Net effect: type once per ingredient, the rest fills automatically.
  const multForOption = (optionId: number): number => {
    return optionId === variants[0]?.optionId ? 1 : multipliers[optionId] ?? 0;
  };
  const commitRowById = (id: number) => {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      let r = prev[idx];

      if (variants.length > 1 && !r.sameForAll) {
        // Detect if the row is scale-locked: every populated cell agrees on
        // the same base (cell / multiplier ≈ same value across the row,
        // within rounding tolerance). Empty cells don't break the lock —
        // they just need filling.
        const valued: { v: VariantColumn; qty: number; mult: number }[] = [];
        for (const v of variants) {
          const qty = r.cells.get(v.optionId) ?? 0;
          if (qty <= 0) continue;
          const m = multForOption(v.optionId);
          if (m <= 0) continue;
          valued.push({ v, qty, mult: m });
        }
        if (valued.length > 0) {
          // Pick the most recently edited cell as the source-of-truth: there's
          // no edit timestamp, so we use the cell whose ratio differs from the
          // others (= the user's latest input). If all ratios agree, the row
          // is already consistent and we keep it as-is.
          const ratios = valued.map(({ qty, mult }) => qty / mult);
          const minR = Math.min(...ratios);
          const maxR = Math.max(...ratios);
          const consistent = maxR - minR < 0.005 * Math.max(maxR, 0.001);

          if (!consistent || valued.length < variants.length) {
            // Find the source: the outlier (if inconsistent) or the only
            // populated cell (if some are empty). Outlier = the one whose
            // ratio differs most from the others' median.
            let source = valued[0];
            if (!consistent && valued.length >= 2) {
              const sorted = [...ratios].sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)];
              let bestDist = -1;
              for (const entry of valued) {
                const dist = Math.abs(entry.qty / entry.mult - median);
                if (dist > bestDist) {
                  bestDist = dist;
                  source = entry;
                }
              }
            }
            const base = source.qty / source.mult;
            const nextCells = new Map<number, number>();
            for (const v of variants) {
              const m = multForOption(v.optionId);
              if (m > 0) nextCells.set(v.optionId, +(base * m).toFixed(3));
            }
            r = { ...r, cells: nextCells };
          }
        }
      }

      void onUpdate(id, rowToPatch(r, allVariantIds));

      if (r === prev[idx]) return prev;
      const next = [...prev];
      next[idx] = r;
      return next;
    });
  };

  const setCell = (id: number, optionId: number, qty: number) => {
    // No commit here — onBlur will persist after the user finishes typing.
    updateAndCommit(
      id,
      (r) => {
        const nextCells = new Map(r.cells);
        nextCells.set(optionId, qty);
        return { ...r, sameForAll: false, cells: nextCells };
      },
      { commit: false },
    );
  };

  const setBase = (id: number, qty: number) => {
    updateAndCommit(id, (r) => ({ ...r, baseQty: qty }), { commit: false });
  };

  const setUnit = (id: number, unit: string) => {
    // Commit immediately — unit is a discrete change with no further input.
    updateAndCommit(id, (r) => ({ ...r, unit }));
  };

  // Fill each row's empty variant cells from `base × multiplier`.
  // The first variant column is the base; the user types there directly and
  // Apply scales by the per-variant multipliers. Cells that already have a
  // positive value are left alone — non-destructive.
  const applyMultipliers = useCallback(async () => {
    if (variants.length < 2) return;
    const baseVariantId = variants[0].optionId;
    const updated: Row[] = [];
    let touched = 0;
    const multFor = (optionId: number): number => {
      return optionId === baseVariantId ? 1 : multipliers[optionId] ?? 0;
    };
    setRows((prev) => {
      const next = prev.map((r) => {
        // Resolve the per-1-portion base for this row.
        let base = 0;
        if (r.sameForAll && r.baseQty > 0) {
          base = r.baseQty;
        } else if ((r.cells.get(baseVariantId) ?? 0) > 0) {
          base = r.cells.get(baseVariantId)!;
        } else {
          for (const v of variants) {
            const q = r.cells.get(v.optionId) ?? 0;
            if (q > 0) {
              base = q;
              break;
            }
          }
        }
        if (base <= 0) return r; // nothing to scale from

        const nextCells = new Map(r.cells);
        let rowTouched = false;
        for (const v of variants) {
          const existing = nextCells.get(v.optionId) ?? 0;
          if (existing > 0) continue; // never overwrite
          const mult = multFor(v.optionId);
          if (!mult || mult <= 0) continue;
          nextCells.set(v.optionId, +(base * mult).toFixed(3));
          rowTouched = true;
        }
        if (!rowTouched) return r;
        touched += 1;
        const filled: Row = { ...r, sameForAll: false, cells: nextCells };
        updated.push(filled);
        return filled;
      });
      return next;
    });
    for (const r of updated) await onUpdate(r.id, rowToPatch(r, allVariantIds));
    if (touched === 0) {
      setApplyHint(
        'Renseignez une valeur dans la première colonne et au moins un multiplicateur.',
      );
    } else {
      setApplyHint(null);
    }
  }, [variants, multipliers, onUpdate, allVariantIds]);

  // Per-variant total cost. Sums (cell qty in stock unit × cost_per_unit)
  // across rows. Cross-family unit mismatches contribute 0 — the warning
  // icon on the row tells the user something's off.
  const totals = useMemo(() => {
    const out = new Map<number | 'base', number>();
    const cellFor = (r: Row, optionId: number | null): number => {
      if (r.sameForAll) return r.baseQty;
      if (optionId == null) return 0;
      return r.cells.get(optionId) ?? 0;
    };
    const rowCost = (r: Row, qty: number): number => {
      if (qty <= 0 || !r.costPerUnit || !r.costUnit) return 0;
      // Resolve into the stock unit, honouring custom units (1 piece = N base).
      const inStock = convertToBaseUnit(qty, r.unit, r.costUnit, r.conversions);
      if (inStock == null) return 0; // incompatible units → flagged by the warning
      return inStock * r.costPerUnit;
    };
    if (variants.length === 0) {
      let sum = 0;
      for (const r of rows) sum += rowCost(r, cellFor(r, null));
      out.set('base', sum);
    } else {
      for (const v of variants) {
        let sum = 0;
        for (const r of rows) sum += rowCost(r, cellFor(r, v.optionId));
        out.set(v.optionId, sum);
      }
    }
    return out;
  }, [rows, variants]);

  const toggleSameForAll = (id: number, sameForAll: boolean) => {
    updateAndCommit(id, (r) => {
      if (sameForAll) {
        // Collapse: keep the largest non-zero cell as the base, clear cells.
        let base = r.baseQty;
        r.cells.forEach((v) => {
          if (v > base) base = v;
        });
        return { ...r, sameForAll: true, baseQty: base, cells: new Map() };
      }
      // Expand: pre-fill each variant cell with the base qty so the user
      // has a starting point to differentiate from.
      const next = new Map<number, number>();
      for (const v of variants) next.set(v.optionId, r.baseQty);
      return { ...r, sameForAll: false, cells: next };
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-[var(--s-3)]">
        <div>
          <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
            {t('ingredients') || 'Ingrédients'}
            <span className="text-[var(--fg-muted)] font-normal ms-1.5">
              · {ingredients.length} {ingredients.length === 1 ? 'élément' : 'éléments'}
            </span>
          </h4>
          <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
            {hasVariants
              ? 'Quantité utilisée à chaque taille.'
              : 'Quantité pour 1 portion.'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onAddClick}
            className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addIngredient') || 'Ajouter un ingrédient'}
          </button>
        )}
      </div>

      {/* Multipliers strip — shown only when there are 2+ variants. The first
          variant is the base (locked to 1); the rest are user-typed multipliers.
          Pure productivity helper — bulk-fills empty cells using base ×
          multiplier. Persisted to localStorage per item. */}
      {hasVariants && variants.length > 1 && rows.length > 0 && (
        <div className="mb-[var(--s-3)]">
          <button
            type="button"
            onClick={() => setShowMultipliers((v) => !v)}
            aria-expanded={showMultipliers}
            className="inline-flex items-center gap-1.5 text-fs-xs font-medium text-[var(--brand-500)] hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Pré-remplir les quantités par taille
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-fast ${showMultipliers ? 'rotate-180' : ''}`}
            />
          </button>
          {showMultipliers && (
            <div className="mt-[var(--s-2)] flex items-start gap-[var(--s-3)] flex-wrap rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]/40 px-[var(--s-3)] py-[var(--s-2)]">
              <div className="flex-1 min-w-[180px] text-fs-xs text-[var(--fg-muted)]">
                Un multiplicateur par taille pré-remplit les lignes vides depuis la
                quantité de base. Chaque cellule reste modifiable.
              </div>
              <div className="flex items-end gap-[var(--s-3)] flex-wrap">
                {variants.map((v, i) => {
                  // First variant is locked to "1" — it's the base everything else
                  // multiplies against.
                  const isBase = i === 0;
                  const value = isBase ? 1 : multipliers[v.optionId] ?? 0;
                  return (
                    <label key={v.optionId} className="flex flex-col gap-0.5">
                      <span className="text-fs-xs text-[var(--fg-muted)]">{v.name}</span>
                      <NumberInput
                        value={value}
                        onChange={(n) => {
                          if (isBase) return;
                          setUserMultipliers((prev) => {
                            if (n <= 0) {
                              const next = { ...prev };
                              delete next[v.optionId];
                              return next;
                            }
                            return { ...prev, [v.optionId]: n };
                          });
                        }}
                        placeholder={isBase ? '1' : '—'}
                        disabled={isBase}
                        className={`w-16 px-[var(--s-2)] py-1 text-fs-sm font-mono tabular-nums text-end bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)] ${
                          isBase ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      />
                    </label>
                  );
                })}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void applyMultipliers()}
                    className="inline-flex items-center gap-1 h-8 px-[var(--s-3)] rounded-r-sm bg-[var(--brand-500)] text-white text-fs-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Appliquer
                  </button>
                )}
              </div>
              {applyHint && (
                <div
                  className="basis-full text-fs-xs text-[var(--warn-500,#d97706)] mt-[var(--s-2)]"
                  role="status"
                  aria-live="polite"
                >
                  {applyHint}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border-2 border-dashed border-[var(--line-strong)]">
          {t('noIngredients') || 'Aucun ingrédient ajouté.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-r-md border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full text-fs-sm" role="table">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="text-start px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider">
                  Ingrédient
                </th>
                <th className="text-start px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider w-[110px]">
                  Unité
                </th>
                {hasVariants ? (
                  variants.map((v) => (
                    <th
                      key={v.optionId}
                      className="text-end px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider min-w-[110px]"
                    >
                      {v.name}
                    </th>
                  ))
                ) : (
                  <th className="text-end px-[var(--s-3)] py-[var(--s-2)] font-semibold text-[var(--fg-muted)] uppercase text-fs-xs tracking-wider">
                    Quantité
                  </th>
                )}
                <th className="w-10" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RecipeRow
                  key={row.id}
                  row={row}
                  variants={variants}
                  hasVariants={hasVariants}
                  onCellChange={(optionId, qty) => setCell(row.id, optionId, qty)}
                  onBaseChange={(qty) => setBase(row.id, qty)}
                  onUnitChange={(unit) => setUnit(row.id, unit)}
                  onSameForAllChange={(v) => toggleSameForAll(row.id, v)}
                  onCommit={() => commitRowById(row.id)}
                  onDelete={() => onDelete(row.id)}
                />
              ))}
            </tbody>
            {/* Footer: total food cost AND total dish weight per variant
                column. Surfaces what the Coût tab shows — but live, in the
                same view the chef is editing. The weight row gives chefs the
                "wait, my dish is 950 g total, not 750 g" feedback that was
                missing when portion_size lived on variants. */}
            {rows.length > 0 && (
              <tfoot className="bg-[var(--surface-2)]">
                <tr className="border-t-2 border-[var(--line-strong)]">
                  <td
                    className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]"
                    colSpan={2}
                  >
                    Coût matière (HT)
                  </td>
                  {hasVariants ? (
                    variants.map((v) => {
                      const total = totals.get(v.optionId) ?? 0;
                      return (
                        <td
                          key={v.optionId}
                          className="px-[var(--s-3)] py-[var(--s-2)] text-end font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]"
                        >
                          {total > 0 ? `${total.toFixed(2)} ₪` : '—'}
                        </td>
                      );
                    })
                  ) : (
                    <td className="px-[var(--s-3)] py-[var(--s-2)] text-end font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                      {(() => {
                        const v = totals.get('base') ?? 0;
                        return v > 0 ? `${v.toFixed(2)} ₪` : '—';
                      })()}
                    </td>
                  )}
                  <td aria-hidden />
                </tr>
                <tr>
                  <td
                    className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]"
                    colSpan={2}
                  >
                    Poids total du plat
                  </td>
                  {hasVariants ? (
                    variants.map((v) => (
                      <td
                        key={v.optionId}
                        className="px-[var(--s-3)] py-[var(--s-2)] text-end font-mono tabular-nums text-fs-sm text-[var(--fg-muted)]"
                      >
                        {formatTotalWeight(rows, v.optionId)}
                      </td>
                    ))
                  ) : (
                    <td className="px-[var(--s-3)] py-[var(--s-2)] text-end font-mono tabular-nums text-fs-sm text-[var(--fg-muted)]">
                      {formatTotalWeight(rows, null)}
                    </td>
                  )}
                  <td aria-hidden />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// Sum each row's cells (or base qty) for the given variant column, grouped
// by unit family. Mixed-unit recipes display per-unit subtotals
// (e.g. "750 g + 200 ml"). Auto-converts g→kg ≥ 1000 g and ml→L ≥ 1000 ml.
function formatTotalWeight(rows: Row[], optionId: number | null): string {
  const totals = new Map<string, number>(); // unit → cumulative qty
  for (const row of rows) {
    let qty: number;
    let unit: string;
    if (row.sameForAll) {
      qty = row.baseQty;
      unit = row.unit;
    } else if (optionId == null) {
      continue; // no variants and no base — nothing to add
    } else {
      qty = row.cells.get(optionId) ?? 0;
      unit = row.unit;
    }
    if (!unit || qty <= 0) continue;
    totals.set(unit, (totals.get(unit) ?? 0) + qty);
  }
  if (totals.size === 0) return '—';
  return Array.from(totals.entries())
    .map(([unit, qty]) => prettifyWeight(qty, unit))
    .join(' + ');
}

function prettifyWeight(qty: number, unit: string): string {
  if (unit === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
  if (unit === 'ml' && qty >= 1000) return `${(qty / 1000).toFixed(2)} L`;
  return `${+qty.toFixed(2)} ${unit}`;
}

interface RecipeRowProps {
  row: Row;
  variants: VariantColumn[];
  hasVariants: boolean;
  onCellChange: (optionId: number, qty: number) => void;
  onBaseChange: (qty: number) => void;
  onUnitChange: (unit: string) => void;
  onSameForAllChange: (v: boolean) => void;
  onCommit: () => void | Promise<void>;
  onDelete: () => void;
}

function RecipeRow({
  row,
  variants,
  hasVariants,
  onCellChange,
  onBaseChange,
  onUnitChange,
  onSameForAllChange,
  onCommit,
  onDelete,
}: RecipeRowProps) {
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  // Persist on blur — avoids saving on every keystroke. The change handler
  // updates the visible state immediately so input feels responsive; commit
  // pushes the latest snapshot to the server.
  const handleBlur = () => {
    void onCommit();
  };

  return (
    <tr className="border-t border-[var(--line)] hover:bg-[var(--surface-2)]/50 transition-colors">
      <td className="px-[var(--s-3)] py-[var(--s-2)]">
        <div className="flex items-center gap-[var(--s-2)] min-w-0">
          <div
            className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-white"
            style={{ background: row.isPrep ? PREP_COLOR : BRUT_COLOR }}
            aria-hidden
          >
            {row.isPrep ? (
              <FlaskConical className="w-3.5 h-3.5" />
            ) : (
              <Package className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-fs-sm font-medium text-[var(--fg)] truncate">{row.name}</span>
              {/* Cross-family unit mismatch — chef wrote "g" but stock is in
                  "unit", or vice versa. The deduction silently falls back to
                  1× scaling, which surprised the user during testing. */}
              {row.costUnit && !sameUnitFamily(row.unit, row.costUnit)
                && customUnitFactor(row.unit, row.conversions) == null && (
                <span
                  title={`L'unité de cet ingrédient (${row.unit}) n'est pas compatible avec celle du stock (${row.costUnit}). La déduction et le coût seront incorrects.`}
                  className="shrink-0 inline-flex"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warn-500,#d97706)]" />
                </span>
              )}
              {/* A variant added after this recipe was set up has no quantity
                  here and silently deducts nothing. Surface it so a forgotten
                  value is visible. Deliberate explicit 0s are NOT flagged. */}
              {!row.sameForAll && variants.some((v) => !row.cells.has(v.optionId)) && (
                <span
                  title="Une ou plusieurs variantes n'ont pas de quantité définie. Rien ne sera décompté du stock pour ces variantes tant qu'une valeur n'est pas saisie."
                  className="shrink-0 inline-flex"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warn-500,#d97706)]" />
                </span>
              )}
            </div>
            {hasVariants && (
              <label className="inline-flex items-center gap-1 mt-0.5 text-fs-xs text-[var(--fg-muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={row.sameForAll}
                  onChange={(e) => onSameForAllChange(e.target.checked)}
                  className="w-3 h-3 rounded-r-xs border-[var(--line-strong)]"
                />
                Même quantité
              </label>
            )}
          </div>
        </div>
      </td>

      <td className="px-[var(--s-3)] py-[var(--s-2)]">
        <RecipeUnitSelect
          value={row.unit}
          onChange={onUnitChange}
          conversions={row.conversions}
          baseUnit={row.costUnit}
          stockItemId={row.stockItemId}
        />
      </td>

      {hasVariants ? (
        variants.map((v) => {
          const cellQty = row.sameForAll ? row.baseQty : row.cells.get(v.optionId) ?? 0;
          // A non-"même quantité" row with no override entry for this variant
          // silently falls back to 0 — nothing gets deducted for this size.
          // An explicit 0 (present in cells) is a deliberate "not used here"
          // and is intentionally NOT flagged.
          const cellUnset = !row.sameForAll && !row.cells.has(v.optionId);
          return (
            <td
              key={v.optionId}
              className="px-[var(--s-3)] py-[var(--s-2)] text-end"
              title={
                cellUnset
                  ? `Aucune quantité définie pour « ${v.name} ». Rien ne sera décompté du stock pour cette variante tant qu'une valeur n'est pas saisie.`
                  : undefined
              }
            >
              <NumberInput
                value={cellQty}
                onChange={(n) => {
                  if (row.sameForAll) onBaseChange(n);
                  else onCellChange(v.optionId, n);
                }}
                onBlur={handleBlur}
                placeholder="0"
                className={`w-full max-w-[100px] px-[var(--s-2)] py-1 bg-[var(--surface)] border rounded-r-sm text-fs-sm text-[var(--fg)] text-end font-mono tabular-nums focus:outline-none focus:border-[var(--brand-500)] ${
                  cellUnset
                    ? 'border-[var(--warn-500,#d97706)] bg-[var(--warn-50,#fffbeb)]'
                    : 'border-[var(--line-strong)]'
                }`}
              />
            </td>
          );
        })
      ) : (
        <td className="px-[var(--s-3)] py-[var(--s-2)] text-end">
          <NumberInput
            value={row.baseQty}
            onChange={onBaseChange}
            onBlur={handleBlur}
            placeholder="0"
            className="w-full max-w-[100px] px-[var(--s-2)] py-1 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm text-fs-sm text-[var(--fg)] text-end font-mono tabular-nums focus:outline-none focus:border-[var(--brand-500)]"
          />
        </td>
      )}

      <td className="px-[var(--s-2)] py-[var(--s-2)] text-end">
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
            aria-label="Supprimer l'ingrédient"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

// Re-export so callers using the old draft picker can build inputs that
// match the new table's expectations (default mode = "same for all" with
// quantity 0 — user fills cells after adding).
export function defaultIngredientInputForTable(
  source: { kind: 'brut' | 'prep'; id: number },
  unit: string,
): IngredientInput {
  return {
    stock_item_id: source.kind === 'brut' ? source.id : undefined,
    prep_item_id: source.kind === 'prep' ? source.id : undefined,
    quantity_needed: 0,
    unit,
    variant_overrides: [],
  };
}
