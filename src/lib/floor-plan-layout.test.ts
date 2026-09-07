import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRectangleRotation,
  applyTableShape,
  normalizeTablePlacement,
  tablePlacementCollisionIds,
  TABLE_SIZE_PRESETS,
  VERTICAL_RECTANGLE_SIZE,
} from "./floor-plan-layout";

test("normalization applies the square preset while preserving the centre", () => {
  const result = normalizeTablePlacement({
    tableId: 1,
    x: 20,
    y: 30,
    width: 6,
    height: 8,
    shape: "square" as const,
    rotation: 12,
  });
  assert.deepEqual(
    { width: result.width, height: result.height },
    TABLE_SIZE_PRESETS.square,
  );
  assert.equal(result.x + result.width / 2, 23);
  assert.equal(result.y + result.height / 2, 34);
  assert.equal(result.rotation, 0);
});

test("changing shape preserves centre and only rectangles retain quarter-turn rotation", () => {
  const source = {
    tableId: 1,
    x: 10,
    y: 20,
    width: 10.5,
    height: 18.3,
    shape: "square" as const,
    rotation: 0,
  };
  const rectangle = applyTableShape(source, "rectangle");
  assert.equal(rectangle.x + rectangle.width / 2, source.x + source.width / 2);
  assert.equal(
    rectangle.y + rectangle.height / 2,
    source.y + source.height / 2,
  );
  assert.deepEqual(
    { width: rectangle.width, height: rectangle.height },
    TABLE_SIZE_PRESETS.rectangle,
  );
  const vertical = applyRectangleRotation(rectangle, 90);
  assert.deepEqual(
    { width: vertical.width, height: vertical.height },
    VERTICAL_RECTANGLE_SIZE,
  );
  assert.equal(vertical.x + vertical.width / 2, source.x + source.width / 2);
});

test("collision detection reports both overlapping table ids", () => {
  const placements = [
    {
      tableId: 1,
      x: 10,
      y: 10,
      ...TABLE_SIZE_PRESETS.square,
      shape: "square" as const,
      rotation: 0,
    },
    {
      tableId: 2,
      x: 15,
      y: 15,
      ...TABLE_SIZE_PRESETS.circle,
      shape: "circle" as const,
      rotation: 0,
    },
    {
      tableId: 3,
      x: 70,
      y: 70,
      ...TABLE_SIZE_PRESETS.rectangle,
      shape: "rectangle" as const,
      rotation: 90,
    },
  ];
  assert.deepEqual(Array.from(tablePlacementCollisionIds(placements)).sort(), [1, 2]);
});
