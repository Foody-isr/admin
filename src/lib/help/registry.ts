// Central registry mapping each foodyadmin feature to its help metadata: the
// in-app intro strings (i18n keys) and the foodylanding Help article it links
// to. Rolling help out to a new page = add an entry here + author the article.
//
// The only cross-repo coupling is the (landingTopic, landingSlug) pair, which
// must match a foodylanding article at
//   src/content/help/<lang>/<landingTopic>/<landingSlug>.mdx

export type FeatureHelp = {
  /** Stable key used in <FeatureIntro feature="..."/> and the dismiss storage key. */
  key: string;
  /** foodylanding help topic directory. */
  landingTopic: string;
  /** foodylanding help article slug (filename without .mdx). */
  landingSlug: string;
  /** i18n key for the intro banner title. */
  titleKey: string;
  /** i18n key for the one-to-two line "what it is / how to use it" blurb. */
  blurbKey: string;
};

/** Base URL of the foodylanding Help center. Configurable per environment. */
export const HELP_BASE_URL =
  process.env.NEXT_PUBLIC_HELP_BASE_URL || 'https://foody-pos.co.il';

export const FEATURE_HELP: Record<string, FeatureHelp> = {
  availability: {
    key: 'availability',
    landingTopic: 'kitchen',
    landingSlug: 'availability',
    titleKey: 'helpAvailabilityTitle',
    blurbKey: 'helpAvailabilityBlurb',
  },
  stock: {
    key: 'stock',
    landingTopic: 'kitchen',
    landingSlug: 'stock-management',
    titleKey: 'helpStockTitle',
    blurbKey: 'helpStockBlurb',
  },
  prep: {
    key: 'prep',
    landingTopic: 'kitchen',
    landingSlug: 'preparations',
    titleKey: 'helpPrepTitle',
    blurbKey: 'helpPrepBlurb',
  },
  items: {
    key: 'items',
    landingTopic: 'menu',
    landingSlug: 'categories-and-items',
    titleKey: 'helpItemsTitle',
    blurbKey: 'helpItemsBlurb',
  },
  orders: {
    key: 'orders',
    landingTopic: 'orders',
    landingSlug: 'managing-orders',
    titleKey: 'helpOrdersTitle',
    blurbKey: 'helpOrdersBlurb',
  },
};

const HELP_LANGS = ['en', 'fr', 'he'];

/** Builds a locale-aware deep link to a Help article (falls back to en). */
export function helpArticleUrl(topic: string, slug: string, lang: string): string {
  const l = HELP_LANGS.includes(lang) ? lang : 'en';
  return `${HELP_BASE_URL}/${l}/help/${topic}/${slug}`;
}
