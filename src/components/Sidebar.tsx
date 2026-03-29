'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useWs } from '@/lib/ws-context';
import { useI18n } from '@/lib/i18n';
import { getLowStockCount, getPrepLowStockCount } from '@/lib/api';
import {
  HomeIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  UserGroupIcon,
  BuildingStorefrontIcon,
  XMarkIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

interface SubItem {
  href: string;
  labelKey: string;
  badge?: number;
}

interface SubItemGroup {
  labelKey: string;
  items: SubItem[];
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof HomeIcon;
  perm?: string[];
  /** Flat list of sub-items (for simple sections) */
  subItems?: SubItem[];
  /** Grouped sub-items with collapsible section headers (for complex sections) */
  subGroups?: SubItemGroup[];
}

interface SidebarProps {
  restaurantId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ restaurantId, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { restaurantIds } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { status: wsStatus } = useWs();
  const { t, direction } = useI18n();

  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowPrepCount, setLowPrepCount] = useState(0);
  // All groups start expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['articlesGroup', 'stockGroup'])
  );

  useEffect(() => {
    getLowStockCount(restaurantId).then(setLowStockCount).catch(() => {});
    getPrepLowStockCount(restaurantId).then(setLowPrepCount).catch(() => {});
  }, [restaurantId]);

  const base = `/${restaurantId}`;
  const isRtl = direction === 'rtl';
  const BackArrow = isRtl ? ArrowRightIcon : ArrowLeftIcon;
  const Chevron = isRtl ? ChevronLeftIcon : ChevronRightIcon;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allNav: NavItem[] = [
    { href: `${base}/dashboard`, labelKey: 'dashboard', icon: HomeIcon },
    {
      href: `${base}/menu`,
      labelKey: 'menu',
      icon: Bars3BottomLeftIcon,
      perm: ['menu.view', 'menu.edit', 'kitchen.view', 'kitchen.manage'],
      subGroups: [
        {
          labelKey: 'articlesGroup',
          items: [
            { href: `${base}/menu/items`, labelKey: 'itemLibrary' },
            { href: `${base}/menu/categories`, labelKey: 'categories' },
            { href: `${base}/menu/modifiers`, labelKey: 'modifiers' },
            { href: `${base}/menu/import`, labelKey: 'aiImport' },
          ],
        },
        {
          labelKey: 'stockGroup',
          items: [
            { href: `${base}/kitchen/stock`, labelKey: 'stock', badge: lowStockCount },
            { href: `${base}/kitchen/prep`, labelKey: 'recipesAndPrep', badge: lowPrepCount },
            { href: `${base}/kitchen/food-cost`, labelKey: 'foodCost' },
            { href: `${base}/kitchen/suppliers`, labelKey: 'suppliers' },
          ],
        },
      ],
    },
    {
      href: `${base}/orders/all`,
      labelKey: 'orders',
      icon: ClipboardDocumentListIcon,
      perm: ['orders.view', 'orders.manage'],
    },
    {
      href: `${base}/website`,
      labelKey: 'online',
      icon: GlobeAltIcon,
      perm: ['settings.edit'],
      subItems: [
        { href: `${base}/website`, labelKey: 'websiteBuilder' },
      ],
    },
    {
      href: `${base}/customers`,
      labelKey: 'customers',
      icon: UserGroupIcon,
      perm: ['customers.view', 'customers.manage'],
      subItems: [
        { href: `${base}/customers`, labelKey: 'customerDirectory' },
        { href: `${base}/analytics/customers`, labelKey: 'customerInsights' },
      ],
    },
    {
      href: `${base}/analytics`,
      labelKey: 'reports',
      icon: ChartBarIcon,
      perm: ['analytics.view'],
      subItems: [
        { href: `${base}/analytics/overview`, labelKey: 'overview' },
      ],
    },
    {
      href: `${base}/staff`,
      labelKey: 'staff',
      icon: UsersIcon,
      perm: ['staff.view', 'staff.manage', 'roles.manage'],
      subItems: [
        { href: `${base}/staff`, labelKey: 'staffMembers' },
        { href: `${base}/roles`, labelKey: 'rolesPermissions' },
      ],
    },
    {
      href: `${base}/settings`,
      labelKey: 'settings',
      icon: Cog6ToothIcon,
      perm: ['settings.view', 'settings.edit', 'tables.manage'],
      subItems: [
        { href: `${base}/settings`, labelKey: 'general' },
        { href: `${base}/orders/settings`, labelKey: 'fulfillmentSettings' },
        { href: `${base}/restaurant/floor-plans`, labelKey: 'floorPlans' },
        { href: `${base}/restaurant/table-status`, labelKey: 'tableStatus' },
        { href: `${base}/restaurant/workflow`, labelKey: 'workflow' },
        { href: `${base}/billing`, labelKey: 'billing' },
      ],
    },
  ];
  const nav = allNav.filter((item) => !item.perm || hasAnyPermission(...item.perm));

  /** Returns all leaf hrefs for an item (subItems + subGroups items). */
  function getSubHrefs(item: NavItem): string[] {
    return [
      ...(item.subItems?.map((s) => s.href) ?? []),
      ...(item.subGroups?.flatMap((g) => g.items.map((s) => s.href)) ?? []),
    ];
  }

  /** True when the current pathname is within this nav item's scope. */
  function isItemActive(item: NavItem): boolean {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) return true;
    return getSubHrefs(item).some(
      (href) => pathname === href || pathname.startsWith(href + '/')
    );
  }

  // Determine if we're inside a section that has sub-items or sub-groups
  const activeSection = nav.find(
    (item) => (item.subItems || item.subGroups) && isItemActive(item)
  );

  /** The href to use when clicking a nav item in the main list */
  function getNavHref(item: NavItem): string {
    if (item.subGroups) return item.subGroups[0].items[0].href;
    if (item.subItems) return item.subItems[0].href;
    return item.href;
  }

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
            {activeSection ? t(activeSection.labelKey) : t('menu')}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--sidebar-hover)]">
            <XMarkIcon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {activeSection ? (
          /* ── Sub-navigation view (replaces main nav) ── */
          <>
            {/* Back button */}
            <div className="px-3 pt-4 pb-1">
              <Link
                href={`${base}/dashboard`}
                className="flex items-center gap-2 px-2 py-2 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--sidebar-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <BackArrow className="w-4 h-4" />
                {t(activeSection.labelKey)}
              </Link>
            </div>

            {/* Sub-items (flat) */}
            {activeSection.subItems && (
              <nav className="flex-1 px-3 py-1 space-y-0.5">
                {activeSection.subItems.map((sub) => {
                  const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={onClose}
                      className={`sidebar-link ${isActive ? 'active' : ''}`}
                    >
                      <span className="flex-1">{t(sub.labelKey)}</span>
                      {sub.badge !== undefined && sub.badge > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-500">
                          {sub.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Sub-groups (collapsible sections) */}
            {activeSection.subGroups && (
              <nav className="flex-1 px-3 py-1 space-y-1">
                {activeSection.subGroups.map((group) => {
                  const hasActiveItem = group.items.some(
                    (sub) => pathname === sub.href || pathname.startsWith(sub.href + '/')
                  );
                  // Auto-expand the group that contains the active route
                  const isExpanded = expandedGroups.has(group.labelKey) || hasActiveItem;
                  return (
                    <div key={group.labelKey}>
                      <button
                        onClick={() => toggleGroup(group.labelKey)}
                        className="w-full flex items-center justify-between px-2 py-2 text-sm font-semibold rounded-lg transition-colors hover:bg-[var(--sidebar-hover)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span>{t(group.labelKey)}</span>
                        <ChevronDownIcon
                          className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                          style={{ color: 'var(--text-secondary)' }}
                        />
                      </button>
                      {isExpanded && (
                        <div className="space-y-0.5 mt-0.5">
                          {group.items.map((sub) => {
                            const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={onClose}
                                className={`sidebar-link ${isActive ? 'active' : ''}`}
                              >
                                <span className="flex-1">{t(sub.labelKey)}</span>
                                {sub.badge !== undefined && sub.badge > 0 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-500">
                                    {sub.badge}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </>
        ) : (
          /* ── Main navigation view ── */
          <>
            {/* Section label */}
            <div className="px-4 pt-4 pb-2 hidden lg:block">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Tools
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-1 space-y-0.5">
              {nav.map((item) => {
                const isActive = isItemActive(item);
                return (
                  <Link
                    key={item.href}
                    href={getNavHref(item)}
                    onClick={onClose}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    {item.labelKey === 'orders' && (
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          wsStatus === 'connected' ? 'bg-green-400' :
                          wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                          'bg-red-400'
                        }`}
                        title={`WebSocket: ${wsStatus}`}
                      />
                    )}
                    {(item.subItems || item.subGroups) && (
                      <Chevron className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    )}
                  </Link>
                );
              })}
            </nav>
          </>
        )}

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
