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
    parallax: type === "text_and_image" ? "up" : "none",
    parallax_amount: 20,
    parallax_mobile: false,
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
