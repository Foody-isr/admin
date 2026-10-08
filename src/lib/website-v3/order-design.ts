/** Restores the historical menu presentation while retaining authored colors and commerce settings. */
export function previousOrderPresentation(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...value,
    content_width: "wide",
    layout: "list",
    columns: 3,
    card_style: "filled",
    card_radius: "rounded",
    image_radius: "rounded",
    item_action: "cutout",
    category_shape: "pill",
    sticky_categories: true,
    show_availability_filter: false,
    show_descriptions: true,
    show_portions: true,
    price_display: "starting",
    category_style: "inherit",
    category_title_style: "inherit",
    item_title_style: "inherit",
    item_price_style: "inherit",
  };
}

/** Selecting a shared style gives the whole menu one color source and restores its background. */
export function selectOrderColorStyle(
  value: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return { ...value, color_style: id, background_kind: "style" };
}
