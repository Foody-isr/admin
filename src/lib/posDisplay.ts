// Single source of truth for POS display tiles. MUST match the Dart copy in
// foodypos/lib/features/menu/domain/pos_display_tile.dart and the Go validator.

export type PosTileSize = 'petit' | 'large' | 'grand';
export type PosTileType = 'group' | 'item';
export type PosBgType = 'color' | 'image';

export const POS_TILE_SPANS: Record<PosTileSize, { col: number; row: number }> = {
  petit: { col: 1, row: 1 },
  large: { col: 2, row: 1 },
  grand: { col: 2, row: 2 },
};

export const POS_GRID_COLUMNS = 4;

export const POS_PALETTE: string[] = [
  '#1C1C1E', '#DB2777', '#DC2626', '#EA580C', '#F97316', '#EAB308', '#92400E',
  '#166534', '#16A34A', '#2DD4BF', '#2563EB', '#38BDF8', '#7C3AED', '#EC4899',
];
export const POS_DEFAULT_COLOR = POS_PALETTE[0];

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
}
