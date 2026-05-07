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

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Package, Plus, Trash2 } from 'lucide-react';
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
  return {
    id: ing.id,
    name: ingredientName(ing),
    isPrep: !!ing.prep_item_id,
    unit: rowUnit(ing),
    sameForAll,
    baseQty,
    cells,
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
  item: _item,
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
            <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{row.name}</div>
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
