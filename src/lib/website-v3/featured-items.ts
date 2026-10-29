import type { Menu, MenuItem } from "@/lib/api";

/** Keeps only bounded, restaurant-item keyed hex colors for featured image surfaces. */
export function normalizeFeaturedImageBackgrounds(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 1000).filter(([id, color]) =>
    /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) && typeof color === "string" && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color),
  )) as Record<string, string>;
}

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

/** Adds the current picker results without dropping prior selections or changing their order. */
export function selectAllFeaturedItems(ids: number[], visibleItems: Pick<MenuItem, "id">[]): number[] {
  return Array.from(new Set([...ids, ...visibleItems.map(item => item.id)]));
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
