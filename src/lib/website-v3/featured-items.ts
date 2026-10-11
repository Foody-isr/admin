import type { Menu, MenuItem } from "@/lib/api";

/** Lists the restaurant's customer-facing catalogue, deduplicated across web menu groups. */
export function featuredPickerItems(menus: Menu[]): MenuItem[] {
  const items = new Map<number, MenuItem>();
  for (const menu of menus) {
    if (!menu.web_enabled) continue;
    for (const group of menu.groups ?? menu.categories ?? []) {
      if (!group.web_enabled || group.is_hidden) continue;
      for (const item of group.items ?? []) {
        if (
          item.is_active &&
          !item.combo_only &&
          item.availability_state !== "hidden" &&
          !items.has(item.id)
        )
          items.set(item.id, item);
      }
    }
  }
  return Array.from(items.values());
}

/** Toggles a draft selection while retaining its explicit display order. */
export function toggleFeaturedItem(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

/** Moves a selected item without dropping IDs that are temporarily unavailable. */
export function moveFeaturedItem(
  ids: number[],
  index: number,
  delta: number,
): number[] {
  const next = [...ids];
  if (
    index < 0 ||
    index >= ids.length ||
    index + delta < 0 ||
    index + delta >= ids.length
  )
    return next;
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
