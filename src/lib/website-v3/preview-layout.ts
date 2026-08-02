export const DESKTOP_PREVIEW_WIDTH = 1280;

/** Resolves the scaled desktop preview dimensions for its available canvas. */
export function resolveDesktopPreviewLayout(
  width: number,
  height: number,
): { scale: number; logicalHeight: number } {
  const availableWidth = Number.isFinite(width) ? Math.max(width, 0) : 0;
  const availableHeight = Number.isFinite(height) ? Math.max(height, 0) : 0;
  const scale = Math.min(
    Math.max(availableWidth / DESKTOP_PREVIEW_WIDTH, Number.EPSILON),
    1,
  );

  return {
    scale,
    logicalHeight: availableHeight / scale,
  };
}
