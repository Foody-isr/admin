'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useTheme } from '@/lib/theme-context';
import { useWs } from '@/lib/ws-context';
import { useI18n } from '@/lib/i18n';
import {
  HomeIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  CreditCardIcon,
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  BuildingStorefrontIcon,
  SunIcon,
  MoonIcon,
  BeakerIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  restaurantId: number;
  restaurantName: string;
}

export default function Sidebar({ restaurantId, restaurantName }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, restaurantIds } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { theme, toggleTheme } = useTheme();
  const { status: wsStatus } = useWs();
  const { t } = useI18n();

  const base = `/${restaurantId}`;
  const allNav: { href: string; labelKey: string; icon: typeof HomeIcon; perm?: string[] }[] = [
    { href: `${base}/dashboard`, labelKey: 'dashboard', icon: HomeIcon },
    { href: `${base}/menu`, labelKey: 'menu', icon: Bars3BottomLeftIcon, perm: ['menu.view', 'menu.edit'] },
    { href: `${base}/kitchen`, labelKey: 'kitchen', icon: BeakerIcon, perm: ['kitchen.view', 'kitchen.manage'] },
    { href: `${base}/orders`, labelKey: 'orders', icon: ClipboardDocumentListIcon, perm: ['orders.view', 'orders.manage'] },
    { href: `${base}/staff`, labelKey: 'staff', icon: UsersIcon, perm: ['staff.view', 'staff.manage'] },
    { href: `${base}/roles`, labelKey: 'roles', icon: ShieldCheckIcon, perm: ['roles.manage'] },
    { href: `${base}/customers`, labelKey: 'customers', icon: UserGroupIcon, perm: ['customers.view', 'customers.manage'] },
    { href: `${base}/analytics`, labelKey: 'analytics', icon: ChartBarIcon, perm: ['analytics.view'] },
    { href: `${base}/settings`, labelKey: 'settings', icon: Cog6ToothIcon, perm: ['settings.view', 'settings.edit'] },
    { href: `${base}/website`, labelKey: 'website', icon: GlobeAltIcon, perm: ['settings.edit'] },
    { href: `${base}/billing`, labelKey: 'billing', icon: CreditCardIcon },
  ];
  const nav = allNav.filter((item) => !item.perm || hasAnyPermission(...item.perm));

  return (
    <aside className="w-64 min-h-screen flex flex-col" style={{ background: 'var(--sidebar-bg)' }}>
      {/* Brand + restaurant name */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-lg font-black text-white">F</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{restaurantName}</h1>
            <p className="text-xs text-[var(--text-secondary)]">{t('adminPortal')}</p>
          </div>
        </div>
      </div>

      {/* Switch restaurant (for multi-restaurant owners) */}
      {restaurantIds.length > 1 && (
        <div className="px-4 pt-3">
          <Link
            href="/select-restaurant"
            className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <BuildingStorefrontIcon className="w-4 h-4" />
            {t('switchRestaurant')}
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link text-[var(--text-secondary)] ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {t(item.labelKey)}
              {item.labelKey === 'orders' && (
                <span
                  className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${
                    wsStatus === 'connected' ? 'bg-green-400' :
                    wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                    'bg-red-400'
                  }`}
                  title={`WebSocket: ${wsStatus}`}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: theme toggle + user + logout */}
      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="sidebar-link w-full text-[var(--text-secondary)]"
        >
          {theme === 'dark' ? (
            <SunIcon className="w-5 h-5" />
          ) : (
            <MoonIcon className="w-5 h-5" />
          )}
          {theme === 'dark' ? t('lightMode') : t('darkMode')}
        </button>

        {/* User info */}
        <div className="text-xs text-[var(--text-secondary)] truncate">{user?.full_name}</div>
        <div className="text-xs text-[var(--text-secondary)] opacity-70 truncate">{user?.email}</div>

        <button
          onClick={logout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          {t('signOut')}
        </button>
      </div>
    </aside>
  );
}
