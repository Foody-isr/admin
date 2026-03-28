'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { WsProvider } from '@/lib/ws-context';
import { useIdleTimeout } from '@/lib/use-idle-timeout';
import { useI18n } from '@/lib/i18n';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import IdleModal from '@/components/IdleModal';
import AiDrawer from '@/components/ai/AiDrawer';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    getRestaurant(restaurantId)
      .then(setRestaurant)
      .catch(() => router.push('/select-restaurant'))
      .finally(() => setRestaurantLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn, restaurantId, restaurantIds]);

  if (loading || restaurantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
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
          <div className="min-h-screen flex flex-col">
            <TopBar
              restaurantName={restaurant.name}
              pageName={pageName}
              onToggleSidebar={toggleSidebar}
            />
            <div className="flex flex-1 pt-12">
              <Sidebar
                restaurantId={restaurantId}
                restaurantName={restaurant.name}
                isOpen={sidebarOpen}
                onClose={closeSidebar}
              />
              <main className={`flex-1 overflow-auto ${isRtl ? 'lg:mr-64' : 'lg:ml-64'}`}>
                <div className={isWideLayout ? 'p-6 lg:p-8' : 'p-6 lg:p-8 max-w-7xl mx-auto'}>
                  {children}
                </div>
              </main>
            </div>
          </div>
          <AiDrawer />
          {idleVisible && <IdleModal countdown={countdown} onDismiss={dismissIdle} />}
        </AiChatProvider>
      </WsProvider>
    </PermissionsProvider>
  );
}

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RestaurantGuard>{children}</RestaurantGuard>
    </AuthProvider>
  );
}
