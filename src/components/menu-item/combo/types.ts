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

/** A per-size pick rule on a group-sourced step. Mirrors the server's
 *  `ComboStepVariantRule`. Lets the customer choose a size per pick within
 *  limits (e.g. up to 4 at 500g, the rest 250g). Mutually exclusive with
 *  `source_variant_label` (single force-pin, no choice). */
export interface ComboStepVariantRuleDraft {
  /** Variant/option name this rule caps (e.g. "500g"). */
  variant_label: string;
  /** Minimum picks that must use this size. 0 = no minimum. */
  min_picks: number;
  /** Maximum picks that may use this size. 0 = unlimited. */
  max_picks: number;
}

/** A per-item pick cap within a step (e.g. "Tuna max 1"). Mirrors the server's
 *  `ComboStepItemLimit`. `max_qty` 0 = unlimited (explicit exemption from the
 *  step's default `max_per_item`). */
export interface ComboStepItemLimitDraft {
  menu_item_id: number;
  max_qty: number;
  /** UI-only: cached display name so the row renders before items load. */
  item_name?: string;
}

/** A draft entry in a combo step's items list. Matches `ComboStepInput.items[]`
 *  on the server, plus a few denormalized fields used at the UI layer. */
export interface ComboStepDraftItem {
  menu_item_id: number;
  /** When the source item has variants, this points to the specific variant. */
  variant_id?: number;
  price_delta: number;
  /** When the linked item is off all cartes, this controls what the server
   *  resolver does at order time. true = surface anyway (combo IS the
   *  customer pathway); false = drop so the combo silently follows carte
   *  rotation. Defaults to true everywhere it isn't explicitly set. */
  force_off_carte?: boolean;
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
  /** Optional copy shown to the customer below the step name (e.g.
   *  "Choose a starter to share"). Persists to `combo_steps.description`. */
  description: string;
  min_picks: number;
  max_picks: number;
  items: ComboStepDraftItem[];
  /** "explicit" (default) — items[] is the source of truth, listed manually.
   *  "group"               — items[] is ignored; the server auto-includes the
   *  current members of menu group `source_group_id` (the carte section). */
  source_type: 'explicit' | 'group';
  /** Required when source_type === 'group'. */
  source_group_id?: number;
  /** Group mode: pin every resolved item to the variant whose name matches this
   *  label (e.g. "250g"). undefined = no pin (whole items). Items without a
   *  matching variant are excluded by the server. */
  source_variant_label?: string;
  /** Group mode: per-size pick caps. When non-empty the customer chooses a size
   *  per pick within these limits, and `source_variant_label` is ignored (the
   *  two are mutually exclusive). Empty/undefined = no per-size constraint. */
  variant_rules?: ComboStepVariantRuleDraft[];
  /** Default cap on how many times any single item may be picked in this step
   *  (counted across sizes). 0/undefined = unlimited. */
  max_per_item?: number;
  /** Per-item overrides of max_per_item for specific items. */
  item_limits?: ComboStepItemLimitDraft[];
  /** UI-only intent flag. Not sent to the server.
   *
   *  - "choice" — operator wants the customer to pick from multiple options.
   *               Renders with name, rules popover, required badge, etc.
   *  - "fixed"  — operator wants a single predefined item with a quantity.
   *               Renders a stripped-down card: one item slot + qty stepper.
   *
   *  On reload from the server we infer this from the data shape (1 item
   *  with min_picks === max_picks → fixed). See `deriveStepKind` below. */
  kind?: 'fixed' | 'choice';
  /** UI-only round-trip stash. Not sent to the server (whitelist serializer).
   *
   *  When the operator flips a choice step to fixed via KindToggle, the
   *  prior choice metadata (source_type, group binding, min/max) is saved
   *  here so that flipping back to choice restores the EXACT prior state —
   *  including "Carte (groupe)" mode and any pinned variant label. Without
   *  this, every fixed → choice round-trip silently dropped the operator
   *  back into "Liste manuelle" with min=1/max=N defaults. */
  _stashedChoice?: {
    source_type: 'explicit' | 'group';
    source_group_id?: number;
    source_variant_label?: string;
    min_picks: number;
    max_picks: number;
  };
}

/** Infer a step's UI kind from its persisted shape.
 *
 *  A step is "fixed" when the customer makes no real choice. Two valid
 *  shapes:
 *    • single item × N quantity: items.length === 1, min_picks === max_picks
 *    • bundle of N items × 1 each: items.length === min_picks === max_picks
 *
 *  Anything else (multi-option with a smaller pick count, optional steps,
 *  group mode) is a choice step. */
export function deriveStepKind(s: Pick<ComboStepDraft, 'source_type' | 'items' | 'min_picks' | 'max_picks'>): 'fixed' | 'choice' {
  if (s.source_type === 'group') return 'choice';
  if (s.items.length === 0) return 'choice';
  if (s.min_picks <= 0) return 'choice';
  if (s.min_picks !== s.max_picks) return 'choice';
  if (s.items.length !== 1 && s.items.length !== s.min_picks) return 'choice';
  return 'fixed';
}

/** Resolve which UI variant a step should render as.
 *
 *  - Non-empty: pure data-shape check via `deriveStepKind`. So if the
 *    operator manually sets min=max=items.length on a "choice" step, the
 *    card auto-flips to fixed (the customer can't tell the difference and
 *    fixed has the cleaner UI).
 *  - Empty: the persisted `kind` flag wins (so a freshly-added "fixed"
 *    step renders its empty-state UI immediately, before any item is
 *    picked). */
export function effectiveStepKind(s: ComboStepDraft): 'fixed' | 'choice' {
  if (s.items.length === 0) return s.kind === 'fixed' ? 'fixed' : 'choice';
  return deriveStepKind(s);
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
  /** Mirrors the server-side ComboStepItem flag for this option's MenuItem.
   *  Per option (not per variant) — carte membership is a property of the
   *  source item, so every variant of the same item shares this value. */
  forceOffCarte: boolean;
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
    // Prefer the live source name. `draftRows[0].item_name` is only used as a
    // fallback when the source isn't loaded yet — it's a denormalized cache
    // that, for variant rows, contains the variant-suffixed name (e.g.
    // "AUBERGINE TOMATE — Normal"). Reading from the cache as primary causes
    // the suffix to compound on every save→load→save cycle, since
    // `toDraftItems` re-appends ` — ${v.name}` each time.
    const itemName = source?.name ?? draftRows[0].item_name ?? `#${menuItemId}`;
    const imageUrl = source?.image_url || undefined;

    // All draft rows for the same menu_item_id should carry the same value
    // for force_off_carte (it's a property of the source item, not the
    // variant). Read from the first; if missing on a freshly-loaded row,
    // default to true to preserve the server's existing-row default.
    const forceOffCarte = draftRows[0].force_off_carte ?? true;

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
        forceOffCarte,
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
      forceOffCarte,
      upcharge: 0,
      variants,
    });
  }
  promoteDefaultOption(options);
  return options;
}

/** Convert a list of options back to draft items (one row per included
 *  variant for variant items, one row per option for variant-less items).
 *  force_off_carte stamps on every row of the same menu_item_id so the
 *  server-side ComboStepItem rows stay in sync regardless of variant. */
export function toDraftItems(options: ComboOptionView[]): ComboStepDraftItem[] {
  const out: ComboStepDraftItem[] = [];
  for (const opt of options) {
    if (!opt.hasVariants) {
      out.push({
        menu_item_id: opt.menuItemId,
        price_delta: opt.upcharge,
        force_off_carte: opt.forceOffCarte,
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
        force_off_carte: opt.forceOffCarte,
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
