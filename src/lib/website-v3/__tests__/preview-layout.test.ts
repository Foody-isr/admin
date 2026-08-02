import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDesktopPreviewLayout } from "../preview-layout";

test("scales the desktop preview to fit its available width", () => {
  assert.deepEqual(resolveDesktopPreviewLayout(640, 720), {
    scale: 0.5,
    logicalHeight: 1440,
  });
});

test("does not upscale a desktop preview at or above its logical width", () => {
  assert.deepEqual(resolveDesktopPreviewLayout(1280, 720), {
    scale: 1,
    logicalHeight: 720,
  });
  assert.deepEqual(resolveDesktopPreviewLayout(1920, 720), {
    scale: 1,
    logicalHeight: 720,
  });
});

test("keeps scale positive and finite for zero or invalid widths", () => {
  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { scale } = resolveDesktopPreviewLayout(width, 720);

    assert.ok(Number.isFinite(scale));
    assert.ok(scale > 0);
    assert.ok(scale <= 1);
  }
});
