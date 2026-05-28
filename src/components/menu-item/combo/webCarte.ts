// Shared "is this item on any carte?" helper used by the combo composer.
//
// An item is "on a carte" when it's a member of at least one non-hidden,
// channel-enabled (POS or web) group on any menu. Items that aren't on any
// carte at all are still reachable when they're explicitly added to a combo
// step — the combo flow is itself a customer-facing pathway. So the composer
// uses this to surface an INFORMATIONAL "combo-only" label, not a warning.
//
// Category-mode steps DO require carte membership at order time (the server's
// resolver filters category items by current menu_group_items), so that
// surface still treats absence as a real exclusion.
//
// Computed from the `menus` prop CompositionTab already forwards to both
// StepPicker and StepCard, so neither surface needs a new round trip.

import type { Menu } from '@/lib/api';

/** Returns the set of menu_item.id values reachable through any non-hidden
 *  group on any carte, on either channel (POS or web). */
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

/** True when the item isn't on any carte — meaning customers can reach it
 *  only through a combo that explicitly references it. */
export function isOffAnyCarte(menuItemId: number, anyCarteIds: Set<number>): boolean {
  return !anyCarteIds.has(menuItemId);
}
