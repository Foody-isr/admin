'use client';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n, SUPPORTED_LOCALES } from '@/lib/i18n';
import SearchTriggerButton from '@/components/search/SearchTriggerButton';
import BranchSwitcher from '@/components/BranchSwitcher';
import { Sun, Moon, LogOut, Menu, ChevronDown, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface TopBarProps {
  restaurantId: number;
  restaurantName: string;
  pageName: string;
  onToggleSidebar: () => void;
}

/** Active restaurant, actual scoped search and keyboard-accessible account controls. */
export default function TopBar({ restaurantId, restaurantName, onToggleSidebar }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale, direction } = useI18n();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const languages = { en: 'English', fr: 'Français', he: 'עברית' };
  return (
    <header className="sticky top-0 z-20 h-[var(--topbar-total-h)] flex items-center gap-3 pt-safe-t px-4 sm:px-6 lg:px-8 border-b border-[var(--line)] bg-[var(--topbar-bg)] text-[var(--fg)]">
      <button type="button" onClick={onToggleSidebar} className="lg:hidden size-11 shrink-0 grid place-items-center rounded-r-md hover:bg-[var(--sidebar-hover)]" aria-label={t('menu')}>
        <Menu className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-sm"><BranchSwitcher restaurantId={restaurantId} restaurantName={restaurantName} /></div>
      <SearchTriggerButton />
      <DropdownMenu dir={direction}>
        <DropdownMenuTrigger asChild>
          <button className="flex h-11 items-center gap-2 rounded-r-md px-1.5 hover:bg-[var(--surface-2)]" aria-label={t('profile')}>
            <span className="size-8 grid place-items-center rounded-full bg-[var(--summary-bg)] text-[var(--summary-fg)] text-xs font-semibold" aria-hidden>{initials}</span>
            <ChevronDown className="size-3.5 hidden sm:block text-[var(--fg-muted)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="px-3 py-3">
            <p className="font-semibold break-words">{user?.full_name}</p>
            <bdi className="block mt-1 text-xs text-[var(--fg-muted)] font-normal truncate">{user?.email}</bdi>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleTheme} className="min-h-11">
            {theme === 'dark' ? <Sun /> : <Moon />}{theme === 'dark' ? t('lightMode') : t('darkMode')}
          </DropdownMenuItem>
          <DropdownMenuLabel className="text-xs font-normal text-[var(--fg-muted)]">{t('language')}</DropdownMenuLabel>
          {SUPPORTED_LOCALES.map(lang => <DropdownMenuItem key={lang} onSelect={() => setLocale(lang)} className="min-h-10">
            <span lang={lang} className="flex-1">{languages[lang]}</span>{locale === lang && <Check className="size-4" />}
          </DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout} className="min-h-11 text-[var(--danger-500)]"><LogOut />{t('signOut')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
