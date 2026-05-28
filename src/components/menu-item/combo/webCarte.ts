// Shared "is this item on a web carte?" helper used by the combo composer
// to surface a non-blocking warning when a step references an item that
// won't be reachable on foodyweb. "On the web carte" means: a member of
// at least one menu group with web_enabled=true AND is_hidden=false.
//
// Computed from the `menus` prop CompositionTab already forwards to both
// StepPicker and StepCard, so neither surface needs a new round trip.

import type { Menu } from '@/lib/api';

/** Returns the set of menu_item.id values reachable through any web-enabled,
 *  non-hidden group across every menu. */
export function buildWebItemIdSet(menus: Menu[]): Set<number> {
  const ids = new Set<number>();
  for (const m of menus) {
    for (const g of m.groups ?? []) {
      if (!g.web_enabled || g.is_hidden) continue;
      for (const it of g.items ?? []) ids.add(it.id);
    }
  }
  return ids;
}

/** True when the item won't render on the foodyweb carte. */
export function isOffWebCarte(menuItemId: number, webItemIds: Set<number>): boolean {
  return !webItemIds.has(menuItemId);
}

/** Returns the set of menu_item.id values reachable through any non-hidden
 *  group on any carte, on either channel (POS or web). Used by the combo
 *  composer's category-step preview to flag items that wouldn't resolve at
 *  order time because they aren't bound to any carte at all. */
export function buildAnyCarteItemIdSet(menus: Menu[]): Set<number> {
  const ids = new Set<number>();
  for (const m of menus) {
    for (const g of m.groups ?? []) {
      if (g.is_hidden) continue;
      if (!g.pos_enabled && !g.web_enabled) continue;
      for (const it of g.items ?? []) ids.add(it.id);
    }
  }
  return ids;
}
