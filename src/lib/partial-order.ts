/**
 * Helpers for *partial* ordering preferences: a saved arrangement that lists
 * only what the user actually moved, never the full universe of ids.
 *
 * Storing the full resolved order is the tempting shortcut and the wrong one on
 * a multi-tenant product: anything added after a restaurant saved its layout is
 * missing from that stale list, and disappears for exactly the restaurants who
 * bothered to customise. Keeping the preference partial means an unknown id
 * always survives, in its natural position.
 *
 * Used by the production sheet (numeric category/item ids) and the admin orders
 * table (string column keys), hence the generic id type.
 */

/**
 * Order `ids` by the saved preference `pref`, appending any id not covered by
 * `pref` in its original relative position. This keeps the layout stable while
 * ensuring brand-new entries are never hidden by a stale saved order.
 */
export function orderBy<T>(ids: T[], pref: T[]): T[] {
  if (!pref.length) return ids;
  const present = new Set(ids);
  const ordered = pref.filter((id) => present.has(id));
  const placed = new Set(ordered);
  for (const id of ids) if (!placed.has(id)) ordered.push(id);
  return ordered;
}

/** Move `fromId` to just before `toId` within `ids` (drop-before semantics). */
export function reorder<T>(ids: T[], fromId: T, toId: T): T[] {
  if (fromId === toId) return ids;
  const out = ids.filter((id) => id !== fromId);
  const idx = out.indexOf(toId);
  if (idx < 0) return ids;
  out.splice(idx, 0, fromId);
  return out;
}
