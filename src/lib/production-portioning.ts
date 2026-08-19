'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveProductionPortioning, type ProductionPortioning } from '@/lib/api';
import { DEFAULT_PORTIONING } from '@/lib/production';

// The production sheet's container rule: how a client's grams become boxes.
// Restaurant-wide and server-persisted (like the column layout, and unlike the
// portions/units preference in production-display.ts, which stays per-device) —
// a kitchen where one tablet packs 3×250 g and the next packs 1×500 + 1×250 for
// the same client is a kitchen that produces two different orders.
//
// Anyone may change the rule for their own session; only managers/owners can
// save it as the restaurant's default (the server enforces SettingsEdit).

/** Coerce a stored/served rule into a canonical value, so equality checks are a
 *  string compare and an unknown mode from a newer client reads as the default
 *  rather than as something the sheet would misapply. */
function normalize(p: ProductionPortioning | null | undefined): ProductionPortioning {
  if (!p || (p.mode !== 'ordered' && p.mode !== 'packed')) return DEFAULT_PORTIONING;
  if (p.mode === 'ordered') return { mode: 'ordered' };
  const cap = p.max_box && p.max_box > 0 ? p.max_box : 0;
  return cap > 0 ? { mode: 'packed', max_box: cap } : { mode: 'packed' };
}

function keyOf(p: ProductionPortioning | null | undefined): string {
  return JSON.stringify(normalize(p));
}

/** The Affichage select carries one rule per option value: "ordered", "packed"
 *  (each article repacked into its own largest box) or "packed:500" (capped at
 *  a size the kitchen actually stocks). */
export function portioningOptionValue(p: ProductionPortioning): string {
  const rule = normalize(p);
  if (rule.mode !== 'packed') return 'ordered';
  return rule.max_box ? `packed:${rule.max_box}` : 'packed';
}

export function portioningFromOption(value: string): ProductionPortioning {
  if (!value.startsWith('packed')) return { mode: 'ordered' };
  const cap = Number(value.slice('packed:'.length));
  return cap > 0 ? { mode: 'packed', max_box: cap } : { mode: 'packed' };
}

export interface ProductionPortioningControl {
  /** The rule the sheet is currently portioned by. */
  value: ProductionPortioning;
  /** Change it for this session only. */
  set: (next: ProductionPortioning) => void;
  /** Persist the current rule as the restaurant default (needs SettingsEdit). */
  saveAsDefault: () => void;
  /** True when the current rule already is the saved restaurant default — the
   *  "save as default" action has nothing to do. */
  isDefault: boolean;
  /** A save is in flight. */
  saving: boolean;
}

/**
 * Owns the production sheet's container rule: seeds from the rule the server
 * returned with the sheet, lets the staffer try another one for their session,
 * and persists a new default on request.
 *
 * Seeding is keyed on the *saved* rule, not on each sheet load, so stepping
 * from one day to the next keeps a session choice instead of silently snapping
 * back to the restaurant default mid-service.
 */
export function useProductionPortioning(
  restaurantId: number,
  serverValue: ProductionPortioning | null | undefined,
): ProductionPortioningControl {
  const [saved, setSaved] = useState<ProductionPortioning>(DEFAULT_PORTIONING);
  const [value, setValue] = useState<ProductionPortioning>(DEFAULT_PORTIONING);
  const [saving, setSaving] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const serverKey = keyOf(serverValue);
  useEffect(() => {
    const next = JSON.parse(serverKey) as ProductionPortioning;
    setSaved(next);
    setValue(next);
  }, [serverKey]);

  const set = useCallback((next: ProductionPortioning) => setValue(normalize(next)), []);

  const saveAsDefault = useCallback(() => {
    const next = valueRef.current;
    const prev = saved;
    // Optimistic, like the column layout: a failed save reverts so the popover
    // never claims a default the restaurant doesn't have.
    setSaved(next);
    setSaving(true);
    saveProductionPortioning(restaurantId, next)
      .catch((err) => {
        console.error('[production] failed to save portioning rule', err);
        setSaved(prev);
      })
      .finally(() => setSaving(false));
  }, [restaurantId, saved]);

  const isDefault = useMemo(() => keyOf(value) === keyOf(saved), [value, saved]);

  return { value, set, saveAsDefault, isDefault, saving };
}
