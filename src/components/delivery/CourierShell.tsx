'use client';

import Link from 'next/link';
import {
  Building2Icon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  MenuIcon,
  SunIcon,
  UserRoundIcon,
} from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ds';
import { useAuth } from '@/lib/auth-context';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import type { Restaurant } from '@/lib/api';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

interface CourierShellProps {
  children: React.ReactNode;
  restaurant: Restaurant;
}

/** Focused app shell for couriers: route content plus essential account controls. */
export function CourierShell({ children, restaurant }: CourierShellProps) {
  const { user, restaurantIds, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const initials = (user?.full_name || user?.email || '?')
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="relative h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg)]"
      style={{ '--courier-height': '100dvh' } as React.CSSProperties}
    >
      <a
        href="#courier-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-16 focus:z-[70] focus:bg-[var(--surface)] focus:p-3"
      >
        {t('skipToContent')}
      </a>
      <header className="absolute start-3 top-[calc(12px+var(--safe-top))] z-40">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--info-500)]"
              aria-label={t('profile')}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </MenuTrigger>
          <MenuContent
            side="bottom"
            align="end"
            sideOffset={8}
            className="w-[min(300px,calc(100vw-24px))] p-1.5"
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--brand-500)]">
                <UserRoundIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-fs-sm font-semibold text-[var(--fg)]">
                  {restaurant.name}
                </p>
                <p className="mt-1 text-fs-xs">{user?.full_name || initials}</p>
                <p className="mt-0.5 truncate text-fs-xs text-[var(--fg-muted)]">{user?.email}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--brand-500)]">
                  {t('roleName_courier')}
                </p>
              </div>
            </div>

            <MenuSeparator />
            <MenuItem onSelect={toggleTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {theme === 'dark' ? t('lightMode') : t('darkMode')}
            </MenuItem>

            <div className="px-3 py-2.5">
              <div className="mb-2 flex items-center gap-3 text-fs-sm text-[var(--fg)]">
                <LanguagesIcon className="h-4 w-4 text-[var(--fg-muted)]" />
                {t('language')}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {SUPPORTED_LOCALES.map((nextLocale) => (
                  <button
                    key={nextLocale}
                    type="button"
                    onClick={() => setLocale(nextLocale)}
                    className={`h-8 rounded-r-sm border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-ring ${
                      locale === nextLocale
                        ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_10%,transparent)] text-[var(--brand-500)]'
                        : 'border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {LOCALE_LABELS[nextLocale]}
                  </button>
                ))}
              </div>
            </div>

            {restaurantIds.length > 1 && (
              <MenuItem asChild>
                <Link href="/select-restaurant">
                  <Building2Icon />
                  {t('switchRestaurant')}
                </Link>
              </MenuItem>
            )}

            <MenuSeparator />
            <MenuItem danger onSelect={logout}>
              <LogOutIcon />
              {t('signOut')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      <main id="courier-content" className="h-full">
        {children}
      </main>
    </div>
  );
}
