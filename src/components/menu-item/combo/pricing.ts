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

/** Combo price range — accounts for the customer's `min_picks` selections per
 *  step and for variant upcharges.
 *
 *  Min = base price (default options + zero-upcharge variants).
 *  Max = base + Σ_steps (max upcharges over the customer's `picks` selections).
 *
 *  For "pick N from this step", we approximate worst-case as N × the highest
 *  single upcharge in the step. This overestimates slightly when N > number of
 *  distinct items but is directionally honest for the operator-facing range. */
export function computePriceRange(
  basePrice: number,
  steps: ComboStepDraft[],
): PriceRange {
  let max = basePrice;
  for (const step of steps) {
    const picks = picksPerStep(step);
    const single = maxUpchargeInStep(step);
    max += picks * single;
  }
  const min = basePrice;
  return { min, max, static: min === max };
}

/** Per-step "how many picks does the customer commit to". Optional steps
 *  (`min_picks === 0`) contribute zero upcharge to the min/max math. */
function picksPerStep(step: ComboStepDraft): number {
  return Math.max(0, step.min_picks || 0);
}

/** Largest single upcharge in this step (any item / any variant). */
function maxUpchargeInStep(step: ComboStepDraft): number {
  if (step.items.length === 0) return 0;
  let max = 0;
  for (const it of step.items) {
    if (it.price_delta > max) max = it.price_delta;
  }
  return max;
}

/** Solo (à-la-carte) price totals — what the customer would pay buying the
 *  same items individually. Compared against the combo price to show savings.
 *
 *  Per step, the customer picks `min_picks` items. For the "min" of the
 *  range we assume they pick the cheapest items (best case for the customer
 *  buying separately); for "max" the most expensive.
 *
 *  Items with no known solo price (source not in `itemsById`) are skipped.
 *
 *  `comparable` is false when a required step has zero priced options, or
 *  when fewer priced options exist than `picks` — the customer is forced to
 *  pick at least one item with no standalone retail price (share plates,
 *  per-person items), so the "if bought separately" baseline is fictional. */
export function computeSoldSeparately(
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
): { min: number; max: number; comparable: boolean } {
  let min = 0;
  let max = 0;
  let comparable = true;
  for (const step of steps) {
    const picks = picksPerStep(step);
    if (picks === 0) continue;

    const options = buildOptions(step.items, itemsById);
    if (options.length === 0) continue;

    // Pair each option with its solo price range, drop unknowns, sort ascending.
    const priced = options
      .map((opt) => ({ opt, solo: soloPriceForOption(opt, itemsById) }))
      .filter(({ solo }) => solo.max > 0)
      .sort((a, b) => a.solo.min - b.solo.min);
    if (priced.length < picks) {
      // Required slots can't be filled with priced options — the comparison
      // would silently treat the missing picks as ₪0 and overstate savings
      // (or, more often, fabricate a surcharge that isn't real).
      comparable = false;
    }
    if (priced.length === 0) continue;

    const n = Math.min(picks, priced.length);
    // Cheapest n options for the min (customer's best case buying separately).
    for (let i = 0; i < n; i++) min += priced[i].solo.min;
    // Most expensive n options for the max.
    for (let i = priced.length - n; i < priced.length; i++) max += priced[i].solo.max;
  }
  return { min, max, comparable };
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

/** Per-step breakdown of how the "if bought separately" total is built.
 *  Used by the savings drilldown modal — same data as `computeSoldSeparately`
 *  but with attribution per step / per item. */
export interface ComboSavingsBreakdownContributor {
  itemName: string;
  variantName?: string;
  soloPrice: number;
}

export interface ComboSavingsBreakdownStep {
  stepName: string;
  picks: number;
  /** The cheapest `picks` options in this step that drive the min savings.
   *  Empty when the step is optional (`min_picks: 0`) or has no priced
   *  options. */
  contributors: ComboSavingsBreakdownContributor[];
  stepTotal: number;
}

export interface ComboSavingsBreakdown {
  basePrice: number;
  steps: ComboSavingsBreakdownStep[];
  soloTotal: number;
  savings: number;     // positive = customer saves; negative = combo overpriced
  savingsPct: number;  // signed
  /** False when at least one required step has zero-priced contributors —
   *  the soloTotal is built against a fictional baseline. The modal should
   *  swap the surcharge/savings summary for an explanatory note. */
  comparable: boolean;
}

/** Builds a step-by-step breakdown of the savings calculation. The numbers
 *  here always reconcile to `computeComboSavings(...).savingsMin`. */
export function computeComboSavingsBreakdown(
  basePrice: number,
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
): ComboSavingsBreakdown {
  const result: ComboSavingsBreakdownStep[] = [];
  let soloTotal = 0;
  let comparable = true;

  for (const step of steps) {
    const picks = picksPerStep(step);
    if (picks === 0) {
      result.push({ stepName: step.name, picks: 0, contributors: [], stepTotal: 0 });
      continue;
    }
    const options = buildOptions(step.items, itemsById);
    if (options.length === 0) {
      result.push({ stepName: step.name, picks, contributors: [], stepTotal: 0 });
      continue;
    }

    // For each option, surface its single cheapest included variant (or its
    // flat solo for variant-less items). Drop options whose source isn't
    // resolvable.
    type OptInfo = ComboSavingsBreakdownContributor;
    const optInfos: OptInfo[] = [];
    for (const opt of options) {
      const source = itemsById.get(opt.menuItemId);
      if (!source) continue;
      if (!opt.hasVariants) {
        optInfos.push({ itemName: opt.itemName, soloPrice: source.price ?? 0 });
        continue;
      }
      const sourceVariants = getSourceVariants(source);
      const includedIds = new Set(opt.variants.filter((v) => v.included).map((v) => v.variantId));
      const cheapest = sourceVariants
        .filter((sv) => includedIds.has(sv.id))
        .sort((a, b) => a.price - b.price)[0];
      if (!cheapest) continue;
      optInfos.push({ itemName: opt.itemName, variantName: cheapest.name, soloPrice: cheapest.price });
    }

    // Required picks that we'd need to fill from non-priced options (or no
    // options at all) make the savings comparison fictional. Mirror the
    // logic in `computeSoldSeparately` so both views stay consistent.
    const pricedCount = optInfos.filter((o) => o.soloPrice > 0).length;
    if (pricedCount < picks) comparable = false;

    optInfos.sort((a, b) => a.soloPrice - b.soloPrice);
    const chosen = optInfos.slice(0, Math.min(picks, optInfos.length));
    const stepTotal = chosen.reduce((s, c) => s + c.soloPrice, 0);
    soloTotal += stepTotal;
    result.push({ stepName: step.name, picks, contributors: chosen, stepTotal });
  }

  const savings = soloTotal - basePrice;
  const savingsPct = soloTotal > 0 ? (savings / soloTotal) * 100 : 0;
  return { basePrice, steps: result, soloTotal, savings, savingsPct, comparable };
}

/** Bundle of figures the operator sees: combo price range, solo equivalent
 *  range, and savings (positive = customer saves; negative = combo costs more
 *  than buying separately, which is a configuration warning). */
export interface ComboSavingsSummary {
  comboMin: number;
  comboMax: number;
  soloMin: number;
  soloMax: number;
  /** Positive when the customer saves vs solo, negative when the combo is
   *  more expensive. */
  savingsMin: number;
  savingsMax: number;
  /** Same sign as savings. Computed against `soloMin` so it's stable when
   *  upcharges move. 0 when soloMin is 0. */
  savingsPct: number;
  /** True when no solo prices were resolvable (items not loaded yet). The UI
   *  can show "—" instead of a misleading "₪0". */
  unknown: boolean;
  /** False when at least one required step is missing priced options — share
   *  plates, per-person dishes, or any item whose price only exists in the
   *  combo context. The savings math runs against a fictional baseline in
   *  that case, so callers should suppress the saves/surcharge framing. */
  comparable: boolean;
}

export function computeComboSavings(
  basePrice: number,
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
): ComboSavingsSummary {
  const range = computePriceRange(basePrice, steps);
  const solo = computeSoldSeparately(steps, itemsById);
  const unknown = solo.min === 0 && solo.max === 0;
  const savingsMin = solo.min - range.min;
  const savingsMax = solo.max - range.max;
  const savingsPct = solo.min > 0 ? (savingsMin / solo.min) * 100 : 0;
  return {
    comboMin: range.min,
    comboMax: range.max,
    soloMin: solo.min,
    soloMax: solo.max,
    savingsMin,
    savingsMax,
    savingsPct,
    unknown,
    comparable: solo.comparable,
  };
}

// Re-export so consumers can stay in this module.
export type { ComboStepDraftItem };
