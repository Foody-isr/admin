'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type {
  WebsiteConfig, ThemeCatalog, TypographyPairingEntry,
  TypographyOverrides, TypographyRoleKey, ExtraFont,
} from '@/lib/api';
import { uploadWebsiteFont, deleteWebsiteFonts } from '@/lib/api';
import {
  loadWebsiteFont, unloadCustomFont, curatedFontWeights, WEIGHT_LABELS,
  type CustomFontSource,
} from '@/lib/website-fonts';
import { FontSelect } from './FontSelect';
import { MyFontsManager } from './MyFontsManager';

/** A custom (uploaded) font carries its own faces/url; Google picks don't. */
function isCustomFont(f: ExtraFont): boolean {
  return Boolean(f.url || (f.faces && f.faces.length > 0));
}

/** S3 keys of every file backing a custom font (for deletion). */
function fontKeys(f: ExtraFont): string[] {
  return (f.faces ?? []).map((face) => face.key).filter((k): k is string => Boolean(k));
}

function loadGoogleFont(family: string, weights: number[]) {
  if (typeof document === 'undefined') return;
  const id = `gf-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  const familyParam = family.replace(/\s+/g, '+');
  const weightParam = weights.length > 0 ? `:wght@${[...weights].sort((a, b) => a - b).join(';')}` : '';
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}${weightParam}&display=swap`;
  document.head.appendChild(link);
}

function FontSample({
  pairing, kind, dir,
}: {
  pairing: TypographyPairingEntry['pairing'];
  kind: 'display' | 'body';
  dir: 'ltr' | 'rtl';
}) {
  const def =
    dir === 'rtl'
      ? kind === 'display' ? pairing.displayHebrew : pairing.bodyHebrew
      : kind === 'display' ? pairing.displayLatin : pairing.bodyLatin;

  const text =
    dir === 'rtl'
      ? kind === 'display' ? 'תפריט הערב' : 'מנה צמחונית עם ירקות עונתיים, רוטב טחינה'
      : kind === 'display' ? 'Tonight’s Menu' : 'Seasonal greens, tahini, slow-roasted pepper.';

  return (
    <div
      dir={dir}
      style={{
        fontFamily: `"${def.family}", system-ui, sans-serif`,
        fontWeight: kind === 'display' ? Math.max(...def.weights) : Math.min(...def.weights),
        fontSize: kind === 'display' ? '1rem' : '0.7rem',
        lineHeight: kind === 'display' ? 1.15 : 1.4,
      }}
      className={kind === 'display' ? 'mb-0.5' : 'text-fg-secondary line-clamp-1'}
    >
      {text}
    </div>
  );
}

// Menu text roles exposed for per-section font + size overrides. Mirrors the
// roles foodyweb applies in lib/themes/typography.ts. `caseControl` marks the
// roles offering the Auto / Majuscules / Normale case picker (prices are
// numbers, casing is meaningless there).
// `defaultWeight` is the weight the theme renders each role at (mirrors the
// baseWeight foodyweb passes to roleTextStyle). Used to snap a custom font to
// its nearest real cut on pick, so a 700-title role doesn't chase a weight the
// uploaded font lacks and fall back to a thinner face.
const ROLES: { key: TypographyRoleKey; label: string; sample: string; family: 'display' | 'body'; caseControl?: boolean; defaultWeight: number }[] = [
  { key: 'categoryTitle', label: 'Titres de catégories', sample: 'Salades', family: 'display', caseControl: true, defaultWeight: 700 },
  { key: 'itemName', label: 'Noms des plats', sample: 'Salade César', family: 'display', caseControl: true, defaultWeight: 600 },
  { key: 'itemPrice', label: 'Prix', sample: '₪35.00', family: 'display', defaultWeight: 600 },
  { key: 'itemDescription', label: 'Descriptions', sample: 'Roquette, parmesan, croûtons', family: 'body', caseControl: true, defaultWeight: 400 },
];

/** The available weight closest to `target` (custom fonts ship a finite set). */
function nearestWeight(avail: number[], target: number): number {
  return avail.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), avail[0]);
}

// Case picker options. Auto (absent) keeps the theme's own behavior — e.g. a
// dark custom palette renders category titles in capitals by default.
const CASE_OPTIONS: { value: 'uppercase' | 'none' | undefined; label: string }[] = [
  { value: undefined, label: 'Auto' },
  { value: 'uppercase', label: 'Majuscules' },
  { value: 'none', label: 'Normale' },
];

// Drop defaulted values so the saved blob stays minimal (and the editor's
// autosave snapshot stays stable when nothing meaningful changed).
function normalizeTypography(t: TypographyOverrides): TypographyOverrides | null {
  const out: TypographyOverrides = {};
  const roles: NonNullable<TypographyOverrides['roles']> = {};
  for (const r of ROLES) {
    const o = t.roles?.[r.key];
    if (!o) continue;
    const clean: { font?: string; sizeMult?: number; weight?: number; transform?: 'uppercase' | 'none' } = {};
    if (o.font) clean.font = o.font;
    if (typeof o.sizeMult === 'number' && o.sizeMult !== 1) clean.sizeMult = o.sizeMult;
    if (typeof o.weight === 'number') clean.weight = o.weight;
    if (o.transform === 'uppercase' || o.transform === 'none') clean.transform = o.transform;
    if (Object.keys(clean).length > 0) roles[r.key] = clean;
  }
  if (Object.keys(roles).length > 0) out.roles = roles;
  if (t.extraFonts && t.extraFonts.length > 0) out.extraFonts = t.extraFonts;
  if (typeof t.heroWeight === 'number') out.heroWeight = t.heroWeight;
  return Object.keys(out).length > 0 ? out : null;
}

function pct(mult: number): string {
  return `${Math.round(mult * 100)}%`;
}

/** Build the @font-face source for a custom (uploaded) font entry: multi-variant
 *  faces when present, else the single-file url. Undefined for Google Fonts and
 *  curated families (they load by family name). Accepts an ExtraFont or a
 *  freshly picked font (same url/format/faces shape). */
function fontSourceOf(ef?: Pick<ExtraFont, 'url' | 'format' | 'faces'>): CustomFontSource | undefined {
  if (!ef) return undefined;
  if (ef.faces && ef.faces.length > 0) return { faces: ef.faces };
  if (ef.url) return { url: ef.url, format: ef.format };
  return undefined;
}

/** Weight (style) picker for one section — only offers weights the effective
 *  family actually ships ("Auto" keeps the section's built-in weight). */
function WeightSelect({
  value, weights, onChange,
}: {
  value?: number;
  weights: number[];
  onChange: (w?: number) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="w-[104px] shrink-0 px-2 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      style={value ? { fontWeight: value } : undefined}
    >
      <option value="">Auto</option>
      {weights.map((w) => (
        <option key={w} value={w} style={{ fontWeight: w }}>
          {WEIGHT_LABELS[w] ?? w}
        </option>
      ))}
    </select>
  );
}

type Props = {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  /** Restaurant scope for the custom-font upload endpoint. */
  restaurantId: number;
  /** Hero restaurant-name font (WebsiteConfig.hero_name_font, managed by the
   *  parent editor state) — edited here so every text section lives in one list. */
  heroNameFont: string;
  onHeroNameFontChange: (family: string) => void;
  /** Sample text for the hero row (the restaurant's name). */
  heroSample?: string;
};

export function TypographyPanel({
  config, catalog, onUpdate, restaurantId, heroNameFont, onHeroNameFontChange, heroSample,
}: Props) {
  const { t } = useI18n();
  const typo: TypographyOverrides = config.typography ?? {};
  const extraFonts = useMemo(() => typo.extraFonts ?? [], [typo.extraFonts]);
  const selectedPairing = catalog.typography_pairings.find((p) => p.id === config.pairing_id);
  const [stylesOpen, setStylesOpen] = useState(false);

  const fontsToLoad = useMemo(() => {
    const set = new Map<string, number[]>();
    for (const p of catalog.typography_pairings) {
      for (const def of [p.pairing.displayLatin, p.pairing.bodyLatin, p.pairing.displayHebrew, p.pairing.bodyHebrew]) {
        const existing = set.get(def.family) ?? [];
        set.set(def.family, Array.from(new Set([...existing, ...def.weights])));
      }
    }
    return Array.from(set.entries());
  }, [catalog]);

  useEffect(() => {
    fontsToLoad.forEach(([family, weights]) => loadGoogleFont(family, weights));
  }, [fontsToLoad]);

  function extraWeights(family: string): number[] | undefined {
    return extraFonts.find((f) => f.family === family)?.weights;
  }

  /** @font-face source for a custom (uploaded) font entry — multi-variant faces
   *  when present, else the single-file url. Undefined for Google Fonts. */
  function customSource(family: string): CustomFontSource | undefined {
    return fontSourceOf(extraFonts.find((f) => f.family === family));
  }

  // Load the fonts currently selected (per role + hero) so the in-panel
  // samples render in the chosen face.
  useEffect(() => {
    const families = ROLES.map((r) => typo.roles?.[r.key]?.font).concat(heroNameFont);
    for (const f of families) {
      if (!f) continue;
      const ef = extraFonts.find((x) => x.family === f);
      loadWebsiteFont(f, ef?.weights, fontSourceOf(ef));
    }
  }, [typo.roles, heroNameFont, extraFonts]);

  /** Persist the blob. Google picks are disposable, so an unreferenced one is
   *  pruned. Custom (uploaded) fonts are a persistent library — they are kept
   *  even when no section uses them, and only removed via the fonts manager. */
  function commit(next: TypographyOverrides, heroOverride?: string) {
    const hero = heroOverride ?? heroNameFont;
    const referenced = new Set<string>();
    for (const r of ROLES) {
      const f = next.roles?.[r.key]?.font;
      if (f) referenced.add(f);
    }
    if (hero) referenced.add(hero);
    const pruned = (next.extraFonts ?? []).filter((f) => isCustomFont(f) || referenced.has(f.family));
    onUpdate({ typography: normalizeTypography({ ...next, extraFonts: pruned }) });
  }

  function withExtra(picked?: ExtraFont): ExtraFont[] {
    return picked && !extraFonts.some((f) => f.family === picked.family)
      ? [...extraFonts, picked]
      : extraFonts;
  }

  /** Weights the effective family of a section actually ships — drives the
   *  style (weight) picker so we never request a weight the family lacks. */
  function availableWeights(family: string, roleFamily: 'display' | 'body', picked?: ExtraFont): number[] {
    if (family) {
      return curatedFontWeights(family) ?? picked?.weights ?? extraWeights(family) ?? [400, 700];
    }
    const def = roleFamily === 'display'
      ? selectedPairing?.pairing.displayLatin
      : selectedPairing?.pairing.bodyLatin;
    return def?.weights ?? [400, 700];
  }

  function setRoleFont(key: TypographyRoleKey, family: string, picked?: ExtraFont) {
    if (family) {
      const src = fontSourceOf(picked) ?? customSource(family);
      loadWebsiteFont(family, picked?.weights ?? extraWeights(family), src);
    }
    const role = ROLES.find((r) => r.key === key)!;
    const cur = typo.roles?.[key] ?? {};
    const avail = availableWeights(family, role.family, picked);
    // Keep an explicit weight the new family still ships; otherwise drop to Auto.
    let weight = cur.weight !== undefined && avail.includes(cur.weight) ? cur.weight : undefined;
    // Custom (uploaded) fonts ship a finite set of faces. Leaving Auto makes the
    // browser chase the role's theme weight (e.g. 700 for titles) the font may
    // not have, rendering a thinner fallback — so snap to the nearest real cut.
    if (weight === undefined && (fontSourceOf(picked) ?? customSource(family))) {
      weight = nearestWeight(avail, role.defaultWeight);
    }
    commit({
      ...typo,
      extraFonts: withExtra(picked),
      roles: { ...typo.roles, [key]: { ...cur, font: family, weight } },
    });
  }

  function setRoleSize(key: TypographyRoleKey, sizeMult: number) {
    commit({
      ...typo,
      roles: { ...typo.roles, [key]: { ...typo.roles?.[key], sizeMult } },
    });
  }

  function setRoleWeight(key: TypographyRoleKey, weight?: number) {
    commit({
      ...typo,
      roles: { ...typo.roles, [key]: { ...typo.roles?.[key], weight } },
    });
  }

  function setRoleTransform(key: TypographyRoleKey, transform?: 'uppercase' | 'none') {
    commit({
      ...typo,
      roles: { ...typo.roles, [key]: { ...typo.roles?.[key], transform } },
    });
  }

  function setHeroFont(family: string, picked?: ExtraFont) {
    if (family) {
      const src = fontSourceOf(picked) ?? customSource(family);
      loadWebsiteFont(family, picked?.weights ?? extraWeights(family), src);
    }
    onHeroNameFontChange(family);
    const avail = availableWeights(family, 'display', picked);
    let heroWeight = typo.heroWeight !== undefined && avail.includes(typo.heroWeight)
      ? typo.heroWeight
      : undefined;
    // Snap custom fonts to their nearest real cut (the hero name is a heading).
    if (heroWeight === undefined && (fontSourceOf(picked) ?? customSource(family))) {
      heroWeight = nearestWeight(avail, 700);
    }
    commit({ ...typo, extraFonts: withExtra(picked), heroWeight }, family);
  }

  function setHeroWeight(weight?: number) {
    commit({ ...typo, heroWeight: weight });
  }

  // ── Custom-font library management ─────────────────────────────────────────
  const customFonts = useMemo(() => extraFonts.filter(isCustomFont), [extraFonts]);

  /** How many roles (+ hero) reference a family — drives delete warnings. */
  function fontUsage(family: string): number {
    let n = ROLES.reduce((acc, r) => acc + (typo.roles?.[r.key]?.font === family ? 1 : 0), 0);
    if (heroNameFont === family) n += 1;
    return n;
  }

  /** Import a new custom font, or replace one with an added-variant version. */
  function upsertFont(font: ExtraFont) {
    const exists = extraFonts.some((f) => f.family === font.family);
    const nextExtra = exists
      ? extraFonts.map((f) => (f.family === font.family ? font : f))
      : [...extraFonts, font];
    unloadCustomFont(font.family); // re-inject with the new face set
    loadWebsiteFont(font.family, font.weights, fontSourceOf(font));
    commit({ ...typo, extraFonts: nextExtra });
  }

  /** Rename a custom font, cascading to every role + the hero that uses it. */
  function renameFont(oldFamily: string, newFamily: string) {
    const name = newFamily.trim();
    if (!name || name === oldFamily || extraFonts.some((f) => f.family === name)) return;
    const nextRoles = { ...typo.roles };
    for (const r of ROLES) {
      if (nextRoles[r.key]?.font === oldFamily) nextRoles[r.key] = { ...nextRoles[r.key], font: name };
    }
    const renamed = { ...extraFonts.find((f) => f.family === oldFamily)!, family: name };
    const nextExtra = extraFonts.map((f) => (f.family === oldFamily ? renamed : f));
    const heroNext = heroNameFont === oldFamily ? name : heroNameFont;
    if (heroNext !== heroNameFont) onHeroNameFontChange(heroNext);
    unloadCustomFont(oldFamily);
    loadWebsiteFont(name, renamed.weights, fontSourceOf(renamed)); // inject under the new name
    commit({ ...typo, roles: nextRoles, extraFonts: nextExtra }, heroNext);
  }

  /** Delete a custom font: unset it everywhere, drop it, and free its S3 files. */
  function deleteFont(font: ExtraFont) {
    const nextRoles = { ...typo.roles };
    for (const r of ROLES) {
      if (nextRoles[r.key]?.font === font.family) {
        const { font: _drop, ...rest } = nextRoles[r.key]!;
        nextRoles[r.key] = rest;
      }
    }
    const heroNext = heroNameFont === font.family ? '' : heroNameFont;
    if (heroNext !== heroNameFont) onHeroNameFontChange(heroNext);
    const nextExtra = extraFonts.filter((f) => f.family !== font.family);
    unloadCustomFont(font.family);
    commit({ ...typo, roles: nextRoles, extraFonts: nextExtra }, heroNext);
    const keys = fontKeys(font);
    if (keys.length) deleteWebsiteFonts(restaurantId, keys).catch(() => {});
  }

  /** Remove one variant of a custom font (deleting the last one deletes the font). */
  function removeVariant(family: string, index: number) {
    const font = extraFonts.find((f) => f.family === family);
    const list = font?.faces ?? [];
    if (!font || list.length === 0) return;
    if (list.length <= 1) { deleteFont(font); return; }
    const removed = list[index];
    const nextFaces = list.filter((_, i) => i !== index);
    const weights = Array.from(new Set(nextFaces.map((f) => f.weight ?? 400))).sort((a, b) => a - b);
    const nextExtra = extraFonts.map((f) => (f.family === family ? { ...f, faces: nextFaces, weights } : f));
    unloadCustomFont(family);
    loadWebsiteFont(family, weights, { faces: nextFaces }); // re-inject without the removed face
    commit({ ...typo, extraFonts: nextExtra });
    if (removed?.key) deleteWebsiteFonts(restaurantId, [removed.key]).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Site-wide base style (pairing) — collapsed by default; per-section
          pickers below are the primary control. */}
      <div className="rounded-lg border border-[var(--divider)]">
        <button
          type="button"
          onClick={() => setStylesOpen(!stylesOpen)}
          className="w-full flex items-center justify-between gap-2 p-2.5 text-start"
        >
          <div>
            <span className="block text-xs font-medium text-fg-primary">Style général du site</span>
            <span className="block text-[11px] text-fg-secondary mt-0.5">
              {selectedPairing?.name ?? 'Par défaut'}
            </span>
          </div>
          <svg
            width="12" height="12" viewBox="0 0 12 12"
            className={`shrink-0 text-fg-tertiary transition-transform ${stylesOpen ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {stylesOpen && (
          <div className="px-2.5 pb-2.5 flex flex-col gap-2">
            <p className="text-[10px] text-fg-tertiary leading-relaxed">
              Le point de départ appliqué à tout le site (titres, textes, boutons, menu).
              {' '}{t('typographyIntro')}
            </p>
            {catalog.typography_pairings.map((p) => {
              const selected = p.id === config.pairing_id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdate({ pairing_id: p.id })}
                  className={`text-start rounded-lg border p-2.5 transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                      : 'border-[var(--divider)] hover:border-fg-tertiary'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs font-semibold">{p.name}</span>
                      <p className="text-[11px] text-fg-secondary mt-0.5 line-clamp-1">{p.description}</p>
                    </div>
                    {selected && (
                      <span className="text-[9px] uppercase tracking-wider text-brand-500 font-semibold shrink-0">
                        {t('selectedBadge')}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--divider)]">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-fg-tertiary mb-1">Latin</div>
                      <FontSample pairing={p.pairing} kind="display" dir="ltr" />
                      <FontSample pairing={p.pairing} kind="body" dir="ltr" />
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-fg-tertiary mb-1">עברית</div>
                      <FontSample pairing={p.pairing} kind="display" dir="rtl" />
                      <FontSample pairing={p.pairing} kind="body" dir="rtl" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* One list of text sections; each picker searches the curated list AND
          the full Google Fonts catalog (picked catalog fonts are persisted
          automatically in typography.extraFonts). Size is set per section —
          there is no separate overall menu size. */}
      <div className="border-t border-[var(--divider)] pt-4">
        <label className="block text-xs font-medium text-fg-primary mb-1">Polices par section</label>
        <p className="text-[10px] text-fg-tertiary mb-2 leading-relaxed">
          Choisissez une police pour la partie à personnaliser. La recherche couvre
          tout le catalogue Google Fonts. Sans choix, la police du style général s&apos;applique.
        </p>
        <div className="flex flex-col gap-3">
          {/* Hero restaurant name */}
          <div className="rounded-lg border border-[var(--divider)] p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-fg-primary">Nom du restaurant</span>
              <span
                className="text-[12px] text-fg-secondary truncate max-w-[45%] text-end"
                style={{
                  fontFamily: heroNameFont ? `"${heroNameFont}"` : 'inherit',
                  fontWeight: typo.heroWeight,
                }}
                title={heroSample}
              >
                {heroSample || 'Nom du restaurant'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1 min-w-0">
                <FontSelect
                  value={heroNameFont}
                  onChange={setHeroFont}
                  extraFonts={extraFonts}
                  defaultLabel="Police du style général"
                  onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
                />
              </div>
              <WeightSelect
                value={typo.heroWeight}
                weights={availableWeights(heroNameFont, 'display')}
                onChange={setHeroWeight}
              />
            </div>
          </div>

          {ROLES.map((r) => {
            const o = typo.roles?.[r.key] ?? {};
            const roleMult = o.sizeMult ?? 1;
            const themeFont = selectedPairing
              ? (r.family === 'display'
                  ? selectedPairing.pairing.displayLatin.family
                  : selectedPairing.pairing.bodyLatin.family)
              : null;
            return (
              <div key={r.key} className="rounded-lg border border-[var(--divider)] p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-medium text-fg-primary">{r.label}</span>
                  <span
                    className="text-[12px] text-fg-secondary truncate max-w-[45%] text-end"
                    style={{
                      fontFamily: o.font ? `"${o.font}"` : 'inherit',
                      fontWeight: o.weight,
                      textTransform: o.transform === 'uppercase' ? 'uppercase' : undefined,
                    }}
                    dir={r.key === 'itemPrice' ? 'ltr' : undefined}
                    title={r.sample}
                  >
                    {r.sample}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1 min-w-0">
                    <FontSelect
                      value={o.font ?? ''}
                      onChange={(family, picked) => setRoleFont(r.key, family, picked)}
                      extraFonts={extraFonts}
                      defaultLabel={themeFont ? `Police du thème (${themeFont})` : 'Police du thème (par défaut)'}
                      onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
                    />
                  </div>
                  <WeightSelect
                    value={o.weight}
                    weights={availableWeights(o.font ?? '', r.family)}
                    onChange={(w) => setRoleWeight(r.key, w)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-fg-tertiary shrink-0">Taille</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.6}
                    step={0.05}
                    value={roleMult}
                    onChange={(e) => setRoleSize(r.key, Number(e.target.value))}
                    className="flex-1 accent-brand-500"
                  />
                  <span className="text-[10px] tabular-nums text-fg-secondary w-9 text-end">{pct(roleMult)}</span>
                </div>
                {r.caseControl && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-fg-tertiary shrink-0">Casse</span>
                    <div className="flex rounded-lg border border-divider overflow-hidden">
                      {CASE_OPTIONS.map((c) => {
                        const selected = o.transform === c.value;
                        return (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => setRoleTransform(r.key, c.value)}
                            className={`px-2 py-1 text-[10px] transition-colors ${
                              selected
                                ? 'bg-brand-500/10 text-brand-500 font-medium'
                                : 'text-fg-secondary hover:bg-[var(--surface-2)]'
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <MyFontsManager
        fonts={customFonts}
        usageCount={fontUsage}
        onUpload={(file) => uploadWebsiteFont(restaurantId, file)}
        onUpsert={upsertFont}
        onRename={renameFont}
        onDelete={deleteFont}
        onRemoveVariant={removeVariant}
      />
    </div>
  );
}
