import type { AvailabilityState, MenuItem } from './api';

/** Uses the shared size ID, with historical labels reserved for old configurations. */
export function comboSizeKey(sizeId: number | null | undefined, label: string): string {
  return sizeId == null ? `label:${label.trim().toLowerCase()}` : `size:${sizeId}`;
}

/** Tests whether an option satisfies a saved size reference. */
export function matchesComboSize(
  sizeId: number | null | undefined, label: string,
  optionSizeId: number | undefined, optionLabel: string,
): boolean {
  return comboSizeKey(sizeId, label) === comboSizeKey(sizeId == null ? undefined : optionSizeId, optionLabel);
}

/** Returns active combo sizes, including options reserved for combos and their stock states. */
export function comboItemSizes(
  item: MenuItem | undefined,
): Array<{ optionId: number; name: string; sizeId?: number; availabilityState?: AvailabilityState }> {
  if (!item) return [];
  const out: Array<{ optionId: number; name: string; sizeId?: number; availabilityState?: AvailabilityState }> = [];
  for (const os of item.option_sets ?? []) {
    for (const o of os.options ?? []) {
      if (o.is_active !== false) {
        out.push({ optionId: o.id, name: o.name, sizeId: o.size_id ?? undefined, availabilityState: o.availability_state });
      }
    }
  }
  for (const g of item.variant_groups ?? []) {
    for (const v of g.variants ?? []) {
      if (v.is_active !== false) out.push({ optionId: v.id, name: v.name, sizeId: v.size_id ?? undefined });
    }
  }
  return out;
}
