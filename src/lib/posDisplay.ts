// Single source of truth for POS display tiles. MUST match the Dart copy in
// foodypos/lib/features/menu/domain/pos_display_tile.dart and the Go validator.
import type { MenuGroup, MenuItem } from '@/lib/api';

export type PosTileSize = 'petit' | 'large' | 'grand';
export type PosTileType = 'group' | 'item';
export type PosBgType = 'color' | 'image';

export const POS_TILE_SPANS: Record<PosTileSize, { col: number; row: number }> = {
  petit: { col: 1, row: 1 },
  large: { col: 2, row: 1 },
  grand: { col: 1, row: 2 },
};

export const POS_GRID_COLUMNS = 4;

export const POS_PALETTE: string[] = [
  '#1C1C1E', '#DB2777', '#DC2626', '#EA580C', '#F97316', '#EAB308', '#92400E',
  '#166534', '#16A34A', '#2DD4BF', '#2563EB', '#38BDF8', '#7C3AED', '#EC4899',
];
export const POS_DEFAULT_COLOR = POS_PALETTE[0];
const DEFAULT_GROUP_COLORS = ['#8A3B34', '#2F5D8A', '#D89B35', '#B5497E', '#3D6B4A', '#E67E3B', '#5B4B8A'];

export interface PosDisplayTile {
  id?: number;
  tile_type: PosTileType;
  ref_group_id?: number;
  ref_item_id?: number;
  size: PosTileSize;
  bg_type: PosBgType;
  color: string;
  image_url: string;
  position: number;
}

export interface PosDisplayLayout {
  tiles: PosDisplayTile[];
  group_tiles: Record<string, PosDisplayTile[]>; // keyed by group id (string)
  automatic?: boolean;
}

/** Indexes POS-visible groups by their direct parent when it is visible in the same menu. */
export function posGroupsByParent(groups: Iterable<MenuGroup>): Map<number | null, MenuGroup[]> {
  const visible = Array.from(groups).filter((group) => group.pos_enabled !== false && !group.is_hidden);
  const byId = new Map(visible.map((group) => [group.id, group]));
  const children = new Map<number | null, MenuGroup[]>();
  for (const group of visible) {
    const parent = byId.get(group.parent_id ?? -1);
    const visited = new Set([group.id]);
    let next = parent;
    while (next && !visited.has(next.id)) {
      visited.add(next.id);
      next = byId.get(next.parent_id ?? -1);
    }
    const parentId = next ? null : parent?.id ?? null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(group);
    children.set(parentId, siblings);
  }
  return children;
}

/** Builds the default grid for a menu or group from the published groups and direct items. */
export function defaultPosTiles(groups: MenuGroup[], items: MenuItem[] = []): PosDisplayTile[] {
  return [
    ...groups.map((group, position): PosDisplayTile => ({
      tile_type: 'group', ref_group_id: group.id, size: 'petit', bg_type: 'color',
      color: DEFAULT_GROUP_COLORS[position % DEFAULT_GROUP_COLORS.length], image_url: '', position,
    })),
    ...items.map((item, index): PosDisplayTile => ({
      tile_type: 'item', ref_item_id: item.id, size: 'petit', bg_type: item.image_url ? 'image' : 'color',
      color: POS_DEFAULT_COLOR, image_url: item.image_url ?? '', position: groups.length + index,
    })),
  ];
}

/** Identifies groups that would lead back to the current path through saved or default tiles. */
export function posShortcutLoops(
  start: number,
  path: number[],
  children: Map<number | null, MenuGroup[]>,
  layouts: PosDisplayLayout['group_tiles'],
): boolean {
  const remaining = [start];
  const seen = new Set<number>();
  while (remaining.length > 0) {
    const id = remaining.pop()!;
    if (path.includes(id)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const layout = layouts[id];
    const next = layout?.length
      ? layout.flatMap((tile) => tile.tile_type === 'group' && tile.ref_group_id != null ? [tile.ref_group_id] : [])
      : (children.get(id) ?? []).map((group) => group.id);
    remaining.push(...next);
  }
  return false;
}
