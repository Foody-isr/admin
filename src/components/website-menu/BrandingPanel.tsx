'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { WebsiteConfig } from '@/lib/api';

type Props = {
  config: WebsiteConfig;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
};

export function BrandingPanel({ config, onUpdate }: Props) {
  const { t } = useI18n();
  const [faviconDraft, setFaviconDraft] = useState(config.favicon_url ?? '');

  useEffect(() => {
    setFaviconDraft(config.favicon_url ?? '');
  }, [config.favicon_url]);

  return (
    <div className="flex flex-col gap-4">
      {/* Default layout */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('defaultLayout')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            {t('defaultLayoutHelp')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['compact', 'magazine'] as const).map((value) => {
            const selected = config.layout_default === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onUpdate({ layout_default: value })}
                className={`flex flex-col items-start gap-1 px-2.5 py-2 rounded-md border text-start transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                    : 'border-[var(--divider)] hover:border-fg-tertiary'
                }`}
              >
                <span className="text-xs font-medium capitalize">{t(value)}</span>
                <span className="text-[10px] text-fg-secondary leading-tight">
                  {value === 'compact' ? t('compactDesc') : t('magazineDesc')}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Logo size */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xs font-semibold">{t('logoSize')}</h3>
            <p className="text-[11px] text-fg-secondary leading-snug">{t('logoSizeHelp')}</p>
          </div>
          <span className="text-xs font-mono text-fg-secondary">{config.logo_size}px</span>
        </div>
        <input
          type="range"
          min={24}
          max={96}
          step={4}
          value={config.logo_size}
          onChange={(e) => onUpdate({ logo_size: Number(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </section>

      {/* Hide navbar name */}
      <section className="rounded-lg border border-[var(--divider)] p-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold mb-0.5">{t('hideNavbarName')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">{t('hideNavbarNameHelp')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.hide_navbar_name}
          onClick={() => onUpdate({ hide_navbar_name: !config.hide_navbar_name })}
          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
            config.hide_navbar_name ? 'bg-brand-500' : 'bg-[var(--divider)]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              config.hide_navbar_name ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </section>

      {/* Favicon */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('favicon')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">{t('faviconHelp')}</p>
        </div>
        <div className="flex items-center gap-2">
          {faviconDraft && (
            <img
              src={faviconDraft}
              alt=""
              className="w-7 h-7 rounded border border-[var(--divider)] object-cover shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
            />
          )}
          <input
            type="url"
            value={faviconDraft}
            onChange={(e) => setFaviconDraft(e.target.value)}
            onBlur={() => onUpdate({ favicon_url: faviconDraft.trim() })}
            placeholder="https://…/favicon.png"
            className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none"
          />
          {faviconDraft && (
            <button
              type="button"
              onClick={() => {
                setFaviconDraft('');
                onUpdate({ favicon_url: '' });
              }}
              className="text-[11px] text-fg-secondary hover:text-fg-primary shrink-0"
            >
              {t('clear')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
