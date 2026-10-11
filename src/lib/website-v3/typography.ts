import type { ExtraFont, TypographyOverrides } from "@/lib/api";

/** Keeps uploaded families and variants when adding a font to the library. */
export function mergeFontLibrary(
  base: ExtraFont[] = [],
  additions: ExtraFont[] = [],
): ExtraFont[] {
  const fonts = new Map(base.map((font) => [font.family, font]));
  for (const font of additions) {
    const previous = fonts.get(font.family);
    const faces = new Map(
      (
        previous?.faces ??
        (previous?.url ? [{ url: previous.url, format: previous.format }] : [])
      ).map((face) => [face.url, face]),
    );
    for (const face of font.faces ??
      (font.url ? [{ url: font.url, format: font.format }] : []))
      faces.set(face.url, face);
    fonts.set(font.family, {
      ...previous,
      ...font,
      weights: Array.from(
        new Set([...(previous?.weights ?? []), ...font.weights]),
      ).sort((a, b) => a - b),
      ...(faces.size ? { faces: Array.from(faces.values()) } : {}),
    });
  }
  return Array.from(fonts.values());
}

/** Resolves page typography without discarding inherited roles or uploaded sources. */
export function mergeTypography(
  base: TypographyOverrides = {},
  page: TypographyOverrides = {},
): TypographyOverrides {
  const roles = { ...base.roles };
  for (const key of Object.keys(page.roles ?? {}) as Array<
    keyof typeof roles
  >) {
    const override = { ...page.roles?.[key] };
    for (const field of Object.keys(override) as Array<keyof typeof override>) {
      if (override[field] === undefined) delete override[field];
    }
    roles[key] = { ...roles[key], ...override };
  }
  return {
    ...base,
    ...page,
    site: { ...base.site, ...page.site },
    roles,
    extraFonts: mergeFontLibrary(base.extraFonts, page.extraFonts),
  };
}
