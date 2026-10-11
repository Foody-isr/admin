// Isolated, synthetic API for exercising the editor against the real storefront.
// Run with node; it never proxies requests or uses external credentials.
import http from "node:http";
import { readFileSync } from "node:fs";
import { createFixture } from "./fixtures.mjs";
const base = createFixture();
const headerChoices = ["1", "batch", "scheduled-pickup"].includes(process.env.FOODY_HEADER_CHOICES);
const restaurantHeader = process.env.FOODY_RESTAURANT_HEADER === "1" || headerChoices;
const menuAppearance = (process.env.FOODY_MENU_APPEARANCE === "1" || process.env.FOODY_MENU_STYLES === "1" || restaurantHeader)
  ? JSON.parse(readFileSync(new URL("./fixtures/mamie-menu-appearance.json", import.meta.url), "utf8"))
  : null;
const date = "2026-10-04T12:00:00Z";
const image = "http://localhost:3003/images/login/cafe-israel.webp";
const page = (id, type, slug, title, settings = {}) => ({
  id,
  type,
  slug,
  title,
  sort_order: id - 1,
  nav_visible: true,
  is_homepage: id === 1,
  is_default: type === "order",
  seo: {},
  appearance_overrides: { foody_renderer_version: 1 },
  settings,
});
const section = (id, type, content, layout = "default") => ({
  id,
  section_type: type,
  page: "home",
  page_id: 1,
  sort_order: id - 1,
  is_visible: true,
  layout,
  content,
  settings: { color_style: "light" },
});
let draft = {
  config: {
    landing_enabled: true,
    theme_id: "custom",
    custom_palette: {
      mode: "light",
      bg: "#fff",
      surface: "#f5f5f5",
      ink: "#101010",
      accent: "#101010",
    },
    navbar_color: "#fff",
    navbar_text_color: "#101010",
    navbar_logo_position: "center",
  },
  pages: [
    page(1, "landing", "home", "Home"),
    page(2, "order", "order", "Order online", { menu_ids: [1] }),
    page(3, "content", "about", "About"),
  ],
  sections: [
    section(
      1,
      "hero_banner",
      {
        headline: "Atelier Foody",
        subheadline: "Fresh ingredients. Made with care.",
        image_url: image,
        cta_text: "Order now",
        cta_link: "/order",
      },
      "centered",
    ),
    section(2, "scrolling_text", {
      text: "FRESH INGREDIENTS · MADE WITH CARE",
    }),
    section(
      3,
      "text_and_image",
      {
        title: "Good food, good company.",
        body: "A table for everyone. Discover our seasonal kitchen.",
        image_url: image,
      },
      "image_right",
    ),
    section(4, "testimonials", {
      title: "Around our table",
      reviews: [{ name: "Alex", text: "A wonderful lunch.", rating: 5 }],
    }),
    section(5, "about", {
      blocks: [{ title: "Our kitchen", body: "Freshly prepared every day." }],
    }),
    section(6, "menu_highlights", {
      title: "Our favourites",
      item_ids: [1, 2],
    }),
  ],
  deleted_page_ids: [],
  deleted_section_ids: [],
};
if (process.env.FOODY_COMPONENT_MOTION === "1") {
  draft.config.custom_palette.accent = "#d7807f";
  draft.sections[0].settings.motion = { enabled: true, entrance: "fade", duration_ms: 1250 };
  draft.sections[2].content.cta_text = "Découvrir la carte";
  draft.sections[2].content.cta_link = "/order";
  draft.sections[2].settings.motion = { enabled: true, entrance: "split", duration_ms: 1250, media_hover: "wobble", button_hover: "push", parallax: "down", parallax_amount: 100, parallax_target: "media", parallax_mobile: true, mobile_parallax: "up", mobile_parallax_target: "text", mobile_parallax_amount: 200 };
  draft.sections[3].layout = "carousel";
  draft.sections[3].settings = { carousel_autoplay: true, carousel_interval: 5000, carousel_duration: 500 };
  draft.sections[3].content.reviews.push({ name: "Sam", text: "Un accueil chaleureux et de belles saveurs.", rating: 5 });
  draft.sections.splice(3, 0, {...section(7, "animated_text", {text: "Apparemment, on nous aime", phrases: [{text:"un peu"},{text:"beaucoup"},{text:"passionnément"}]}), sort_order: 3, settings: {text_size:"md", rotating_color:"#d7807f", motion:{enabled:true, entrance:"zoom", duration_ms:1250}}});
}
if (process.env.FOODY_COMPONENT_MOTION === "1") draft.sections.forEach((section, index) => { section.sort_order = index; });
if (process.env.FOODY_THEME_REGRESSION === "1") {
  draft.sections[0].content = { headline: "blalbla", subheadline: "blablabla", image_url: "", cta_text: "", cta_link: "" };
  draft.sections[0].settings = { show_image_url: false, show_cta_text: false, headline_uppercase: true, headline_size: "sm" };
  draft.pages[0].appearance_overrides = { navbar_cta: { enabled: false }, navigation_mode: "hidden", footer_mode: "hidden" };
  draft.config.nav_layout = { content: { desktop: "hidden" }, links: [{ id: "old", label: "Old theme", page_slug: "missing" }] };
}
const featuredRegression = process.env.FOODY_FEATURED_REGRESSION === "1";
const featuredItems = Array.from({length: 6}, (_, index) => ({
  id: index + 1, category_id: 1, name: ["Double Espresso", "Tall Cold Brew", "Cappuccino", "Drip Coffee", "Croissant", "Apple cake"][index],
  description: "Prepared fresh in our kitchen.", price: 5 + index, is_active: true,
  image_url: "", item_type: "regular", availability_state: index === 5 ? "sold_out" : "available",
  ...(index === 0 ? {option_sets: [{id: 1, name: "Size", is_active: true, options: [{id: 11, name: "Small", price: 5, is_active: true}, {id: 12, name: "Large", price: 9, is_active: true}]}]} : {}),
}));
if (featuredRegression) {
  draft.sections = [
    {...section(6, "menu_highlights", {title: "Featured Items", item_ids: [1,2,3,4,5,6]}, "carousel"), settings: {color_style: "site", auto_scroll: true, full_width: true, column_spacing: 5, image_size: "L"}},
    {...section(7, "featured_menu", {title: "Featured Menu Items", subtitle: "Try one of our signature selections", item_ids: [1,2,3,4], cta_text: "Explore our menu"}, "list"), settings: {color_style: "site"}},
  ];
}
if (menuAppearance) {
  draft.config = { ...draft.config, ...menuAppearance.config, navbar_color: "#6e1f13", navbar_text_color: "#ffffff" };
  draft.pages[1].appearance_overrides = { ...menuAppearance.order_appearance, foody_renderer_version: 1, website_order: {
    show_banner: false, show_fulfillment: false, prompt_on_entry: false,
  }};
  draft.sections = [];
}
if (process.env.FOODY_MENU_STYLES === "1" || restaurantHeader) {
  draft.config.custom_palette = {
    mode: "light", bg: "#ffffff", surface: "#f5f5f5", ink: "#111111", accent: "#de5228",
    secondary_colors: ["#6d1f13", "#dfc65b", "#cfb4a9", "#ffffff"],
    color_styles: { version: 1, default: "style-1", styles: [
      { id: "style-2", background: "#de5228", title: "#111111", paragraph: "#111111",
        solid_button: "#111111", outline_button: "#111111", menu: {
          heading: "#ffffff", bar_background: "#6d1f13", category_text: "#ffffff",
          active_background: "#ffffff", active_text: "#6d1f13",
          card_background: "#6d1f13", card_title: "#ffffff",
          card_price: "#dfc65b", card_description: "#cfb4a9",
        },
      },
    ] },
  };
  Object.assign(draft.pages[1].appearance_overrides.website_order, {
    color_style: "style-2", content_width: "wide", layout: "list", columns: 3,
    card_style: "filled", card_radius: "rounded", image_radius: "rounded",
    item_action: "cutout", category_shape: "pill", sticky_categories: true,
    category_title_style: "inherit", show_descriptions: true, show_portions: true,
    // Obsolete local settings must not compete with the global menu style.
    background_kind: "color", background: "#ff00ff", card_color_style: "style-5",
    category_color_style: "style-5", card_background: "#ff00ff",
  });
}
if (restaurantHeader) {
  draft.config.nav_layout = {header:{version:1, layout:"restaurant", scroll:"none", color_style:"style-5",
    background:{mode:"image", image:"", overlay:45},
    logo:{type:"image", image:"", size:140},
    icons:{cart:false, search:false}, button:{enabled:false},
    navigation:{enabled:true, mode:"dropdown", links:[{id:"order",label:"Menu",target:{kind:"order",value:""}},{id:"about",label:"À propos",target:{kind:"page",value:"about"}}]},
    restaurant:{height:"medium",show_name:true,info_enabled:true,info_color_style:"style-3",show_status:true,show_minimum:true,show_social:true},
  }};
  draft.config.custom_palette.color_styles.styles.push(
    {id:"style-3",background:"#de5228",title:"#ffffff",paragraph:"#fff5ec",solid_button:"#6d1f13",outline_button:"#6d1f13"},
    {id:"style-5",background:"#111111",title:"#ffffff",paragraph:"#ffffff",solid_button:"#de5228",outline_button:"#ffffff"},
  );
  draft.config.checkout_config = {lock_order_type:true};
  draft.config.social_links = {instagram:"https://www.instagram.com/mamietlv/",whatsapp:"https://wa.me/9720534679393"};
  // Even saved appearance switches must not restore forbidden choices or a duplicate cover.
  Object.assign(draft.pages[1].appearance_overrides.website_order, {show_banner:true,show_fulfillment:true,prompt_on_entry:true});
}
if (headerChoices) {
  draft.config.checkout_config = {lock_order_type: false};
  draft.config.nav_layout.header.fulfillment = {enabled: true};
  draft.config.nav_layout.header.restaurant.info_color_style = "style-6";
  draft.config.custom_palette.color_styles.styles.push({id:"style-6",background:"#eee9df",title:"#111111",paragraph:"#111111",solid_button:"#111111",outline_button:"#111111"});
  draft.sections = [section(1, "hero_banner", {headline: "Bienvenue", image_url: image}, "centered")];
  draft.pages[1].appearance_overrides.website_order.prompt_on_entry = false;
}
let published = structuredClone(draft),
  dirty = false;
const response = () => ({
  state: structuredClone(draft),
  draft_dirty: dirty,
  draft_saved_at: date,
  published_at: date,
});
const restaurant = () => ({
  ...base.response("/api/v1/restaurants/1", "GET", {}, 1).json.restaurant,
  id: 1,
  name: "Atelier Foody",
  slug: "atelier-foody",
  description: "Fresh ingredients. Made with care.",
  logo_url: "",
  cover_url: process.env.FOODY_THEME_REGRESSION === "1" ? "" : image,
  default_locale: "en",
  catering_enabled: false,
  ...(menuAppearance ? {name: "MAMIE — aperçu local"} : {}),
  ...(restaurantHeader ? {
    name:"MAMIE", default_locale:"fr", timezone:"Asia/Jerusalem", pickup_enabled:false, delivery_enabled:true,
    scheduling_enabled:false, batch_fulfillment_enabled:true, minimum_order_delivery:450,
    logo_url:"https://foody-menu-images.s3.eu-north-1.amazonaws.com/restaurants/5/logo/e4f26758-7ca6-454e-8d9c-ab22cc5ac73a.png",
    cover_url:"https://foody-menu-images.s3.eu-north-1.amazonaws.com/restaurants/5/background/6b7dbb85-ccf7-417c-a09a-ba21150b5474.JPG",
  } : {}),
  ...(headerChoices ? {name: "Atelier — aperçu local", pickup_enabled: true, delivery_enabled: process.env.FOODY_HEADER_CHOICES !== "scheduled-pickup", scheduling_enabled: true, batch_fulfillment_enabled: process.env.FOODY_HEADER_CHOICES === "batch"} : {}),
  ...(featuredRegression ? { opening_hours_config: Object.fromEntries(
    ["dine_in", "pickup", "delivery"].map((service) => [service, Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [day, {closed: false, open: "00:00", close: "00:00"}]),
    )]),
  ) } : {}),
  website_config: published.config,
  website_sections: published.sections,
});
const publicPages = () =>
  published.pages.map((p) => ({
    ...p,
    restaurant_id: 1,
    created_at: date,
    updated_at: date,
    sections: published.sections
      .filter((s) => s.page_id === p.id)
      .map((s) => ({
        ...s,
        restaurant_id: 1,
        created_at: date,
        updated_at: date,
      })),
  }));
http
  .createServer(async (req, res) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      req.headers.origin === "http://localhost:3000"
        ? "http://localhost:3000"
        : "http://localhost:3003",
    );
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, authorization, x-restaurant-id",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = new URL(req.url, "http://localhost").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      res.writeHead(400);
      res.end("{}");
      return;
    }
    let result;
    if (path === "/api/v1/restaurants/1/website-draft") {
      if (req.method === "PUT") {
        draft = body;
        dirty = true;
      }
      result = { json: response() };
    } else if (path === "/api/v1/restaurants/1/website-publish") {
      const pageIds = new Map(draft.pages.map((page, index) => [page.tmp_id, page.id ?? index + 100]));
      published = {
        ...structuredClone(draft),
        pages: draft.pages.map(({tmp_id, ...page}, index) => ({...page, id: page.id ?? index + 100})),
        sections: draft.sections.map(({tmp_id, page_tmp_id, ...section}, index) => ({...section, id: section.id ?? index + 1000, ...(page_tmp_id ? {page_id: pageIds.get(page_tmp_id)} : {})})),
      };
      dirty = false;
      result = { json: response() };
    } else if (path === "/api/v1/restaurants/1/website-discard") {
      draft = structuredClone(published);
      dirty = false;
      result = { json: response() };
    } else if (path === "/api/v1/chain/branches")
      result = {
        json: { chain_id: null, primary_restaurant_id: null, branches: [] },
      };
    else if (
      path === "/api/v1/restaurants/1" ||
      /^\/api\/v1\/public\/restaurants\/(1|atelier-foody)$/.test(path)
    )
      result = { json: { restaurant: restaurant() } };
    else if (path.endsWith("/website-pages"))
      result = { json: { pages: publicPages() } };
    else if (path.includes("/website-pages/")) {
      const page = publicPages().find((p) => p.slug === path.split("/").pop());
      result = page
        ? { json: { page } }
        : { status: 404, json: { error: "Page not found" } };
    } else if (featuredRegression && /^\/api\/v1\/menu\/?$/.test(path))
      result = {json: {menus: [{id: 1, restaurant_id: 1, name: "Menu", is_active: true, web_enabled: true, groups: [{id:1, web_enabled:true, is_hidden:false, items:featuredItems}]}]}};
    else if (path === "/api/v1/public/menu")
      result = {
        json: {
          ...(featuredRegression ? {popular_item_ids: [4,2,1,3,5,6]} : {}),
          menus: menuAppearance?.menus ?? [
            {
              id: 1,
              name: "Our menu",
              groups: [
                {
                  id: 1,
                  name: "Kitchen",
                  items: featuredRegression ? featuredItems : base.response("/api/v1/menu/items", "GET", {}, 1).json.items,
                },
              ],
            },
          ],
        },
      };
    else if (restaurantHeader && path.endsWith("/batch-fulfillment-config"))
      result = {json:{enabled:true,ordering_open:true,current_batch_open_at:"2026-10-05T12:00:00+03:00",current_batch_cutoff:"2026-10-08T18:00:00+03:00",cutoff_day_name:"Thursday",cutoff_time:"18:00",fulfillment_days:[{date:"2026-10-09",day_name:"Friday",delivery_window:{start:"08:00",end:"15:00"},...(headerChoices ? {pickup_window:{start:"10:00",end:"12:00"}} : {})}],immediate_available:false}};
    else if (path === "/api/v1/public/delivery/check")
      result = {json: {resolved: true, deliverable: !new URL(req.url, "http://localhost").searchParams.get("address")?.includes("outside"), delivery_fee: 12}};
    else if (path === "/api/v1/public/themes/catalog")
      result = { json: { themes: [], typography_pairings: [] } };
    else if (path.endsWith("/catering/services"))
      result = { json: { services: [] } };
    else result = base.response(req.url, req.method, body, 1);
    res.writeHead(result.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.json ?? {}));
  })
  .listen(18081, "127.0.0.1", () =>
    console.log("Website editor synthetic fixture: http://127.0.0.1:18081"),
  );
