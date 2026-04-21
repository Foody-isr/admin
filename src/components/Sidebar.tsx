'use client';

import Link from 'next/link';
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
  Building2,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
  Bell,
  HelpCircle,
  Sparkles,
  User as UserIcon,
  Calendar,
  LogOut,
  Flame,
  Sun,
  Moon,
  Languages,
  type LucideIcon,
} from 'lucide-react';
import { useAi } from '@/lib/ai-context';
import { useSidebar } from '@/lib/sidebar-context';
import FullscreenToggle from '@/components/FullscreenToggle';

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
  icon: LucideIcon;
  perm?: string[];
  subItems?: SubItem[];
  subGroups?: SubItemGroup[];
  /** Override the href used when clicking the main nav item (defaults to first sub-item). */
  clickHref?: string;
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
  const ai = useAi();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const { hasAnyPermission } = usePermissions();
  const { status: wsStatus } = useWs();
  const { t, direction, locale, setLocale } = useI18n();
  const { collapsed, toggleCollapsed } = useSidebar();

  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowPrepCount, setLowPrepCount] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    getLowStockCount(restaurantId).then(setLowStockCount).catch(() => {});
    getPrepLowStockCount(restaurantId).then(setLowPrepCount).catch(() => {});
  }, [restaurantId]);

  const base = `/${restaurantId}`;
  const isRtl = direction === 'rtl';
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  function toggleKey(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allNav: NavItem[] = [
    { href: `${base}/dashboard`, labelKey: 'dashboard', icon: Home },
    {
      href: `${base}/menu`,
      labelKey: 'menu',
      icon: MenuIcon,
      perm: ['menu.view', 'menu.edit'],
      clickHref: `${base}/menu/items`,
      subItems: [{ href: `${base}/menu/menus`, labelKey: 'menus' }],
      subGroups: [
        {
          labelKey: 'articlesGroup',
          items: [
            { href: `${base}/menu/items`, labelKey: 'itemLibrary' },
            { href: `${base}/menu/categories`, labelKey: 'categories' },
            { href: `${base}/menu/modifier-sets`, labelKey: 'modifierSets' },
            { href: `${base}/menu/options`, labelKey: 'options' },
            { href: `${base}/menu/rotation`, labelKey: 'rotation' },
            { href: `${base}/menu/import`, labelKey: 'aiImport' },
          ],
        },
      ],
    },
    {
      href: `${base}/kitchen`,
      labelKey: 'kitchen',
      icon: Flame,
      perm: ['kitchen.view', 'kitchen.manage'],
      subItems: [
        { href: `${base}/kitchen/stock`, labelKey: 'stock', badge: lowStockCount },
        { href: `${base}/kitchen/recipes`, labelKey: 'recipes' },
        { href: `${base}/kitchen/prep`, labelKey: 'preparations', badge: lowPrepCount },
        { href: `${base}/kitchen/food-cost`, labelKey: 'foodCost' },
        { href: `${base}/kitchen/daily-operations`, labelKey: 'dailyOperations' },
        { href: `${base}/kitchen/supplies`, labelKey: 'supplies' },
      ],
    },
    {
      href: `${base}/orders/all`,
      labelKey: 'orders',
      icon: ClipboardList,
      perm: ['orders.view', 'orders.manage'],
    },
    {
      href: `${base}/website`,
      labelKey: 'online',
      icon: Globe,
      perm: ['settings.edit'],
      subItems: [{ href: `${base}/website`, labelKey: 'websiteBuilder' }],
    },
    {
      href: `${base}/customers`,
      labelKey: 'customers',
      icon: Users,
      perm: ['customers.view', 'customers.manage'],
      subItems: [
        { href: `${base}/customers`, labelKey: 'customerDirectory' },
        { href: `${base}/analytics/customers`, labelKey: 'customerInsights' },
      ],
    },
    {
      href: `${base}/analytics`,
      labelKey: 'reports',
      icon: BarChart3,
      perm: ['analytics.view'],
      subItems: [{ href: `${base}/analytics/overview`, labelKey: 'overview' }],
    },
    {
      href: `${base}/staff`,
      labelKey: 'staff',
      icon: UserCog,
      perm: ['staff.view', 'staff.manage', 'roles.manage'],
      subItems: [
        { href: `${base}/staff`, labelKey: 'staffMembers' },
        { href: `${base}/roles`, labelKey: 'rolesPermissions' },
      ],
    },
    {
      href: `${base}/settings`,
      labelKey: 'settings',
      icon: Settings,
      perm: ['settings.view', 'settings.edit', 'tables.manage'],
      subItems: [
        { href: `${base}/settings`, labelKey: 'general' },
        { href: `${base}/settings/opening-hours`, labelKey: 'openingHours' },
        { href: `${base}/orders/settings`, labelKey: 'fulfillmentSettings' },
        { href: `${base}/restaurant/floor-plans`, labelKey: 'floorPlans' },
        { href: `${base}/restaurant/table-status`, labelKey: 'tableStatus' },
        { href: `${base}/restaurant/workflow`, labelKey: 'workflow' },
        { href: `${base}/billing`, labelKey: 'billing' },
      ],
    },
  ];
  const nav = allNav.filter((item) => !item.perm || hasAnyPermission(...item.perm));

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

  const sidebarWidth = collapsed ? 'w-20' : 'w-64';
  const brandInitial = (restaurantName?.trim().charAt(0) || 'F').toUpperCase();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed top-0 z-30 h-screen flex flex-col overflow-y-auto bg-white dark:bg-[#111111]
          ${sidebarWidth}
          transition-[width,transform] duration-200 ease-in-out
          lg:translate-x-0
          ${isRtl ? 'right-0 border-l' : 'left-0 border-r'}
          border-neutral-200 dark:border-neutral-800
          ${isOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}
        `}
      >
        {/* Brand / restaurant header — matches Figma Make App.tsx lines 209-216 */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 text-left"
            aria-label={t('profile')}
          >
            <div className="size-10 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold">
              {brandInitial}
            </div>
            {!collapsed && (
              <h1 className="font-bold text-xl text-neutral-900 dark:text-white truncate">
                {restaurantName ?? 'Foody'}
              </h1>
            )}
          </button>
        </div>

        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-2 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {t('menu')}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-[#1a1a1a]">
            <X className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const isActive = isItemActive(item);
            const expanded = expandedKeys.has(item.labelKey) || isActive;
            const children = hasChildren(item);
            const totalBadge =
              (item.subItems?.reduce((a, s) => a + (s.badge ?? 0), 0) ?? 0) +
              (item.subGroups?.reduce(
                (a, g) => a + g.items.reduce((ga, s) => ga + (s.badge ?? 0), 0),
                0,
              ) ?? 0);

            return (
              <div key={item.labelKey}>
                {/* Top-level row */}
                {children ? (
                  // Parent groups never get the orange gradient — only text color
                  // shifts when expanded. Active state lives on the leaf child.
                  <button
                    onClick={() => {
                      if (collapsed) {
                        // In collapsed mode, clicking top-level navigates instead of expanding.
                        window.location.href = getNavHref(item);
                      } else {
                        toggleKey(item.labelKey);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
                      expanded
                        ? 'text-neutral-900 dark:text-white'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] hover:text-neutral-900 dark:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!collapsed && (
                        <span className="font-medium truncate">
                          {t(item.labelKey)}
                        </span>
                      )}
                    </div>
                    {!collapsed && (
                      <div className="flex items-center gap-2">
                        {totalBadge > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-semibold bg-orange-500/15 text-orange-500">
                            {totalBadge}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 transition-transform text-neutral-600 dark:text-neutral-400 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    )}
                  </button>
                ) : (
                  <Link
                    href={getNavHref(item)}
                    onClick={onClose}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] hover:text-neutral-900 dark:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <span className="font-medium flex-1 truncate">
                        {t(item.labelKey)}
                      </span>
                    )}
                    {item.labelKey === 'orders' && !collapsed && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          wsStatus === 'connected'
                            ? 'bg-green-400'
                            : wsStatus === 'connecting'
                              ? 'bg-yellow-400 animate-pulse'
                              : 'bg-red-400'
                        }`}
                        title={`WebSocket: ${wsStatus}`}
                      />
                    )}
                  </Link>
                )}

                {/* Expanded sub-items */}
                {children && expanded && !collapsed && (
                  <div
                    className={`mt-1 space-y-0.5 ${
                      isRtl ? 'mr-4 pr-4 border-r-2' : 'ml-4 pl-4 border-l-2'
                    } border-neutral-200 dark:border-neutral-800`}
                  >
                    {item.subGroups?.map((group) => (
                      <div key={group.labelKey} className="py-1">
                        <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                          {t(group.labelKey)}
                        </p>
                        {group.items.map((sub) => {
                          const active = isPathActive(sub.href);
                          return (
                            <SubLink
                              key={sub.href}
                              href={sub.href}
                              label={t(sub.labelKey)}
                              badge={sub.badge}
                              active={active}
                              onClick={onClose}
                            />
                          );
                        })}
                      </div>
                    ))}
                    {item.subItems?.map((sub) => {
                      const active = isPathActive(sub.href);
                      return (
                        <SubLink
                          key={sub.href}
                          href={sub.href}
                          label={t(sub.labelKey)}
                          badge={sub.badge}
                          active={active}
                          onClick={onClose}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer — action icons + theme/collapse toggles */}
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-around px-2 py-2 border-b border-neutral-200 dark:border-neutral-800">
            <IconBtn label={t('notifications')} badge>
              <Bell className="w-5 h-5" />
            </IconBtn>
            <IconBtn label={t('calendar')}>
              <Calendar className="w-5 h-5" />
            </IconBtn>
            <IconBtn label={t('help')}>
              <HelpCircle className="w-5 h-5" />
            </IconBtn>
            <IconBtn label="Foody AI" onClick={ai.toggleDrawer} active={ai.isOpen}>
              <Sparkles className="w-5 h-5" />
            </IconBtn>
            <FullscreenToggle />
          </div>
          <div className="flex">
            <button
              onClick={toggleTheme}
              className={`flex-1 p-3 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors flex items-center justify-center text-neutral-600 dark:text-neutral-400 ${isRtl ? 'border-l' : 'border-r'} border-neutral-200 dark:border-neutral-800`}
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={toggleCollapsed}
              className="flex-1 p-3 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors flex items-center justify-center text-neutral-600 dark:text-neutral-400"
              title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            >
              {collapsed ? (
                isRtl ? (
                  <ChevronLeft className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )
              ) : isRtl ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Profile drawer ── */}
      {profileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-50"
          onClick={() => setProfileOpen(false)}
        />
      )}
      <div
        className={`
          fixed top-0 bottom-0 z-50 w-80 max-w-[85vw] flex flex-col bg-white dark:bg-[#111111]
          transition-transform duration-200 ease-in-out border-neutral-200 dark:border-neutral-800
          ${isRtl ? 'left-0 border-r' : 'right-0 border-l'}
          ${profileOpen ? 'translate-x-0' : isRtl ? '-translate-x-full' : 'translate-x-full'}
        `}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setProfileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-[#1a1a1a]"
          >
            <X className="w-5 h-5 text-neutral-900 dark:text-white" />
          </button>
        </div>

        {/* User info */}
        <div className="px-5 py-5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand-500 text-white">
              <span className="text-sm font-bold">
                {(user?.full_name || user?.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              {user?.full_name && (
                <p className="text-sm font-semibold truncate text-neutral-900 dark:text-white">
                  {user.full_name}
                </p>
              )}
              {user?.email && (
                <p className="text-xs truncate text-neutral-600 dark:text-neutral-400">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          {restaurantName && (
            <p className="mt-3 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {restaurantName}
            </p>
          )}
        </div>

        {/* Drawer menu items */}
        <nav className="flex-1 overflow-y-auto py-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-900 dark:text-white"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>

          <div className="px-5 py-3">
            <div className="flex items-center gap-3 mb-2">
              <Languages className="w-5 h-5 text-neutral-900 dark:text-white" />
              <span className="text-sm text-neutral-900 dark:text-white">{t('language')}</span>
            </div>
            <div className="flex gap-2 ml-8">
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    locale === loc
                      ? 'border-brand-500 text-brand-500 font-semibold'
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-[var(--text-secondary)]'
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
              className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-900 dark:text-white"
            >
              <Building2 className="w-5 h-5" />
              {t('switchRestaurant')}
            </Link>
          )}

          <Link
            href={`/${restaurantId}/settings`}
            onClick={() => setProfileOpen(false)}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-900 dark:text-white"
          >
            <Settings className="w-5 h-5" />
            {t('settings')}
          </Link>
        </nav>

        <div className="border-t border-neutral-200 dark:border-neutral-800 px-5 py-4">
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
      </div>
    </>
  );
}

function SubLink({
  href,
  label,
  badge,
  active,
  onClick,
}: {
  href: string;
  label: string;
  badge?: number;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-brand-500 text-white'
          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] hover:text-neutral-900 dark:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
            active ? 'bg-white/20 text-white' : 'bg-brand-500/15 text-brand-500'
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  badge,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  badge?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-lg transition-colors text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] hover:text-neutral-900 dark:text-white ${
        active ? 'bg-[var(--sidebar-hover)] text-neutral-900 dark:text-white' : ''
      }`}
      aria-label={label}
      title={label}
    >
      {children}
      {badge && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </button>
  );
}
