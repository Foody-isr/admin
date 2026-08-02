import type {
  MenuItem,
  ProductionSheetItem,
  ProductionSheetOrder,
  ProductionSheetPortion,
} from '@/lib/api';
import { itemSizeOptions } from '@/lib/item-options';

/** Parse a gram value from a portion-variant label like "250", "500 g", "1kg",
 *  "1.5 kg". Returns null when the label isn't a plain numeric portion (e.g.
 *  "Small"). Mirrors the server's parseGramsFromName so the box-packing UI
 *  offers the same portions the production sheet measures by. */
export function parsePortionGrams(name: string): number | null {
  const m = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(kg|g)?\s*$/i.exec(name);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  return /kg/i.test(m[2] ?? '') ? v * 1000 : v;
}

/** Distinct, ascending portion sizes (grams) derived from an item's numeric
 *  size options (option sets, with legacy variant-group fallback — see
 *  itemSizeOptions). Empty when the item has no numeric portion options. */
export function itemPortionGrams(item: MenuItem): number[] {
  const grams = new Set<number>();
  for (const o of itemSizeOptions(item)) {
    const px = parsePortionGrams(o.name);
    if (px != null) grams.add(px);
  }
  return Array.from(grams).sort((a, b) => a - b);
}

export interface PortionBox {
  portion: number; // grams
  count: number;
}

/** Pack `total` grams into the fewest containers, using `chosen` as the largest
 *  box and filling the remainder with the next-smaller available portion sizes
 *  (greedy, descending). Any indivisible leftover is returned as its own box so
 *  the breakdown always sums back to `total`. */
export function packIntoBoxes(total: number, chosen: number, available: number[]): PortionBox[] {
  const sizes = Array.from(new Set([chosen, ...available]))
    .filter((s) => s > 0 && s <= chosen)
    .sort((a, b) => b - a);
  const out: PortionBox[] = [];
  let rem = total;
  for (const s of sizes) {
    if (rem <= 0) break;
    const count = Math.floor((rem + 1e-6) / s);
    if (count > 0) {
      out.push({ portion: s, count });
      rem -= count * s;
    }
  }
  if (rem > 1e-6) out.push({ portion: Math.round(rem), count: 1 });
  return out;
}

/** Auto-mode breakdown for a weighed column: the containers actually ordered,
 *  tallied from the per-cell packaging the server attaches to each order row. A
 *  client who took 2 pots of 250 g counts as two 250 g containers — never as one
 *  500 g container, which is what reading their summed 500 g cell would suggest
 *  and which the kitchen may not even sell. Because it sums rows, it stays exact
 *  when the sheet is narrowed to some clients, unlike the day-level aggregate.
 *  `fallback` covers sheets served before per-order portions existed. Sorted by
 *  portion descending (largest box first), like packIntoBoxes. */
function orderedPortionBreakdown(
  orders: ProductionSheetOrder[],
  itemId: number,
  fallback: ProductionSheetPortion[] | undefined,
): PortionBox[] {
  const counts = new Map<number, number>();
  for (const o of orders) {
    for (const p of o.portions?.[String(itemId)] ?? []) {
      counts.set(p.portion_g, (counts.get(p.portion_g) ?? 0) + p.count);
    }
  }
  if (counts.size === 0) {
    for (const p of fallback ?? []) counts.set(p.portion_g, p.count);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([portion, count]) => ({ portion, count }));
}

/** The packaging chips for one weighed column — the single source both the
 *  desktop matrix header and the phone cook-list read, so the two screens can't
 *  drift apart on portioning. With a box size picked, the column total is
 *  repacked into the fewest containers of that size; in Auto it's the containers
 *  the clients actually ordered. Empty for counted items. */
export function productionBoxes(
  orders: ProductionSheetOrder[],
  item: ProductionSheetItem,
  boxSize: number | null | undefined,
  availablePortions: number[],
): PortionBox[] {
  if (item.measure !== 'weight') return [];
  if (boxSize) return packIntoBoxes(item.total, boxSize, availablePortions);
  return orderedPortionBreakdown(orders, item.menu_item_id, item.packaging);
}

/** Compact gram label: "250 g", "1 kg", "1.5 kg". */
export function fmtPortionGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return `${Number.isInteger(kg) ? kg : Number(kg.toFixed(2))} kg`;
  }
  return `${g} g`;
}
