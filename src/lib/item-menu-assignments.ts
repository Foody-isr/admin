import {
  getBatchFulfillmentConfig, getCarteDraft, saveCarteDraft,
  type CarteDraftGroup, type CarteDraftState, type Menu,
} from '@/lib/api';

/** One explicit item membership edit in a particular carte and series draft. */
export interface ItemMenuAssignment {
  menuId: number;
  seriesKey: string;
  groupKey: string;
  groupName: string;
  selected: boolean;
  create?: boolean;
}

/** A recoverable assignment error with localized UI copy. */
export class ItemMenuAssignmentError extends Error {
  constructor(public readonly translationKey: 'itemMenuGroupConflict' | 'itemMenuDraftSaveFailed') {
    super(translationKey);
  }
}

/** Stable identity includes the series, since a rotating carte has separate drafts. */
export function itemMenuScope(menuId: number, seriesKey: string): string {
  return `${menuId}:${seriesKey}`;
}

/** Restores old item drafts without turning their memberships into immediate writes. */
export async function restoreLegacyItemAssignments(rid: number, menus: Menu[], groupIds: number[]): Promise<ItemMenuAssignment[]> {
  const selected = menus.flatMap(menu => (menu.groups ?? [])
    .filter(group => groupIds.includes(group.id)).map(group => ({ menu, group })));
  if (groupIds.some(id => !selected.some(({ group }) => group.id === id))) throw new ItemMenuAssignmentError('itemMenuGroupConflict');
  const config = selected.some(({ menu }) => menu.is_weekly_rotating) ? await getBatchFulfillmentConfig(rid) : null;
  return selected.map(({ menu, group }) => {
    const seriesKey = menu.is_weekly_rotating ? config?.upcoming_cycles?.[0]?.fulfillment_days?.[0]?.date : '';
    if (seriesKey == null) throw new ItemMenuAssignmentError('itemMenuGroupConflict');
    return { menuId: menu.id, seriesKey, groupKey: `group-${group.id}`, groupName: group.name, selected: true };
  });
}

/** Changes only this item's memberships, retaining all other carte and stock edits. */
export function applyItemMenuAssignments(state: CarteDraftState, edits: ItemMenuAssignment[], itemId: number): CarteDraftState['payload'] {
  const groups = state.payload.groups.map(group => ({ ...group, item_ids: [...group.item_ids] }));
  for (const edit of edits) {
    if (edit.menuId !== state.menu_id || edit.seriesKey !== state.series_key) throw new ItemMenuAssignmentError('itemMenuGroupConflict');
    let group = groups.find(value => value.key === edit.groupKey);
    if (!group) {
      if (!edit.selected) continue;
      if (!edit.create || !edit.groupName.trim() || groups.some(value => value.name.trim().toLowerCase() === edit.groupName.trim().toLowerCase())) {
        throw new ItemMenuAssignmentError('itemMenuGroupConflict');
      }
      group = {
        key: edit.groupKey, id: 0, name: edit.groupName.trim(), image_url: '',
        pos_enabled: true, web_enabled: true, is_hidden: false, follows_menu_hours: true,
        hours: [], banner_focal_x: 50, banner_focal_y: 50, item_ids: [],
      } satisfies CarteDraftGroup;
      groups.push(group);
    }
    if (edit.selected && !group.item_ids.includes(itemId)) group.item_ids.push(itemId);
    if (!edit.selected) group.item_ids = group.item_ids.filter(id => id !== itemId);
  }
  return { ...state.payload, groups };
}

/** Saves private drafts only; fresh reads and stable keys make an explicit retry safe. */
export async function saveItemMenuAssignments(
  rid: number, itemId: number, edits: ItemMenuAssignment[],
  api = { getCarteDraft, saveCarteDraft },
): Promise<string[]> {
  const scopes = new Map<string, ItemMenuAssignment[]>();
  for (const edit of edits) {
    const key = itemMenuScope(edit.menuId, edit.seriesKey);
    scopes.set(key, [...(scopes.get(key) ?? []), edit]);
  }
  const names: string[] = [];
  for (const changes of Array.from(scopes.values())) {
    const { menuId, seriesKey } = changes[0];
    try {
      const state = await api.getCarteDraft(rid, menuId, seriesKey);
      if (changes.every(edit => edit.create && !edit.selected && !state.payload.groups.some(group => group.key === edit.groupKey))) continue;
      const payload = applyItemMenuAssignments(state, changes, itemId);
      if (JSON.stringify(payload) !== JSON.stringify(state.payload)) {
        await api.saveCarteDraft(rid, menuId, seriesKey, {
          revision: state.revision, base_revision: state.base_revision,
          base_fingerprint: state.base_fingerprint, payload,
        });
      }
      names.push(state.payload.name);
    } catch (error) {
      if (error instanceof ItemMenuAssignmentError) throw error;
      throw new ItemMenuAssignmentError('itemMenuDraftSaveFailed');
    }
  }
  return Array.from(new Set(names));
}
