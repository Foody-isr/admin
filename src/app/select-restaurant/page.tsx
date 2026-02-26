'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredRestaurantIds, getRestaurant, Restaurant, isAuthenticated } from '@/lib/api';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';

export default function SelectRestaurantPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    const rids = getStoredRestaurantIds();
    if (rids.length === 1) {
      router.replace(`/${rids[0]}/dashboard`);
      return;
    }
    Promise.all(rids.map((id) => getRestaurant(id)))
      .then(setRestaurants)
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
              <span className="text-xl font-black text-white">F</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Choose a restaurant</h1>
          </div>
        </div>

        <div className="space-y-3">
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/${r.id}/dashboard`)}
              className="w-full card hover:border-brand-500 hover:shadow-md transition-all text-left flex items-center gap-4"
            >
              {r.logo_url ? (
                <img src={r.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center">
                  <BuildingStorefrontIcon className="w-6 h-6 text-brand-500" />
                </div>
              )}
              <div>
                <div className="font-semibold text-gray-900">{r.name}</div>
                <div className="text-sm text-gray-500">{r.address}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
