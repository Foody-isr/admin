'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  BellIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  MenuIcon,
} from 'lucide-react';
interface TopBarProps {
  restaurantName: string;
  pageName: string;
  onToggleSidebar: () => void;
  orderCount?: number;
}

/**
 * Topbar — crumbs on the left, search input-group in the middle, actions on the right.
 * Matches chrome.jsx from the design reference.
 */
export default function TopBar({ restaurantName, pageName, onToggleSidebar, orderCount }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const crumbs = [restaurantName, pageName].filter(Boolean);

  return (
    <header
      className="sticky top-0 z-20 h-[var(--topbar-h)] flex items-center gap-[var(--s-4)] px-[var(--s-6)] border-b border-[var(--line)]"
      style={{ background: 'var(--topbar-bg)', color: 'var(--topbar-fg)' }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-1.5 rounded-r-md hover:bg-[var(--sidebar-hover)] transition-colors"
        aria-label={t('menu') || 'Menu'}
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      {/* Crumbs */}
      <div className="flex items-center gap-[var(--s-2)] text-fs-sm text-[var(--fg-muted)] min-w-0">
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-[var(--s-2)] min-w-0">
            {i > 0 && <ChevronRightIcon className="w-3 h-3 text-[var(--fg-subtle)] shrink-0" />}
            <span
              className={`${i === crumbs.length - 1 ? 'text-[var(--fg)] font-medium' : ''} truncate`}
            >
              {c}
            </span>
          </span>
        ))}
      </div>

      <div className="flex-1" />

      {/* Search input-group */}
      <div
        className="hidden md:flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 w-80 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md transition-colors focus-within:border-[var(--brand-500)] focus-within:shadow-ring"
      >
        <SearchIcon className="w-4 h-4 shrink-0 text-[var(--fg-subtle)]" />
        <input
          type="search"
          placeholder={t('searchCommands') || 'Rechercher, ou tapez une commande…'}
          className="flex-1 h-full bg-transparent border-none outline-none text-fs-sm placeholder:text-[var(--fg-subtle)]"
        />
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-r-xs bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]">
          ⌘K
        </kbd>
      </div>

      {/* Bell */}
      <button
        className="relative p-2 rounded-r-md hover:bg-[var(--sidebar-hover)] transition-colors"
        aria-label={t('notifications') || 'Notifications'}
      >
        <BellIcon className="w-4 h-4" />
        {orderCount !== undefined && orderCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--danger-500)] rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {orderCount > 9 ? '9+' : orderCount}
          </span>
        )}
      </button>

      {/* Avatar dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-[var(--s-2)] px-1.5 py-1 rounded-r-md hover:bg-[var(--sidebar-hover)] transition-colors"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-fs-xs font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
          >
            {initials}
          </div>
          <ChevronDownIcon className="w-3.5 h-3.5 hidden md:block text-[var(--fg-muted)]" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-60 rounded-r-md shadow-3 py-1 z-50 bg-[var(--surface)] border border-[var(--line)]">
            <div className="px-4 py-3 border-b border-[var(--line)]">
              <p className="text-fs-sm font-medium text-[var(--fg)] truncate">{user?.full_name}</p>
              <p className="text-fs-xs mt-0.5 text-[var(--fg-muted)] truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
              className="w-full flex items-center gap-[var(--s-3)] px-4 py-2.5 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg)]"
            >
              {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
              {theme === 'dark' ? t('lightMode') : t('darkMode')}
            </button>
            <button
              onClick={() => { logout(); setMenuOpen(false); }}
              className="w-full flex items-center gap-[var(--s-3)] px-4 py-2.5 text-fs-sm transition-colors hover:bg-[var(--danger-50)] text-[var(--danger-500)]"
            >
              <LogOutIcon className="w-4 h-4" />
              {t('signOut')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
