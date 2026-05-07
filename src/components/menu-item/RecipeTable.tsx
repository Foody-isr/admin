'use client';

// RecipeTable — chef-friendly recipe editor.
//
// One row per ingredient, one column per variant. Each cell is the quantity
// of that ingredient consumed for a single sale of that variant. A small
// "Même quantité" toggle per row collapses all cells into a single value
// when the ingredient doesn't change with variant size.
//
// The three legacy modes (adapt / fixed / custom) become an internal
// serialization detail: we derive them from the cell state at save time.
//   • All cells equal (or "Même quantité" on)  → fixed
//   • Cells differ per variant                  → custom (variant_overrides)
//   • Legacy adapt-mode rows on load            → presented as custom by
//     pre-filling each cell from the variant's portion_size; saved as
//     custom on the next edit.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Package, Plus, Sparkles, Trash2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import type {
  IngredientInput,
  IngredientVariantOverride,
  MenuItem,
  MenuItemIngredient,
  PrepItem,
  StockItem,
} from '@/lib/api';
import { computePrepUnitCostExVat } from '@/lib/cost-utils';
import { convertQuantity, sameUnitFamily } from '@/lib/units';
import { BRUT_COLOR, PREP_COLOR } from './RecipeComposer';

const UNITS = ['g', 'kg', 'ml', 'l', 'unit'] as const;

export interface VariantColumn {
  /** Backend option_id for this variant. */
  optionId: number;
  /** Display name (e.g. "Pour Table 8"). */
  name: string;
  /** Variant's own portion_size, used to migrate legacy adapt-mode rows
   *  into per-cell quantities at first render. May be 0 for variants that
   *  never had a portion declared. */
  portionSize?: number;
  portionSizeUnit?: string;
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
function toRow(ing: MenuItemIngredient, variants: VariantColumn[]): Row {
  const overrides = ing.variant_overrides ?? [];
  const cells = new Map<number, number>();
  if (overrides.length > 0) {
    // Custom mode — load each override.
    for (const ov of overrides) cells.set(ov.option_id, ov.quantity);
  } else if (ing.scales_with_variant) {
    // Legacy adapt mode — pre-fill each cell from the variant's portion_size
    // so the user sees the migrated values directly. On their next edit we
    // save as custom and the legacy flag falls away.
    for (const v of variants) {
      if (v.portionSize && v.portionSize > 0) cells.set(v.optionId, v.portionSize);
    }
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
  };
}

// Translate a row back into an API patch.
//   sameForAll → quantity_needed + unit, no overrides.
//   Otherwise  → variant_overrides[] for every cell with a positive quantity,
//                quantity_needed reset to 0.
function rowToPatch(row: Row): Partial<MenuItemIngredient> {
  if (row.sameForAll) {
    return {
      quantity_needed: row.baseQty,
      unit: row.unit,
      scales_with_variant: false,
      variant_overrides: [],
    };
  }
  const overrides: IngredientVariantOverride[] = [];
  row.cells.forEach((qty, optionId) => {
    if (qty > 0) overrides.push({ option_id: optionId, quantity: qty, unit: row.unit });
  });
  return {
    quantity_needed: 0,
    unit: row.unit,
    scales_with_variant: false,
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

  // Per-variant multipliers, persisted in localStorage. The first variant
  // is implicitly the base (multiplier = 1). For Mamie's Table on BTSOL
  // MARDNOUSS the user types [3, 5, 6, 8] once, hits Apply, and every
  // ingredient row's empty cells fill from the base × multiplier.
  //
  // When variants carry portion_size data (Normal 250 g / Grand 500 g),
  // we pre-derive the multipliers as `variant.portion_size / base.portion_size`
  // so the user doesn't have to type them — they just hit Apply.
  const multStorageKey = `foody.recipeMultipliers.${item.id}`;
  const derivedMultipliers = useMemo<Record<number, number>>(() => {
    if (variants.length < 2) return {};
    const base = variants[0];
    if (!base.portionSize || base.portionSize <= 0) return {};
    const out: Record<number, number> = {};
    for (let i = 1; i < variants.length; i += 1) {
      const v = variants[i];
      if (!v.portionSize || v.portionSize <= 0) continue;
      const baseQty = convertQuantity(
        base.portionSize,
        base.portionSizeUnit ?? 'g',
        v.portionSizeUnit ?? base.portionSizeUnit ?? 'g',
      );
      if (baseQty <= 0) continue;
      out[v.optionId] = +(v.portionSize / baseQty).toFixed(3);
    }
    return out;
  }, [variants]);
  const [multipliers, setMultipliers] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return derivedMultipliers;
    try {
      const raw = window.localStorage.getItem(multStorageKey);
      return raw ? (JSON.parse(raw) as Record<number, number>) : derivedMultipliers;
    } catch {
      return derivedMultipliers;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(multStorageKey, JSON.stringify(multipliers));
    } catch {
      // Quota or private mode — silently ignore; multipliers are a UX nicety.
    }
  }, [multStorageKey, multipliers]);

  // Commit a single row's current state. Errors are swallowed at the parent
  // boundary (which surfaces them via alert), so we don't double-handle here.
  const commit = async (row: Row) => {
    await onUpdate(row.id, rowToPatch(row));
  };

  const updateRow = (id: number, mutate: (r: Row) => Row) => {
    setRows((prev) => prev.map((r) => (r.id === id ? mutate(r) : r)));
  };

  const setCell = (id: number, optionId: number, qty: number) => {
    updateRow(id, (r) => {
      const nextCells = new Map(r.cells);
      nextCells.set(optionId, qty);
      return { ...r, sameForAll: false, cells: nextCells };
    });
  };

  const setBase = (id: number, qty: number) => {
    updateRow(id, (r) => ({ ...r, baseQty: qty }));
  };

  const setUnit = (id: number, unit: string) => {
    updateRow(id, (r) => ({ ...r, unit }));
  };

  // Fill each row's empty variant cells from `base × multiplier`. Base is
  // taken per-row as either the "Same for all" base value or the leftmost
  // variant cell that has data. Cells that already have a positive value
  // are left alone — the action is non-destructive.
  const applyMultipliers = useCallback(async () => {
    if (variants.length < 2) return;
    const baseVariantId = variants[0].optionId;
    const updated: Row[] = [];
    let touched = 0;
    setRows((prev) => {
      const next = prev.map((r) => {
        // Pick the base value: explicit "same for all" base, else the base
        // variant's cell, else the first non-empty cell.
        let base = 0;
        if (r.sameForAll && r.baseQty > 0) base = r.baseQty;
        else if ((r.cells.get(baseVariantId) ?? 0) > 0) base = r.cells.get(baseVariantId)!;
        else {
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
          const mult =
            v.optionId === baseVariantId
              ? 1
              : multipliers[v.optionId];
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
    // Persist each touched row.
    for (const r of updated) await onUpdate(r.id, rowToPatch(r));
    if (touched === 0) {
      // Helpful nudge — likely the user clicked Apply before entering a base
      // value or before setting any non-1 multiplier.
      // eslint-disable-next-line no-alert
      alert(
        'Aucune ligne à remplir. Vérifiez que la première colonne contient une valeur et qu’au moins un multiplicateur est défini.',
      );
    }
  }, [variants, multipliers, onUpdate]);

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
      if (!sameUnitFamily(r.unit, r.costUnit)) return 0;
      const inStock = convertQuantity(qty, r.unit, r.costUnit);
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
    updateRow(id, (r) => {
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
              ? 'Une ligne par ingrédient. Une colonne par variante. Saisissez la quantité utilisée à chaque taille.'
              : 'Saisissez la quantité de chaque ingrédient pour 1 portion.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('addIngredient') || 'Ajouter un ingrédient'}
        </button>
      </div>

      {/* Multipliers strip — shown only when there are 2+ variants. The first
          variant is the base (multiplier = 1, displayed but not editable).
          Other multipliers default to "—" until the user enters them.
          Persisted to localStorage so the user types them once per item. */}
      {hasVariants && variants.length > 1 && rows.length > 0 && (
        <div className="mb-[var(--s-2)] flex items-start gap-[var(--s-3)] flex-wrap rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]/40 px-[var(--s-3)] py-[var(--s-2)]">
          <div className="flex-1 min-w-[180px]">
            <div className="text-fs-xs font-semibold text-[var(--fg)]">
              Multiplicateurs par variante
            </div>
            <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              Combien de fois la quantité <strong>{variants[0].name}</strong> ? Ex&nbsp;: si{' '}
              {variants[1].name} fait 2× la quantité de {variants[0].name}, mettez{' '}
              <span className="font-mono">2</span>. Saisissez la quantité dans la colonne{' '}
              {variants[0].name} pour chaque ligne, puis cliquez sur Appliquer.
            </div>
          </div>
          <div className="flex items-end gap-[var(--s-3)] flex-wrap">
            {variants.map((v, i) => {
              const isBase = i === 0;
              const value = isBase ? 1 : multipliers[v.optionId] ?? 0;
              return (
                <label key={v.optionId} className="flex flex-col gap-0.5">
                  <span className="text-fs-xs text-[var(--fg-muted)]">{v.name}</span>
                  <NumberInput
                    value={value}
                    onChange={(n) => {
                      if (isBase) return;
                      setMultipliers((prev) => {
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
            <button
              type="button"
              onClick={() => void applyMultipliers()}
              className="inline-flex items-center gap-1 h-8 px-[var(--s-3)] rounded-r-sm bg-[var(--brand-500)] text-white text-fs-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Appliquer aux lignes vides
            </button>
          </div>
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
                  onCommit={() => commit(row)}
                  onDelete={() => onDelete(row.id)}
                />
              ))}
            </tbody>
            {/* Footer: total food cost per variant column. Surfaces what the
                Coût tab shows — but live, in the same view the chef is editing. */}
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
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
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
              {row.costUnit && !sameUnitFamily(row.unit, row.costUnit) && (
                <span
                  title={`L'unité de cet ingrédient (${row.unit}) n'est pas compatible avec celle du stock (${row.costUnit}). La déduction et le coût seront incorrects.`}
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
                  onChange={(e) => {
                    onSameForAllChange(e.target.checked);
                    // Defer commit to next tick so state has applied.
                    setTimeout(() => void onCommit(), 0);
                  }}
                  className="w-3 h-3 rounded-r-xs border-[var(--line-strong)]"
                />
                Même quantité
              </label>
            )}
          </div>
        </div>
      </td>

      <td className="px-[var(--s-3)] py-[var(--s-2)]">
        <select
          value={row.unit}
          onChange={(e) => {
            onUnitChange(e.target.value);
            setTimeout(() => void onCommit(), 0);
          }}
          className="w-full px-[var(--s-2)] py-1 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm text-fs-sm text-[var(--fg)] focus:outline-none focus:border-[var(--brand-500)]"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>

      {hasVariants ? (
        variants.map((v) => {
          const cellQty = row.sameForAll ? row.baseQty : row.cells.get(v.optionId) ?? 0;
          return (
            <td key={v.optionId} className="px-[var(--s-3)] py-[var(--s-2)] text-end">
              <NumberInput
                value={cellQty}
                onChange={(n) => {
                  if (row.sameForAll) onBaseChange(n);
                  else onCellChange(v.optionId, n);
                }}
                onBlur={handleBlur}
                placeholder="0"
                className="w-full max-w-[100px] px-[var(--s-2)] py-1 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm text-fs-sm text-[var(--fg)] text-end font-mono tabular-nums focus:outline-none focus:border-[var(--brand-500)]"
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
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
          aria-label="Supprimer l'ingrédient"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
    scales_with_variant: false,
    variant_overrides: [],
  };
}
