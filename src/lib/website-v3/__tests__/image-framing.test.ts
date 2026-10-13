import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_FRAME,
  imageFrameRect,
  normalizeImageFraming,
} from "../image-framing";
import {
  normalizeWebsiteHeader,
  orderHeaderPresentation,
  resolvePageHeader,
} from "../header";

test("framing stays opt-in, clamps corrupt input and preserves independent screens", () => {
  assert.equal(normalizeImageFraming(undefined), undefined);
  assert.equal(normalizeImageFraming({ zoom: 2 }), undefined);
  assert.deepEqual(
    normalizeImageFraming({
      desktop: { x: -20, y: 200, zoom: Infinity, fit: "bad" },
      mobile: { x: 10, y: 20, zoom: 0.1, fit: "contain" },
    }),
    {
      desktop: { x: 0, y: 100, zoom: 1, fit: "cover" },
      mobile: { x: 10, y: 20, zoom: 0.5, fit: "contain" },
    },
  );
});
test("zooming out reveals the source, contain shows its full extent, and pan follows the clipped rectangle", () => {
  assert.deepEqual(imageFrameRect(600, 200, 800, 600, DEFAULT_IMAGE_FRAME), {
    width: 600,
    height: 450,
    left: 0,
    top: -125,
  });
  const zoomedOut = imageFrameRect(600, 200, 800, 600, {
    ...DEFAULT_IMAGE_FRAME,
    zoom: 0.5,
  });
  assert.deepEqual(zoomedOut, {
    width: 300,
    height: 225,
    left: 150,
    top: -12.5,
  });
  const whole = imageFrameRect(600, 200, 800, 600, {
    ...DEFAULT_IMAGE_FRAME,
    fit: "contain",
  });
  assert.equal(whole.height, 200);
  assert.ok(whole.width <= 600 && whole.left >= 0 && whole.top >= 0);
  assert.equal(
    imageFrameRect(600, 200, 800, 600, { ...DEFAULT_IMAGE_FRAME, y: 100 }).top,
    -250,
  );
  assert.deepEqual(imageFrameRect(0, 0, 0, 0, DEFAULT_IMAGE_FRAME), {
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });
});
test("order overrides retain header framing and modal images have their own framing", () => {
  const frame = {
    desktop: { ...DEFAULT_IMAGE_FRAME, zoom: 1.3 },
    mobile: { ...DEFAULT_IMAGE_FRAME, x: 20 },
  };
  const header = normalizeWebsiteHeader({
    background: {
      mode: "image",
      image: "https://example.com/banner.jpg",
      framing: frame,
    },
    logo: { framing: frame },
  });
  assert.deepEqual(
    resolvePageHeader(header, "order", {
      order_header: orderHeaderPresentation(header),
    }).background.framing,
    frame,
  );
  assert.deepEqual(header.logo.framing, frame);
});
