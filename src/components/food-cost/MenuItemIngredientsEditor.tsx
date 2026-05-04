'use client';

import { useEffect, useState } from 'react';
import {
  setMenuItemIngredients,
  IngredientInput,
  MenuItem, MenuItemIngredient, StockItem, PrepItem,
} from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { PlusIcon, TrashIcon, InfoIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { detectPrepSwaps, SwapSuggestion } from '@/lib/prep-swap';
import { NumberInput } from '@/components/ui/NumberInput';

// Inline label + tooltip — same pattern as the daily-operations page's ThTooltip.
function FieldLabel({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs text-fg-secondary">
      <span>{text}</span>
      <div className="relative group/tip">
        <InfoIcon className="w-3.5 h-3.5 text-fg-secondary opacity-50 cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--surface-elevated,#1e1e1e)] border border-[var(--line)] text-fg-secondary shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20 text-left leading-snug font-normal">
          {tooltip}
        </div>
      </div>
    </div>
  );
}

// Scope button — three of these replace the <select> for a more visual picker.
function ScopeButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active
          ? 'border-brand-500 bg-brand-500/10 text-brand-500'
          : 'border-[var(--divider)] text-fg-secondary hover:text-fg-primary hover:border-fg-secondary/40'
      }`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

type Scope = 'base' | 'match' | 'custom';

interface CardVariantRow {
  option_id: number;
  quantity: number; // 0 = blank
  unit: string;
}

interface IngredientCard {
  key: string;
  stock_item_id?: number;
  prep_item_id?: number;
  scope: Scope;
  // For base/match: single qty/unit
  quantity: number;
  unit: string;
  // For custom: per-variant rows (one per attached variant)
  variants: CardVariantRow[];
}

function blankCard(defaultScope: Scope): IngredientCard {
  return {
    key: crypto.randomUUID(),
    scope: defaultScope,
    quantity: 0,
    unit: '',
    variants: [],
  };
}

interface Props {
  rid: number;
  menuItem: MenuItem;
  initialIngredients: MenuItemIngredient[];
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onSaved?: (ings: MenuItemIngredient[]) => void;
  // Variants attached to the item. When empty, scope picker is hidden — every
  // ingredient is effectively "fixed".
  variants?: Array<{ option_id: number; name: string }>;
}

// Single ingredient editor for a menu item. Each ingredient is a CARD, and
// each card carries a Scope — Fixed quantity (all variants), Match item size
// (qty follows variant portion), or Custom per variant (qty per variant).
// The Variants modal is for price/portion/status only; this is the only
// place where ingredient quantities are authored.
export default function MenuItemIngredientsEditor({
  rid, menuItem, initialIngredients, stockItems, prepItems, onSaved, variants,
}: Props) {
  const { t } = useI18n();
  const variantList = variants ?? [];

  // ── Load: DB rows → cards ────────────────────────────────────────────
  // Group by (ingredient, scope bucket):
  //   - scales_with_variant + no option_id → 'match' (1 card)
  //   - !scales + no option_id            → 'base'  (1 card)
  //   - option_id set                     → 'custom' (1 card with N sub-rows)
  // An ingredient can appear in multiple cards if it has entries in more than
  // one bucket (rare but supported — e.g. "base cheese 10g" AND extra cheese
  // per-variant).
  const toCards = (ings: MenuItemIngredient[]): IngredientCard[] => {
    const byKey = new Map<string, IngredientCard>();
    for (const ing of ings) {
      const scopeBucket: Scope =
        ing.option_id != null ? 'custom'
        : ing.scales_with_variant ? 'match'
        : 'base';
      const ingKey = `${ing.stock_item_id ?? 'none'}:${ing.prep_item_id ?? 'none'}:${scopeBucket}`;
      let card = byKey.get(ingKey);
      if (!card) {
        card = {
          key: crypto.randomUUID(),
          stock_item_id: ing.stock_item_id ?? undefined,
          prep_item_id: ing.prep_item_id ?? undefined,
          scope: scopeBucket,
          quantity: 0,
          unit: ing.unit || ing.stock_item?.unit || ing.prep_item?.unit || '',
          variants: [],
        };
        byKey.set(ingKey, card);
      }
      if (scopeBucket === 'custom' && ing.option_id != null) {
        card.variants.push({
          option_id: ing.option_id,
          quantity: ing.quantity_needed || 0,
          unit: ing.unit || card.unit,
        });
      } else if (scopeBucket === 'base') {
        card.quantity = ing.quantity_needed || 0;
        card.unit = ing.unit || card.unit;
      }
      // match → quantity stays blank; cost math reads variant portion directly
    }
    return Array.from(byKey.values());
  };

  // ── Save: cards → DB rows ─────────────────────────────────────────────
  const toInputs = (cards: IngredientCard[]): IngredientInput[] => {
    const out: IngredientInput[] = [];
    for (const card of cards) {
      if (!card.stock_item_id && !card.prep_item_id) continue;
      if (card.scope === 'match') {
        out.push({
          option_id: undefined,
          stock_item_id: card.stock_item_id,
          prep_item_id: card.prep_item_id,
          quantity_needed: 0,
          unit: card.unit || '',
          scales_with_variant: true,
        });
      } else if (card.scope === 'base') {
        const qty = card.quantity;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        out.push({
          option_id: undefined,
          stock_item_id: card.stock_item_id,
          prep_item_id: card.prep_item_id,
          quantity_needed: qty,
          unit: card.unit || '',
          scales_with_variant: false,
        });
      } else {
        // custom — one row per filled variant cell
        for (const vr of card.variants) {
          const qty = vr.quantity;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          out.push({
            option_id: vr.option_id,
            stock_item_id: card.stock_item_id,
            prep_item_id: card.prep_item_id,
            quantity_needed: qty,
            unit: vr.unit || card.unit || '',
            scales_with_variant: false,
          });
        }
      }
    }
    return out;
  };

  const [current, setCurrent] = useState<MenuItemIngredient[]>(initialIngredients);
  const [cards, setCards] = useState<IngredientCard[]>(toCards(initialIngredients));
  const [saving, setSaving] = useState(false);
  const [swapConfirm, setSwapConfirm] = useState<SwapSuggestion | null>(null);

  // Keep state in sync if parent reloads ingredients (e.g. after save).
  useEffect(() => {
    setCurrent(initialIngredients);
    setCards(toCards(initialIngredients));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIngredients]);

  const addCard = () => {
    // Default scope: if variants exist and the user clearly wants simple
    // ingredients, 'base' is most common. Users switch to match/custom explicitly.
    const scope: Scope = 'base';
    setCards([...cards, blankCard(scope)]);
  };
  const removeCard = (key: string) => setCards(cards.filter((c) => c.key !== key));
  const updateCard = (key: string, patch: Partial<IngredientCard>) =>
    setCards(cards.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  // Pick the source (stock/prep) — sets default unit from the source.
  const pickSource = (key: string, val: string) => {
    if (val.startsWith('stock:')) {
      const id = +val.split(':')[1];
      const s = stockItems.find((x) => x.id === id);
      updateCard(key, {
        stock_item_id: id,
        prep_item_id: undefined,
        unit: s?.unit || cards.find((c) => c.key === key)?.unit || '',
      });
    } else if (val.startsWith('prep:')) {
      const id = +val.split(':')[1];
      const p = prepItems.find((x) => x.id === id);
      updateCard(key, {
        prep_item_id: id,
        stock_item_id: undefined,
        unit: p?.unit || cards.find((c) => c.key === key)?.unit || '',
      });
    }
  };

  // Switching scope — carry over data sensibly between modes.
  const changeScope = (key: string, next: Scope) => {
    const card = cards.find((c) => c.key === key);
    if (!card) return;
    if (next === card.scope) return;
    const seededVariants: CardVariantRow[] =
      next === 'custom'
        ? variantList.map((v) => {
            const existing = card.variants.find((vr) => vr.option_id === v.option_id);
            return existing ?? {
              option_id: v.option_id,
              // When coming from 'base', seed each variant with the base qty (user can adjust).
              quantity: card.scope === 'base' ? card.quantity : 0,
              unit: card.unit || '',
            };
          })
        : card.variants;
    // base/match collapsing: take first non-empty variant qty as the new base qty
    let collapsedQty = card.quantity;
    let collapsedUnit = card.unit;
    if (card.scope === 'custom' && next !== 'custom') {
      const firstFilled = card.variants.find((vr) => vr.quantity > 0);
      if (firstFilled) {
        collapsedQty = firstFilled.quantity;
        collapsedUnit = firstFilled.unit || card.unit;
      }
    }
    updateCard(key, {
      scope: next,
      variants: seededVariants,
      quantity: next === 'match' ? 0 : collapsedQty,
      unit: collapsedUnit,
    });
  };

  const updateVariantRow = (cardKey: string, optionId: number, patch: Partial<CardVariantRow>) => {
    setCards(cards.map((c) => {
      if (c.key !== cardKey) return c;
      const existing = c.variants.find((vr) => vr.option_id === optionId);
      const next = existing
        ? c.variants.map((vr) => (vr.option_id === optionId ? { ...vr, ...patch } : vr))
        : [...c.variants, { option_id: optionId, quantity: 0, unit: c.unit, ...patch } as CardVariantRow];
      return { ...c, variants: next };
    }));
  };

  const save = async (inputCards: IngredientCard[] = cards) => {
    setSaving(true);
    try {
      // Legacy-data migration: rows with variant_overrides from the old matrix
      // era → one Custom row per override. Runs silently on save.
      const legacyMigrated: IngredientInput[] = [];
      for (const i of current) {
        if (i.option_id != null) continue;
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
      const fromCards = toInputs(inputCards);
      const saved = await setMenuItemIngredients(rid, menuItem.id, [...fromCards, ...legacyMigrated]);
      setCurrent(saved);
      setCards(toCards(saved));
      onSaved?.(saved);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Swap helper: drop matched raw ingredients, add a prep card.
  const applySwap = async (s: SwapSuggestion) => {
    const matchedIds = new Set(s.matchedIngredients.map((i) => i.id));
    const kept = current.filter((i) => !matchedIds.has(i.id));
    const keptCards = toCards(kept);
    const prepCard: IngredientCard = {
      key: crypto.randomUUID(),
      prep_item_id: s.prep.id,
      scope: 'base',
      quantity: 0,
      unit: s.prep.unit || '',
      variants: [],
    };
    setSwapConfirm(null);
    await save([...keptCards, prepCard]);
  };

  const suggestions = detectPrepSwaps(current, prepItems);
  const topSuggestion = suggestions[0] ?? null;

  const hasChanges = JSON.stringify(toInputs(cards)) !== JSON.stringify(toInputs(toCards(current)));

  const iconBase = '📌';
  const iconMatch = '📏';
  const iconCustom = '⚙️';

  return (
    <div className="space-y-3">
      {/* Swap banner — brand-tinted info strip */}
      {topSuggestion && (
        <div
          className="flex items-start gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm"
          style={{
            background: 'color-mix(in oklab, var(--brand-500) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--brand-500) 30%, var(--line))',
          }}
        >
          <span className="text-fs-lg leading-none shrink-0">💡</span>
          <div className="flex-1 text-[var(--fg)]">
            <p>
              {t('swapSuggestionBanner')
                .replace('{prep}', topSuggestion.prep.name)
                .replace('{matched}', String(topSuggestion.matchedIngredients.length))
                .replace('{total}', String(current.filter((i) => i.stock_item_id).length))}
            </p>
          </div>
          <button
            onClick={() => setSwapConfirm(topSuggestion)}
            className="inline-flex items-center h-7 px-[var(--s-3)] rounded-r-md bg-[var(--brand-500)] text-white text-fs-xs font-medium hover:bg-[var(--brand-600)] transition-colors whitespace-nowrap"
          >
            {t('replaceWithPrep')}
          </button>
        </div>
      )}

      {/* Cards */}
      {cards.length === 0 ? (
        <p className="text-sm text-fg-secondary italic py-2">{t('noIngredientsLinked')}</p>
      ) : (
        cards.map((card) => {
          const sourceValue = card.stock_item_id
            ? `stock:${card.stock_item_id}`
            : card.prep_item_id
            ? `prep:${card.prep_item_id}`
            : '';
          const hint =
            card.scope === 'match' ? (t('scopeFollowHint') || '')
            : card.scope === 'base' ? (t('scopeBaseHint') || '')
            : (t('scopeCustomHint') || '');
          return (
            <div key={card.key} className="p-[var(--s-4)] rounded-r-md border border-[var(--line)] space-y-[var(--s-3)] shadow-1" style={{ background: 'var(--surface-2)' }}>
              {/* Row 1 — picker + delete */}
              <div className="flex items-center gap-2">
                <SearchableSelect
                  className="flex-1"
                  value={sourceValue}
                  onChange={(val) => pickSource(card.key, val)}
                  options={[
                    ...stockItems.map((s) => ({ value: `stock:${s.id}`, label: s.name, sublabel: s.unit })),
                    ...prepItems.map((p) => ({ value: `prep:${p.id}`, label: p.name, sublabel: `${p.unit} (${t('prep')})` })),
                  ]}
                  placeholder={t('selectIngredient')}
                />
                <button onClick={() => removeCard(card.key)} className="p-1.5 text-red-400 hover:text-red-300 flex-shrink-0">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Row 2 — scope buttons (only when item has variants) */}
              {variantList.length > 0 && (
                <div className="space-y-1.5">
                  <FieldLabel
                    text={t('ingredientScope') || 'How is this ingredient used?'}
                    tooltip={t('ingredientScopeTooltip') || 'Pick how this ingredient behaves across variants.'}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <ScopeButton icon={iconMatch}  label={t('scopeFollowVariant') || 'Match item size'}     active={card.scope === 'match'}  onClick={() => changeScope(card.key, 'match')} />
                    <ScopeButton icon={iconBase}   label={t('scopeBase') || 'Fixed quantity'}                active={card.scope === 'base'}   onClick={() => changeScope(card.key, 'base')} />
                    <ScopeButton icon={iconCustom} label={t('scopeCustom') || 'Custom per variant'}          active={card.scope === 'custom'} onClick={() => changeScope(card.key, 'custom')} />
                  </div>
                  {hint && <p className="text-[11px] text-fg-tertiary italic pt-0.5">{hint}</p>}
                </div>
              )}

              {/* Row 3 — dynamic editor based on scope */}
              {card.scope === 'base' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <FieldLabel text={t('qty') || 'Qty'} tooltip={t('qtyTooltip') || 'How much one sale draws. Literal number.'} />
                  <NumberInput
                    min={0}
                    className={`input w-24 py-1.5 text-sm text-right ${
                      card.quantity <= 0 ? 'border-amber-500/60 ring-1 ring-amber-500/30' : ''
                    }`}
                    value={card.quantity}
                    onChange={(v) => updateCard(card.key, { quantity: v })}
                    placeholder={t('qty')}
                  />
                  <select
                    className="input w-20 py-1.5 text-sm"
                    value={card.unit || ''}
                    onChange={(e) => updateCard(card.key, { unit: e.target.value })}
                    title={t('unitTooltip') || 'Unit of the quantity.'}
                  >
                    <option value="">—</option>
                    <option value="g">g</option><option value="kg">kg</option>
                    <option value="ml">ml</option><option value="l">l</option>
                    <option value="unit">unit</option>
                  </select>
                  {card.quantity <= 0 && (
                    <span className="text-xs text-amber-500">{t('baseQtyMissing') || 'Base qty not set'}</span>
                  )}
                </div>
              )}

              {card.scope === 'custom' && variantList.length > 0 && (
                <div className="rounded-lg border border-[var(--line)] overflow-hidden">
                  <div className="grid text-[11px] font-medium text-fg-tertiary uppercase tracking-wide px-3 py-1.5 bg-[var(--surface)]"
                    style={{ gridTemplateColumns: '1fr 100px 80px' }}>
                    <span>{t('variant') || 'Variant'}</span>
                    <span className="text-right">{t('qty') || 'Quantity'}</span>
                    <span>{t('unit') || 'Unit'}</span>
                  </div>
                  {variantList.map((v) => {
                    const row = card.variants.find((vr) => vr.option_id === v.option_id);
                    return (
                      <div key={v.option_id} className="grid items-center px-3 py-2 text-sm"
                        style={{ gridTemplateColumns: '1fr 100px 80px', borderTop: '1px solid var(--divider)' }}>
                        <span className="text-fg-primary">{v.name}</span>
                        <NumberInput
                          min={0}
                          className="input w-full py-1 text-xs text-right"
                          value={row?.quantity ?? 0}
                          onChange={(qv) => updateVariantRow(card.key, v.option_id, { quantity: qv })}
                          placeholder="—"
                        />
                        <select
                          className="input w-full py-1 text-xs"
                          value={row?.unit || card.unit || 'g'}
                          onChange={(e) => updateVariantRow(card.key, v.option_id, { unit: e.target.value })}
                        >
                          <option value="g">g</option><option value="kg">kg</option>
                          <option value="ml">ml</option><option value="l">l</option>
                          <option value="unit">unit</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* match scope: no editor — hint row above is enough */}
            </div>
          );
        })
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={addCard}
          className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1"
        >
          <PlusIcon className="w-4 h-4" /> {t('addIngredient')}
        </button>
        {hasChanges && (
          <div className="flex gap-2">
            <button
              onClick={() => setCards(toCards(current))}
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
