// Website Builder v3 — which inspector groups belong to which page, tab and
// preview surface.
//
// An order page has TWO preview surfaces: the menu itself ("page") and the
// payment route ("checkout"). They are different foodyweb routes that consume
// different CSS variables, so most settings apply to exactly one of them:
//
//   checkout_text_colors  → app/order/checkout/page.tsx only  (the only
//                           surface="checkout" call site in foodyweb)
//   cart_text_colors      → CartDrawer, mounted by OrderExperience
//   section_colors.categoryBar* → CategoryTabs
//   cover / hero_*        → RestaurantHero, imported only by OrderExperience
//   navbar / footer       → SiteNavbar / SiteFooter, neither of which the
//                           checkout route mounts (it has its own header)
//
// Before this table the rule lived as ~6 scattered `page.type === "order"`
// ternaries in PageInspector and the surface was a useState local to
// PreviewCanvas, so the inspector could not see it at all — the checkout
// surface showed the cart, category-bar and cover groups, and the page surface
// showed the checkout colours. Keeping the rule as DATA is what makes it
// reviewable and testable: `visibleInspectorGroups` is the whole spec, and
// __tests__/inspector-scope.test.ts asserts it directly.

import type { WebsitePageType } from "./types";

/** The preview surface an inspector group applies to. */
export type InspectorSurface = "page" | "checkout";

/** The three inspector tabs. Re-exported by components/website-v3/Inspector. */
export type InspectorTab = "content" | "appearance" | "settings";

/** Stable identity of an inspector group, independent of its (localised) title. */
export type InspectorGroupId =
  | "page.identity"
  | "page.sections"
  | "page.theme"
  | "page.typography"
  | "page.quick_colors"
  | "page.fonts"
  | "checkout.text_colors"
  | "cart.text"
  | "cart.surfaces"
  | "cart.buttons"
  | "page.category_bar"
  | "page.cover"
  | "page.order_type_selector"
  | "page.catalog"
  | "page.category_visuals"
  | "page.address"
  | "page.commerce"
  | "page.navigation"
  | "page.order_info"
  | "page.seo"
  | "checkout.form"
  | "page.handoff";

export type InspectorGroupScope = {
  readonly id: InspectorGroupId;
  /** Tabs the group appears in. Only the handoff card spans more than one. */
  readonly tabs: readonly InspectorTab[];
  readonly pageTypes: readonly WebsitePageType[] | "all";
  readonly surfaces: readonly InspectorSurface[];
};

export type InspectorScopeContext = {
  readonly pageType: WebsitePageType;
  readonly tab: InspectorTab;
  readonly surface: InspectorSurface;
};

const ALL_PAGE_TYPES = "all" as const;
const PAGE_ONLY = ["page"] as const;
const CHECKOUT_ONLY = ["checkout"] as const;

/** Ordered — the array order IS the render order inside each tab. */
export const INSPECTOR_GROUP_SCOPES: readonly InspectorGroupScope[] = [
  // ── Contenu ──────────────────────────────────────────────────────────────
  { id: "page.identity", tabs: ["content"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.sections", tabs: ["content"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },

  // ── Apparence ────────────────────────────────────────────────────────────
  // Theme, typography and the base tokens reach the checkout too (through
  // foodyweb's OrderThemeBridge for the theme, and --bg-page/--text/--brand/
  // --font-* for the rest), but the PAGE owns them: one setting, one owner.
  // The handoff card sends the user back with a single click.
  { id: "page.theme", tabs: ["appearance"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.typography", tabs: ["appearance"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.quick_colors", tabs: ["appearance"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.fonts", tabs: ["appearance"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "checkout.text_colors", tabs: ["appearance"], pageTypes: ["order"], surfaces: CHECKOUT_ONLY },
  { id: "cart.text", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "cart.surfaces", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "cart.buttons", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "page.category_bar", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  // Cover is inert on catering pages (CateringExperience mounts no
  // RestaurantHero). Left visible on purpose: hiding a control an owner has
  // already filled in is a data-visibility regression that needs its own
  // decision about the stored values.
  { id: "page.cover", tabs: ["appearance"], pageTypes: ["order", "catering"], surfaces: PAGE_ONLY },
  { id: "page.order_type_selector", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "page.catalog", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "page.category_visuals", tabs: ["appearance"], pageTypes: ["order"], surfaces: PAGE_ONLY },

  // ── Réglages ─────────────────────────────────────────────────────────────
  { id: "page.address", tabs: ["settings"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.commerce", tabs: ["settings"], pageTypes: ["order", "catering"], surfaces: PAGE_ONLY },
  { id: "page.navigation", tabs: ["settings"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  { id: "page.order_info", tabs: ["settings"], pageTypes: ["order"], surfaces: PAGE_ONLY },
  { id: "page.seo", tabs: ["settings"], pageTypes: ALL_PAGE_TYPES, surfaces: PAGE_ONLY },
  // checkout_config is SITE-level: it is written through onConfigChange, never
  // through the page-scoped onChange, and it applies to every order page.
  { id: "checkout.form", tabs: ["settings"], pageTypes: ["order"], surfaces: CHECKOUT_ONLY },

  // ── Renvoi ───────────────────────────────────────────────────────────────
  // Last in every tab: it explains what the checkout surface does NOT own.
  {
    id: "page.handoff",
    tabs: ["content", "appearance", "settings"],
    pageTypes: ["order"],
    surfaces: CHECKOUT_ONLY,
  },
];

const SCOPES_BY_ID: ReadonlyMap<InspectorGroupId, InspectorGroupScope> = new Map(
  INSPECTOR_GROUP_SCOPES.map((scope) => [scope.id, scope]),
);

/** Surfaces a page type can present. Only order pages have a checkout. */
export function surfacesForPageType(
  type: WebsitePageType,
): readonly InspectorSurface[] {
  return type === "order" ? (["page", "checkout"] as const) : PAGE_ONLY;
}

/** Clamps a requested surface to one the page type actually has.
 *
 *  This is the structural guarantee that a non-order page can never render a
 *  checkout-only field, not even for a single frame while a reset effect is
 *  still pending. `undefined` covers the builder's nullable active page. */
export function effectiveSurface(
  type: WebsitePageType | undefined,
  requested: InspectorSurface,
): InspectorSurface {
  if (!type) return "page";
  return surfacesForPageType(type).includes(requested) ? requested : "page";
}

/** Throws on an unregistered id: a typo must fail loudly, not hide a group. */
export function showsInspectorGroup(
  id: InspectorGroupId,
  ctx: InspectorScopeContext,
): boolean {
  const scope = SCOPES_BY_ID.get(id);
  if (!scope) throw new Error(`Unknown inspector group: ${id}`);
  if (!scope.tabs.includes(ctx.tab)) return false;
  if (!scope.surfaces.includes(ctx.surface)) return false;
  return scope.pageTypes === "all" || scope.pageTypes.includes(ctx.pageType);
}

/** Every group visible for this context, in render order. The whole spec. */
export function visibleInspectorGroups(
  ctx: InspectorScopeContext,
): readonly InspectorGroupId[] {
  return INSPECTOR_GROUP_SCOPES.filter((scope) =>
    showsInspectorGroup(scope.id, ctx),
  ).map((scope) => scope.id);
}
