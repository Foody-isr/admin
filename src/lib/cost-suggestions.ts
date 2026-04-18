import type { MenuItemIngredient } from '@/lib/api';

export interface CostLine {
  ing: MenuItemIngredient;
  lineCost: number;   // what this ingredient contributes to the total (already VAT-normalized)
  unitCost: number;   // displayed ₪/sourceUnit (already VAT-normalized)
  sourceUnit: string; // stock.unit or prep.unit — the unit the unit cost is denominated in
}

export interface PriceSuggestion {
  targetPrice: number;
  delta: number;       // targetPrice - currentPrice
  deltaPct: number;    // delta / currentPrice (fraction, not percent)
}

export interface IngredientSuggestion {
  ingredient: MenuItemIngredient;
  currentUnitCost: number;
  targetUnitCost: number;
  currentLineCost: number;
  targetLineCost: number;
  contributionPct: number; // currentLineCost / totalCost (fraction)
  deltaPct: number;        // (targetUnitCost - currentUnitCost) / currentUnitCost (fraction, negative)
  sourceUnit: string;
}

// Given current food cost and current price (on the same VAT basis), compute
// the price that would bring cost% down to targetPct. Returns null when the
// price is not positive or when no increase is needed.
export function suggestTargetPrice(
  displayCost: number,
  currentPrice: number,
  targetPct: number,
): PriceSuggestion | null {
  if (currentPrice <= 0 || targetPct <= 0) return null;
  if (displayCost <= 0) return null;
  const targetPrice = displayCost / targetPct;
  if (targetPrice <= currentPrice) return null;
  const delta = targetPrice - currentPrice;
  return { targetPrice, delta, deltaPct: delta / currentPrice };
}

// Pick the ingredient with the largest cost contribution and compute the unit
// cost it would need to have so that the TOTAL cost% drops to targetPct
// (holding every other line fixed). Returns null when:
//   - no ingredients or price/cost invalid
//   - even zeroing the top line wouldn't bring cost% to target (raising the
//     price is the only viable lever then)
//   - the top line has zero cost (can't scale proportionally)
export function suggestTopIngredient(
  lines: CostLine[],
  totalCost: number,
  price: number,
  targetPct: number,
): IngredientSuggestion | null {
  if (price <= 0 || totalCost <= 0 || targetPct <= 0) return null;
  if (lines.length === 0) return null;

  const top = lines.reduce<CostLine | null>(
    (best, l) => (best == null || l.lineCost > best.lineCost ? l : best),
    null,
  );
  if (!top || top.lineCost <= 0 || top.unitCost <= 0) return null;

  const targetLineCost = price * targetPct - (totalCost - top.lineCost);
  if (targetLineCost < 0) return null;
  if (targetLineCost >= top.lineCost) return null;

  const ratio = targetLineCost / top.lineCost;
  const targetUnitCost = top.unitCost * ratio;

  return {
    ingredient: top.ing,
    currentUnitCost: top.unitCost,
    targetUnitCost,
    currentLineCost: top.lineCost,
    targetLineCost,
    contributionPct: top.lineCost / totalCost,
    deltaPct: (targetUnitCost - top.unitCost) / top.unitCost,
    sourceUnit: top.sourceUnit,
  };
}
