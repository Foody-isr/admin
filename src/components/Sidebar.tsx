'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
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
  BuildingStorefrontIcon,
  BeakerIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  restaurantId: number;
  restaurantName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ restaurantId, restaurantName, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { restaurantIds } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { status: wsStatus } = useWs();
  const { t, direction } = useI18n();

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

  const isRtl = direction === 'rtl';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-12 z-30 w-64 h-[calc(100vh-3rem)] flex flex-col overflow-y-auto
          transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${isRtl ? 'right-0' : 'left-0'}
          ${isOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}
          ${isRtl ? 'border-l' : 'border-r'}
        `}
        style={{
          background: 'var(--sidebar-bg)',
          borderColor: 'var(--divider)',
        }}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            {t('menu')}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--sidebar-hover)]">
            <XMarkIcon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Section label */}
        <div className="px-4 pt-4 pb-2 hidden lg:block">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Tools
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-1 space-y-0.5">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
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

        {/* Footer: switch restaurant */}
        {restaurantIds.length > 1 && (
          <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--divider)' }}>
            <Link
              href="/select-restaurant"
              className="flex items-center gap-2 text-xs transition-colors hover:text-brand-500"
              style={{ color: 'var(--text-secondary)' }}
            >
              <BuildingStorefrontIcon className="w-4 h-4" />
              {t('switchRestaurant')}
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
