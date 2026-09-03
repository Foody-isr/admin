'use client';

import Link from 'next/link';
import {
  Building2Icon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  RouteIcon,
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
  const restaurantInitial = restaurant.name.trim().charAt(0).toUpperCase() || 'F';
  const initials = (user?.full_name || user?.email || '?')
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <header
        className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-md bg-[var(--brand-500)] text-fs-md font-bold text-white shadow-1">
              {restaurantInitial}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-fs-sm font-semibold text-[var(--fg)]">{restaurant.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-fs-xs text-[var(--fg-muted)]">
                <RouteIcon className="h-3.5 w-3.5 text-[var(--brand-500)]" />
                {t('deliveryRouteToday')}
              </p>
            </div>
          </div>

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--surface-2)] focus-visible:shadow-ring"
                aria-label={t('profile')}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-500)] text-fs-xs font-semibold text-white">
                  {initials}
                </span>
              </button>
            </MenuTrigger>
            <MenuContent side="bottom" align="end" sideOffset={8} className="w-[min(300px,calc(100vw-24px))] p-1.5">
              <div className="flex items-center gap-3 px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--brand-500)]">
                  <UserRoundIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-fs-sm font-semibold text-[var(--fg)]">{user?.full_name}</p>
                  <p className="mt-0.5 truncate text-fs-xs text-[var(--fg-muted)]">{user?.email}</p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--brand-500)]">{t('roleName_courier')}</p>
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
        {children}
      </main>
    </div>
  );
}
