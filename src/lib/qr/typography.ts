import type { CSSProperties } from 'react';
import type { ExtraFont, QrCardTypography, QrSectionKey, QrSectionStyle } from '@/lib/api';
import {
  curatedFontWeights,
  fontSupportsHebrew,
  loadWebsiteFont,
  type CustomFontSource,
} from '@/lib/website-fonts';

/**
 * Per-section text styling for printed QR cards.
 *
 * All QR card presentation logic lives here; `QrCard.tsx` stays a thin
 * renderer that asks this module for a section's final CSS. The four
 * templates each pass their own width-derived base style, and the
 * restaurant's overrides are layered on top — so a single shared config
 * scales correctly from the 90mm round sticker to the 178mm poster.
 */

/** Order matters: this drives the row order in the editor. */
export const QR_SECTIONS: QrSectionKey[] = ['brand', 'title', 'subtitle', 'steps', 'table'];

/** The card's built-in stack, used by any section without a font override. */
export const QR_DEFAULT_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * A size multiplier outside this range either renders illegibly small or
 * overflows the physical card bounds, which only becomes visible after the
 * restaurant has paid to print a sheet. Clamped on both read and write.
 */
export const SIZE_MULT_MIN = 0.5;
export const SIZE_MULT_MAX = 2;

/** Letter-spacing bounds, em. Negative tracking is legitimate for tight display faces. */
export const TRACKING_MIN = -0.05;
export const TRACKING_MAX = 0.4;

export const QR_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function clampSizeMult(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return clamp(v, SIZE_MULT_MIN, SIZE_MULT_MAX);
}

/**
 * Layers a section's overrides onto the template's built-in style.
 *
 * `base` is whatever the template already computed (font size derived from the
 * card width, its own weight, its own casing). Any field the restaurant has not
 * set is left exactly as the template had it, which is what makes this change
 * invisible until someone actually touches a control.
 *
 * `textColor` is the card's global colour: a section with no colour override
 * inherits it, so the existing single-colour behaviour still holds.
 */
export function sectionStyle(
  typography: QrCardTypography | null | undefined,
  key: QrSectionKey,
  base: CSSProperties,
): CSSProperties {
  const o = typography?.sections?.[key];
  if (!o) return base;

  const out: CSSProperties = { ...base };

  if (o.font) out.fontFamily = `'${o.font}', ${QR_DEFAULT_FONT_STACK}`;

  if (typeof o.sizeMult === 'number' && typeof base.fontSize === 'number') {
    out.fontSize = base.fontSize * clampSizeMult(o.sizeMult);
  }
  if (typeof o.weight === 'number') out.fontWeight = o.weight;
  if (o.color) out.color = o.color;
  if (o.transform) out.textTransform = o.transform;
  if (typeof o.tracking === 'number') {
    out.letterSpacing = `${clamp(o.tracking, TRACKING_MIN, TRACKING_MAX)}em`;
  }

  return out;
}

/** The @font-face source for an uploaded family, or undefined for Google/curated
 *  families (which load by name). Mirrors the website builder's resolution. */
export function fontSourceOf(ef?: Pick<ExtraFont, 'url' | 'format' | 'faces'>): CustomFontSource | undefined {
  if (!ef) return undefined;
  if (ef.faces && ef.faces.length > 0) return { faces: ef.faces };
  if (ef.url) return { url: ef.url, format: ef.format };
  return undefined;
}

/** Every family referenced by at least one section. */
export function usedFamilies(typography: QrCardTypography | null | undefined): string[] {
  const out: string[] = [];
  for (const key of QR_SECTIONS) {
    const f = typography?.sections?.[key]?.font;
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * Injects the stylesheets for every family the card uses. Idempotent — safe to
 * call on each render. Returns a promise that settles once the browser reports
 * the faces are ready, which the print sheet must await: Chrome will otherwise
 * rasterize the PDF against the fallback stack.
 */
export async function loadQrFonts(typography: QrCardTypography | null | undefined): Promise<void> {
  const families = usedFamilies(typography);
  if (families.length === 0) return;

  for (const family of families) {
    const extra = typography?.extraFonts?.find((f) => f.family === family);
    loadWebsiteFont(family, extra?.weights, fontSourceOf(extra));
  }

  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // A font that fails to load is not worth blocking a print on — the card
    // still renders in the fallback stack.
  }
}

/** Weights the family actually ships, so the picker cannot offer a weight that
 *  silently renders as a synthesized (ugly) faux-bold. */
export function weightsFor(family: string | undefined, extraFonts: ExtraFont[]): number[] {
  if (!family) return QR_WEIGHTS;
  const extra = extraFonts.find((f) => f.family === family);
  if (extra?.weights?.length) return [...extra.weights].sort((a, b) => a - b);
  const curated = curatedFontWeights(family);
  if (curated?.length) return [...curated].sort((a, b) => a - b);
  return QR_WEIGHTS;
}

/** The available weight closest to `target` — used when switching to a family
 *  that lacks the currently selected weight. */
export function nearestWeight(avail: number[], target: number): number {
  return avail.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), avail[0]);
}

/** Whether `family` can render Hebrew. A Latin-only face silently falls back to
 *  a system font for Hebrew glyphs, which prints as a mismatched card. */
export function familySupportsHebrew(family: string | undefined, extraFonts: ExtraFont[]): boolean {
  if (!family) return true;
  const extra = extraFonts.find((f) => f.family === family);
  if (extra) return extra.supportsHebrew;
  return fontSupportsHebrew(family);
}

/**
 * Drops defaulted values so the persisted blob stays minimal and the editor's
 * dirty-check does not fire on a no-op change. Returns null when nothing is
 * overridden, which clears the column server-side.
 */
export function normalizeQrTypography(t: QrCardTypography | null | undefined): QrCardTypography | null {
  if (!t) return null;
  const sections: Partial<Record<QrSectionKey, QrSectionStyle>> = {};

  for (const key of QR_SECTIONS) {
    const o = t.sections?.[key];
    if (!o) continue;
    const clean: QrSectionStyle = {};
    if (o.font) clean.font = o.font;
    if (typeof o.sizeMult === 'number' && o.sizeMult !== 1) clean.sizeMult = clampSizeMult(o.sizeMult);
    if (typeof o.weight === 'number') clean.weight = o.weight;
    if (o.color) clean.color = o.color;
    if (o.transform) clean.transform = o.transform;
    if (typeof o.tracking === 'number') clean.tracking = clamp(o.tracking, TRACKING_MIN, TRACKING_MAX);
    if (Object.keys(clean).length > 0) sections[key] = clean;
  }

  const out: QrCardTypography = {};
  if (Object.keys(sections).length > 0) out.sections = sections;
  // extraFonts is the restaurant's font library — keep it even when no section
  // currently uses one, so an uploaded font is not lost by clearing a style.
  if (t.extraFonts && t.extraFonts.length > 0) out.extraFonts = t.extraFonts;

  return Object.keys(out).length > 0 ? out : null;
}
