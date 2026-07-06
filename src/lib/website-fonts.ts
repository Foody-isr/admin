// Curated Google-Fonts library offered in the website builder's typography
// controls (hero name font, per-role overrides, and section font pickers).
//
// KEEP IN SYNC with foodyweb/lib/themes/curatedFonts.ts — that file owns the
// runtime loading on the public site; this one owns the admin picker UI. Same
// families, same weights. Custom-uploaded fonts (future) are handled separately.

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';

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

/** Standard type-style names for the numeric font weights (Google Fonts naming). */
export const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans Serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Manuscrites',
  mono: 'Monospace',
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

/** True when the family is part of the shared curated list (vs a restaurant's
 *  own Google Fonts addition stored in typography.extraFonts). */
export function isCuratedFont(family: string): boolean {
  return Boolean(FONT_BY_FAMILY[family]);
}

/** Declared weights for a curated family, undefined for non-curated ones. */
export function curatedFontWeights(family: string): number[] | undefined {
  return FONT_BY_FAMILY[family]?.weights;
}

/** Sample strings rendered by font previews (pickers + Google Fonts browser). */
export const FONT_PREVIEW_LATIN = 'Tonight’s Menu · Salade 35';
export const FONT_PREVIEW_HEBREW = ' תפריט הערב';

/** One uploaded file = one @font-face at a weight/style (mirrors api.ts FontFace). */
export interface CustomFontFace {
  url: string;
  format?: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

/** A custom (uploaded) font's @font-face source(s). `faces` covers multi-variant
 *  families; `url`/`format` is the single-file legacy shape. Passed to the loaders
 *  below so they inject @font-face(s) instead of building a Google Fonts URL. */
export interface CustomFontSource {
  url?: string;
  format?: string;
  faces?: CustomFontFace[];
}

/** True when a source carries at least one uploaded face. */
export function hasCustomFace(s?: CustomFontSource): boolean {
  return Boolean(s && (s.url || (s.faces && s.faces.length > 0)));
}

// Guest app origin — its /api/font proxy streams uploaded fonts with open CORS,
// so the builder preview (admin origin) can load them regardless of S3 CORS.
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

/** Route an uploaded font's S3 URL through the guest app's /api/font proxy so
 *  the builder preview's cross-origin @font-face isn't blocked by S3 CORS. Only
 *  our own bucket URLs are rewritten. */
function fontSrcUrl(url: string): string {
  if (/amazonaws\.com\//i.test(url) || url.includes('/fonts/')) {
    return `${WEB_ORIGIN}/api/font?u=${encodeURIComponent(url)}`;
  }
  return url;
}

/** Inject the @font-face(s) for a custom (uploaded) font family (idempotent).
 *  A multi-variant family emits one @font-face per face (each with its weight/
 *  style) under the same family name, so the browser picks the right file for a
 *  requested weight. Shared by the preview and builder loaders. */
export function loadCustomFont(family: string, source: CustomFontSource): void {
  if (typeof document === 'undefined' || !family) return;
  const faces: CustomFontFace[] = source.faces?.length
    ? source.faces
    : source.url
      ? [{ url: source.url, format: source.format }]
      : [];
  if (faces.length === 0) return;
  const id = `cf-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const css = faces
    .map((f) => {
      const fmt = f.format ? ` format("${f.format}")` : '';
      const w = f.weight ? `font-weight:${f.weight};` : '';
      const st = f.style === 'italic' ? 'font-style:italic;' : '';
      return `@font-face{font-family:"${family}";src:url("${fontSrcUrl(f.url)}")${fmt};${w}${st}font-display:swap;}`;
    })
    .join('');
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

// ── Filename-based variant detection (multi-file custom-font upload) ─────────
// Maps weight/style keywords (FR + EN) found in a font file's name to a numeric
// weight, so uploading "Eros-Leger.otf" + "Eros-Solide.otf" auto-fills 300/700.
// The owner can override per file in the picker.

const WEIGHT_KEYWORDS: { re: RegExp; weight: number }[] = [
  { re: /(extra[\s_-]?black|ultra[\s_-]?black)/i, weight: 900 },
  { re: /(extra[\s_-]?bold|ultra[\s_-]?bold|extra[\s_-]?gras)/i, weight: 800 },
  { re: /(semi[\s_-]?bold|demi[\s_-]?bold|demi[\s_-]?gras)/i, weight: 600 },
  { re: /(extra[\s_-]?light|ultra[\s_-]?light|extra[\s_-]?l[ée]ger)/i, weight: 200 },
  { re: /(black|heavy|noir)/i, weight: 900 },
  { re: /(bold|gras|solide)/i, weight: 700 },
  { re: /(medium|m[ée]dium|moyen)/i, weight: 500 },
  { re: /(thin|maigre|hairline)/i, weight: 100 },
  { re: /(light|l[ée]ger|leger)/i, weight: 300 },
  { re: /(regular|normal|roman|book|r[ée]gulier)/i, weight: 400 },
];

/** Guess a font file's weight + style from its filename. Defaults to 400/normal
 *  when no keyword matches. */
export function detectFontVariant(filename: string): { weight: number; style: 'normal' | 'italic' } {
  const name = filename.replace(/\.[^.]+$/, '');
  const style: 'normal' | 'italic' = /(italic|oblique|italique)/i.test(name) ? 'italic' : 'normal';
  const hit = WEIGHT_KEYWORDS.find((k) => k.re.test(name));
  return { weight: hit?.weight ?? 400, style };
}

// Raw-sfnt signatures we can parse (TTF 0x00010000, 'OTTO', 'true', 'typ1').
// WOFF/WOFF2 are compressed containers we skip (fall back to the filename).
const SFNT_SIGS = new Set([0x00010000, 0x4f54544f, 0x74727565, 0x74797031]);

/** Read the true weight (OS/2 `usWeightClass`) and italic flag straight out of a
 *  TTF/OTF file — filenames lie, font tables don't. Returns {} for WOFF/WOFF2
 *  (compressed) or any parse error so callers fall back to the filename guess. */
export async function readFontMetadata(file: File): Promise<{ weight?: number; italic?: boolean }> {
  try {
    const buf = await file.arrayBuffer();
    if (buf.byteLength < 12) return {};
    const dv = new DataView(buf);
    if (!SFNT_SIGS.has(dv.getUint32(0))) return {};
    const numTables = dv.getUint16(4);
    let os2 = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (rec + 16 > buf.byteLength) break;
      const tag = String.fromCharCode(
        dv.getUint8(rec), dv.getUint8(rec + 1), dv.getUint8(rec + 2), dv.getUint8(rec + 3),
      );
      if (tag === 'OS/2') { os2 = dv.getUint32(rec + 8); break; }
    }
    if (os2 < 0 || os2 + 64 > buf.byteLength) return {};
    let weight = dv.getUint16(os2 + 4);            // usWeightClass
    const italic = (dv.getUint16(os2 + 62) & 0x01) !== 0; // fsSelection bit 0
    if (weight >= 1 && weight <= 9) weight *= 100; // legacy 1-9 scale
    if (weight < 100 || weight > 900) return { italic };
    return { weight: Math.round(weight / 100) * 100, italic };
  } catch {
    return {};
  }
}

/** Detect a file's weight/style, preferring the real font metadata and falling
 *  back to the filename keywords, then 400/normal. */
export async function detectFontVariantFromFile(
  file: File,
): Promise<{ weight: number; style: 'normal' | 'italic' }> {
  const [meta, fromName] = [await readFontMetadata(file), detectFontVariant(file.name)];
  return {
    weight: meta.weight ?? fromName.weight,
    style: meta.italic ? 'italic' : fromName.style,
  };
}

/** Suggest a family name from a set of uploaded filenames: the longest common
 *  prefix, with weight/style keywords and separators stripped and words
 *  title-cased. Editable by the owner. */
export function suggestFamilyName(filenames: string[]): string {
  if (filenames.length === 0) return '';
  const bases = filenames.map((f) => f.replace(/\.[^.]+$/, ''));
  let prefix = bases[0];
  for (const b of bases.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < b.length && prefix[i].toLowerCase() === b[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  const source = prefix.length >= 3 ? prefix : bases[0];
  const cleaned = source
    .replace(/\.[^.]+$/, '')
    .replace(
      /(extra[\s_-]?black|ultra[\s_-]?black|extra[\s_-]?bold|ultra[\s_-]?bold|semi[\s_-]?bold|demi[\s_-]?bold|extra[\s_-]?light|ultra[\s_-]?light|italic|oblique|italique|black|heavy|noir|bold|gras|solide|medium|m[ée]dium|moyen|thin|maigre|light|l[ée]ger|leger|regular|normal|roman|book)/gi,
      ' ',
    )
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Inject a tiny text-subset stylesheet (weight 400, family name + samples) so
 *  preview rows render in their own face — cheap enough for long scrolling
 *  lists. All call sites share the same subset so the link is loaded once.
 *  Custom (uploaded) fonts load their whole @font-face instead of a subset. */
export function loadFontPreview(family: string, hebrew: boolean, custom?: CustomFontSource): void {
  if (typeof document === 'undefined' || !family) return;
  if (hasCustomFace(custom)) {
    loadCustomFont(family, custom!);
    return;
  }
  const id = `gf-preview-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const text = family + FONT_PREVIEW_LATIN + (hebrew ? FONT_PREVIEW_HEBREW : '');
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}&display=swap`;
  document.head.appendChild(link);
}

/** Inject a Google Fonts stylesheet for a family (idempotent) — used for live
 *  previews inside the builder. Curated families load their declared weights;
 *  for extra fonts pass the weights stored on the restaurant's ExtraFont entry
 *  (the css2 endpoint 400s when asked for a weight a family lacks). */
export function loadWebsiteFont(family: string, weights?: number[], custom?: CustomFontSource): void {
  if (typeof document === 'undefined' || !family) return;
  if (hasCustomFace(custom)) {
    loadCustomFont(family, custom!);
    return;
  }
  const def = FONT_BY_FAMILY[family];
  const id = `gf-builder-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
  const w = def?.weights ?? weights ?? [];
  const href = w.length
    ? `${base}:wght@${[...w].sort((a, b) => a - b).join(';')}&display=swap`
    : `${base}&display=swap`;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
