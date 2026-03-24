'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function KitchenRedirect() {
  const { restaurantId } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${restaurantId}/kitchen/stock`);
  }, [restaurantId, router]);

  return null;
}
