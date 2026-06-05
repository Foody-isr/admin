'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { WebsiteConfig, ThemeCatalog } from '@/lib/api';

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PALETTE_HEX_RE = /^#[0-9a-fA-F]{6}$/;

type CustomPalette = NonNullable<WebsiteConfig['custom_palette']>;

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

      {/* Mode — segmented light / dark. Drives derived tokens on render. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-fg-primary">{t('customPaletteMode')}</span>
        <div className="inline-flex rounded-md border border-[var(--divider)] overflow-hidden">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ mode: m })}
              className={`px-2.5 py-1 text-[11px] capitalize ${
                palette.mode === m ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:bg-[var(--surface-hover)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

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
