'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWebsiteMenu } from '@/lib/website-menu-context';

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export default function ThemesPage() {
  const { t } = useI18n();
  const { config, catalog, update } = useWebsiteMenu();

  const [hexDraft, setHexDraft] = useState('');
  useEffect(() => {
    setHexDraft(config?.brand_color ?? '');
  }, [config?.brand_color]);

  if (!config || !catalog) return null;

  const selectedThemeId = config.theme_id;

  const handleHexCommit = () => {
    const v = hexDraft.trim();
    if (v === '') {
      update({ brand_color: null });
      return;
    }
    if (HEX_RE.test(v)) {
      update({ brand_color: v });
    } else {
      setHexDraft(config.brand_color ?? '');
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold mb-1">{t('themes') || 'Themes'}</h1>
        <p className="text-sm text-fg-secondary">
          {t('themesIntro') || 'Pick a hand-designed theme. Each one sets the colors, layout, and visual mood of your menu page.'}
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {catalog.themes.map((theme) => {
          const selected = theme.id === selectedThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => update({ theme_id: theme.id })}
              className={`text-start rounded-xl border p-3 transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                  : 'border-[var(--divider)] hover:border-fg-tertiary'
              }`}
            >
              <div className="flex h-12 rounded-lg overflow-hidden mb-3">
                {theme.preview.swatches.map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-semibold">{theme.name}</span>
                {selected && (
                  <span className="text-[10px] uppercase tracking-wider text-brand-500 font-semibold">
                    {t('selected') || 'Selected'}
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-secondary leading-relaxed mb-2">{theme.description}</p>
              {theme.suggestedFor.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {theme.suggestedFor.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-subtle text-fg-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </section>

      <section className="rounded-xl border border-[var(--divider)] p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold mb-1">
            {t('brandColorOverride') || 'Brand color override'}
          </h2>
          <p className="text-xs text-fg-secondary">
            {t('brandColorHelp') ||
              'Optional. Replaces the theme’s accent color with your brand color across the menu page.'}
          </p>
        </header>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={config.brand_color ?? '#f18a47'}
            onChange={(e) => update({ brand_color: e.target.value })}
            className="w-10 h-10 rounded cursor-pointer border border-[var(--divider)]"
            aria-label={t('brandColor') || 'Brand color'}
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={handleHexCommit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="#f18a47"
            className="flex-1 max-w-[160px] px-3 py-2 text-sm rounded-lg border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none font-mono"
          />
          {config.brand_color && (
            <button
              type="button"
              onClick={() => update({ brand_color: null })}
              className="text-xs text-fg-secondary hover:text-fg-primary"
            >
              {t('reset') || 'Reset'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
