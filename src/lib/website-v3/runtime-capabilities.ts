import {sectionKey, type DraftStatePayload, type FieldError} from "./types";

const REQUIRED_PROTOCOL = "foody.website-v3";
const REQUIRED_VERSION = 1;
const REQUIRED_PUBLICATION_MARKER = "foody_renderer_version";
const REQUIRED_RENDERER_VERSION = 1;
const REQUIRED_PAGE_TYPES = [
  "landing",
  "content",
  "order",
  "catering",
] as const;
const REQUIRED_SURFACES = ["page", "checkout"] as const;

export type WebsiteV3RuntimeCapabilities = {
  campaign_layout_controls?: 1;
  campaign_hero?: 1;
  campaign_products?: 1;
  display_typography?: 1;
  protocol: typeof REQUIRED_PROTOCOL;
  version: number;
  editor_catalog: 2;
  animated_text: true;
  component_animations: 1;
  text_image_backgrounds: 1;
  text_section_dimensions: 1;
  video_playback: 1;
  video_height: 1;
  receipt_editor: 1;
  order_list_styles: 1;
  order_wolt_preset: 1;
  page_types: string[];
  surfaces: string[];
  publication: {
    marker: typeof REQUIRED_PUBLICATION_MARKER;
    version: typeof REQUIRED_RENDERER_VERSION;
  };
};

/** Rejects only drafts using a campaign feature absent from the selected renderer. */
export function campaignRuntimeErrors(state: DraftStatePayload, capabilities: WebsiteV3RuntimeCapabilities | null, translate?: (key: string) => string): FieldError[] {
  const errors: FieldError[] = state.sections.flatMap(section => {
    if (!section.is_visible) return [];
    const layoutControls = section.section_type === "hero_banner" && section.layout === "campaign"
      ? (section.settings.controls_alignment !== undefined && section.settings.controls_alignment !== "center")
        || section.settings.show_counter === false || section.settings.show_playback_control === false
        || (section.settings.card_width_percent !== undefined && section.settings.card_width_percent !== 92)
        || (section.settings.card_width_percent_mobile !== undefined && section.settings.card_width_percent_mobile !== 90)
        || section.settings.card_gap !== undefined
      : section.section_type === "menu_highlights" && section.settings.card_presentation === "campaign"
        && ((section.settings.item_image_backgrounds && typeof section.settings.item_image_backgrounds === "object" && Object.keys(section.settings.item_image_backgrounds).length > 0)
          || (section.settings.content_max_width !== undefined && section.settings.content_max_width !== 1440)
          || (section.settings.row_spacing !== undefined && section.settings.row_spacing !== Number(section.settings.column_spacing ?? 2) * 10));
    const missing = layoutControls && capabilities?.campaign_layout_controls !== 1 ? "campaign_layout_controls"
      : section.section_type === "hero_banner" && section.layout === "campaign" && capabilities?.campaign_hero !== 1
      ? "campaign_hero"
      : section.section_type === "menu_highlights" && section.settings.card_presentation === "campaign" && capabilities?.campaign_products !== 1
        ? "campaign_products"
        : Object.entries(section.settings).some(([key,value]) => key.endsWith("_size") && value === "display") && capabilities?.display_typography !== 1
          ? "display_typography" : null;
    const messages = {
      campaign_layout_controls:["campaignUnsupportedLayoutControls","Mettez à jour le rendu public avant de publier ces réglages de présentation."],
      campaign_hero:["campaignUnsupportedHero","Le rendu public doit être mis à jour avant de publier ce diaporama."],
      campaign_products:["campaignUnsupportedProducts","Le rendu public doit être mis à jour avant de publier ces cartes."],
      display_typography:["campaignUnsupportedDisplay","Le rendu public doit être mis à jour avant de publier ces grands titres."],
    };
    return missing ? [{fieldId: "section.layout", message: translate ? translate(messages[missing][0]) : messages[missing][1],sectionKey:sectionKey(section),sectionPanel:"appearance" as const}] : [];
  });
  const config = state.config.nav_layout as Record<string, unknown> | undefined;
  const header = config?.header as Record<string, unknown> | undefined;
  const navigation = header?.navigation as Record<string, unknown> | undefined;
  if (navigation && capabilities?.campaign_layout_controls !== 1 && (
    navigation.hamburger_style === "staggered" ||
    (navigation.hamburger_size !== undefined && navigation.hamburger_size !== 24) ||
    (navigation.hamburger_stroke !== undefined && navigation.hamburger_stroke !== 1.5)
  )) errors.push({fieldId:"site.header.navigation.hamburger_style",message:translate ? translate("campaignUnsupportedLayoutControls") : "Mettez à jour le rendu public avant de publier ces réglages de présentation."});
  return errors;
}

/** Ensures the selected public storefront can render every Website V3 draft the Admin can publish. */
export async function requireWebsiteV3RuntimeCapabilities(
  webOrigin: string,
  fetcher: typeof fetch = fetch,
): Promise<WebsiteV3RuntimeCapabilities> {
  const endpoint = new URL("/api/website-v3-capabilities", webOrigin);
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw incompatibleRuntimeError();
  }
  if (!response.ok) throw incompatibleRuntimeError();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw incompatibleRuntimeError();
  }
  if (!isCompatible(payload)) throw incompatibleRuntimeError();
  return payload;
}

function isCompatible(value: unknown): value is WebsiteV3RuntimeCapabilities {
  if (!isRecord(value)) return false;
  if (
    value.protocol !== REQUIRED_PROTOCOL ||
    value.version !== REQUIRED_VERSION ||
    value.editor_catalog !== 2 ||
    value.text_image_backgrounds !== 1 ||
    value.text_section_dimensions !== 1 ||
    value.animated_text !== true || value.component_animations !== 1 || value.video_playback !== 1 || value.video_height !== 1 || value.receipt_editor !== 1 || value.order_list_styles !== 1 || value.order_wolt_preset !== 1
  ) {
    return false;
  }
  const pageTypes = value.page_types;
  const surfaces = value.surfaces;
  const publication = value.publication;
  if (!isStringArray(pageTypes) || !isStringArray(surfaces)) {
    return false;
  }
  return (
    REQUIRED_PAGE_TYPES.every((type) => pageTypes.includes(type)) &&
    REQUIRED_SURFACES.every((surface) => surfaces.includes(surface)) &&
    isRecord(publication) &&
    publication.marker === REQUIRED_PUBLICATION_MARKER &&
    publication.version === REQUIRED_RENDERER_VERSION
  );
}

/** Marks every page so the public renderer activates only after an explicit V3 publication. */
export function prepareWebsiteV3StateForPublication(
  state: DraftStatePayload,
): DraftStatePayload {
  return {
    ...state,
    pages: state.pages.map((page) => ({
      ...page,
      appearance_overrides: {
        ...page.appearance_overrides,
        [REQUIRED_PUBLICATION_MARKER]: REQUIRED_RENDERER_VERSION,
      },
    })),
  };
}

function incompatibleRuntimeError(): Error {
  return new Error(
    "Le site public n’est pas compatible avec Website V3. La création et la publication sont suspendues pour éviter un site incomplet. Déployez d’abord la version compatible de Foody Web, puis réessayez.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
