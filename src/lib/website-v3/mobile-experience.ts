export type MobileLocale = "en" | "fr" | "he";
export type MobileCopy = Partial<Record<MobileLocale, string>>;
export type InstallPlacement = "home" | "confirmation" | "menu";

export type InstallCopy = {
  title?: MobileCopy;
  subtitle?: MobileCopy;
  action?: MobileCopy;
};

export const mobileTargets = ["home", "order", "loyalty", "orders", "catering", "more", "page", "url"] as const;
export const mobileIcons = ["home", "order", "gift", "drink", "receipt", "bag", "info", "heart", "more", "star", "link"] as const;
export type MobileNavigationColors = Partial<Record<
  "background" | "border" | "foreground" | "icon" | "active_background" | "active_foreground" | "active_icon" | "accent",
  string
>>;

export type MobileNavigationItem = {
  id: string;
  target: (typeof mobileTargets)[number];
  value?: string;
  placement: "bar" | "more" | "hidden";
  group?: string;
  icon?: (typeof mobileIcons)[number];
  label?: MobileCopy;
};

export type MobileHomeSection = {
  layout: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type MobileAppHome = {
  enabled: boolean;
  hero_height?: 66 | 76 | 88;
  sticky_order?: boolean;
  order_label?: MobileCopy;
  hero?: MobileHomeSection;
  featured?: MobileHomeSection;
  featured_enabled?: boolean;
  featured_from?: string;
  featured_through?: string;
};

export type MobileExperience = {
  version: 1;
  home?: MobileAppHome;
  installation: {
    home: boolean;
    confirmation: boolean;
    menu: boolean;
    benefit: "menu" | "loyalty";
    copy: InstallCopy;
    placement_copy?: Partial<Record<InstallPlacement, InstallCopy>>;
  };
  navigation: {
    enabled: boolean;
    visibility: "standalone";
    style: "floating" | "docked";
    colors?: MobileNavigationColors;
    items: MobileNavigationItem[];
  };
  more: {
    title?: MobileCopy;
    groups: { id: string; title: MobileCopy }[];
    banner?: { enabled: boolean; title?: MobileCopy; subtitle?: MobileCopy; image_url?: string };
  };
};

export type MobilePreview = {
  mode: "browser" | "standalone";
  screen: "page" | "home" | "more" | "confirmation";
  locale: MobileLocale;
};

const defaultGroupTitles = {
  restaurant: { en: "Restaurant", fr: "Le restaurant", he: "המסעדה" },
  account: { en: "My account", fr: "Mon compte", he: "החשבון שלי" },
};

/** Defaults for the editor, before an explicit mobile configuration is saved. */
export function defaultMobileExperience(): MobileExperience {
  return {
    version: 1,
    installation: { home: false, confirmation: true, menu: true, benefit: "menu", copy: {} },
    navigation: {
      enabled: false,
      visibility: "standalone",
      style: "floating",
      items: [
        { id: "home", target: "home", placement: "bar" },
        { id: "order", target: "order", placement: "bar" },
        { id: "loyalty", target: "loyalty", placement: "bar" },
        { id: "more", target: "more", placement: "bar" },
        { id: "catering", target: "catering", placement: "more", group: "restaurant" },
        { id: "orders", target: "orders", placement: "more", group: "account" },
      ],
    },
    more: {
      groups: Object.entries(defaultGroupTitles).map(([id, title]) => ({ id, title: { ...title } })),
    },
  };
}

/** Reads a saved configuration while preserving optional fields from earlier drafts. */
export function readMobileExperience(value: unknown): MobileExperience | undefined {
  if (!value || typeof value !== "object") return;
  const saved = value as Partial<MobileExperience>;
  if (saved.version !== 1) return;
  const defaults = defaultMobileExperience();
  return {
    version: 1,
    home: saved.home,
    installation: { ...defaults.installation, ...saved.installation },
    navigation: {
      ...defaults.navigation,
      ...saved.navigation,
      visibility: "standalone",
      items: Array.isArray(saved.navigation?.items) ? saved.navigation.items : [],
    },
    more: {
      ...defaults.more,
      ...saved.more,
      groups: Array.isArray(saved.more?.groups) ? saved.more.groups : [],
    },
  };
}

import type { DraftStatePayload } from "./types";


/** Checks destinations against the pages that will be published in the same draft. */
export function mobilePublicationIssue(state: DraftStatePayload): string | undefined {
  const layout = state.config.nav_layout as { mobile_experience?: unknown } | undefined;
  const model = readMobileExperience(layout?.mobile_experience);
  if (!model) return;
  for (const item of model.navigation.items) {
    if (item.placement === "hidden") continue;
    if (item.target === "page" && !state.pages.some(page => page.slug === item.value)) return "editorMobileMissingPage";
    if (item.target === "url" && !isSecureUrl(item.value)) return "editorMobileInvalidUrl";
  }
  const image = model.more.banner?.image_url;
  if (image && !isSecureUrl(image)) return "editorMobileInvalidUrl";
  const home = model.home;
  if (home?.enabled && home.featured_enabled !== false &&
    home.featured_from && home.featured_through && home.featured_from > home.featured_through) {
    return "editorMobileHomeInvalidPeriod";
  }
}

function isSecureUrl(value?: string): boolean {
  if (!value || !value.startsWith("https://") || /[\\\s]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return !!parsed.hostname && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
