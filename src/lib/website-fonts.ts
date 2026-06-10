// Curated Google-Fonts library offered in the website builder's typography
// controls (hero name font, per-role overrides, and section font pickers).
//
// KEEP IN SYNC with foodyweb/lib/themes/curatedFonts.ts — that file owns the
// runtime loading on the public site; this one owns the admin picker UI. Same
// families, same weights. Custom-uploaded fonts (future) are handled separately.

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting';

export interface CuratedFont {
  family: string;
  category: FontCategory;
  weights: number[];
  /** True when the family ships Hebrew glyphs (safe for RTL menus). */
  supportsHebrew: boolean;
}

export const WEBSITE_FONTS: CuratedFont[] = [
  // ── Sans ──────────────────────────────────────────────────────────
  { family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Poppins', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Montserrat', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Raleway', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Nunito Sans', category: 'sans', weights: [400, 600, 700, 800], supportsHebrew: false },
  { family: 'Open Sans', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: true },
  { family: 'Work Sans', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'DM Sans', category: 'sans', weights: [400, 500, 700], supportsHebrew: false },
  { family: 'Manrope', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Outfit', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Karla', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Mulish', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Rubik', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: true },
  { family: 'Heebo', category: 'sans', weights: [400, 500, 600, 700, 800], supportsHebrew: true },
  { family: 'Assistant', category: 'sans', weights: [400, 500, 600, 700], supportsHebrew: true },
  // ── Serif ─────────────────────────────────────────────────────────
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800], supportsHebrew: false },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Merriweather', category: 'serif', weights: [400, 700], supportsHebrew: false },
  { family: 'Bitter', category: 'serif', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Crimson Text', category: 'serif', weights: [400, 600, 700], supportsHebrew: false },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'DM Serif Display', category: 'serif', weights: [400], supportsHebrew: false },
  { family: 'Frank Ruhl Libre', category: 'serif', weights: [400, 500, 700, 900], supportsHebrew: true },
  { family: 'David Libre', category: 'serif', weights: [400, 500, 700], supportsHebrew: true },
  { family: 'Suez One', category: 'serif', weights: [400], supportsHebrew: true },
  // ── Display ───────────────────────────────────────────────────────
  { family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Bebas Neue', category: 'display', weights: [400], supportsHebrew: false },
  { family: 'Anton', category: 'display', weights: [400], supportsHebrew: false },
  { family: 'Abril Fatface', category: 'display', weights: [400], supportsHebrew: false },
  { family: 'Cinzel', category: 'display', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Secular One', category: 'display', weights: [400], supportsHebrew: true },
  // ── Handwriting / Script ──────────────────────────────────────────
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Great Vibes', category: 'handwriting', weights: [400], supportsHebrew: false },
  { family: 'Pacifico', category: 'handwriting', weights: [400], supportsHebrew: false },
  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700], supportsHebrew: false },
  { family: 'Sacramento', category: 'handwriting', weights: [400], supportsHebrew: false },
  { family: 'Amatic SC', category: 'handwriting', weights: [400, 700], supportsHebrew: true },
];

/** Flat list of family names, ordered as above. Replaces the old hard-coded FONT_OPTIONS. */
export const WEBSITE_FONT_FAMILIES: string[] = WEBSITE_FONTS.map((f) => f.family);

const FONT_BY_FAMILY: Record<string, CuratedFont> = Object.fromEntries(
  WEBSITE_FONTS.map((f) => [f.family, f]),
);

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans Serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Manuscrites',
};

/** Fonts grouped by category, preserving the declared order — for <optgroup> menus. */
export function fontsByCategory(): { category: FontCategory; fonts: CuratedFont[] }[] {
  const order: FontCategory[] = ['sans', 'serif', 'display', 'handwriting'];
  return order.map((category) => ({
    category,
    fonts: WEBSITE_FONTS.filter((f) => f.category === category),
  }));
}

export function fontSupportsHebrew(family: string): boolean {
  return FONT_BY_FAMILY[family]?.supportsHebrew ?? false;
}

/** Inject a Google Fonts stylesheet for a curated family (idempotent) — used for
 *  live previews inside the builder. */
export function loadWebsiteFont(family: string): void {
  if (typeof document === 'undefined' || !family) return;
  const def = FONT_BY_FAMILY[family];
  const id = `gf-builder-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
  const weights = def?.weights ?? [];
  const href = weights.length
    ? `${base}:wght@${[...weights].sort((a, b) => a - b).join(';')}&display=swap`
    : `${base}&display=swap`;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
