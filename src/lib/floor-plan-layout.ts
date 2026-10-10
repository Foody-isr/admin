/** Canonical floor-plan geometry shared by FoodyAdmin, FoodyPOS and the API. */
export const FLOOR_PLAN_CANVAS_ASPECT = 1.74;

/** Grid units are square on the canonical canvas; new tables start at 8 × 8. */
export const FLOOR_PLAN_GRID_COLUMNS = 128;
export const FLOOR_PLAN_GRID_ROWS = FLOOR_PLAN_GRID_COLUMNS / FLOOR_PLAN_CANVAS_ASPECT;
export const AUTHORED_TABLE_SIZE = { width: 8 / FLOOR_PLAN_GRID_COLUMNS * 100, height: 8 / FLOOR_PLAN_GRID_ROWS * 100 };

export type TableShape = "circle" | "square" | "rectangle";

export const TABLE_SIZE_PRESETS: Record<
  TableShape,
  { width: number; height: number }
> = {
  circle: { width: 10.5, height: 18.3 },
  square: { width: 10.5, height: 18.3 },
  rectangle: { width: 15.75, height: 18.3 },
};

export const VERTICAL_RECTANGLE_SIZE = { width: 10.5, height: 27.4 } as const;

export interface TablePlacementGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: TableShape;
  rotation: number;
  geometryVersion?: number;
}

/** Preserves authored geometry; legacy placements retain the previous preset interpretation. */
export function normalizeTablePlacement<T extends TablePlacementGeometry>(
  placement: T,
): T {
  const shape: TableShape =
    placement.shape in TABLE_SIZE_PRESETS ? placement.shape : "square";
  if (placement.geometryVersion === 2) {
    const width = clamp(Number.isFinite(placement.width) && placement.width > 0 ? placement.width : AUTHORED_TABLE_SIZE.width, .5, 100);
    const height = clamp(Number.isFinite(placement.height) && placement.height > 0 ? placement.height : AUTHORED_TABLE_SIZE.height, .5, 100);
    const rotation = ((Number.isFinite(placement.rotation) ? placement.rotation : 0) % 360 + 360) % 360;
    const bounds = rotatedTableExtent({ width, height, rotation });
    return { ...placement, shape, width, height, rotation,
      x: clamp(placement.x + width/2, bounds.width/2, 100-bounds.width/2)-width/2,
      y: clamp(placement.y + height/2, bounds.height/2, 100-bounds.height/2)-height/2,
    };
  }
  const rotation =
    shape === "rectangle" && Math.abs(placement.rotation % 180) === 90 ? 90 : 0;
  const preset =
    shape === "rectangle" && rotation === 90
      ? VERTICAL_RECTANGLE_SIZE
      : TABLE_SIZE_PRESETS[shape];
  const sourceWidth = placement.width > 0 ? placement.width : preset.width;
  const sourceHeight = placement.height > 0 ? placement.height : preset.height;
  const centerX = placement.x + sourceWidth / 2;
  const centerY = placement.y + sourceHeight / 2;

  return {
    ...placement,
    shape,
    width: preset.width,
    height: preset.height,
    x: clamp(centerX - preset.width / 2, 0, 100 - preset.width),
    y: clamp(centerY - preset.height / 2, 0, 100 - preset.height),
    rotation,
  };
}

/** Changes the outline without resizing authored tables. */
export function applyTableShape<T extends TablePlacementGeometry>(
  placement: T,
  shape: TableShape,
): T {
  return normalizeTablePlacement({
    ...placement,
    shape,
    rotation: shape === "rectangle" ? placement.rotation : 0,
  });
}

/** Applies the legacy quarter-turn representation for preset tables. */
export function applyRectangleRotation<T extends TablePlacementGeometry>(
  placement: T,
  rotation: 0 | 90,
): T {
  return normalizeTablePlacement({
    ...placement,
    shape: "rectangle",
    rotation,
  });
}

/** Finds potentially overlapping table bounds, including rotated outlines. */
export function tablePlacementCollisionIds<
  T extends TablePlacementGeometry & { tableId: number },
>(placements: T[]): Set<number> {
  const collisions = new Set<number>();
  const boxes = placements.map(p => {
    const bounds = p.geometryVersion === 2 ? rotatedTableExtent(p) : p;
    return { x:p.x + (p.width-bounds.width)/2, y:p.y + (p.height-bounds.height)/2, width:bounds.width, height:bounds.height };
  });
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        collisions.add(placements[i].tableId);
        collisions.add(placements[j].tableId);
      }
    }
  }
  return collisions;
}

function boxesOverlap(
  a: Pick<TablePlacementGeometry, "x" | "y" | "width" | "height">,
  b: Pick<TablePlacementGeometry, "x" | "y" | "width" | "height">,
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Upgrades a legacy rendered placement to editable geometry without moving its visible outline. */
export function authoredTablePlacement<T extends TablePlacementGeometry>(placement: T): T {
  const normalized = normalizeTablePlacement(placement);
  return { ...normalized, geometryVersion: 2, rotation: placement.geometryVersion === 2 ? normalized.rotation : 0 };
}

/** Axis-aligned bounds of a rotated table, expressed in canvas percentages. */
export function rotatedTableExtent(p: Pick<TablePlacementGeometry, 'width' | 'height' | 'rotation'>) {
  const radians = p.rotation * Math.PI / 180;
  return {
    width: Math.abs(p.width * Math.cos(radians)) + Math.abs(p.height / FLOOR_PLAN_CANVAS_ASPECT * Math.sin(radians)),
    height: Math.abs(p.width * FLOOR_PLAN_CANVAS_ASPECT * Math.sin(radians)) + Math.abs(p.height * Math.cos(radians)),
  };
}
