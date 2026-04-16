'use client';

import { useEffect, useState } from 'react';
import {
  setMenuItemIngredients,
  IngredientInput,
  MenuItem, MenuItemIngredient, StockItem, PrepItem,
} from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { PlusIcon, TrashIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import { detectPrepSwaps, SwapSuggestion } from '@/lib/prep-swap';

// Inline label + tooltip — same pattern as the daily-operations page's ThTooltip.
function FieldLabel({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs text-fg-secondary">
      <span>{text}</span>
      <div className="relative group/tip">
        <InformationCircleIcon className="w-3.5 h-3.5 text-fg-secondary opacity-50 cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--surface-elevated,#1e1e1e)] border border-[var(--divider)] text-fg-secondary shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20 text-left leading-snug font-normal">
          {tooltip}
        </div>
      </div>
    </div>
  );
}

interface Props {
  rid: number;
  menuItem: MenuItem;
  initialIngredients: MenuItemIngredient[];
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onSaved?: (ings: MenuItemIngredient[]) => void;
  // Variants attached to the item — drives the per-row Scope picker. Empty
  // array = no variants on the item, Scope column is hidden.
  variants?: Array<{ option_id: number; name: string }>;
}

// Single ingredient editor for a menu item. Each row can be scoped to:
// - Base (option_id == null) — applies to every variant
// - a specific variant (option_id set) — applies only when that variant sells
// This is the ONLY place ingredients are edited; the Variants modal is for
// price/portion/status only.
export default function MenuItemIngredientsEditor({
  rid, menuItem, initialIngredients, stockItems, prepItems, onSaved, variants,
}: Props) {
  const { t } = useI18n();
  const variantList = variants ?? [];

  const toInputs = (ings: MenuItemIngredient[]): IngredientInput[] =>
    ings.map((i) => ({
      option_id: i.option_id ?? undefined,
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
      // Legacy-data migration: any row with non-empty variant_overrides from
      // the old matrix era is converted to one variant-scoped row per override.
      // Runs silently on every save so legacy items migrate the first time the
      // user touches them — no backfill script needed.
      const legacyMigrated: IngredientInput[] = [];
      for (const i of current) {
        if (i.option_id != null) continue; // only base rows carried legacy overrides
        for (const ov of i.variant_overrides ?? []) {
          if (!ov.quantity || ov.quantity <= 0) continue;
          legacyMigrated.push({
            option_id: ov.option_id,
            stock_item_id: i.stock_item_id ?? undefined,
            prep_item_id: i.prep_item_id ?? undefined,
            quantity_needed: ov.quantity,
            unit: ov.unit || i.unit || '',
            scales_with_variant: false,
          });
        }
      }
      // Persist rows as-is — each already carries its own option_id (or null
      // for base). Force scales_with_variant off and clear any legacy overrides.
      const normalized = input.map((r) => ({
        ...r,
        scales_with_variant: false,
        variant_overrides: undefined,
      }));
      const saved = await setMenuItemIngredients(rid, menuItem.id, [
        ...normalized,
        ...legacyMigrated,
      ]);
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
            {/* Qty + unit + scope. The scope encodes three cases:
                  - "base"            → applies to every variant (literal qty)
                  - "follow"          → qty auto-uses each variant's portion_size
                  - <option_id>       → literal qty for that specific variant
                Qty/unit inputs hide when scope="follow" (the variant defines them). */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Scope selector — first, since it drives whether qty/unit show */}
              {variantList.length > 0 && (
                <div className="flex items-center gap-1">
                  <FieldLabel text={t('ingredientScope') || 'Scope'} tooltip={t('ingredientScopeTooltip') || 'Who this ingredient applies to. Base = every variant. Follow variant portion = qty = variant size (no number to type). Normal / Grand = only that variant.'} />
                  <select
                    className="input py-1.5 text-sm"
                    value={ing.scales_with_variant ? 'follow' : (ing.option_id ?? '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'follow') {
                        updateRow(idx, { scales_with_variant: true, option_id: undefined, quantity_needed: 0 });
                      } else if (v === '') {
                        updateRow(idx, { scales_with_variant: false, option_id: undefined });
                      } else {
                        updateRow(idx, { scales_with_variant: false, option_id: Number(v) });
                      }
                    }}
                  >
                    <option value="">{t('scopeBase') || 'Base (all variants)'}</option>
                    <option value="follow">{t('scopeFollowVariant') || 'Follow variant portion'}</option>
                    {variantList.map((v) => (
                      <option key={v.option_id} value={v.option_id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Qty + unit — hidden when scope = Follow variant portion (the
                  selected variant's portion_size IS the qty at cost time). */}
              {!ing.scales_with_variant && (
                <>
                  <div className="flex items-center gap-1">
                    <FieldLabel text={t('qty') || 'Qty'} tooltip={t('qtyTooltip') || 'How much of this ingredient one sale draws. Literal number — no scaling applied.'} />
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
                  </div>
                  <select
                    className="input w-20 py-1.5 text-sm"
                    value={ing.unit || ''}
                    onChange={(e) => updateRow(idx, { unit: e.target.value })}
                    title={t('unitTooltip') || 'Unit of the quantity. Convert to stock unit at cost time.'}
                  >
                    <option value="">—</option>
                    <option value="g">g</option><option value="kg">kg</option>
                    <option value="ml">ml</option><option value="l">l</option>
                    <option value="unit">unit</option>
                  </select>
                </>
              )}
              {ing.scales_with_variant && (
                <span className="text-xs text-brand-500/80 italic">
                  {t('scopeFollowHint') || '= each variant\u2019s portion size'}
                </span>
              )}
              {!ing.scales_with_variant && (ing.quantity_needed ?? 0) <= 0 && (
                <span className="text-xs text-amber-500">
                  {t('baseQtyMissing') || 'Base qty not set'}
                </span>
              )}
            </div>
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
