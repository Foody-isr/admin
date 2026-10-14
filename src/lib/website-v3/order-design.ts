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

/** Applies a compact restaurant menu while retaining colors, content and ordering preferences. */
export function compactOrderPresentation(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    layout: "rows",
    card_style: "plain",
    card_border: "separator",
    card_radius: "square",
    item_spacing: 0,
    row_padding: 16,
    image_position: "right",
    image_size: "medium",
    image_ratio: "wide",
    image_radius: "soft",
    image_fit: "cover",
    item_action: "none",
    price_placement: "after_description",
    show_images: true,
    show_item_titles: true,
    show_descriptions: true,
    show_prices: true,
    description_lines: "2",
    category_shape: "underline",
    sticky_categories: true,
    category_title_style: "title-4",
    category_title_weight: "bold",
    category_title_caps: false,
    item_title_style: "paragraph-2",
    item_title_weight: "bold",
    item_title_caps: false,
    item_price_style: "paragraph-3",
    item_description_style: "inherit",
  };
}
