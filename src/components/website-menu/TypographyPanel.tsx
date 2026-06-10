'use client';

import { useEffect, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import type {
  WebsiteConfig, ThemeCatalog, TypographyPairingEntry,
  TypographyOverrides, TypographyRoleKey,
} from '@/lib/api';
import { fontsByCategory, CATEGORY_LABELS, loadWebsiteFont } from '@/lib/website-fonts';

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
    const clean: { font?: string; sizeMult?: number } = {};
    if (o.font) clean.font = o.font;
    if (typeof o.sizeMult === 'number' && o.sizeMult !== 1) clean.sizeMult = o.sizeMult;
    if (clean.font || clean.sizeMult !== undefined) roles[r.key] = clean;
  }
  if (Object.keys(roles).length > 0) out.roles = roles;
  return Object.keys(out).length > 0 ? out : null;
}

function pct(mult: number): string {
  return `${Math.round(mult * 100)}%`;
}

type Props = {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
};

export function TypographyPanel({ config, catalog, onUpdate }: Props) {
  const { t } = useI18n();
  const typo: TypographyOverrides = config.typography ?? {};
  const sizeScale = typo.sizeScale ?? 1;

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

  // Load the fonts currently selected per role so the in-panel samples render
  // in the chosen face.
  useEffect(() => {
    for (const r of ROLES) {
      const f = typo.roles?.[r.key]?.font;
      if (f) loadWebsiteFont(f);
    }
  }, [typo.roles]);

  function commit(next: TypographyOverrides) {
    onUpdate({ typography: normalizeTypography(next) });
  }

  function setSizeScale(v: number) {
    commit({ ...typo, sizeScale: v });
  }

  function setRole(key: TypographyRoleKey, patch: { font?: string; sizeMult?: number }) {
    if (patch.font) loadWebsiteFont(patch.font);
    commit({
      ...typo,
      roles: { ...typo.roles, [key]: { ...typo.roles?.[key], ...patch } },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-secondary leading-relaxed">
        {t('typographyIntro')}
      </p>

      <div className="flex flex-col gap-2">
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

      {/* Per-section (role) font + size */}
      <div className="border-t border-[var(--divider)] pt-4">
        <label className="block text-xs font-medium text-fg-primary mb-2">Polices par section</label>
        <div className="flex flex-col gap-3">
          {ROLES.map((r) => {
            const o = typo.roles?.[r.key] ?? {};
            const roleMult = o.sizeMult ?? 1;
            return (
              <div key={r.key} className="rounded-lg border border-[var(--divider)] p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-medium text-fg-primary">{r.label}</span>
                  <span
                    className="text-[12px] text-fg-secondary truncate max-w-[45%] text-end"
                    style={{ fontFamily: o.font ? `"${o.font}"` : 'inherit' }}
                    dir={r.key === 'itemPrice' ? 'ltr' : undefined}
                    title={r.sample}
                  >
                    {r.sample}
                  </span>
                </div>
                <select
                  value={o.font ?? ''}
                  onChange={(e) => setRole(r.key, { font: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">Police du thème (par défaut)</option>
                  {fontsByCategory().map((group) => (
                    <optgroup key={group.category} label={CATEGORY_LABELS[group.category]}>
                      {group.fonts.map((f) => (
                        <option key={f.family} value={f.family}>
                          {f.family}{f.supportsHebrew ? ' (hébreu)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-fg-tertiary shrink-0">Taille</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.6}
                    step={0.05}
                    value={roleMult}
                    onChange={(e) => setRole(r.key, { sizeMult: Number(e.target.value) })}
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
