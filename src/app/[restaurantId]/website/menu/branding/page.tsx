'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWebsiteMenu } from '@/lib/website-menu-context';

export default function BrandingPage() {
  const { t } = useI18n();
  const { config, update } = useWebsiteMenu();

  const [faviconDraft, setFaviconDraft] = useState('');
  useEffect(() => {
    setFaviconDraft(config?.favicon_url ?? '');
  }, [config?.favicon_url]);

  if (!config) return null;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold mb-1">{t('branding') || 'Branding'}</h1>
        <p className="text-sm text-fg-secondary">
          {t('brandingMenuIntro') ||
            'Branding for the menu/order page. The landing page has its own settings under Accueil.'}
        </p>
      </header>

      {/* Default layout */}
      <section className="rounded-xl border border-[var(--divider)] p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold mb-1">{t('defaultLayout') || 'Default item layout'}</h2>
          <p className="text-xs text-fg-secondary">
            {t('defaultLayoutHelp') ||
              'Density customers see when they first land. They can switch with the toggle in the menu top bar.'}
          </p>
        </header>
        <div className="grid grid-cols-2 gap-2">
          {(['compact', 'magazine'] as const).map((value) => {
            const selected = config.layout_default === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => update({ layout_default: value })}
                className={`flex flex-col items-start gap-2 px-3 py-3 rounded-lg border text-start transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                    : 'border-[var(--divider)] hover:border-fg-tertiary'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-medium capitalize">
                    {t(value) || value}
                  </span>
                  {selected && (
                    <span className="text-[10px] uppercase tracking-wider text-brand-500 font-semibold">
                      {t('selected') || 'Selected'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-fg-secondary">
                  {value === 'compact'
                    ? t('compactDesc') || 'Dense list. More items per screen.'
                    : t('magazineDesc') || 'Large imagery. Editorial feel.'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Logo size */}
      <section className="rounded-xl border border-[var(--divider)] p-4">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold mb-1">{t('logoSize') || 'Logo size'}</h2>
            <p className="text-xs text-fg-secondary">
              {t('logoSizeHelp') || 'How big the logo appears in the menu top bar.'}
            </p>
          </div>
          <span className="text-sm font-mono text-fg-secondary">{config.logo_size}px</span>
        </header>
        <input
          type="range"
          min={24}
          max={96}
          step={4}
          value={config.logo_size}
          onChange={(e) => update({ logo_size: Number(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </section>

      {/* Hide navbar name */}
      <section className="rounded-xl border border-[var(--divider)] p-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold mb-1">
            {t('hideNavbarName') || 'Hide restaurant name in navbar'}
          </h2>
          <p className="text-xs text-fg-secondary">
            {t('hideNavbarNameHelp') ||
              'Useful when your logo already contains the name.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.hide_navbar_name}
          onClick={() => update({ hide_navbar_name: !config.hide_navbar_name })}
          className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${
            config.hide_navbar_name ? 'bg-brand-500' : 'bg-[var(--divider)]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              config.hide_navbar_name ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </section>

      {/* Favicon */}
      <section className="rounded-xl border border-[var(--divider)] p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold mb-1">{t('favicon') || 'Favicon'}</h2>
          <p className="text-xs text-fg-secondary">
            {t('faviconHelp') ||
              'Tab icon shown in browsers. Use a square PNG, 32×32 or larger.'}
          </p>
        </header>
        <div className="flex items-center gap-3">
          {faviconDraft && (
            <img
              src={faviconDraft}
              alt=""
              className="w-8 h-8 rounded border border-[var(--divider)] object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
            />
          )}
          <input
            type="url"
            value={faviconDraft}
            onChange={(e) => setFaviconDraft(e.target.value)}
            onBlur={() => update({ favicon_url: faviconDraft.trim() })}
            placeholder="https://…/favicon.png"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none"
          />
          {faviconDraft && (
            <button
              type="button"
              onClick={() => {
                setFaviconDraft('');
                update({ favicon_url: '' });
              }}
              className="text-xs text-fg-secondary hover:text-fg-primary"
            >
              {t('clear') || 'Clear'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
