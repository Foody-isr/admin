import type { DraftPagePayload } from "./types";

export type EditorComponent = {
  type: string;
  label: string;
  layouts: readonly string[];
  content: Record<string, unknown>;
};
const component = (
  type: string,
  label: string,
  layouts: string[],
  content: Record<string, unknown> = {},
): EditorComponent => ({ type, label, layouts, content });

/** Section catalogue observed in Square Online; legacy Foody blocks are never offered for insertion. */
export const SQUARE_COMPONENT_GROUPS = [
  {
    label: "editorSell",
    items: [
      component(
        "menu_highlights",
        "editorFeaturedItems",
        ["grid", "carousel"],
        { title: "Featured items", item_ids: [] },
      ),
      component(
        "featured_categories",
        "editorFeaturedCategories",
        ["grid", "carousel"],
        { title: "Explore our menu", cards: [] },
      ),
      component("donation", "editorDonation", ["centered", "split"], {
        title: "Make a difference",
        body: "",
        cta_text: "Donate",
        cta_link: "",
      }),
      component("events", "editorEvents", ["list", "grid"], {
        title: "Upcoming events",
        cards: [],
      }),
      component("featured_menu", "editorFeaturedMenu", ["list"], {
        title: "Featured Menu Items",
        subtitle:
          "Try one of our signature selections and see what everyone’s talking about",
        cta_text: "Explore our menu",
        item_ids: [],
      }),
    ],
  },
  {
    label: "editorOrganize",
    items: [
      component("text", "editorText", ["centered", "split"], {
        title: "Quality Craftsmanship",
        subtitle: "Distinctive and Bold",
        body: "Share your story with your customers.",
        cta_text: "Learn more",
        cta_link: "",
      }),
      component("scrolling_text", "editorScrollingText", ["default"], {
        text: "Fresh ingredients • Made with care •",
      }),
      component(
        "text_and_image",
        "editorTextImage",
        [
          "image_left",
          "default",
          "columns",
          "columns_title_top",
          "columns_centered",
          "highlight",
          "image_above",
          "full_width",
          "split_right",
          "split_left",
          "background",
          "overlap",
        ],
        {
          title: "Our story",
          body: "Share your story with your customers.",
          image_url: "",
          cta_text: "Learn more",
          cta_link: "",
        },
      ),
      component(
        "gallery",
        "editorImageGallery",
        ["grid", "masonry", "carousel"],
        { images: [] },
      ),
      component("button", "editorButton", ["centered", "left_aligned"], {
        cta_text: "Learn more",
        cta_link: "",
      }),
      component("video", "editorVideo", ["contained", "full_width"], {
        title: "",
        video_url: "",
        poster_url: "",
      }),
      component("embed", "editorEmbed", ["contained", "full_width"], {
        code: "",
      }),
      component("pdf", "editorPDF", ["contained", "full_width"], {
        title: "",
        file_url: "",
      }),
    ],
  },
  {
    label: "editorInform",
    items: [
      component(
        "about",
        "editorTemplateAbout",
        ["centered", "split", "banner"],
        {
          blocks: [
            {
              title: "About us",
              body: "Share your story with your customers.",
            },
          ],
        },
      ),
      component("testimonials", "editorTestimonials", ["carousel", "grid"], {
        reviews: [],
      }),
    ],
  },
  {
    label: "editorCommunicate",
    items: [
      component(
        "forms",
        "editorForms",
        ["contact", "reservation", "event", "quote"],
        {
          title: "Contact us",
          body: "",
          cta_text: "Send",
          fields: [
            { id: "name", label: "Name", type: "text", required: true },
            { id: "email", label: "Email", type: "email", required: true },
            {
              id: "message",
              label: "Message",
              type: "textarea",
              required: true,
            },
          ],
        },
      ),
      component("newsletter", "editorNewsletter", ["centered", "split"], {
        title: "Stay in the loop",
        body: "Sign up for news and updates.",
        cta_text: "Sign up",
        fields: [
          { id: "email", label: "Email", type: "email", required: true },
        ],
      }),
      component(
        "location_hours",
        "editorLocationHours",
        ["map_right", "map_left", "text_only"],
        {
          title: "Visit us",
          show_address: true,
          show_phone: true,
          show_hours: true,
          show_map: true,
        },
      ),
      component("rss_feed", "editorRSS", ["list", "grid"], {
        title: "Latest stories",
        feed_url: "",
      }),
    ],
  },
] as const;

/** Metadata for both insertion and contextual editing. */
export const SQUARE_COMPONENTS: Record<string, EditorComponent> =
  Object.fromEntries(
    SQUARE_COMPONENT_GROUPS.flatMap((group) =>
      group.items.map((item) => [item.type, item]),
    ),
  );

/** Commerce pages own their menu block but may contain the same editorial sections. */
export function squareComponentGroups(_pageType: DraftPagePayload["type"]) {
  return SQUARE_COMPONENT_GROUPS;
}

/** Each section receives independent content and a stable anchor before its first save. */
export function squareDefaultContent(
  type: string,
  layout?: string,
): Record<string, unknown> {
  if (type === "hero_banner")
    return {
      headline: "Welcome",
      subheadline: "",
      image_url: "",
      cta_text: "Order now",
      cta_link: "/order",
    };
  if (type === "footer")
    return {
      show_logo: true,
      show_address: true,
      show_phone: true,
      show_hours: true,
    };
  const content = structuredClone(SQUARE_COMPONENTS[type]?.content ?? {});
  if (type === "forms" && layout && layout !== "contact")
    content.fields = [
      ...(content.fields as unknown[]),
      { id: "date", label: "Date", type: "date", required: true },
      ...(layout === "reservation"
        ? [{ id: "guests", label: "Guests", type: "number", required: true }]
        : []),
    ];
  return content;
}

/** Defaults belong to the editor catalogue, independently of the retired builder. */
export function squareDefaultSettings(type?: string): Record<string, unknown> {
  return {
    color_style: "site",
    padding: "normal",
    text_alignment: type === "text_and_image" ? "left" : "center",
    ...(type === "scrolling_text"
      ? {
          text_size: "xl",
          text_weight: "bold",
          text_uppercase: true,
          text_font_role: "heading",
          padding: "compact",
        }
      : {}),
    ...(type === "featured_menu"
      ? {
          columns: 2,
          show_images: false,
          show_descriptions: true,
          show_cta_text: true,
          show_buttons: false,
        }
      : type === "menu_highlights"
        ? {
            columns: 3,
            image_size: "L",
            column_spacing: 2,
            show_descriptions: false,
            show_images: true,
            show_buttons: true,
            show_cta_text: false,
          }
        : {}),
  };
}

/** Available layouts for fixed site regions and insertable sections. */
export function squareLayouts(type: string) {
  const values =
    SQUARE_COMPONENTS[type]?.layouts ??
    (type === "hero_banner"
      ? ["centered", "left_aligned", "split", "inset"]
      : type === "footer"
        ? ["columns", "centered", "minimal"]
        : ["default"]);
  return values.map((value) => ({
    value,
    labelKey:
      type === "scrolling_text"
        ? "editorLayout_marquee"
        : type === "text_and_image" && ["columns", "full_width"].includes(value)
          ? `editorTextImageLayout_${value}`
          : `editorLayout_${value}`,
  }));
}
