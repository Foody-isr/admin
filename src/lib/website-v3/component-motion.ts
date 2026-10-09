/** Chooses reference-inspired effects for the actual kind of content. */
export function recommendedComponentMotion(type: string) {
  return {
    enabled: true,
    entrance:
      type === "text_and_image"
        ? "split"
        : [
              "animated_text",
              "menu_highlights",
              "featured_menu",
              "featured_categories",
              "gallery",
            ].includes(type)
          ? "zoom"
          : type === "rss_feed"
            ? "from_left"
            : "fade",
    mobile_entrance: type === "text_and_image" ? "from_bottom" : "inherit",
    duration_ms: 1250,
    delay_ms: 0,
    replay: false,
    mobile: true,
    media_hover: type === "text_and_image" ? "wobble" : "none",
    button_hover: "push",
    parallax: type === "text_and_image" ? "down" : "none",
    parallax_amount: type === "text_and_image" ? 100 : 20,
    parallax_target: "media",
    mobile_parallax: type === "text_and_image" ? "up" : "inherit",
    mobile_parallax_target: type === "text_and_image" ? "text" : "inherit",
    mobile_parallax_amount: type === "text_and_image" ? 200 : 20,
    parallax_mobile: type === "text_and_image",
  };
}

export const COMPONENT_ENTRANCES = [
  "none",
  "fade",
  "zoom",
  "bounce",
  "from_left",
  "from_right",
  "from_top",
  "from_bottom",
  "split",
] as const;
