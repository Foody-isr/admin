'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type {
  WebsiteConfig, ThemeCatalog, TypographyPairingEntry,
  TypographyOverrides, TypographyRoleKey, ExtraFont,
} from '@/lib/api';
import { loadWebsiteFont, curatedFontWeights, WEIGHT_LABELS } from '@/lib/website-fonts';
import { FontSelect } from './FontSelect';

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
// roles foodyweb applies in lib/themes/typography.ts.
const ROLES: { key: TypographyRoleKey; label: string; sample: string; family: 'display' | 'body' }[] = [
  { key: 'categoryTitle', label: 'Titres de catégories', sample: 'SALADES', family: 'display' },
  { key: 'itemName', label: 'Noms des plats', sample: 'Salade César', family: 'display' },
  { key: 'itemPrice', label: 'Prix', sample: '₪35.00', family: 'display' },
  { key: 'itemDescription', label: 'Descriptions', sample: 'Roquette, parmesan, croûtons', family: 'body' },
];

// Drop defaulted values so the saved blob stays minimal (and the editor's
// autosave snapshot stays stable when nothing meaningful changed).
function normalizeTypography(t: TypographyOverrides): TypographyOverrides | null {
  const out: TypographyOverrides = {};
  if (typeof t.sizeScale === 'number' && t.sizeScale !== 1) out.sizeScale = t.sizeScale;
  const roles: NonNullable<TypographyOverrides['roles']> = {};
  for (const r of ROLES) {
    const o = t.roles?.[r.key];
    if (!o) continue;
    const clean: { font?: string; sizeMult?: number; weight?: number } = {};
    if (o.font) clean.font = o.font;
    if (typeof o.sizeMult === 'number' && o.sizeMult !== 1) clean.sizeMult = o.sizeMult;
    if (typeof o.weight === 'number') clean.weight = o.weight;
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
  /** Hero restaurant-name font (WebsiteConfig.hero_name_font, managed by the
   *  parent editor state) — edited here so every text section lives in one list. */
  heroNameFont: string;
  onHeroNameFontChange: (family: string) => void;
  /** Sample text for the hero row (the restaurant's name). */
  heroSample?: string;
};

export function TypographyPanel({
  config, catalog, onUpdate, heroNameFont, onHeroNameFontChange, heroSample,
}: Props) {
  const { t } = useI18n();
  const typo: TypographyOverrides = config.typography ?? {};
  const sizeScale = typo.sizeScale ?? 1;
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

  // Load the fonts currently selected (per role + hero) so the in-panel
  // samples render in the chosen face.
  useEffect(() => {
    const families = ROLES.map((r) => typo.roles?.[r.key]?.font).concat(heroNameFont);
    for (const f of families) {
      if (f) loadWebsiteFont(f, extraFonts.find((x) => x.family === f)?.weights);
    }
  }, [typo.roles, heroNameFont, extraFonts]);

  /** Persist the blob, pruning extra fonts no section references anymore —
   *  the library is implicit (it IS the set of picked non-curated fonts),
   *  so there is no separate management UI to clean it up. */
  function commit(next: TypographyOverrides, heroOverride?: string) {
    const hero = heroOverride ?? heroNameFont;
    const referenced = new Set<string>();
    for (const r of ROLES) {
      const f = next.roles?.[r.key]?.font;
      if (f) referenced.add(f);
    }
    if (hero) referenced.add(hero);
    const pruned = (next.extraFonts ?? []).filter((f) => referenced.has(f.family));
    onUpdate({ typography: normalizeTypography({ ...next, extraFonts: pruned }) });
  }

  function setSizeScale(v: number) {
    commit({ ...typo, sizeScale: v });
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
    if (family) loadWebsiteFont(family, picked?.weights ?? extraWeights(family));
    const role = ROLES.find((r) => r.key === key)!;
    const cur = typo.roles?.[key] ?? {};
    // A weight the new family doesn't ship falls back to Auto.
    const avail = availableWeights(family, role.family, picked);
    const weight = cur.weight !== undefined && avail.includes(cur.weight) ? cur.weight : undefined;
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

  function setHeroFont(family: string, picked?: ExtraFont) {
    if (family) loadWebsiteFont(family, picked?.weights ?? extraWeights(family));
    onHeroNameFontChange(family);
    const avail = availableWeights(family, 'display', picked);
    const heroWeight = typo.heroWeight !== undefined && avail.includes(typo.heroWeight)
      ? typo.heroWeight
      : undefined;
    commit({ ...typo, extraFonts: withExtra(picked), heroWeight }, family);
  }

  function setHeroWeight(weight?: number) {
    commit({ ...typo, heroWeight: weight });
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

      {/* Overall menu text size */}
      <div className="border-t border-[var(--divider)] pt-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-fg-primary">Taille du texte du menu</label>
          <span className="text-[11px] tabular-nums text-fg-secondary">{pct(sizeScale)}</span>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.4}
          step={0.05}
          value={sizeScale}
          onChange={(e) => setSizeScale(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-fg-tertiary">Petit</span>
          <span className="text-[10px] text-fg-tertiary">Grand</span>
        </div>
        {sizeScale !== 1 && (
          <button
            type="button"
            onClick={() => setSizeScale(1)}
            className="mt-1 text-[11px] text-brand-500 hover:underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* One list of text sections; each picker searches the curated list AND
          the full Google Fonts catalog (picked catalog fonts are persisted
          automatically in typography.extraFonts). */}
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
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-fg-tertiary mt-2 leading-relaxed">
          La taille de chaque section se combine avec la taille générale du menu ci-dessus.
        </p>
      </div>
    </div>
  );
}
