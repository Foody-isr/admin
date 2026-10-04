'use client';

import Link from 'next/link';
import { isSettingsDestinationActive, visibleSettingsNavigation } from '@/lib/settings-navigation';
import BranchSwitcher from './BranchSwitcher';
import SearchTriggerButton from './search/SearchTriggerButton';
import { NavigationFrame, useDesktopNavigation } from './common/NavigationFrame';
import { Drawer } from './ds';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useWs } from '@/lib/ws-context';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import { getLowStockCount, getPrepLowStockCount } from '@/lib/api';
import {
  Home,
  Menu as MenuIcon,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Globe,
  UserCog,
  UserRound,
  Building2,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Flame,
  Sun,
  Moon,
  Languages,
  Truck,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import { useSidebar } from '@/lib/sidebar-context';
import { isCourierRoleName } from '@/lib/courier-access';

interface SubItem {
  href: string;
  labelKey: string;
  badge?: number;
  badgeLabelKey?: string;
  /**
   * Permissions granting access to this entry (any one of them). Needed when a
   * section groups pages with different gates — Clients holds both the customer
   * list and Promotions, which not every role may see.
   */
  perm?: string[];
  /** Hide this entry when the sidebar is shown as the mobile drawer (<lg). */
  desktopOnly?: boolean;
  exact?: boolean;
}

interface SubItemGroup {
  labelKey: string;
  items: SubItem[];
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  perm?: string[];
  subItems?: SubItem[];
  subGroups?: SubItemGroup[];
  /** Override the href used when clicking the main nav item (defaults to first sub-item). */
  clickHref?: string;
  /** Hide this entry when the sidebar is shown as the mobile drawer (<lg). */
  desktopOnly?: boolean;
}

interface SidebarProps {
  restaurantId: number;
  restaurantName?: string;
  isOpen: boolean;
  onClose: () => void;
}

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', he: 'עברית', fr: 'Français' };

export default function Sidebar({ restaurantId, restaurantName, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, restaurantIds, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const { hasAnyPermission, roleName, loading: permissionsLoading } = usePermissions();
  const { status: wsStatus } = useWs();
  const { t, direction, locale, setLocale } = useI18n();
  const { collapsed: storedCollapsed, toggleCollapsed, setCollapsed } = useSidebar();
  const desktop = useDesktopNavigation();
  const collapsed = desktop && storedCollapsed;

  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowPrepCount, setLowPrepCount] = useState(0);
  const [expansion, setExpansion] = useState<{ pathname: string; overrides: Record<string, boolean> }>({ pathname, overrides: {} });
  const overrides = expansion.pathname === pathname ? expansion.overrides : {};
  const settingsGroups = visibleSettingsNavigation(restaurantId, hasAnyPermission);

  useEffect(() => {
    if (permissionsLoading || isCourierRoleName(roleName)) return;
    getLowStockCount(restaurantId).then(setLowStockCount).catch(() => {});
    getPrepLowStockCount(restaurantId).then(setLowPrepCount).catch(() => {});
  }, [permissionsLoading, restaurantId, roleName]);

  const base = `/${restaurantId}`;
  const isRtl = direction === 'rtl';

  function toggleKey(key: string, expanded: boolean) {
    setExpansion(current => ({ pathname, overrides: { ...(current.pathname === pathname ? current.overrides : {}), [key]: !expanded } }));
  }

  const allNav: NavItem[] = [
    { href: `${base}/dashboard`, labelKey: 'dashboard', icon: Home },
    {
      href: `${base}/menu`,
      labelKey: 'menu',
      icon: MenuIcon,
      perm: ['menu.view', 'menu.edit'],
      clickHref: `${base}/menu/items`,
      // Flattened — no "Articles" subtitle/group header in the sidebar.
      // Rotation + AI Import routes removed (not in use).
      subItems: [
        { href: `${base}/menu/items`, labelKey: 'itemLibrary' },
        { href: `${base}/menu/menus`, labelKey: 'menus' },
        { href: `${base}/menu/categories`, labelKey: 'categories' },
        { href: `${base}/menu/modifier-sets`, labelKey: 'modifierSets' },
        { href: `${base}/menu/options`, labelKey: 'options' },
      ],
    },
    {
      href: `${base}/kitchen`,
      labelKey: 'kitchen',
      icon: Flame,
      perm: ['kitchen.view', 'kitchen.manage'],
      clickHref: `${base}/kitchen/daily-operations`,
      subItems: [
        { href: `${base}/kitchen/daily-operations`, labelKey: 'today' },
        { href: `${base}/kitchen/stock`, labelKey: 'stock', badge: lowStockCount },
        { href: `${base}/kitchen/prep`, labelKey: 'preparations', badge: lowPrepCount },
        { href: `${base}/kitchen/suppliers`, labelKey: 'purchases' },
        { href: `${base}/kitchen/food-cost`, labelKey: 'costsAndMargins' },
      ],
    },
    {
      href: `${base}/orders/all`,
      labelKey: 'orders',
      icon: ClipboardList,
      perm: ['orders.view', 'orders.manage'],
      clickHref: `${base}/orders/all`,
      subItems: [
        { href: `${base}/orders/all`, labelKey: 'orders' },
        { href: `${base}/orders/deliveries`, labelKey: 'deliveries' },
        {
          href: `${base}/orders/courier-mode`,
          labelKey: 'courierMode',
          perm: ['orders.manage'],
        },
        { href: `${base}/orders/production`, labelKey: 'productionTitle' },
      ],
    },
    {
      href: `${base}/website-v3`,
      labelKey: 'online',
      icon: Globe,
      perm: ['settings.edit'],
      // The group is visible on mobile so an admin can reach Stories (connect
      // Instagram) from a phone. The website builder itself stays desktop-only.
      subItems: [
        {
          href: `${base}/website-v3`,
          labelKey: 'websiteBuilderV3',
          badgeLabelKey: 'betaLabel',
          desktopOnly: true,
        },
        { href: `${base}/reels`, labelKey: 'reels' },
      ],
    },
    {
      // Everything aimed at the customer lives here: who they are, and what we
      // offer them. Promotions keep their /marketing/* route, whose permission
      // gate is keyed on that path segment.
      href: `${base}/customers`,
      labelKey: 'customers',
      icon: Users,
      perm: ['customers.view', 'customers.manage', 'discounts.view', 'discounts.edit'],
      subItems: [
        { href: `${base}/customers`, labelKey: 'customers', perm: ['customers.view', 'customers.manage'] },
        { href: `${base}/marketing/discounts`, labelKey: 'discounts', perm: ['discounts.view', 'discounts.edit'] },
      ],
    },
    {
      href: `${base}/analytics`,
      labelKey: 'reports',
      icon: BarChart3,
      perm: ['analytics.view'],
      subItems: [
        { href: `${base}/analytics/overview`, labelKey: 'overview' },
        { href: `${base}/analytics/items`, labelKey: 'salesByItem' },
        { href: `${base}/analytics/customers`, labelKey: 'salesByCustomer' },
      ],
    },
    {
      href: `${base}/staff`,
      labelKey: 'staff',
      icon: UserCog,
      perm: ['staff.view', 'staff.manage', 'roles.manage', 'shifts.view', 'shifts.manage'],
      desktopOnly: true,
      subItems: [
        { href: `${base}/staff`, labelKey: 'staffMembers', perm: ['staff.view', 'staff.manage'] },
        { href: `${base}/roles`, labelKey: 'rolesPermissions', perm: ['roles.manage', 'staff.manage'] },
        { href: `${base}/staff/table-service`, labelKey: 'floorService', perm: ['staff.manage'] },
        { href: `${base}/staff/shifts`, labelKey: 'shiftReports', perm: ['shifts.view', 'shifts.manage'] },
        { href: `${base}/staff/devices`, labelKey: 'posAccess', perm: ['shifts.manage'] },
      ],
    },
    {
      href: `${base}/catering/services`,
      labelKey: 'nav_catering',
      icon: PartyPopper,
      perm: ['catering.view', 'catering.manage'],
      subItems: [
        { href: `${base}/catering/services`, labelKey: 'nav_catering_services', perm: ['catering.view', 'catering.manage'] },
        { href: `${base}/catering/branches`, labelKey: 'nav_catering_branches', perm: ['catering.manage'] },
        { href: `${base}/catering/quotes`, labelKey: 'nav_catering_quotes', perm: ['catering.view', 'catering.manage'] },
        { href: `${base}/catering/events`, labelKey: 'nav_catering_events', perm: ['catering.view', 'catering.manage'] },
        { href: `${base}/catering/routing`, labelKey: 'nav_catering_routing', perm: ['catering.manage'] },
      ],
    },
    {
      href: `${base}/settings`,
      labelKey: 'settings',
      icon: Settings,
      subGroups: settingsGroups,
    },
  ];
  const courierNav: NavItem[] = [
    {
      href: `${base}/orders/deliveries`,
      labelKey: 'deliveries',
      icon: Truck,
      perm: ['orders.view'],
    },
  ];
  // A section is visible when the user holds any of its permissions; its
  // sub-entries are then filtered on their own gate, so a section that mixes
  // gates (Clients: customer list + Promotions) only ever offers the pages the
  // user can actually open. Dropping a section left with no sub-entry keeps a
  // section from becoming a dead link.
  const nav = (permissionsLoading ? [] : isCourierRoleName(roleName) ? courierNav : allNav)
    .filter((item) => !item.perm || hasAnyPermission(...item.perm))
    .map((item) =>
      item.subItems
        ? { ...item, subItems: item.subItems.filter((s) => !s.perm || hasAnyPermission(...s.perm)) }
        : item,
    )
    .filter((item) => (!item.subItems || item.subItems.length > 0) && (!item.subGroups || item.subGroups.length > 0));

  function getSubHrefs(item: NavItem): string[] {
    return [
      ...(item.subItems?.map((s) => s.href) ?? []),
      ...(item.subGroups?.flatMap((g) => g.items.map((s) => s.href)) ?? []),
    ];
  }

  function isPathActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/');
  }

  function isItemActive(item: NavItem): boolean {
    if (isPathActive(item.href)) return true;
    return getSubHrefs(item).some(isPathActive);
  }

  function getNavHref(item: NavItem): string {
    if (item.clickHref) return item.clickHref;
    if (item.subItems) return item.subItems[0].href;
    if (item.subGroups) return item.subGroups[0].items[0].href;
    return item.href;
  }

  function hasChildren(item: NavItem): boolean {
    return !!(item.subItems?.length || item.subGroups?.length);
  }

  const sidebarWidth = collapsed
    ? 'w-[var(--sidebar-w-collapsed)]'
    : 'w-[var(--sidebar-w)]';

  return (
    <>
      <NavigationFrame open={isOpen} onClose={onClose}
        className={`
          fixed top-0 z-30 h-dvh pt-safe-t pb-safe-b flex flex-col overflow-y-auto bg-[var(--sidebar-bg)]
          ${sidebarWidth}
          transition-[width,transform] duration-200 ease-in-out
          lg:translate-x-0
          ${isRtl ? 'right-0 border-l' : 'left-0 border-r'}
          border-[var(--line)]
          ${isOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}
        `}
      >
        {desktop && !collapsed && <div className="space-y-4 px-4 py-4">
          <div className="min-w-0 rounded-xl border border-[var(--line)] px-2 py-1 text-sm"><BranchSwitcher restaurantId={restaurantId} restaurantName={restaurantName ?? ''} /></div>
          <SearchTriggerButton placement="sidebar" />
        </div>}

        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-2 lg:hidden">
          <span className="text-xs font-semibold text-[var(--fg-muted)]">
            {t('menu')}
          </span>
          <button onClick={onClose} aria-label={t('close')} className="p-2 rounded hover:bg-[var(--sidebar-hover)]">
            <X className="w-5 h-5 text-[var(--fg-muted)]" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label={t('mainNavigation')} className="flex-1 p-[var(--s-3)] space-y-0.5 overflow-y-auto">
          {            nav.map((item) => {
            const isActive = isItemActive(item);
            const expanded = overrides[item.labelKey] ?? isActive;
            const children = hasChildren(item);
            const totalBadge =
              (item.subItems?.reduce((a, s) => a + (s.badge ?? 0), 0) ?? 0) +
              (item.subGroups?.reduce(
                (a, g) => a + g.items.reduce((ga, s) => ga + (s.badge ?? 0), 0),
                0,
              ) ?? 0);

            return (
              <div key={item.labelKey} className={item.desktopOnly ? 'max-lg:hidden' : undefined}>
                {/* Top-level row */}
                {children ? (
                  // Expanding a section keeps the current workspace visible.
                  <button
                    aria-label={t(item.labelKey)}
                    title={collapsed ? t(item.labelKey) : undefined}
                    aria-expanded={!collapsed && expanded}
                    aria-controls={`nav-${item.labelKey}`}
                    onClick={() => {
                      if (collapsed) {
                        setCollapsed(false);
                        setExpansion(current => ({ pathname, overrides: { ...(current.pathname === pathname ? current.overrides : {}), [item.labelKey]: true } }));
                      } else {
                        toggleKey(item.labelKey, expanded);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-[var(--s-3)] min-h-10 py-2 px-[var(--s-3)] rounded-r-md text-fs-md font-medium transition-colors duration-fast ease-out ${
                      expanded
                        ? 'text-[var(--fg)]'
                        : 'text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)]'
                    }`}
                  >
                    <div className="flex items-center gap-[var(--s-3)] min-w-0">
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    </div>
                    {!collapsed && (
                      <div className="flex items-center gap-[var(--s-2)]">
                        {totalBadge > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-r-full min-w-[18px] text-center bg-[var(--surface-2)] text-[var(--fg-muted)]">
                            {totalBadge}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-3.5 h-3.5 shrink-0 transition-transform text-[var(--fg-subtle)] ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    )}
                  </button>
                ) : (
                  <Link
                    href={getNavHref(item)}
                    aria-label={t(item.labelKey)}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? t(item.labelKey) : undefined}
                    onClick={onClose}
                    className={`relative w-full flex items-center gap-[var(--s-3)] min-h-10 py-2 px-[var(--s-3)] rounded-r-md text-fs-md font-medium transition-colors duration-fast ease-out ${
                      isActive
                        ? 'bg-[var(--sidebar-hover)] text-[var(--fg)] font-semibold before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:bg-[var(--brand-500)] before:rounded-e-[2px]'
                        : 'text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)]'
                    }`}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
                    {item.labelKey === 'orders' && !collapsed && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          wsStatus === 'connected'
                            ? 'bg-[var(--success-500)]'
                            : wsStatus === 'connecting'
                              ? 'bg-[var(--warning-500)] animate-pulse'
                              : 'bg-[var(--danger-500)]'
                        }`}
                        title={`WebSocket: ${wsStatus}`}
                      />
                    )}
                  </Link>
                )}

                {/* Expanded sub-items */}
                {children && expanded && !collapsed && (
                  <div id={`nav-${item.labelKey}`} className="mt-0.5 space-y-0.5 ps-5">
                    {item.subGroups?.map((group) => {
                      const groupKey = `${item.labelKey}-${group.labelKey}`;
                      const groupActive = group.items.some(sub => isSettingsDestinationActive(pathname, sub));
                      const groupExpanded = overrides[groupKey] ?? groupActive;
                      return <div key={groupKey}>
                        <button type="button" aria-expanded={groupExpanded} aria-controls={`nav-${groupKey}`}
                          onClick={() => toggleKey(groupKey, groupExpanded)}
                          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-r-md px-3 py-2 text-start text-fs-sm font-medium text-[var(--fg)] hover:bg-[var(--sidebar-hover)]">
                          <span>{t(group.labelKey)}</span>
                          <ChevronDown aria-hidden className={`size-3.5 shrink-0 text-[var(--fg-subtle)] transition-transform ${groupExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {groupExpanded && <div id={`nav-${groupKey}`} className="ps-3">
                          {group.items.map(sub => <SubLink key={sub.href} href={sub.href} label={t(sub.labelKey)}
                            active={isSettingsDestinationActive(pathname, sub)} desktopOnly={sub.desktopOnly} onClick={onClose} />)}
                        </div>}
                      </div>;
                    })}
                    {item.subItems?.map((sub) => {
                      const active = isPathActive(sub.href);
                      return (
                        <SubLink
                          key={sub.href}
                          href={sub.href}
                          label={t(sub.labelKey)}
                          badge={sub.badge}
                          badgeLabel={sub.badgeLabelKey ? t(sub.badgeLabelKey) : undefined}
                          active={active}
                          desktopOnly={sub.desktopOnly}
                          onClick={onClose}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
            })
          }
        </nav>

        {/* Account stays accessible without a branded navigation header. */}
        <div className="border-t border-[var(--line)]">
          <div className={collapsed ? 'grid grid-cols-1' : 'flex'}>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label={`Foody · ${t('profile')}`}
              title={t('profile')}
              className="flex h-11 flex-1 items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)]"
            >
              <UserRound aria-hidden className="size-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="flex-1 h-11 flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)] transition-colors duration-fast ease-out"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={toggleCollapsed}
              className="flex-1 h-11 flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)] transition-colors duration-fast ease-out"
              title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            >
              {collapsed ? (
                isRtl ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )
              ) : isRtl ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </NavigationFrame>

      <Drawer open={profileOpen} onOpenChange={setProfileOpen} title={t('profile')} width={360}>
        {/* User info */}
        <div className="px-5 py-5 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[var(--action)] text-[var(--action-fg)]">
              <span className="text-sm font-bold">
                {(user?.full_name || user?.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              {user?.full_name && (
                <p className="text-sm font-semibold truncate text-[var(--fg)]">
                  {user.full_name}
                </p>
              )}
              {user?.email && (
                <p className="text-xs truncate text-[var(--fg-muted)]">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          {restaurantName && (
            <p className="mt-3 text-xs font-medium text-[var(--fg-muted)]">
              {restaurantName}
            </p>
          )}
        </div>

        {/* Drawer menu items */}
        <nav className="flex-1 overflow-y-auto py-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--sidebar-hover)] text-[var(--fg)]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>

          <div className="px-5 py-3">
            <div className="flex items-center gap-3 mb-2">
              <Languages className="w-5 h-5 text-[var(--fg)]" />
              <span className="text-sm text-[var(--fg)]">{t('language')}</span>
            </div>
            <div className="flex gap-2 ms-8">
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    locale === loc
                      ? 'border-brand-500 text-brand-500 font-semibold'
                      : 'border-[var(--line)] text-[var(--fg-muted)] hover:border-[var(--text-secondary)]'
                  }`}
                >
                  {LOCALE_LABELS[loc]}
                </button>
              ))}
            </div>
          </div>

          {restaurantIds.length > 1 && (
            <Link
              href="/select-restaurant"
              onClick={() => setProfileOpen(false)}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--sidebar-hover)] text-[var(--fg)]"
            >
              <Building2 className="w-5 h-5" />
              {t('switchRestaurant')}
            </Link>
          )}

          {settingsGroups.length > 0 && <Link
            href={settingsGroups.flatMap(group => group.items).find(item => item.href === `/${restaurantId}/settings`)?.href ?? settingsGroups[0].items[0].href}
            onClick={() => setProfileOpen(false)}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--sidebar-hover)] text-[var(--fg)]"
          >
            <Settings className="w-5 h-5" />
            {t('settings')}
          </Link>}
        </nav>

        <div className="border-t border-[var(--line)] px-5 py-4">
          <button
            onClick={() => {
              setProfileOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors hover:bg-red-500/10 text-red-500"
          >
            <LogOut className="w-5 h-5" />
            {t('signOut')}
          </button>
        </div>
      </Drawer>
    </>
  );
}

function SubLink({
  href,
  label,
  badge,
  badgeLabel,
  active,
  desktopOnly,
  onClick,
}: {
  href: string;
  label: string;
  badge?: number;
  badgeLabel?: string;
  active: boolean;
  desktopOnly?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-[var(--s-2)] px-[var(--s-3)] py-2 rounded-r-md text-fs-md font-medium transition-colors duration-fast ease-out ${
        desktopOnly ? 'max-lg:hidden ' : ''
      }${
        active
          ? 'bg-[var(--selection)] text-[var(--brand-ink)]'
          : 'text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)]'
      }`}
    >
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-r-full min-w-[18px] text-center ${
            active
              ? 'bg-[color-mix(in_oklab,var(--brand-500)_18%,transparent)] text-[var(--brand-500)]'
              : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
          }`}
        >
          {badge}
        </span>
      )}
      {badgeLabel && (
        <span
          className={`rounded-r-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${
            active
              ? 'bg-[color-mix(in_oklab,var(--brand-500)_18%,transparent)] text-[var(--brand-500)]'
              : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
          }`}
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  );
}
