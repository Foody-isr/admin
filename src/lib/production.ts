import type { MenuItem } from '@/lib/api';
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

/** Auto-mode packaging breakdown for a weighed column, built from the per-client
 *  cell values exactly as the grid shows them. Each non-zero cell contributes one
 *  container of its own value and equal values are tallied, so cells [500, 500,
 *  250, 250, 250] read as "2×500 · 3×250" — a header row that maps line-for-line
 *  to the column. A cell already above a box size (e.g. 1000) stays "1×1000"
 *  rather than being re-split, so what you read in the header is what a client
 *  cell literally shows. Sorted by portion descending (largest box first). */
export function cellPortionBreakdown(cellValues: Array<number | undefined>): PortionBox[] {
  const counts = new Map<number, number>();
  for (const v of cellValues) {
    if (!v || v <= 0) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([portion, count]) => ({ portion, count }));
}

/** Compact gram label: "250 g", "1 kg", "1.5 kg". */
export function fmtPortionGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return `${Number.isInteger(kg) ? kg : Number(kg.toFixed(2))} kg`;
  }
  return `${g} g`;
}
