'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  setMenuItemIngredients,
  IngredientInput, IngredientVariantOverride,
  MenuItem, MenuItemIngredient, StockItem, PrepItem,
  OptionSet, ItemOptionOverride,
} from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import { detectPrepSwaps, SwapSuggestion } from '@/lib/prep-swap';

interface Props {
  rid: number;
  menuItem: MenuItem;
  initialIngredients: MenuItemIngredient[];
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onSaved?: (ings: MenuItemIngredient[]) => void;
  // Optional override for the item's yield — used when the Recipe tab's unsaved
  // yield input should drive the batch-mode detection (so the toggle hides
  // immediately instead of waiting for the main modal save).
  effectiveYield?: number;
  // Variants attached to the item. One column per option renders in the matrix,
  // letting the user set a per-variant override on any ingredient that should
  // scale (e.g. beef 200 g for Normal, 400 g for Grand). Empty cell = inherit base.
  attachedOptionSets?: OptionSet[];
  itemOptionOverrides?: ItemOptionOverride[];
}

// Shared editor for a menu item's `menu_item_ingredients`. Used on the
// Menu Item edit page (primary home) and (read-only elsewhere).
export default function MenuItemIngredientsEditor({
  rid, menuItem, initialIngredients, stockItems, prepItems, onSaved, effectiveYield,
  attachedOptionSets, itemOptionOverrides,
}: Props) {
  const { t } = useI18n();

  // Batch mode = the item has a recipe yield. Prefer the live prop (reflects
  // the user's current unsaved yield input) over the persisted value.
  const yieldForBatchCheck = effectiveYield ?? menuItem.recipe_yield ?? 0;
  const isBatchMode = yieldForBatchCheck > 0;

  // Flatten attached option sets into one list of variant columns with the
  // portion metadata already applied (override if present, else option default).
  // For batch items we hide the matrix — batch proration handles scaling uniformly.
  const variantColumns = useMemo(() => {
    if (isBatchMode) return [] as Array<{ option_id: number; name: string; portion_size?: number; portion_size_unit?: string }>;
    const cols: Array<{ option_id: number; name: string; portion_size?: number; portion_size_unit?: string }> = [];
    for (const os of attachedOptionSets ?? []) {
      for (const opt of os.options ?? []) {
        if (!opt.is_active) continue;
        const ov = (itemOptionOverrides ?? []).find((o) => o.option_id === opt.id);
        cols.push({
          option_id: opt.id,
          name: opt.name,
          portion_size: ov?.portion_size,
          portion_size_unit: ov?.portion_size_unit,
        });
      }
    }
    return cols;
  }, [attachedOptionSets, itemOptionOverrides, isBatchMode]);

  const toInputs = (ings: MenuItemIngredient[]): IngredientInput[] =>
    ings.map((i) => ({
      stock_item_id: i.stock_item_id ?? undefined,
      prep_item_id: i.prep_item_id ?? undefined,
      quantity_needed: i.quantity_needed,
      unit: i.unit || i.stock_item?.unit || i.prep_item?.unit || '',
      scales_with_variant: i.scales_with_variant ?? false,
      variant_overrides: (i.variant_overrides ?? []).map((ov) => ({
        option_id: ov.option_id,
        quantity: ov.quantity,
        unit: ov.unit,
      })),
    }));

  const [current, setCurrent] = useState<MenuItemIngredient[]>(initialIngredients);
  const [rows, setRows] = useState<IngredientInput[]>(toInputs(initialIngredients));
  const [saving, setSaving] = useState(false);
  const [swapConfirm, setSwapConfirm] = useState<SwapSuggestion | null>(null);

  // Keep state in sync if parent reloads ingredients (e.g. after save).
  useEffect(() => {
    setCurrent(initialIngredients);
    setRows(toInputs(initialIngredients));
  }, [initialIngredients]);

  const addRow = () => setRows([...rows, { quantity_needed: 0, unit: '', scales_with_variant: false, variant_overrides: [] }]);
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<IngredientInput>) =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Variant override helpers — upsert / remove a single (ingredient row, option) cell.
  const setOverride = (rowIdx: number, optionId: number, next: Partial<IngredientVariantOverride> | null) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const existing = r.variant_overrides ?? [];
      if (next === null) {
        // Remove override → inherit base.
        return { ...r, variant_overrides: existing.filter((o) => o.option_id !== optionId) };
      }
      const hit = existing.find((o) => o.option_id === optionId);
      if (hit) {
        return { ...r, variant_overrides: existing.map((o) => o.option_id === optionId ? { ...o, ...next } : o) };
      }
      return {
        ...r,
        variant_overrides: [
          ...existing,
          { option_id: optionId, quantity: next.quantity ?? 0, unit: next.unit ?? r.unit ?? 'g' },
        ],
      };
    }));
  };
  const getOverride = (rowIdx: number, optionId: number): IngredientVariantOverride | undefined =>
    (rows[rowIdx]?.variant_overrides ?? []).find((o) => o.option_id === optionId);

  const save = async (input: IngredientInput[] = rows) => {
    setSaving(true);
    try {
      // Batch items prorate uniformly via (variant.portion / item.yield), so the
      // per-ingredient scales_with_variant flag doesn't apply. Force it off on
      // save to avoid carrying stale `true` values from pre-batch configs, which
      // would otherwise shortcut the proration path and over-charge the cost.
      const normalized = isBatchMode
        ? input.map((r) => ({ ...r, scales_with_variant: false }))
        : input;
      const saved = await setMenuItemIngredients(rid, menuItem.id, normalized);
      setCurrent(saved);
      setRows(toInputs(saved));
      onSaved?.(saved);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Swap helper: drop matched raw rows, keep unmatched, add one prep row.
  const applySwap = async (s: SwapSuggestion) => {
    const matchedIds = new Set(s.matchedIngredients.map((i) => i.id));
    const kept: IngredientInput[] = current
      .filter((i) => !matchedIds.has(i.id))
      .map((i) => ({
        stock_item_id: i.stock_item_id ?? undefined,
        prep_item_id: i.prep_item_id ?? undefined,
        quantity_needed: i.quantity_needed,
        unit: i.unit || i.stock_item?.unit || i.prep_item?.unit || '',
        scales_with_variant: i.scales_with_variant ?? false,
      }));
    const withPrep: IngredientInput[] = [
      ...kept,
      {
        prep_item_id: s.prep.id,
        quantity_needed: 0,
        unit: '',
        // User fills in the base qty after the swap; variant scaling is opt-in.
        scales_with_variant: false,
      },
    ];
    setSwapConfirm(null);
    await save(withPrep);
  };

  const suggestions = detectPrepSwaps(current, prepItems);
  const topSuggestion = suggestions[0] ?? null;

  const hasChanges = JSON.stringify(rows) !== JSON.stringify(toInputs(current));

  return (
    <div className="space-y-3">
      {/* Swap banner */}
      {topSuggestion && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-brand-500/30 bg-brand-500/10 text-sm">
          <span className="text-xl leading-none shrink-0">💡</span>
          <div className="flex-1 text-fg-primary">
            <p>
              {t('swapSuggestionBanner')
                .replace('{prep}', topSuggestion.prep.name)
                .replace('{matched}', String(topSuggestion.matchedIngredients.length))
                .replace('{total}', String(current.filter((i) => i.stock_item_id).length))}
            </p>
          </div>
          <button
            onClick={() => setSwapConfirm(topSuggestion)}
            className="btn-primary text-xs py-1.5 px-3 rounded-full whitespace-nowrap"
          >
            {t('replaceWithPrep')}
          </button>
        </div>
      )}

      {/* Rows */}
      {rows.length === 0 ? (
        <p className="text-sm text-fg-secondary italic py-2">{t('noIngredientsLinked')}</p>
      ) : (
        rows.map((ing, idx) => (
          <div key={idx} className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-subtle)' }}>
            {/* Picker + delete */}
            <div className="flex items-center gap-2">
              <SearchableSelect
                className="flex-1"
                value={
                  ing.stock_item_id
                    ? `stock:${ing.stock_item_id}`
                    : ing.prep_item_id
                    ? `prep:${ing.prep_item_id}`
                    : ''
                }
                onChange={(val) => {
                  if (val.startsWith('stock:')) {
                    const si = stockItems.find((s) => s.id === +val.split(':')[1]);
                    updateRow(idx, {
                      stock_item_id: +val.split(':')[1],
                      prep_item_id: undefined,
                      unit: si?.unit || ing.unit,
                    });
                  } else if (val.startsWith('prep:')) {
                    const pi = prepItems.find((p) => p.id === +val.split(':')[1]);
                    updateRow(idx, {
                      prep_item_id: +val.split(':')[1],
                      stock_item_id: undefined,
                      unit: pi?.unit || ing.unit,
                    });
                  }
                }}
                options={[
                  ...stockItems.map((s) => ({ value: `stock:${s.id}`, label: s.name, sublabel: s.unit })),
                  ...prepItems.map((p) => ({ value: `prep:${p.id}`, label: p.name, sublabel: `${p.unit} (${t('prep')})` })),
                ]}
                placeholder={t('selectIngredient')}
              />
              <button onClick={() => removeRow(idx)} className="p-1.5 text-red-400 hover:text-red-300 flex-shrink-0">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            {/* Qty + unit: always authored (base quantity for the item's default
                portion). Variant scaling multiplies this by a ratio at cost time. */}
            <div className="flex items-center gap-2">
              <input
                type="number" step="any" min="0"
                className={`input w-24 py-1.5 text-sm text-right ${
                  (ing.quantity_needed ?? 0) <= 0
                    ? 'border-amber-500/60 ring-1 ring-amber-500/30'
                    : ''
                }`}
                value={ing.quantity_needed || ''}
                onChange={(e) => updateRow(idx, { quantity_needed: +e.target.value })}
                placeholder={t('qty')}
              />
              <select
                className="input w-20 py-1.5 text-sm"
                value={ing.unit || ''}
                onChange={(e) => updateRow(idx, { unit: e.target.value })}
              >
                <option value="">—</option>
                <option value="g">g</option><option value="kg">kg</option>
                <option value="ml">ml</option><option value="l">l</option>
                <option value="unit">unit</option>
              </select>
              {(ing.quantity_needed ?? 0) <= 0 && (
                <span className="text-xs text-amber-500">
                  {t('baseQtyMissing') || 'Base qty not set'}
                </span>
              )}
            </div>
            {/* Per-variant overrides — one compact input per attached variant.
                Empty cell = inherits the base qty. Only shown in per-portion
                mode (batch items prorate uniformly via yield, no override UI). */}
            {variantColumns.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-fg-tertiary font-medium">
                  {t('perVariantOverride') || 'Per-variant quantity (optional)'}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  {variantColumns.map((col) => {
                    const ov = getOverride(idx, col.option_id);
                    const hasOverride = !!ov;
                    return (
                      <div key={col.option_id} className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-fg-secondary">{col.name}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" step="any" min="0"
                            className="input w-20 py-1 text-xs text-right"
                            value={ov?.quantity || ''}
                            placeholder={ing.quantity_needed ? String(ing.quantity_needed) : '—'}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) { setOverride(idx, col.option_id, null); return; }
                              setOverride(idx, col.option_id, { quantity: +v, unit: ov?.unit || ing.unit || 'g' });
                            }}
                          />
                          <select
                            className="input w-14 py-1 text-xs"
                            value={ov?.unit || ing.unit || 'g'}
                            onChange={(e) => setOverride(idx, col.option_id, { quantity: ov?.quantity ?? 0, unit: e.target.value })}
                            disabled={!hasOverride}
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="ml">ml</option>
                            <option value="l">l</option>
                            <option value="unit">unit</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-fg-tertiary italic">
                  {t('perVariantOverrideHint') || 'Leave blank to use the base quantity. Example: Beef — base 200 g, Grand override 400 g.'}
                </p>
              </div>
            )}
          </div>
        ))
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={addRow}
          className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1"
        >
          <PlusIcon className="w-4 h-4" /> {t('addIngredient')}
        </button>
        {hasChanges && (
          <div className="flex gap-2">
            <button
              onClick={() => setRows(toInputs(current))}
              className="btn-secondary text-xs"
              disabled={saving}
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="btn-primary text-xs"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        )}
      </div>

      {/* Swap confirmation */}
      {swapConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-modal shadow-xl max-w-md w-full" style={{ background: 'var(--surface)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--divider)' }}>
              <h3 className="font-semibold text-fg-primary">{t('replaceWithPrep')}</h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-fg-primary">
              <p>
                {t('confirmReplacePrep')
                  .replace('{count}', String(swapConfirm.matchedIngredients.length))
                  .replace('{prep}', swapConfirm.prep.name)}
              </p>
              <ul className="text-xs text-fg-secondary list-disc pl-5 space-y-0.5 max-h-32 overflow-auto">
                {swapConfirm.matchedIngredients.map((i) => (
                  <li key={i.id}>{i.stock_item?.name ?? '?'}</li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--divider)' }}>
              <button onClick={() => setSwapConfirm(null)} className="btn-secondary text-sm">
                {t('cancel')}
              </button>
              <button
                onClick={() => applySwap(swapConfirm)}
                disabled={saving}
                className="btn-primary text-sm"
              >
                {saving ? t('saving') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
