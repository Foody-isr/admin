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
  priceDelta: number;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `combo-${Date.now()}`;
}

function optionsFromStep(step: ComboStep, groupItems: StepOption[] | undefined): StepOption[] {
  if (step.source_type === 'group') return groupItems ?? [];
  return (step.items ?? []).map((si) => ({
    key: `${si.menu_item_id}:${si.option_id ?? ''}`,
    menuItemId: si.menu_item_id,
    optionId: si.option_id ?? null,
    name: si.menu_item?.name ?? `#${si.menu_item_id}`,
    priceDelta: si.price_delta ?? 0,
  }));
}

interface NewOrderComboModalProps {
  combo: MenuItem | null;
  restaurantId: number;
  open: boolean;
  onClose: () => void;
  onAdd: (line: NewOrderLine) => void;
}

export function NewOrderComboModal({ combo, restaurantId, open, onClose, onAdd }: NewOrderComboModalProps) {
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
          try {
            const { items } = await resolveComboStepPreview(restaurantId, {
              sourceType: 'group',
              sourceId: step.source_group_id,
              variantLabel: step.source_variant_label ?? undefined,
            });
            resolved[step.id as number] = items.map((it) => ({
              key: `${it.menu_item_id}:${it.option_id ?? ''}`,
              menuItemId: it.menu_item_id,
              optionId: it.option_id ?? null,
              name: it.name,
              priceDelta: 0,
            }));
          } catch {
            /* leave this step empty — staff can still pick from other steps */
          }
        }
      }
      if (!cancelled) setGroupItems(resolved);
    })();
    return () => { cancelled = true; };
  }, [combo, open, steps, restaurantId]);

  if (!combo) return null;
  const activeCombo = combo;

  const stepCount = (stepId: number) =>
    Object.values(picks[stepId] ?? {}).reduce((a, b) => a + b, 0);

  function pick(step: ComboStep, opt: StepOption) {
    const stepId = step.id as number;
    const max = step.max_picks;
    const current = stepCount(stepId);
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

  const allComplete = steps.every((s) => stepCount(s.id as number) >= (s.min_picks ?? 0));

  const extraDelta = steps.reduce((sum, step) => {
    const opts = optionsFromStep(step, groupItems[step.id as number]);
    const byKey = picks[step.id as number] ?? {};
    return sum + opts.reduce((s, o) => s + (byKey[o.key] ?? 0) * o.priceDelta, 0);
  }, 0);
  const totalPrice = activeCombo.price + extraDelta;

  function handleAdd() {
    const selections: ComboSelection[] = [];
    for (const step of steps) {
      const opts = optionsFromStep(step, groupItems[step.id as number]);
      const byKey = picks[step.id as number] ?? {};
      for (const [key, qty] of Object.entries(byKey)) {
        const opt = opts.find((o) => o.key === key);
        if (!opt || qty <= 0) continue;
        selections.push({
          stepId: step.id as number,
          stepName: step.name,
          menuItemId: opt.menuItemId,
          menuItemName: opt.name,
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
          const opts = optionsFromStep(step, groupItems[stepId]);
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
                            disabled={max > 0 && count >= max}
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
