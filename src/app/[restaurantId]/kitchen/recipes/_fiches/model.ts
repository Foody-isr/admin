// View-model + mappers for the Fiches Recettes feature.
// Bridges the real API shapes (MenuItem / PrepItem / cost-utils) to the
// article/prep "fiche" view models the UI renders. Pure functions only.

import type { MenuItem, PrepItem, RecipeStep } from '@/lib/api';
import type { ItemCostSummary } from '@/lib/cost-utils';

export type FicheKind = 'article' | 'prep';

// ─── helpers ────────────────────────────────────────────────────────────────
export function money(n: number | null | undefined): string {
  return Number.isFinite(n as number) ? `₪${(n as number).toFixed(2)}` : '—';
}

/** Stable category → categorical color index (1..8), so a category always
 *  paints with the same --cat-N hue across the page. */
export function catColor(name: string): number {
  const s = name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}

/** Trim trailing zeros from a quantity for display (250.00 → 250, 2.50 → 2.5). */
export function trimNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

export function fmtQty(qty: number, unit: string): string {
  return `${trimNum(qty)}${unit ? ' ' + unit : ''}`.trim();
}

// ─── article (pack-out / sellable) ───────────────────────────────────────────
export interface CompRow {
  kind: 'prep' | 'stock';
  refId: number | null; // prep_item_id (jump target) or stock_item_id
  name: string;
  qty: string;
  cost: number;
}

export interface LinkedPrepRef {
  id: number;
  name: string;
}

export interface FicheArticle {
  kind: 'article';
  id: number;
  name: string;
  category: string;
  price: number;
  timeMins: number;
  image: string;
  note: string;
  // ── enrichment (filled lazily) ──
  enriched: boolean;
  cost?: number;
  costPct?: number; // 0..1
  margin?: number;
  comps?: CompRow[];
  method?: string[];
  linkedPreps?: LinkedPrepRef[];
}

export type ApiMenuItem = MenuItem & { category_name?: string };

export function mapArticleBase(item: ApiMenuItem): FicheArticle {
  return {
    kind: 'article',
    id: item.id,
    name: item.name,
    category: item.category_name || '',
    price: item.price ?? 0,
    timeMins: item.prep_time_mins ?? 0,
    image: item.image_url || '',
    note: item.recipe_notes || '',
    enriched: false,
  };
}

export function methodFromSteps(steps: RecipeStep[] | undefined): string[] {
  if (!steps || steps.length === 0) return [];
  return [...steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => s.instruction)
    .filter(Boolean);
}

/** Build composition rows + linked-prep refs + cost KPIs from a cost summary. */
export function enrichArticle(
  base: FicheArticle,
  summary: ItemCostSummary,
  method: string[],
): FicheArticle {
  const comps: CompRow[] = summary.lines.map((l) => ({
    kind: l.isPrep ? 'prep' : 'stock',
    refId: l.isPrep ? l.ingredient.prep_item_id ?? null : l.ingredient.stock_item_id ?? null,
    name: l.name,
    qty: fmtQty(l.qty, l.qtyUnit),
    cost: l.lineCost,
  }));
  const linkedPreps: LinkedPrepRef[] = summary.lines
    .filter((l) => l.isPrep && l.ingredient.prep_item_id != null)
    .map((l) => ({ id: l.ingredient.prep_item_id as number, name: l.name }));
  return {
    ...base,
    enriched: true,
    cost: summary.foodCost,
    costPct: summary.costPct,
    margin: summary.margin,
    comps,
    method,
    linkedPreps,
  };
}

// ─── preparation (kitchen recipe) ────────────────────────────────────────────
export interface IngredientRow {
  name: string;
  qty: string;
  cost: number;
}

export interface UsedByEntry {
  id: number;
  name: string;
  perPortion: string;
  monthly?: number;
  share?: number; // 0..100, optional bar fill
}

export interface FichePrep {
  kind: 'prep';
  id: number;
  name: string;
  category: string;
  unit: string;
  yieldQty: number;
  yieldLabel: string;
  costPerUnit: number | null; // ex-VAT
  totalCost: number | null; // costPerUnit * yield
  shelfLifeHours: number;
  note: string;
  // ── enrichment ──
  enriched: boolean;
  ingredients?: IngredientRow[];
  usedBy?: UsedByEntry[];
  usedByCount: number;
  critical: boolean;
}

export function mapPrepBase(prep: PrepItem, costPerUnit: number | null): FichePrep {
  const total = costPerUnit != null && prep.yield_per_batch > 0 ? costPerUnit * prep.yield_per_batch : null;
  return {
    kind: 'prep',
    id: prep.id,
    name: prep.name,
    category: prep.category || 'Préparations',
    unit: prep.unit,
    yieldQty: prep.yield_per_batch ?? 0,
    yieldLabel: fmtQty(prep.yield_per_batch ?? 0, prep.unit),
    costPerUnit,
    totalCost: total,
    shelfLifeHours: prep.shelf_life_hours ?? 0,
    note: prep.notes || '',
    enriched: false,
    usedByCount: 0,
    critical: false,
  };
}
