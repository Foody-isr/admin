'use client';

import { useRef, useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { WebsiteMenuProvider, useWebsiteMenu } from '@/lib/website-menu-context';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

const SECTIONS = [
  { id: 'themes',      labelKey: 'menuTabThemes',      defaultLabel: 'Themes' },
  { id: 'typography',  labelKey: 'menuTabTypography',  defaultLabel: 'Typography' },
  { id: 'branding',    labelKey: 'menuTabBranding',    defaultLabel: 'Branding' },
] as const;

function TopBar() {
  const { t } = useI18n();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const { restaurant, saving, saved } = useWebsiteMenu();
  const previewUrl = restaurant ? `${WEB_URL}/r/${restaurant.slug}/order` : '#';

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-[var(--divider)] bg-surface">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/${restaurantId}/website`}
          className="text-sm text-fg-secondary hover:text-fg-primary"
        >
          ← {t('backToWebsite') || 'Back to Website'}
        </Link>
        <span className="text-sm font-semibold truncate">
          {t('menuPageDesigner') || 'Menu page designer'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-fg-secondary min-w-[60px] text-end">
          {saving ? (t('saving') || 'Saving…') : saved ? (t('saved') || 'Saved ✓') : ''}
        </span>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs font-medium text-brand-500 hover:underline"
        >
          {t('openInNewTab') || 'Open in new tab'} ↗
        </a>
      </div>
    </header>
  );
}

function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const { config } = useWebsiteMenu();

  const completion = useMemo(() => ({
    themes: !!config && (config.theme_id !== 'editorial-dark' || !!config.brand_color),
    typography: !!config && config.pairing_id !== 'modern-sans',
    branding: !!config && (
      config.logo_size !== 48 ||
      !!config.favicon_url ||
      config.hide_navbar_name ||
      config.layout_default !== 'magazine'
    ),
  }), [config]);

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--divider)] bg-surface-subtle p-3 flex flex-col gap-1">
      {SECTIONS.map((s) => {
        const href = `/${restaurantId}/website/menu/${s.id}`;
        const active = pathname === href;
        const done = completion[s.id];
        return (
          <Link
            key={s.id}
            href={href}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-brand-500/10 text-brand-500 font-medium'
                : 'text-fg-secondary hover:bg-surface'
            }`}
          >
            <span>{t(s.labelKey) || s.defaultLabel}</span>
            <span
              className={`w-2 h-2 rounded-full ${done ? 'bg-brand-500' : 'bg-[var(--divider)]'}`}
              aria-label={done ? 'configured' : 'default'}
            />
          </Link>
        );
      })}
    </nav>
  );
}

function PreviewIframe() {
  const { restaurant, iframeRef } = useWebsiteMenu();
  const { t } = useI18n();
  if (!restaurant) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary text-sm">
        {t('loading') || 'Loading…'}
      </div>
    );
  }
  const src = `${WEB_URL}/r/${restaurant.slug}/order?preview=1`;
  return (
    <div className="flex-1 bg-surface-subtle p-6 overflow-hidden flex items-center justify-center">
      <div className="w-full max-w-[420px] aspect-[9/19] rounded-3xl border border-[var(--divider)] shadow-lg overflow-hidden bg-bg">
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full border-0"
          title="menu-preview"
        />
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { loading, error } = useWebsiteMenu();
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-fg-secondary text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="text-error text-sm">{error}</div>
          ) : (
            children
          )}
        </main>
        <PreviewIframe />
      </div>
    </div>
  );
}

export default function MenuTabLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <WebsiteMenuProvider restaurantId={restaurantId} iframeRef={iframeRef}>
      <Shell>{children}</Shell>
    </WebsiteMenuProvider>
  );
}
