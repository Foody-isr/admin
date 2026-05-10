'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OrdersRedirect() {
  const { restaurantId } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${restaurantId}/orders/all`);
  }, [restaurantId, router]);

  return null;
}
