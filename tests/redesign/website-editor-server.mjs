// Isolated, synthetic API for exercising the editor against the real storefront.
// Run with node; it never proxies requests or uses external credentials.
import http from "node:http";
import { createFixture } from "./fixtures.mjs";
const base = createFixture();
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
if (process.env.FOODY_THEME_REGRESSION === "1") {
  draft.sections[0].content = { headline: "blalbla", subheadline: "blablabla", image_url: "", cta_text: "", cta_link: "" };
  draft.sections[0].settings = { show_image_url: false, show_cta_text: false, headline_uppercase: true, headline_size: "sm" };
  draft.pages[0].appearance_overrides = { navbar_cta: { enabled: false }, navigation_mode: "hidden", footer_mode: "hidden" };
  draft.config.nav_layout = { content: { desktop: "hidden" }, links: [{ id: "old", label: "Old theme", page_slug: "missing" }] };
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
    } else if (path === "/api/v1/public/menu")
      result = {
        json: {
          menus: [
            {
              id: 1,
              name: "Our menu",
              groups: [
                {
                  id: 1,
                  name: "Kitchen",
                  items: base.response("/api/v1/menu/items", "GET", {}, 1).json
                    .items,
                },
              ],
            },
          ],
        },
      };
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
