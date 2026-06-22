'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  updateRestaurant,
  uploadRestaurantLogo,
  type Restaurant,
  type WebsiteConfig,
} from '@/lib/api';

type Props = {
  config: WebsiteConfig;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  restaurantId: number;
  restaurant: Restaurant | null;
  onRestaurantUpdate: (r: Restaurant) => void;
};

export function BrandingPanel({ config, onUpdate, restaurantId, restaurant, onRestaurantUpdate }: Props) {
  const { t } = useI18n();
  const [faviconDraft, setFaviconDraft] = useState(config.favicon_url ?? '');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    setFaviconDraft(config.favicon_url ?? '');
  }, [config.favicon_url]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const imageUrl = await uploadRestaurantLogo(restaurantId, file);
      const updated = await updateRestaurant(restaurantId, {
        name: restaurant?.name,
        logo_url: imageUrl,
      } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleRemoveLogo() {
    const updated = await updateRestaurant(restaurantId, {
      name: restaurant?.name,
      logo_url: '',
    } as Partial<Restaurant>);
    onRestaurantUpdate(updated);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Logo */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('logo')}</h3>
        </div>
        <div className="flex items-center gap-3">
          {restaurant?.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt=""
              className="w-14 h-14 rounded-full object-cover border border-[var(--divider)] shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full border border-dashed border-[var(--divider)] flex items-center justify-center text-[10px] text-fg-secondary shrink-0">
              {t('logo')}
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--divider)] text-[11px] font-medium capitalize cursor-pointer hover:bg-[var(--surface-hover)] transition ${
                uploadingLogo ? 'opacity-50 pointer-events-none' : 'text-fg-primary'
              }`}
            >
              {uploadingLogo ? '…' : restaurant?.logo_url ? t('change') : t('uploadAction')}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
            {restaurant?.logo_url && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-300 text-[11px] font-medium text-red-600 hover:bg-red-50 transition"
              >
                {t('remove')}
              </button>
            )}
          </div>
        </div>
      </section>

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

      {/* Logo background — the logo sits in a rounded square on the order-page
          hero (Wolt-style). This picks the box background. Hidden in logo-only
          cover mode, where there is no box. */}
      {config.hero_cover_layout !== 'logo' && (
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">{t('logoBackground')}</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">{t('logoBackgroundHelp')}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['white', 'black'] as const).map((value) => {
            const selected = (config.hero_logo_bg || 'white') === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onUpdate({ hero_logo_bg: value })}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-start transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                    : 'border-[var(--divider)] hover:border-fg-tertiary'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-md border border-[var(--divider)] shrink-0 ${
                    value === 'white' ? 'bg-white' : 'bg-black'
                  }`}
                />
                <span className="text-xs font-medium">
                  {value === 'white' ? t('logoBgWhite') : t('logoBgBlack')}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      )}

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
