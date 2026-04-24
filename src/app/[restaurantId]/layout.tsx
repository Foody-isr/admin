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
import FullscreenExitButton from '@/components/FullscreenExitButton';
import { AiChatProvider } from '@/lib/ai-context';
import { getRestaurant, Restaurant } from '@/lib/api';

const PAGE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  menu: 'Menu',
  kitchen: 'Kitchen',
  orders: 'Orders',
  staff: 'Staff',
  roles: 'Roles',
  customers: 'Customers',
  analytics: 'Analytics',
  settings: 'Settings',
  website: 'Website',
  billing: 'Billing',
};

function RestaurantGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, restaurantIds } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { direction } = useI18n();
  const restaurantId = Number(params.restaurantId);
  const isFullscreen = pathname.endsWith('/website');
  const isWideLayout = pathname.includes('/orders');

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [restaurantError, setRestaurantError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Track browser fullscreen so we can drop the sidebar chrome and let the
  // page fill the screen. Syncs with Esc-to-exit via the fullscreenchange event.
  const [fullscreenActive, setFullscreenActive] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreenActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const { showModal: idleVisible, countdown, dismiss: dismissIdle } = useIdleTimeout();

  const isRtl = direction === 'rtl';

  // Derive current page name from pathname
  const segments = pathname.split('/');
  const pageSlug = segments[2] || 'dashboard';
  const pageName = PAGE_NAMES[pageSlug] || pageSlug.charAt(0).toUpperCase() + pageSlug.slice(1);

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
          <SidebarProvider>
            <RestaurantShell
              restaurant={restaurant}
              restaurantId={restaurantId}
              sidebarOpen={sidebarOpen}
              toggleSidebar={toggleSidebar}
              closeSidebar={closeSidebar}
              fullscreenActive={fullscreenActive}
              isRtl={isRtl}
              isWideLayout={isWideLayout}
              pageName={pageName}
            >
              {children}
            </RestaurantShell>
            <AiDrawer />
            <FullscreenExitButton />
            {idleVisible && <IdleModal countdown={countdown} onDismiss={dismissIdle} />}
          </SidebarProvider>
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
  fullscreenActive,
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
  fullscreenActive: boolean;
  isRtl: boolean;
  isWideLayout: boolean;
  pageName: string;
}) {
  const { collapsed } = useSidebar();
  // Sidebar widths come from tokens (260 / 72) — keep these arbitrary classes
  // in sync with --sidebar-w / --sidebar-w-collapsed in globals.css.
  const marginClass = fullscreenActive
    ? ''
    : collapsed
      ? isRtl
        ? 'lg:mr-[var(--sidebar-w-collapsed)]'
        : 'lg:ml-[var(--sidebar-w-collapsed)]'
      : isRtl
        ? 'lg:mr-[var(--sidebar-w)]'
        : 'lg:ml-[var(--sidebar-w)]';
  return (
    <div className="h-screen flex">
      <div className="flex flex-1 min-w-0">
        {!fullscreenActive && (
          <Sidebar
            restaurantId={restaurantId}
            restaurantName={restaurant.name}
            isOpen={sidebarOpen}
            onClose={closeSidebar}
          />
        )}
        <main
          className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden transition-[margin] duration-200 ${marginClass}`}
        >
          {!fullscreenActive && (
            <TopBar
              restaurantName={restaurant.name}
              pageName={pageName}
              onToggleSidebar={toggleSidebar}
            />
          )}
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
