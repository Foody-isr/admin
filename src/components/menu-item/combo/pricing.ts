// Pricing math — single source of truth. Used by:
//   • PricingCard (range display)
//   • CustomerOutcomePreview (sample combinations)
//   • Validation (sanity checks)
//
// Currently only `pricingMode === 'fixed'` is implemented. The other modes
// are placeholders for v2 (sum − %, sum − ₪).

import type { MenuItem } from '@/lib/api';
import type { ComboStepDraft, ComboStepDraftItem } from './types';
import { buildOptions, getSourceVariants } from './types';

export type PricingMode = 'fixed' | 'sumMinusPercent' | 'sumMinusFixed';

export interface PriceRange {
  min: number;
  max: number;
  /** True when min === max — no variant choice changes price. */
  static: boolean;
}

/** Min = base price (every step uses default option + baseline variant).
 *  Max = base + Σ_steps (max upcharge across that step's options).
 *  Optional steps contribute 0 to min (since the customer can skip). */
export function computePriceRange(
  basePrice: number,
  steps: ComboStepDraft[],
): PriceRange {
  let max = basePrice;
  for (const step of steps) {
    const stepMaxUpcharge = maxUpchargeInStep(step);
    max += stepMaxUpcharge;
  }
  const min = basePrice;
  return { min, max, static: min === max };
}

/** Worst-case upcharge a customer can incur within this step — picking the
 *  most expensive included variant of the most expensive option. */
function maxUpchargeInStep(step: ComboStepDraft): number {
  if (step.items.length === 0) return 0;
  // For variant rows, items sharing a menu_item_id are alternative variants —
  // take the max upcharge across them. For variant-less items they're just
  // alternative options — same logic. So a flat max() works.
  let max = 0;
  for (const it of step.items) {
    if (it.price_delta > max) max = it.price_delta;
  }
  return max;
}

/** Solo prices summed across one default-pick-per-step path. Used to show
 *  "if bought separately" / customer savings. Items without a known solo
 *  price contribute 0 (no warning surfaced for v1). */
export function computeSoldSeparately(
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const step of steps) {
    const options = buildOptions(step.items, itemsById);
    if (options.length === 0) continue;

    // For "min", use the default option's baseline (default) variant.
    const defaultOpt = options.find((o) => o.isDefault) ?? options[0];
    const defaultSolo = soloPriceForOption(defaultOpt, itemsById);
    min += defaultSolo.min;

    // For "max", take the most expensive solo across all options in the step.
    let stepMax = 0;
    for (const opt of options) {
      const s = soloPriceForOption(opt, itemsById);
      if (s.max > stepMax) stepMax = s.max;
    }
    max += stepMax;
  }
  return { min, max };
}

function soloPriceForOption(
  opt: ReturnType<typeof buildOptions>[number],
  itemsById: Map<number, MenuItem>,
): { min: number; max: number } {
  const source = itemsById.get(opt.menuItemId);
  if (!source) return { min: 0, max: 0 };

  if (!opt.hasVariants) {
    const p = source.price ?? 0;
    return { min: p, max: p };
  }

  // Variant solo prices come from the source item's variant list. Use only
  // included variants for the bounds.
  const sourceVariants = getSourceVariants(source);
  const includedIds = new Set(opt.variants.filter((v) => v.included).map((v) => v.variantId));
  const prices = sourceVariants
    .filter((sv) => includedIds.has(sv.id))
    .map((sv) => sv.price);
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Sample combinations to render in the customer-outcome card. We take the
 *  first step's first option's variants as the "showcased" axis. If that
 *  option has no variants, we fall back to a single sample at the base
 *  price. */
export interface SampleCombo {
  label: string;
  price: number;
  hint: string;
}

export function buildSampleCombos(
  comboName: string,
  basePrice: number,
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
  baseDefaultLabel: string,
  upchargeLabelTemplate: string, // "Base + ₪{delta} upcharge ({variant})"
  cap = 4,
): SampleCombo[] {
  if (steps.length === 0) return [];
  const firstOpts = buildOptions(steps[0].items, itemsById);
  if (firstOpts.length === 0) return [];
  const showcased = firstOpts[0];
  if (!showcased.hasVariants) {
    return [{
      label: comboName,
      price: basePrice + showcased.upcharge,
      hint: baseDefaultLabel,
    }];
  }
  const included = showcased.variants.filter((v) => v.included);
  const out: SampleCombo[] = [];
  for (const v of included) {
    if (out.length >= cap) break;
    out.push({
      label: `${comboName} · ${v.name}`,
      price: basePrice + v.upcharge,
      hint: v.upcharge === 0
        ? baseDefaultLabel
        : upchargeLabelTemplate.replace('{delta}', v.upcharge.toFixed(2)).replace('{variant}', v.name),
    });
  }
  return out;
}

// Re-export so consumers can stay in this module.
export type { ComboStepDraftItem };
