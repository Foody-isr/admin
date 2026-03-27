'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n';
import {
  Bars3Icon,
  BellIcon,
  SunIcon,
  MoonIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useAi } from '@/lib/ai-context';

interface TopBarProps {
  restaurantName: string;
  pageName: string;
  onToggleSidebar: () => void;
  orderCount?: number;
}

export default function TopBar({ restaurantName, pageName, onToggleSidebar, orderCount }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const ai = useAi();
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

  return (
    <header className="fixed top-0 left-0 right-0 h-12 z-40 flex items-center justify-between px-4" style={{ background: 'var(--topbar-bg)' }}>
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-md hover:bg-white/10 transition-colors"
          style={{ color: 'var(--topbar-fg)' }}
          aria-label="Toggle sidebar"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--topbar-fg)', opacity: 0.7 }}>
          {restaurantName}
        </span>
        <span className="text-sm hidden sm:block" style={{ color: 'var(--topbar-fg)', opacity: 0.4 }}>/</span>
        <span className="text-sm font-medium" style={{ color: 'var(--topbar-fg)' }}>
          {pageName}
        </span>
      </div>

      {/* Center: Foody logo */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
          <span className="text-sm font-black text-black">F</span>
        </div>
      </div>

      {/* Right: notifications + user menu */}
      <div className="flex items-center gap-2">
        {/* AI Assistant */}
        <button
          onClick={ai.toggleDrawer}
          className={`relative p-1.5 rounded-md hover:bg-white/10 transition-colors ${ai.isOpen ? 'bg-white/10' : ''}`}
          style={{ color: 'var(--topbar-fg)' }}
          aria-label="Foody AI"
        >
          <SparklesIcon className="w-5 h-5" />
        </button>

        {/* Notification bell */}
        <button
          className="relative p-1.5 rounded-md hover:bg-white/10 transition-colors"
          style={{ color: 'var(--topbar-fg)' }}
          aria-label="Notifications"
        >
          <BellIcon className="w-5 h-5" />
          {orderCount !== undefined && orderCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {orderCount > 9 ? '9+' : orderCount}
            </span>
          )}
        </button>

        {/* User dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white/10 transition-colors"
            style={{ color: 'var(--topbar-fg)' }}
          >
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <span className="text-sm font-medium hidden md:block">{user?.full_name}</span>
            <ChevronDownIcon className="w-3.5 h-3.5 hidden md:block" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-56 rounded-lg shadow-lg border py-1 z-50"
              style={{ background: 'var(--surface)', borderColor: 'var(--divider)' }}
            >
              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--divider)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user?.full_name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
              </div>

              {/* Theme toggle */}
              <button
                onClick={() => { toggleTheme(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-subtle)]"
                style={{ color: 'var(--text-primary)' }}
              >
                {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
                {theme === 'dark' ? t('lightMode') : t('darkMode')}
              </button>

              {/* Logout */}
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-[var(--surface-subtle)]"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                {t('signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
