import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDesktopPreviewLayout } from "../preview-layout";

test("scales the desktop preview to fit its available width", () => {
  assert.deepEqual(resolveDesktopPreviewLayout(640, 720), {
    scale: 0.5,
    logicalHeight: 1440,
  });
});
