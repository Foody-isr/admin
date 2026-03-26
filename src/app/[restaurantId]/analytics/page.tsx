'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AnalyticsRedirect() {
  const { restaurantId } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${restaurantId}/analytics/overview`);
  }, [restaurantId, router]);

  return null;
}
