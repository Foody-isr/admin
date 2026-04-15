'use client';

import { useEffect, useState } from 'react';
import {
  setMenuItemIngredients,
  IngredientInput, MenuItem, MenuItemIngredient, StockItem, PrepItem,
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
}

// Shared editor for a menu item's `menu_item_ingredients`. Used on the
// Menu Item edit page (primary home) and (read-only elsewhere).
export default function MenuItemIngredientsEditor({
  rid, menuItem, initialIngredients, stockItems, prepItems, onSaved, effectiveYield,
}: Props) {
  const { t } = useI18n();

  // Batch mode = the item has a recipe yield. Prefer the live prop (reflects
  // the user's current unsaved yield input) over the persisted value.
  const yieldForBatchCheck = effectiveYield ?? menuItem.recipe_yield ?? 0;
  const isBatchMode = yieldForBatchCheck > 0;

  const toInputs = (ings: MenuItemIngredient[]): IngredientInput[] =>
    ings.map((i) => ({
      stock_item_id: i.stock_item_id ?? undefined,
      prep_item_id: i.prep_item_id ?? undefined,
      quantity_needed: i.quantity_needed,
      unit: i.unit || i.stock_item?.unit || i.prep_item?.unit || '',
      scales_with_variant: i.scales_with_variant ?? false,
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

  const addRow = () => setRows([...rows, { quantity_needed: 0, unit: '', scales_with_variant: false }]);
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<IngredientInput>) =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

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
                className="input w-24 py-1.5 text-sm text-right"
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
            </div>
            {/* Follow variant portion — only meaningful for per-portion items.
                Batch items (recipe_yield > 0) prorate all ingredients uniformly
                by the variant's portion / yield ratio, so a per-ingredient flag
                would contradict that and is hidden here. */}
            {!isBatchMode && (
              <>
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ing.scales_with_variant ?? false}
                    onChange={(e) => updateRow(idx, { scales_with_variant: e.target.checked })}
                    className="rounded border-[var(--divider)]"
                  />
                  <span>{t('followVariantPortion')}</span>
                </label>
                {ing.scales_with_variant && (
                  <p className="text-xs text-fg-tertiary italic">{t('followVariantPortionHint')}</p>
                )}
              </>
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
