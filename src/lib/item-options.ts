import type { MenuItem } from '@/lib/api';

/** One orderable size choice for an item, normalized across the two variant
 *  systems. `price` is the effective absolute unit price: option prices are
 *  per-item overridden server-side, and a 0 price means "same as base item"
 *  (see resolveOrderItemPrice), so it is coerced here. */
export interface ItemSizeOption {
  id: number;
  name: string;
  price: number;
}

/** Size options for an item. Sizes live in the option-set system
 *  (option_set_options, written by the VariantsEditor) — the legacy
 *  variant_groups tables are dead but kept as a fallback for pre-migration
 *  data. Only the first attached set maps to the order's single
 *  selected_variant_id, mirroring the guest apps' size pickers; the first
 *  option is the default a guest picker auto-selects. */
export function itemSizeOptions(item: MenuItem): ItemSizeOption[] {
  const optionSet = (item.option_sets ?? [])[0];
  const opts = (optionSet?.options ?? []).filter((o) => o.is_active && !o.is_combo_only);
  if (opts.length > 0) {
    return opts.map((o) => ({ id: o.id, name: o.name, price: o.price > 0 ? o.price : item.price }));
  }
  const legacy = (item.variant_groups?.[0]?.variants ?? []).filter((v) => v.is_active);
  return legacy.map((v) => ({ id: v.id, name: v.name, price: v.price > 0 ? v.price : item.price }));
}

/** Label of the size group shown above the size radio list. */
export function itemSizeGroupLabel(item: MenuItem): string | undefined {
  return item.option_sets?.[0]?.name || item.variant_groups?.[0]?.title || undefined;
}
