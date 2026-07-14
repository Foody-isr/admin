'use client';

import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ds';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { resolveComboStepPreview, type MenuItem, type ComboStep } from '@/lib/api';
import type { ComboSelection, NewOrderLine } from './NewOrderItemModal';

// A single pickable option within a step. `key` uniquely identifies the
// item+option pair so the same item with different sizes stays distinct.
interface StepOption {
  key: string;
  menuItemId: number;
  optionId: number | null;
  name: string;
  /** Pinned portion/size label for this option (e.g. "250 g"), if any. */
  portion?: string;
  /** When the step carries per-size rules, the variant size this option
   *  represents (e.g. "500g"). Drives the per-size cap tally. */
  sizeLabel?: string;
  priceDelta: number;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `combo-${Date.now()}`;
}

/** Normalize a size label for case/whitespace-insensitive matching, mirroring
 *  the server's combo resolver and the guest web. */
function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

/** All active sizes (option-set options + legacy variants) on a catalog item,
 *  as {optionId, name} pairs. Used to expand a per-size-rules step into one
 *  pickable option per allowed size. */
function itemSizeOptions(item: MenuItem | undefined): Array<{ optionId: number; name: string }> {
  if (!item) return [];
  const out: Array<{ optionId: number; name: string }> = [];
  for (const os of item.option_sets ?? []) {
    for (const o of os.options ?? []) {
      if (o.is_active !== false) out.push({ optionId: o.id, name: o.name });
    }
  }
  for (const g of item.variant_groups ?? []) {
    for (const v of g.variants ?? []) {
      if (v.is_active !== false) out.push({ optionId: v.id, name: v.name });
    }
  }
  return out;
}

// Resolve the label of a pinned variant/option (e.g. "250 g") from the full
// catalog item — combos pin the portion via option_id, they don't let the
// customer choose it.
function portionLabel(item: MenuItem | undefined, optionId: number | null | undefined): string | undefined {
  if (!item || optionId == null) return undefined;
  for (const g of item.variant_groups ?? []) {
    const v = (g.variants ?? []).find((x) => x.id === optionId);
    if (v) return v.name;
  }
  for (const os of item.option_sets ?? []) {
    const o = (os.options ?? []).find((x) => x.id === optionId);
    if (o) return o.portion || o.name;
  }
  return undefined;
}

function optionsFromStep(
  step: ComboStep,
  groupItems: StepOption[] | undefined,
  itemMap: Map<number, MenuItem>,
): StepOption[] {
  if (step.source_type === 'group') return groupItems ?? [];
  return (step.items ?? []).map((si) => {
    const full = itemMap.get(si.menu_item_id) ?? si.menu_item;
    return {
      key: `${si.menu_item_id}:${si.option_id ?? ''}`,
      menuItemId: si.menu_item_id,
      optionId: si.option_id ?? null,
      name: full?.name ?? `#${si.menu_item_id}`,
      portion: portionLabel(full, si.option_id),
      priceDelta: si.price_delta ?? 0,
    };
  });
}

interface NewOrderComboModalProps {
  combo: MenuItem | null;
  restaurantId: number;
  itemMap: Map<number, MenuItem>;
  // Selected série/batch ISO date for a weekly-rotating carte, so group steps
  // resolve to the same week as the à-la-carte items. null on a non-rotating
  // carte (the server then resolves at today).
  serieDate?: string | null;
  open: boolean;
  onClose: () => void;
  onAdd: (line: NewOrderLine) => void;
}

export function NewOrderComboModal({ combo, restaurantId, itemMap, serieDate, open, onClose, onAdd }: NewOrderComboModalProps) {
  const { t } = useI18n();
  const steps = useMemo(() => (combo?.combo_steps ?? []).filter((s) => s.id != null), [combo]);

  // Resolved items for group-sourced (dynamic) steps, keyed by step id.
  const [groupItems, setGroupItems] = useState<Record<number, StepOption[]>>({});
  // Picks: stepId → optionKey → quantity.
  const [picks, setPicks] = useState<Record<number, Record<string, number>>>({});

  // Reset local state whenever a different combo is opened.
  const [seedId, setSeedId] = useState<number | null>(null);
  if (combo && combo.id !== seedId) {
    setSeedId(combo.id);
    setPicks({});
    setGroupItems({});
  }

  useEffect(() => {
    if (!combo || !open) return;
    let cancelled = false;
    (async () => {
      const resolved: Record<number, StepOption[]> = {};
      for (const step of steps) {
        if (step.source_type === 'group' && step.source_group_id) {
          const rules = step.variant_rules ?? [];
          const hasRules = rules.length > 0;
          try {
            const { items } = await resolveComboStepPreview(restaurantId, {
              sourceType: 'group',
              sourceId: step.source_group_id,
              // Per-size-rules steps are not pinned to one size — resolve whole
              // items and expand them into their allowed sizes below.
              variantLabel: hasRules ? undefined : step.source_variant_label ?? undefined,
              serieDate: serieDate ?? undefined,
            });
            if (hasRules) {
              const allowed = new Set(rules.map((r) => normLabel(r.variant_label)));
              const expanded: StepOption[] = [];
              for (const it of items) {
                const sizes = itemSizeOptions(itemMap.get(it.menu_item_id)).filter((s) =>
                  allowed.has(normLabel(s.name)),
                );
                for (const s of sizes) {
                  expanded.push({
                    key: `${it.menu_item_id}:${s.optionId}`,
                    menuItemId: it.menu_item_id,
                    optionId: s.optionId,
                    name: it.name,
                    portion: s.name,
                    sizeLabel: s.name,
                    priceDelta: 0,
                  });
                }
              }
              resolved[step.id as number] = expanded;
            } else {
              resolved[step.id as number] = items.map((it) => ({
                key: `${it.menu_item_id}:${it.option_id ?? ''}`,
                menuItemId: it.menu_item_id,
                optionId: it.option_id ?? null,
                name: it.name,
                // Group steps pin the size via the step's variant label.
                portion: step.source_variant_label ?? portionLabel(itemMap.get(it.menu_item_id), it.option_id),
                priceDelta: 0,
              }));
            }
          } catch {
            /* leave this step empty — staff can still pick from other steps */
          }
        }
      }
      if (!cancelled) setGroupItems(resolved);
    })();
    return () => { cancelled = true; };
  }, [combo, open, steps, restaurantId, itemMap, serieDate]);

  if (!combo) return null;
  const activeCombo = combo;

  const stepCount = (stepId: number) =>
    Object.values(picks[stepId] ?? {}).reduce((a, b) => a + b, 0);

  // Picks in a step that use a given size label (sums across all items of that
  // size). Drives per-size cap enforcement for variant-rule steps.
  const sizeCount = (stepId: number, sizeLabel: string): number => {
    const opts = groupItems[stepId] ?? [];
    const byKey = picks[stepId] ?? {};
    return opts.reduce(
      (sum, o) => (o.sizeLabel && normLabel(o.sizeLabel) === normLabel(sizeLabel) ? sum + (byKey[o.key] ?? 0) : sum),
      0,
    );
  };

  // Remaining picks allowed for a size (null = no cap / not a rule size).
  const sizeRemaining = (step: ComboStep, sizeLabel?: string): number | null => {
    if (!sizeLabel) return null;
    const rule = (step.variant_rules ?? []).find((r) => normLabel(r.variant_label) === normLabel(sizeLabel));
    if (!rule || rule.max_picks <= 0) return null;
    return rule.max_picks - sizeCount(step.id as number, sizeLabel);
  };

  // Picks of one item in a step, summed across its sizes.
  const itemCount = (stepId: number, menuItemId: number): number => {
    const opts = groupItems[stepId] ?? optionsFromStep(steps.find((s) => s.id === stepId)!, undefined, itemMap);
    const byKey = picks[stepId] ?? {};
    return opts.reduce((sum, o) => (o.menuItemId === menuItemId ? sum + (byKey[o.key] ?? 0) : sum), 0);
  };

  // The per-item cap for an item in a step (null = unlimited): an item_limits
  // override wins, else the step-wide max_per_item.
  const itemCap = (step: ComboStep, menuItemId: number): number | null => {
    const ov = (step.item_limits ?? []).find((l) => l.menu_item_id === menuItemId);
    const cap = ov ? ov.max_qty : step.max_per_item ?? 0;
    return cap > 0 ? cap : null;
  };

  function pick(step: ComboStep, opt: StepOption) {
    const stepId = step.id as number;
    const max = step.max_picks;
    const current = stepCount(stepId);
    // Per-size cap: block a size once its max is reached.
    const remaining = sizeRemaining(step, opt.sizeLabel);
    if (remaining != null && remaining <= 0) return;
    // Per-item cap: block an item once its max (across sizes) is reached.
    const cap = itemCap(step, opt.menuItemId);
    if (cap != null && itemCount(stepId, opt.menuItemId) >= cap) return;
    setPicks((prev) => {
      const cur = { ...(prev[stepId] ?? {}) };
      // Single-choice step: selecting replaces the current pick.
      if (max === 1) {
        return { ...prev, [stepId]: { [opt.key]: 1 } };
      }
      if (max > 0 && current >= max) return prev; // at capacity
      cur[opt.key] = (cur[opt.key] ?? 0) + 1;
      return { ...prev, [stepId]: cur };
    });
  }

  function unpick(stepId: number, key: string) {
    setPicks((prev) => {
      const cur = { ...(prev[stepId] ?? {}) };
      const q = (cur[key] ?? 0) - 1;
      if (q <= 0) delete cur[key];
      else cur[key] = q;
      return { ...prev, [stepId]: cur };
    });
  }

  const allComplete = steps.every((s) => {
    if (stepCount(s.id as number) < (s.min_picks ?? 0)) return false;
    // Per-size minimums must also be met (e.g. "at least 4 at 500g").
    return (s.variant_rules ?? []).every(
      (r) => r.min_picks <= 0 || sizeCount(s.id as number, r.variant_label) >= r.min_picks,
    );
  });

  const extraDelta = steps.reduce((sum, step) => {
    const opts = optionsFromStep(step, groupItems[step.id as number], itemMap);
    const byKey = picks[step.id as number] ?? {};
    return sum + opts.reduce((s, o) => s + (byKey[o.key] ?? 0) * o.priceDelta, 0);
  }, 0);
  const totalPrice = activeCombo.price + extraDelta;

  function handleAdd() {
    const selections: ComboSelection[] = [];
    for (const step of steps) {
      const opts = optionsFromStep(step, groupItems[step.id as number], itemMap);
      const byKey = picks[step.id as number] ?? {};
      for (const [key, qty] of Object.entries(byKey)) {
        const opt = opts.find((o) => o.key === key);
        if (!opt || qty <= 0) continue;
        selections.push({
          stepId: step.id as number,
          stepName: step.name,
          menuItemId: opt.menuItemId,
          // Carry the pinned portion into the label so the receipt shows it too.
          menuItemName: opt.portion ? `${opt.name} · ${opt.portion}` : opt.name,
          optionId: opt.optionId,
          quantity: qty,
          priceDelta: opt.priceDelta,
        });
      }
    }
    onAdd({
      uid: uid(),
      item: activeCombo,
      quantity: 1,
      notes: '',
      modifiers: [],
      comboItemId: activeCombo.id,
      comboSelections: selections,
    });
    setSeedId(null);
    onClose();
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={activeCombo.name}
      subtitle={activeCombo.description || t('comboLabel')}
      width={520}
      onSave={handleAdd}
      saveDisabled={!allComplete}
      saveLabel={`${t('addToOrder')} · ₪${totalPrice.toFixed(2)}`}
    >
      <div className="flex flex-col gap-[var(--s-5)]">
        {steps.map((step) => {
          const stepId = step.id as number;
          const opts = optionsFromStep(step, groupItems[stepId], itemMap);
          const count = stepCount(stepId);
          const min = step.min_picks ?? 0;
          const max = step.max_picks ?? 0;
          const satisfied = count >= min;
          return (
            <div key={stepId} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-fs-sm font-semibold">{step.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-fs-xs font-medium',
                    satisfied
                      ? 'bg-[var(--success-500)]/15 text-[var(--success-500)]'
                      : 'bg-[var(--surface-2)] text-[var(--fg-muted)]',
                  )}
                >
                  {count}/{min || max || count}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {opts.length === 0 && (
                  <span className="text-fs-xs text-[var(--fg-subtle)]">{t('loading')}…</span>
                )}
                {opts.map((opt) => {
                  const qty = (picks[stepId] ?? {})[opt.key] ?? 0;
                  const selected = qty > 0;
                  const single = max === 1;
                  const remaining = sizeRemaining(step, opt.sizeLabel);
                  const sizeFull = remaining != null && remaining <= 0;
                  return (
                    <div
                      key={opt.key}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-md border px-[var(--s-3)] py-2 transition-colors',
                        selected ? 'border-[var(--brand-500)] bg-[var(--surface-2)]' : 'border-[var(--line)]',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => pick(step, opt)}
                        className="flex flex-1 items-center gap-2 text-start text-fs-sm"
                      >
                        {single && (
                          <span className={cn('size-3.5 shrink-0 rounded-full border', selected ? 'border-[var(--brand-500)] bg-[var(--brand-500)]' : 'border-[var(--line-strong)]')} />
                        )}
                        <span>{opt.name}</span>
                        {opt.portion && (
                          <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-fs-xs font-medium text-[var(--fg-muted)]">
                            {opt.portion}
                          </span>
                        )}
                        {remaining != null && (
                          <span className="text-fs-xs text-[var(--fg-subtle)]">
                            {sizeFull ? t('comboSizeFull') : t('comboSizeRemaining').replace('{n}', String(remaining))}
                          </span>
                        )}
                        {opt.priceDelta > 0 && (
                          <span className="text-fs-xs text-[var(--fg-muted)]">+₪{opt.priceDelta.toFixed(2)}</span>
                        )}
                      </button>
                      {!single && (
                        <div className="flex items-center gap-1.5">
                          {qty > 0 && (
                            <button type="button" onClick={() => unpick(stepId, opt.key)} className="flex size-6 items-center justify-center rounded border border-[var(--line-strong)] text-fs-sm">−</button>
                          )}
                          {qty > 0 && <span className="w-5 text-center font-mono tabular-nums text-fs-sm">{qty}</span>}
                          <button
                            type="button"
                            onClick={() => pick(step, opt)}
                            disabled={(max > 0 && count >= max) || sizeFull}
                            className="flex size-6 items-center justify-center rounded border border-[var(--line-strong)] text-fs-sm disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
