'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { WsProvider } from '@/lib/ws-context';
import { useIdleTimeout } from '@/lib/use-idle-timeout';
import Sidebar from '@/components/Sidebar';
import IdleModal from '@/components/IdleModal';
import { getRestaurant, Restaurant } from '@/lib/api';

function RestaurantGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, restaurantIds } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const isFullscreen = pathname.endsWith('/website');
  const isWideLayout = pathname.endsWith('/orders');

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const { showModal: idleVisible, countdown, dismiss: dismissIdle } = useIdleTimeout();

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    // Verify user has access to this restaurant
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
        <div className="flex min-h-screen">
          <Sidebar restaurantId={restaurantId} restaurantName={restaurant.name} />
          <main className="flex-1 overflow-auto">
            <div className={isWideLayout ? 'p-6 lg:p-8' : 'p-6 lg:p-8 max-w-7xl mx-auto'}>{children}</div>
          </main>
        </div>
        {idleVisible && <IdleModal countdown={countdown} onDismiss={dismissIdle} />}
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
