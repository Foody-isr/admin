/** Selecting a shared style gives the whole menu one color source and restores its background. */
export function selectOrderColorStyle(
  value: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return { ...value, color_style: id, background_kind: "style" };
}

/** Restores the compact photo sheet without changing color assignments or order behavior. */
export function previousItemPresentation(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, item_layout: "cover", item_width: "compact", item_radius: "rounded", item_aspect_ratio: "16/9", item_image_fit: "cover" };
}
