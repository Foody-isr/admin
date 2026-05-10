'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MenuRedirect() {
  const { restaurantId } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${restaurantId}/menu/items`);
  }, [restaurantId, router]);

  return null;
}
