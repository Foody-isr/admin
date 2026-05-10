'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { WebsiteConfig, ThemeCatalog } from '@/lib/api';

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

type Props = {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
};

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

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-fg-secondary leading-relaxed">
        {t('themesIntro')}
      </p>

      <div className="grid grid-cols-1 gap-2">
        {catalog.themes.map((theme) => {
          const selected = theme.id === config.theme_id;
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
      </div>

      <div className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('brandColorOverride')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            {t('brandColorHelp')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.brand_color ?? '#f18a47'}
            onChange={(e) => onUpdate({ brand_color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-[var(--divider)]"
            aria-label={t('brandColor')}
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={handleHexCommit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="#f18a47"
            className="flex-1 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none font-mono"
          />
          {config.brand_color && (
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
