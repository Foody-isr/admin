import type { MenuItem } from '@/lib/api';

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
 *  size variants. Empty when the item has no numeric portion variants. */
export function itemPortionGrams(item: MenuItem): number[] {
  const grams = new Set<number>();
  for (const g of item.variant_groups ?? []) {
    for (const v of g.variants ?? []) {
      const px = parsePortionGrams(v.name);
      if (px != null) grams.add(px);
    }
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

/** Compact gram label: "250 g", "1 kg", "1.5 kg". */
export function fmtPortionGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return `${Number.isInteger(kg) ? kg : Number(kg.toFixed(2))} kg`;
  }
  return `${g} g`;
}
