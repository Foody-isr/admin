export type WebsitePageType = "landing" | "content" | "order" | "catering";
export type PreviewDevice = "desktop" | "mobile";
export type StatePath = readonly (string | number)[];

export type NavbarCtaSurfaceStyle = {
  variant?: "filled" | "outline" | "ghost";
  bg?: string;
  text_color?: string;
  border_color?: string;
};

export type NavbarCtaOverride = {
  enabled?: boolean;
  text?: string;
  link?: string;
  shape?: "pill" | "rounded" | "square";
  size?: "sm" | "md" | "lg";
  bg?: string;
  text_color?: string;
  border_color?: string;
  variant?: "filled" | "outline" | "ghost";
  transparent?: NavbarCtaSurfaceStyle;
  solid?: NavbarCtaSurfaceStyle;
};

export type OrderTypeSelectorOverride = NavbarCtaSurfaceStyle & {
  shape?: "pill" | "rounded" | "square";
  size?: "sm" | "md" | "lg";
};

export type ChainOrderEntryLocaleCopy = {
  brandName?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  pickup?: string;
  delivery?: string;
  search?: string;
  nearMe?: string;
  branches?: string;
  orderHere?: string;
};

export type ChainOrderEntryOverride = {
  logo_url?: string;
  layout?: "list" | "cards";
  show_search?: boolean;
  show_near_me?: boolean;
  show_branch_count?: boolean;
  show_branch_numbers?: boolean;
  surface_color?: string;
  overlay_opacity?: number;
  translations?: Partial<Record<"en" | "fr" | "he", ChainOrderEntryLocaleCopy>>;
};

export type DraftAppearanceOverrides = {
  bg?: string;
  ink?: string;
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
  theme_id?: string;
  pairing_id?: string;
  brand_color?: string | null;
  layout_default?: "compact" | "magazine";
  layout_default_mobile?: "" | "compact" | "magazine";
  custom_palette?: Record<string, unknown> | null;
  section_colors?: Record<string, unknown> | null;
  typography?: Record<string, unknown> | null;
  checkout_text_colors?: {
    heading?: string;
    primary?: string;
    secondary?: string;
    input?: string;
    price?: string;
    button?: string;
  } | null;
  /** Every colour the cart drawer paints. Separate from the page's global ink,
   *  which the cart would otherwise inherit — a palette whose ink matches the
   *  cart surface renders it unreadable. No "input": the cart has no fields.
   *  Kept under the historical `cart_text_colors` key so drafts saved before
   *  the surface and button roles existed keep resolving. */
  cart_text_colors?: {
    heading?: string;
    primary?: string;
    secondary?: string;
    price?: string;
    surface?: string;
    surfaceMuted?: string;
    divider?: string;
    accent?: string;
    overlay?: string;
    button?: string;
    buttonBg?: string;
    closeText?: string;
    closeBg?: string;
    stepperBg?: string;
    stepperText?: string;
    stepperBorder?: string;
    remove?: string;
  } | null;
  hero_name_font?: string;
  hero_logo_bg?: "white" | "black";
  hero_cover_layout?: "card" | "logo" | "bare";
  hero_logo_size?: number;
  cover_url?: string;
  background_color?: string;
  cover_focal_x?: number;
  cover_focal_y?: number;
  category_banner_style?: string;
  category_banner_overlay?: number;
  category_banner_fit?: string;
  category_banner_fit_mobile?: string;
  navigation_mode?: "inherit" | "full" | "slim" | "compact" | "hidden";
  navigation_mode_mobile?: "inherit" | "full" | "slim" | "compact" | "hidden";
  navbar_style?: "inherit" | "solid" | "transparent" | "overlay";
  navbar_color?: string;
  navbar_text_color?: string;
  navbar_overlay_text_color?: string;
  hide_navbar_name?: boolean;
  navbar_cta?: NavbarCtaOverride;
  footer_mode?: "inherit" | "full" | "compact" | "hidden";
  order_page_info?: Record<string, unknown> | null;
  order_type_selector?: OrderTypeSelectorOverride | null;
  chain_order_entry?: ChainOrderEntryOverride | null;
  group_banners?: Record<
    string,
    {
      image_url?: string;
      focal_x?: number;
      focal_y?: number;
      banner_design?: Record<string, unknown>;
    }
  >;
};

export type DraftSeoPayload = {
  title?: string;
  description?: string;
  share_image_url?: string;
};

export type DraftPageBase = {
  id?: number;
  tmp_id?: string;
  type: WebsitePageType;
  slug: string;
  title: string;
  sort_order: number;
  nav_visible: boolean;
  is_homepage: boolean;
  is_default: boolean;
  seo: DraftSeoPayload;
  appearance_overrides: DraftAppearanceOverrides;
};

export type DraftPagePayload =
  | (DraftPageBase & {
      type: "landing";
      settings: Record<string, never>;
    })
  | (DraftPageBase & {
      type: "content";
      settings: Record<string, never>;
    })
  | (DraftPageBase & {
      type: "order";
      settings: { menu_ids: number[] };
    })
  | (DraftPageBase & {
      type: "catering";
      settings: { service_ids: number[] };
    });

export type DraftSectionPayload = {
  id?: number;
  tmp_id?: string;
  section_type: string;
  page: string;
  page_id?: number;
  page_tmp_id?: string;
  sort_order: number;
  is_visible: boolean;
  layout: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type DraftConfigPayload = Record<string, unknown>;

export type DraftStatePayload = {
  config: DraftConfigPayload;
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
  deleted_section_ids: number[];
  deleted_page_ids: number[];
};

export type DraftResponse = {
  state: DraftStatePayload;
  draft_dirty: boolean;
  draft_saved_at?: string | null;
  published_at?: string | null;
};

export type FieldError = {
  fieldId: string;
  message: string;
  pageKey?: string;
  sectionKey?: string;
  tab?: "content" | "appearance" | "settings";
};

/** Returns the stable key used by the editor and preview protocol. */
export function pageKey(page: Pick<DraftPagePayload, "id" | "tmp_id">): string {
  if (page.id !== undefined) return String(page.id);
  if (page.tmp_id) return page.tmp_id;
  throw new Error("Website page is missing both id and tmp_id");
}

/** Returns the stable key used by the section inspector. */
export function sectionKey(
  section: Pick<DraftSectionPayload, "id" | "tmp_id">,
): string {
  if (section.id !== undefined) return String(section.id);
  if (section.tmp_id) return section.tmp_id;
  throw new Error("Website section is missing both id and tmp_id");
}
