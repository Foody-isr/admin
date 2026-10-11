'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import { visibleSettingsNavigation } from '@/lib/settings-navigation';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', he: 'עברית', fr: 'Français' };

/** Restaurant identity opens the same accessible account panel on desktop and mobile. */
export default function RestaurantAccountMenu({ restaurantId, restaurantName, collapsed = false, onNavigate }: {
  restaurantId: number;
  restaurantName: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { restaurantIds, logout } = useAuth();
  const { hasAnyPermission, roleName } = usePermissions();
  const { t, direction, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const focus = useDialogReturnFocus();
  const settings = visibleSettingsNavigation(restaurantId, hasAnyPermission).flatMap(group => group.items);
  const settingsHref = settings.find(item => item.href === `/${restaurantId}/settings`)?.href ?? settings[0]?.href;
  function closeForNavigation() {
    setOpen(false);
    onNavigate?.();
  }

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className="restaurant-account-trigger" data-collapsed={collapsed || undefined}
        aria-label={restaurantName} title={collapsed ? restaurantName : undefined}>
        <UserRound aria-hidden />
        {!collapsed && <span>{restaurantName}</span>}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="account-panel-overlay" />
      <Dialog.Content {...focus} aria-describedby={undefined} dir={direction} className="account-panel">
        <Dialog.Title className="sr-only">{t('profile')}</Dialog.Title>
        <Dialog.Close className="account-panel-close" aria-label={t('close')}><X aria-hidden /></Dialog.Close>
        <p className="account-panel-role">{roleName === 'Owner' ? t('accountHolder') : roleName}</p>
        <nav aria-label={t('profile')} className="account-panel-actions">
          {settingsHref && <Link href={settingsHref} onClick={closeForNavigation}>{t('accountSettings')}</Link>}
          <button type="button" onClick={toggleTheme}>{t(theme === 'dark' ? 'lightMode' : 'darkMode')}</button>
          <label className="account-panel-language">
            <span>{t('language')}</span>
            <select value={locale} onChange={event => setLocale(event.target.value as Locale)}>
              {SUPPORTED_LOCALES.map(value => <option key={value} value={value} lang={value}>{LOCALE_LABELS[value]}</option>)}
            </select>
          </label>
          {restaurantIds.length > 1 && <Link href="/select-restaurant" onClick={closeForNavigation}>{t('switchRestaurant')}</Link>}
          <button type="button" onClick={() => { closeForNavigation(); logout(); }}>{t('signOut')}</button>
        </nav>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
