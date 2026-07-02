'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { WebsiteConfig, ThemeCatalog } from '@/lib/api';

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PALETTE_HEX_RE = /^#[0-9a-fA-F]{6}$/;

type CustomPalette = NonNullable<WebsiteConfig['custom_palette']>;

// Derives the palette mode from the background's luminance (same WCAG math +
// 0.4 threshold as foodyweb's contrastInk, so both sides agree). The mode is
// not user-facing: it only tells the foodyweb resolver which direction to
// derive the secondary shades (muted ink, dividers…) from the 4 swatches.
function paletteModeFromBg(bg: string): 'light' | 'dark' {
  const c = bg.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return luminance > 0.4 ? 'light' : 'dark';
}

type Props = {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
};

// Seed a fresh custom palette from the currently-selected catalog theme so
// the editor opens on a sensible starting point instead of placeholder grey.
function seedFromCatalog(catalog: ThemeCatalog, themeId: string): CustomPalette {
  const theme = catalog.themes.find((t) => t.id === themeId) ?? catalog.themes[0];
  const swatches = theme?.preview?.swatches ?? ['#181412', '#2A2018', '#D4A373', '#F0E6D6'];
  const mode = (theme?.mode === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  // Preview swatches are ordered [bg, surface, accent, ink] by convention
  // in catalog.json — preserve that mapping.
  return {
    mode,
    bg: swatches[0],
    surface: swatches[1],
    accent: swatches[2],
    ink: swatches[3],
  };
}

export function ThemesPanel({ config, catalog, onUpdate }: Props) {
  const { t } = useI18n();
  const [hexDraft, setHexDraft] = useState(config.brand_color ?? '');

  useEffect(() => {
    setHexDraft(config.brand_color ?? '');
  }, [config.brand_color]);

  const handleHexCommit = () => {
    const v = hexDraft.trim();
    if (v === '') return onUpdate({ brand_color: null });
    if (HEX_RE.test(v)) onUpdate({ brand_color: v });
    else setHexDraft(config.brand_color ?? '');
  };

  const isCustom = config.theme_id === 'custom';
  const customPalette = config.custom_palette ?? null;

  const handleSelectCustom = () => {
    if (customPalette) {
      onUpdate({ theme_id: 'custom' });
    } else {
      // Seed + select in a single patch so server-side cross-validation
      // (theme_id=custom requires custom_palette non-null) is satisfied.
      onUpdate({
        theme_id: 'custom',
        custom_palette: seedFromCatalog(catalog, config.theme_id),
      });
    }
  };

  const handlePaletteChange = (patch: Partial<CustomPalette>) => {
    const next: CustomPalette = { ...(customPalette ?? seedFromCatalog(catalog, config.theme_id)), ...patch };
    // Mode is auto-derived from the background on every edit; a stored palette
    // keeps its saved mode untouched until the user edits a color. Seeding from
    // a preset passes an explicit mode (the preset's declared one) — keep it.
    if (!('mode' in patch)) next.mode = paletteModeFromBg(next.bg);
    onUpdate({ custom_palette: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-fg-secondary leading-relaxed">
        {t('themesIntro')}
      </p>

      <div className="grid grid-cols-1 gap-2">
        {catalog.themes.map((theme) => {
          const selected = !isCustom && theme.id === config.theme_id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onUpdate({ theme_id: theme.id })}
              className={`text-start rounded-lg border p-2.5 transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                  : 'border-[var(--divider)] hover:border-fg-tertiary'
              }`}
            >
              <div className="flex h-8 rounded overflow-hidden mb-2">
                {theme.preview.swatches.map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold">{theme.name}</span>
                {selected && (
                  <span className="text-[9px] uppercase tracking-wider text-brand-500 font-semibold">
                    {t('selectedBadge')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-fg-secondary leading-snug line-clamp-2">
                {theme.description}
              </p>
            </button>
          );
        })}

        {/* Synthetic "Custom" card. Lives in the same grid as catalog presets
            so users discover it as just another option. Swatches mirror the
            user-defined palette, or show neutral grey placeholders when no
            palette has been built yet. */}
        <button
          type="button"
          onClick={handleSelectCustom}
          className={`text-start rounded-lg border p-2.5 transition-colors ${
            isCustom
              ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
              : 'border-[var(--divider)] hover:border-fg-tertiary'
          }`}
        >
          <div className="flex h-8 rounded overflow-hidden mb-2">
            {(customPalette
              ? [customPalette.bg, customPalette.surface, customPalette.accent, customPalette.ink]
              : ['#3a3a3a', '#4a4a4a', '#5a5a5a', '#6a6a6a']
            ).map((c, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <span className="text-xs font-semibold">{t('customPalette')}</span>
            {isCustom && (
              <span className="text-[9px] uppercase tracking-wider text-brand-500 font-semibold">
                {t('selectedBadge')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-fg-secondary leading-snug line-clamp-2">
            {t('customPaletteDesc')}
          </p>
        </button>
      </div>

      {/* Editor — only shown while Custom is active. */}
      {isCustom && customPalette && (
        <CustomPaletteEditor
          palette={customPalette}
          catalog={catalog}
          onChange={handlePaletteChange}
          onReset={() => onUpdate({ theme_id: 'editorial-dark' })}
        />
      )}

      <div className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('brandColorOverride')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            {isCustom ? t('brandColorDisabledWhenCustom') : t('brandColorHelp')}
          </p>
        </div>
        <div className={`flex items-center gap-2 ${isCustom ? 'opacity-50 pointer-events-none' : ''}`}>
          <input
            type="color"
            value={config.brand_color ?? '#f18a47'}
            onChange={(e) => onUpdate({ brand_color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-[var(--divider)]"
            aria-label={t('brandColor')}
            disabled={isCustom}
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={handleHexCommit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="#f18a47"
            className="flex-1 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none font-mono"
            disabled={isCustom}
          />
          {config.brand_color && !isCustom && (
            <button
              type="button"
              onClick={() => onUpdate({ brand_color: null })}
              className="text-[11px] text-fg-secondary hover:text-fg-primary"
            >
              {t('reset')}
            </button>
          )}
        </div>
      </div>

      <SectionColorsEditor config={config} onUpdate={onUpdate} />
    </div>
  );
}

/* ─────────────────────── Per-section color overrides ─────────────────────── */

type SectionKey = 'navbar' | 'hero' | 'metadata' | 'categoryBar';
type SectionField = 'bg' | 'text' | 'accent';

// Each section exposes Background + Text; the category bar adds an Active-pill
// (accent) color. Labels are French to match the rest of the builder UI.
const SECTION_DEFS: { key: SectionKey; label: string; fields: { field: SectionField; label: string }[] }[] = [
  { key: 'navbar', label: 'En-tête (barre du haut)', fields: [{ field: 'bg', label: 'Fond' }, { field: 'text', label: 'Texte' }] },
  { key: 'hero', label: 'Hero (bandeau du resto)', fields: [{ field: 'bg', label: 'Fond' }, { field: 'text', label: 'Texte' }] },
  { key: 'metadata', label: 'Infos (pré-commande, min…)', fields: [{ field: 'bg', label: 'Fond' }, { field: 'text', label: 'Texte' }] },
  { key: 'categoryBar', label: 'Barre de catégories', fields: [{ field: 'bg', label: 'Fond' }, { field: 'text', label: 'Texte' }, { field: 'accent', label: 'Pastille active' }] },
];

type SectionMap = Record<string, Record<string, string | undefined> | undefined>;

function SectionColorsEditor({ config, onUpdate }: { config: WebsiteConfig; onUpdate: (patch: Partial<WebsiteConfig>) => void }) {
  const sc = (config.section_colors ?? {}) as SectionMap;

  const commit = (next: SectionMap) => {
    onUpdate({ section_colors: (Object.keys(next).length ? next : null) as WebsiteConfig['section_colors'] });
  };

  const toggleSection = (key: SectionKey, on: boolean) => {
    const next: SectionMap = { ...sc };
    if (on) next[key] = next[key] ?? {};
    else delete next[key];
    commit(next);
  };

  const setField = (key: SectionKey, field: SectionField, value: string | undefined) => {
    const section: Record<string, string | undefined> = { ...(sc[key] ?? {}) };
    if (value) section[field] = value;
    else delete section[field];
    commit({ ...sc, [key]: section });
  };

  return (
    <div className="rounded-lg border border-[var(--divider)] p-3 flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold mb-0.5">Couleurs par section</h3>
        <p className="text-[11px] text-fg-secondary leading-snug">
          Surchargez les couleurs d&apos;une section précise. Laissez vide pour hériter de la couleur du thème.
        </p>
      </div>

      {SECTION_DEFS.map((def) => {
        const active = !!sc[def.key];
        return (
          <div key={def.key} className="border-t border-[var(--divider)] pt-3 first:border-t-0 first:pt-0">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[11px] font-medium text-fg-primary">{def.label}</span>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => toggleSection(def.key, e.target.checked)}
                className="accent-brand-500"
              />
            </label>
            {active && (
              <div className="mt-2 flex flex-col gap-2">
                {def.fields.map(({ field, label }) => (
                  <OptionalColorRow
                    key={field}
                    label={label}
                    value={sc[def.key]?.[field]}
                    onChange={(v) => setField(def.key, field, v)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OptionalColorRow({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);
  const commit = () => {
    const v = draft.trim();
    if (v === '') return onChange(undefined);
    if (PALETTE_HEX_RE.test(v)) onChange(v);
    else setDraft(value ?? '');
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-fg-primary w-24 shrink-0">{label}</span>
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-[var(--divider)] shrink-0"
        aria-label={label}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="Hériter"
        className="flex-1 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none font-mono"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-fg-secondary hover:text-fg-primary shrink-0"
          aria-label="Réinitialiser"
          title="Hériter du thème"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── Custom palette editor ─────────────────────── */

type EditorProps = {
  palette: CustomPalette;
  catalog: ThemeCatalog;
  onChange: (patch: Partial<CustomPalette>) => void;
  onReset: () => void;
};

function CustomPaletteEditor({ palette, catalog, onChange, onReset }: EditorProps) {
  const { t } = useI18n();
  const rows: { key: 'bg' | 'surface' | 'accent' | 'ink'; label: string }[] = [
    { key: 'bg', label: t('customPaletteBg') },
    { key: 'surface', label: t('customPaletteSurface') },
    { key: 'accent', label: t('customPaletteAccent') },
    { key: 'ink', label: t('customPaletteInk') },
  ];

  return (
    <div className="rounded-lg border border-[var(--divider)] p-3 flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold mb-0.5">{t('customPaletteEditTitle')}</h3>
      </div>

      {/* No light/dark toggle: the mode is auto-derived from the background
          color (see paletteModeFromBg) — asking was redundant and let users
          pick a polarity that fought their own colors. */}

      {/* The 4 swatch rows. Color picker + hex input, both wired to the same field. */}
      {rows.map(({ key, label }) => (
        <PaletteColorRow key={key} label={label} value={palette[key]} onChange={(v) => onChange({ [key]: v } as Partial<CustomPalette>)} />
      ))}

      {/* Start-from-preset seeder. Confirms before overwriting current edits. */}
      <div>
        <label className="block text-[11px] font-medium text-fg-primary mb-1">{t('customPaletteSeedFrom')}</label>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const dirty = !!palette.bg || !!palette.surface || !!palette.accent || !!palette.ink;
            if (dirty && !window.confirm(t('customPaletteSeedConfirm'))) {
              e.target.value = '';
              return;
            }
            const seed = (() => {
              const theme = catalog.themes.find((t) => t.id === id);
              const swatches = theme?.preview?.swatches;
              if (!theme || !swatches) return null;
              return {
                mode: (theme.mode === 'light' ? 'light' : 'dark') as 'light' | 'dark',
                bg: swatches[0],
                surface: swatches[1],
                accent: swatches[2],
                ink: swatches[3],
              };
            })();
            if (seed) onChange(seed);
            e.target.value = '';
          }}
          className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none"
        >
          <option value="">{t('customPaletteSeedFromPlaceholder')}</option>
          {catalog.themes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => {
          if (window.confirm(t('customPaletteResetConfirm'))) onReset();
        }}
        className="self-start text-[11px] text-fg-secondary hover:text-fg-primary"
      >
        {t('reset')}
      </button>
    </div>
  );
}

function PaletteColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    const v = draft.trim();
    if (PALETTE_HEX_RE.test(v)) onChange(v);
    else setDraft(value);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-fg-primary w-20 shrink-0">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-[var(--divider)] shrink-0"
        aria-label={label}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="#000000"
        className="flex-1 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none font-mono"
      />
    </div>
  );
}
