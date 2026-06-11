'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { WsProvider } from '@/lib/ws-context';
import { useIdleTimeout } from '@/lib/use-idle-timeout';
import { useI18n } from '@/lib/i18n';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import IdleModal from '@/components/IdleModal';
import AiDrawer from '@/components/ai/AiDrawer';
import { AiChatProvider } from '@/lib/ai-context';
import { SearchShortcutProvider } from '@/lib/search-shortcut';
import SearchModal from '@/components/search/SearchModal';
import { getRestaurant, Restaurant } from '@/lib/api';

// Slugs that map to an existing translation key in i18n.tsx. Anything not listed
// here falls back to a title-cased version of the slug.
const PAGE_SLUGS = [
  'dashboard',
  'menu',
  'kitchen',
  'orders',
  'staff',
  'roles',
  'customers',
  'analytics',
  'settings',
  'website',
  'billing',
] as const;

function RestaurantGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, restaurantIds } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { direction, t } = useI18n();
  const restaurantId = Number(params.restaurantId);
  const isFullscreen = pathname.endsWith('/website') || pathname.endsWith('/table-qr/print');
  const isWideLayout = pathname.includes('/orders');

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [restaurantError, setRestaurantError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showModal: idleVisible, countdown, dismiss: dismissIdle } = useIdleTimeout();

  const isRtl = direction === 'rtl';

  // Derive current page name from pathname
  const segments = pathname.split('/');
  const pageSlug = segments[2] || 'dashboard';
  const pageName = (PAGE_SLUGS as readonly string[]).includes(pageSlug)
    ? t(pageSlug)
    : pageSlug.charAt(0).toUpperCase() + pageSlug.slice(1);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    if (restaurantIds.length > 0 && !restaurantIds.includes(restaurantId)) {
      router.push('/select-restaurant');
      return;
    }
    setRestaurantLoading(true);
    setRestaurantError(false);
    getRestaurant(restaurantId)
      .then((r) => { setRestaurant(r); setRestaurantError(false); })
      .catch(() => setRestaurantError(true))
      .finally(() => setRestaurantLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn, restaurantId, restaurantIds, retryCount]);

  if (loading || restaurantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (restaurantError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-fg-secondary">Unable to load restaurant. Check your connection.</p>
        <button
          className="text-sm text-brand-500 underline"
          onClick={() => setRetryCount((c) => c + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!isLoggedIn || !restaurant) return null;

  if (isFullscreen) {
    return (
      <PermissionsProvider restaurantId={restaurantId}>
        <WsProvider restaurantId={restaurantId}>
          <div className="min-h-screen">{children}</div>
          {idleVisible && <IdleModal countdown={countdown} onDismiss={dismissIdle} />}
        </WsProvider>
      </PermissionsProvider>
    );
  }

  return (
    <PermissionsProvider restaurantId={restaurantId}>
      <WsProvider restaurantId={restaurantId}>
        <AiChatProvider restaurantId={restaurantId}>
          <SearchShortcutProvider>
            <SidebarProvider>
              <RestaurantShell
                restaurant={restaurant}
                restaurantId={restaurantId}
                sidebarOpen={sidebarOpen}
                toggleSidebar={toggleSidebar}
                closeSidebar={closeSidebar}
                isRtl={isRtl}
                isWideLayout={isWideLayout}
                pageName={pageName}
              >
                {children}
              </RestaurantShell>
              <AiDrawer />
              <SearchModal />
              {idleVisible && <IdleModal countdown={countdown} onDismiss={dismissIdle} />}
            </SidebarProvider>
          </SearchShortcutProvider>
        </AiChatProvider>
      </WsProvider>
    </PermissionsProvider>
  );
}

function RestaurantShell({
  children,
  restaurant,
  restaurantId,
  sidebarOpen,
  toggleSidebar,
  closeSidebar,
  isRtl,
  isWideLayout,
  pageName,
}: {
  children: React.ReactNode;
  restaurant: Restaurant;
  restaurantId: number;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  isRtl: boolean;
  isWideLayout: boolean;
  pageName: string;
}) {
  const { collapsed } = useSidebar();
  // Sidebar widths come from tokens (260 / 72) — keep these arbitrary classes
  // in sync with --sidebar-w / --sidebar-w-collapsed in globals.css.
  // Sidebar is always on the left — margin is always left regardless of RTL.
  const marginClass = collapsed
    ? 'lg:ml-[var(--sidebar-w-collapsed)]'
    : 'lg:ml-[var(--sidebar-w)]';
  return (
    <div className="h-screen flex">
      <div className="flex flex-1 min-w-0">
        <Sidebar
          restaurantId={restaurantId}
          restaurantName={restaurant.name}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
        />
        <main
          className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden transition-[margin] duration-200 ${marginClass}`}
        >
          <TopBar
            restaurantName={restaurant.name}
            pageName={pageName}
            onToggleSidebar={toggleSidebar}
          />
          <div className={`min-w-0 ${isWideLayout ? 'p-6 lg:p-8' : 'px-6 py-6 lg:px-8'}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RestaurantGuard>{children}</RestaurantGuard>
    </AuthProvider>
  );
}
