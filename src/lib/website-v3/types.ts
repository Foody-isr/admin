export type WebsitePageType = "landing" | "content" | "order" | "catering";
export type PreviewDevice = "desktop" | "mobile";
export type StatePath = readonly (string | number)[];

export type DraftAppearanceOverrides = {
  bg?: string;
  ink?: string;
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
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
