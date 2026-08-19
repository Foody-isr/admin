import type {
  MenuItem,
  ProductionPortioning,
  ProductionSheetItem,
  ProductionSheetOrder,
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

/** True when a weighed article is shown as container counts (2 pots) rather
 *  than their summed weight (500 g). Counted articles already count, so the
 *  preference never applies to them.
 *
 *  This decision belongs here, not in a screen: it used to live only in the
 *  desktop matrix, so an article flipped to "Unités" read as containers on a
 *  desktop and as grams on a phone — the same sheet portioned two ways, with
 *  the toggle appearing inert to whoever set it on the phone. */
export function showsUnits(
  item: ProductionSheetItem,
  unitDisplayIds: Set<number> | undefined,
): boolean {
  return item.measure === 'weight' && !!unitDisplayIds?.has(item.menu_item_id);
}

/** The restaurant default before anything is saved: report what was ordered.
 *  Repacking is opt-in because it merges pots a client asked for separately. */
export const DEFAULT_PORTIONING: ProductionPortioning = { mode: 'ordered' };

/** Total containers in a breakdown. */
function boxCount(boxes: PortionBox[]): number {
  return boxes.reduce((n, b) => n + b.count, 0);
}

/** Compact chip text for a breakdown: "2×500 · 19×250". One formatter for the
 *  column recap and the per-client detail under it, so a reader comparing the
 *  two is never comparing two notations. */
export function fmtBoxes(boxes: PortionBox[]): string {
  return boxes.map((b) => `${b.count}×${b.portion}`).join(' · ');
}

/** True when a breakdown says more than the number it sits under. A 500 g cell
 *  holding one 500 g pot needs no detail; the same 500 g made of two 250 g pots
 *  does — that exact ambiguity is what made the column recap look wrong against
 *  a hand count of the cells. */
export function needsBoxDetail(boxes: PortionBox[]): boolean {
  if (boxes.length === 0) return false;
  return boxes.length > 1 || boxes[0].count > 1;
}

/** Largest container the packed rule may use for one article: the explicit cap
 *  when the restaurant set one, else the article's own largest portion. null
 *  when neither is known — with no container to pack into, the rule can't apply
 *  and the ordered containers stand. */
function packCap(portioning: ProductionPortioning, available: number[]): number | null {
  const cap = portioning.max_box ?? 0;
  if (cap > 0) return cap;
  const largest = available.reduce((m, g) => (g > m ? g : m), 0);
  return largest > 0 ? largest : null;
}

/** Merge per-cell breakdowns into one, largest box first (like packIntoBoxes). */
function tallyBoxes(all: PortionBox[][]): PortionBox[] {
  const counts = new Map<number, number>();
  for (const boxes of all) {
    for (const b of boxes) counts.set(b.portion, (counts.get(b.portion) ?? 0) + b.count);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([portion, count]) => ({ portion, count }));
}

/** The containers one client's order carries for one article, as ordered. */
function orderedCellBoxes(order: ProductionSheetOrder, itemId: number): PortionBox[] {
  return (order.portions?.[String(itemId)] ?? []).map((p) => ({
    portion: p.portion_g,
    count: p.count,
  }));
}

/** Applies one restaurant's container rule to a sheet. Every container count on
 *  every production surface comes from here — the desktop matrix, the phone
 *  cook-list and the per-client cells all call the same object, so a sheet can
 *  never be portioned two ways at once.
 *
 *  Both rules count containers **per client and then add them up**; neither ever
 *  repacks a day total. Boxes are filled for one client at a time, so a recap
 *  built from the day's grams would claim containers shared between clients and
 *  stop reconciling with the cells above it. */
export interface Portioner {
  /** The rule in force (what the Affichage control shows as selected). */
  portioning: ProductionPortioning;
  /** Containers for one client's cell. Empty for counted articles. */
  cellBoxes: (order: ProductionSheetOrder, item: ProductionSheetItem) => PortionBox[];
  /** Containers for a whole column, over the orders given (search-filtered
   *  sheets included — it sums the rows on screen, never the day aggregate). */
  columnBoxes: (orders: ProductionSheetOrder[], item: ProductionSheetItem) => PortionBox[];
  /** The article's day value under the portions/units preference: grams, or the
   *  number of containers the rule produces. */
  totalValue: (
    orders: ProductionSheetOrder[],
    item: ProductionSheetItem,
    unitDisplayIds: Set<number> | undefined,
  ) => number;
  /** One client's value under that same preference. */
  qtyValue: (
    order: ProductionSheetOrder,
    item: ProductionSheetItem,
    unitDisplayIds: Set<number> | undefined,
  ) => number;
}

export function makePortioner(
  portioning: ProductionPortioning,
  availablePortions: Record<number, number[]> | undefined,
): Portioner {
  const portionsFor = (itemId: number) => availablePortions?.[itemId] ?? [];

  const cellBoxes = (order: ProductionSheetOrder, item: ProductionSheetItem): PortionBox[] => {
    if (item.measure !== 'weight') return [];
    const ordered = orderedCellBoxes(order, item.menu_item_id);
    if (portioning.mode !== 'packed') return ordered;
    const available = portionsFor(item.menu_item_id);
    const cap = packCap(portioning, available);
    const grams = order.cells[String(item.menu_item_id)] ?? 0;
    // Nothing to pack, or no container to pack into: keep what was ordered
    // rather than invent a breakdown out of a size we don't know.
    if (cap == null || grams <= 0) return ordered;
    return packIntoBoxes(grams, cap, available);
  };

  const columnBoxes = (orders: ProductionSheetOrder[], item: ProductionSheetItem): PortionBox[] => {
    if (item.measure !== 'weight') return [];
    const boxes = tallyBoxes(orders.map((o) => cellBoxes(o, item)));
    if (boxes.length > 0) return boxes;
    // Sheet served before per-order portions existed: the day aggregate is the
    // only breakdown there is. Kept as a pre-deploy fallback only.
    return (item.packaging ?? []).map((p) => ({ portion: p.portion_g, count: p.count }));
  };

  return {
    portioning,
    cellBoxes,
    columnBoxes,
    totalValue: (orders, item, unitDisplayIds) => {
      if (!showsUnits(item, unitDisplayIds)) return item.total;
      if (portioning.mode === 'packed') return boxCount(columnBoxes(orders, item));
      // A sheet served before `total_units` existed reports 0 containers rather
      // than falling back to grams, which would print a weight beside a "u.".
      return item.total_units ?? 0;
    },
    qtyValue: (order, item, unitDisplayIds) => {
      const key = String(item.menu_item_id);
      if (!showsUnits(item, unitDisplayIds)) return order.cells[key] ?? 0;
      if (portioning.mode === 'packed') return boxCount(cellBoxes(order, item));
      return order.units?.[key] ?? 0;
    },
  };
}

/** Compact gram label: "250 g", "1 kg", "1.5 kg". */
export function fmtPortionGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return `${Number.isInteger(kg) ? kg : Number(kg.toFixed(2))} kg`;
  }
  return `${g} g`;
}
