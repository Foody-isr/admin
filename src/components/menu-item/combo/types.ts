// Combo composition — shared state shape + UI view-models.
//
// `ComboStepDraft` is the persistent state shape held by `new/page.tsx` and
// `[itemId]/page.tsx`. It mirrors the server's `ComboStepInput` 1:1 and
// existed before this refactor — the two pages were each redefining it
// inline. Now both import from here.
//
// The richer view-models (`ComboOptionView`, `VariantView`) live below.
// They group `items` rows that share a `menu_item_id` so the UI can render
// one card per source item with variant sub-rows. None of this is persisted
// — `toDraftItems()` flattens back to the canonical shape on every change.

import type { MenuItem } from '@/lib/api';

/** A draft entry in a combo step's items list. Matches `ComboStepInput.items[]`
 *  on the server, plus a few denormalized fields used at the UI layer. */
export interface ComboStepDraftItem {
  menu_item_id: number;
  /** When the source item has variants, this points to the specific variant. */
  variant_id?: number;
  price_delta: number;
  /** UI-only: cached display name so the row renders before the source item
   *  is loaded. */
  item_name?: string;
  /** UI-only: stable key. `item:<id>` for variant-less options, or
   *  `variant:<itemId>:<variantId>` for variant rows. */
  pick_key?: string;
}

/** A draft step in a combo. Held in state on the page; serialized to
 *  `ComboStepInput` on save. */
export interface ComboStepDraft {
  /** UI-only stable key (uuid). Not sent to the server. */
  key: string;
  name: string;
  min_picks: number;
  max_picks: number;
  items: ComboStepDraftItem[];
}

// ── View-models ──────────────────────────────────────────────────────────

/** One source-item-grouping in a step. Items sharing the same `menu_item_id`
 *  collapse into a single card with variant sub-rows. */
export interface ComboOptionView {
  /** Stable key for this option within the step (`item:<id>`). */
  key: string;
  menuItemId: number;
  itemName: string;
  imageUrl?: string;
  isDefault: boolean;
  hasVariants: boolean;
  /** Set when `hasVariants === false` — the option's flat upcharge. */
  upcharge: number;
  /** Set when `hasVariants === true` — one row per source variant, including
   *  excluded ones (so the operator can re-include them). */
  variants: VariantView[];
}

export interface VariantView {
  variantId: number;
  name: string;
  /** Solo price of the variant on the source item. Used for "prix solo ₪14"
   *  hints and the savings calc. */
  soloPrice: number;
  /** Included in this combo? Excluded variants render greyed-out. */
  included: boolean;
  /** When included, the upcharge added on top of the combo base price. */
  upcharge: number;
  isDefault: boolean;
}

// ── Pure helpers — view-model <-> draft ──────────────────────────────────

interface SourceVariant {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  sort_order: number;
}

/** Flatten variants from both legacy `variant_groups` and new `option_sets`
 *  on a source item into a single ordered list. Excludes inactive entries. */
export function getSourceVariants(item: Pick<MenuItem, 'variant_groups' | 'option_sets'>): SourceVariant[] {
  const fromGroups = (item.variant_groups ?? []).flatMap((g) =>
    (g.variants ?? []).map((v) => ({
      id: v.id, name: v.name, price: v.price,
      is_active: v.is_active, sort_order: v.sort_order ?? 0,
    })),
  );
  const fromOptions = (item.option_sets ?? []).flatMap((os) =>
    (os.options ?? []).map((o) => ({
      id: o.id, name: o.name, price: o.price,
      is_active: o.is_active, sort_order: o.sort_order ?? 0,
    })),
  );
  return [...fromGroups, ...fromOptions]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Group a step's draft items into options. For each `menu_item_id`, look up
 *  the source item and reconcile variants — included variants come from the
 *  draft, excluded variants are appended so the operator can re-include them. */
export function buildOptions(
  items: ComboStepDraftItem[],
  itemsById: Map<number, MenuItem>,
): ComboOptionView[] {
  const byMenuItem = new Map<number, ComboStepDraftItem[]>();
  for (const it of items) {
    const arr = byMenuItem.get(it.menu_item_id) ?? [];
    arr.push(it);
    byMenuItem.set(it.menu_item_id, arr);
  }

  const options: ComboOptionView[] = [];
  for (const [menuItemId, draftRows] of Array.from(byMenuItem.entries())) {
    const source = itemsById.get(menuItemId);
    const sourceVariants = source ? getSourceVariants(source) : [];
    const itemName = draftRows[0].item_name ?? source?.name ?? `#${menuItemId}`;
    const imageUrl = source?.image_url || undefined;

    if (sourceVariants.length === 0) {
      // No variants — single flat row.
      const row = draftRows[0];
      options.push({
        key: `item:${menuItemId}`,
        menuItemId,
        itemName,
        imageUrl,
        isDefault: false,
        hasVariants: false,
        upcharge: row.price_delta ?? 0,
        variants: [],
      });
      continue;
    }

    // Item has variants — one VariantView per source variant. Included ones
    // come from the draft; missing ones are excluded but kept so the operator
    // can flip them back on.
    const draftByVariant = new Map<number, ComboStepDraftItem>();
    for (const r of draftRows) {
      if (r.variant_id != null) draftByVariant.set(r.variant_id, r);
    }

    const variants: VariantView[] = sourceVariants.map((sv) => {
      const draft = draftByVariant.get(sv.id);
      return {
        variantId: sv.id,
        name: sv.name,
        soloPrice: sv.price,
        included: !!draft,
        upcharge: draft?.price_delta ?? 0,
        isDefault: false, // promoted below
      };
    });

    promoteDefaultVariant(variants);
    options.push({
      key: `item:${menuItemId}`,
      menuItemId,
      itemName,
      imageUrl,
      isDefault: false,
      hasVariants: true,
      upcharge: 0,
      variants,
    });
  }
  promoteDefaultOption(options);
  return options;
}

/** Convert a list of options back to draft items (one row per included
 *  variant for variant items, one row per option for variant-less items). */
export function toDraftItems(options: ComboOptionView[]): ComboStepDraftItem[] {
  const out: ComboStepDraftItem[] = [];
  for (const opt of options) {
    if (!opt.hasVariants) {
      out.push({
        menu_item_id: opt.menuItemId,
        price_delta: opt.upcharge,
        item_name: opt.itemName,
        pick_key: opt.key,
      });
      continue;
    }
    for (const v of opt.variants) {
      if (!v.included) continue;
      out.push({
        menu_item_id: opt.menuItemId,
        variant_id: v.variantId,
        price_delta: v.upcharge,
        item_name: `${opt.itemName} — ${v.name}`,
        pick_key: `variant:${opt.menuItemId}:${v.variantId}`,
      });
    }
  }
  return out;
}

/** Convention: among included variants, the one with `upcharge === 0` and
 *  the smallest variantId wins. Falls back to the first included variant. */
export function promoteDefaultVariant(variants: VariantView[]): void {
  const included = variants.filter((v) => v.included);
  if (included.length === 0) return;
  const baseline = included.find((v) => v.upcharge === 0) ?? included[0];
  for (const v of variants) v.isDefault = v.variantId === baseline.variantId;
}

/** First option in the step is treated as the default option. Operators can
 *  reorder; reorder fixes the default. */
export function promoteDefaultOption(options: ComboOptionView[]): void {
  if (options.length === 0) return;
  for (let i = 0; i < options.length; i++) options[i].isDefault = i === 0;
}
