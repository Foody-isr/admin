/** Canonical floor-plan geometry shared by FoodyAdmin, FoodyPOS and the API. */
export const FLOOR_PLAN_CANVAS_ASPECT = 1.74;

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
}

export function normalizeTablePlacement<T extends TablePlacementGeometry>(
  placement: T,
): T {
  const shape: TableShape =
    placement.shape in TABLE_SIZE_PRESETS ? placement.shape : "square";
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

export function tablePlacementCollisionIds<
  T extends TablePlacementGeometry & { tableId: number },
>(placements: T[]): Set<number> {
  const collisions = new Set<number>();
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (boxesOverlap(placements[i], placements[j])) {
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
