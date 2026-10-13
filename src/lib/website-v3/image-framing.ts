/** Non-destructive image framing, independently authored for each screen size. */
export type ImageFrame = {
  x: number;
  y: number;
  zoom: number;
  fit: "cover" | "contain";
};
export type ImageFraming = { desktop: ImageFrame; mobile?: ImageFrame };
export const DEFAULT_IMAGE_FRAME: ImageFrame = {
  x: 50,
  y: 50,
  zoom: 1,
  fit: "cover",
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;
/** Rejects absent framing and bounds persisted presentation values. */
export function normalizeImageFraming(
  value: unknown,
): ImageFraming | undefined {
  const source = record(value);
  if (!source.desktop || typeof source.desktop !== "object") return undefined;
  const frame = (value: unknown): ImageFrame => {
    const v = record(value);
    return {
      x: clamp(v.x, 0, 100, 50),
      y: clamp(v.y, 0, 100, 50),
      zoom: clamp(v.zoom, 0.5, 3, 1),
      fit: v.fit === "contain" ? "contain" : "cover",
    };
  };
  return {
    desktop: frame(source.desktop),
    ...(source.mobile ? { mobile: frame(source.mobile) } : {}),
  };
}
/** Computes the actual image rectangle before clipping, so zooming out reveals the source. */
export function imageFrameRect(
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
  frame: ImageFrame,
) {
  if (width <= 0 || height <= 0 || naturalWidth <= 0 || naturalHeight <= 0)
    return { width: 0, height: 0, left: 0, top: 0 };
  const ratios = [width / naturalWidth, height / naturalHeight];
  const scale =
    (frame.fit === "contain" ? Math.min(...ratios) : Math.max(...ratios)) *
    frame.zoom;
  const w = naturalWidth * scale,
    h = naturalHeight * scale;
  return {
    width: w,
    height: h,
    left: ((width - w) * frame.x) / 100,
    top: ((height - h) * frame.y) / 100,
  };
}
