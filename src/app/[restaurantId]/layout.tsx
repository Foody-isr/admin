'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';
import { getRestaurant, Restaurant } from '@/lib/api';

function RestaurantGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, restaurantIds } = useAuth();
  const router = useRouter();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);

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
  }, [loading, isLoggedIn, restaurantId, restaurantIds, router]);

  if (loading || restaurantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isLoggedIn || !restaurant) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar restaurantId={restaurantId} restaurantName={restaurant.name} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
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
