'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { FoodySpinner } from '@/components/FoodySpinner';

/** Preserve the current restaurant and query when opening a section’s default page. */
export default function RestaurantRedirect({ target }: {target: 'analytics/overview' | 'kitchen/daily-operations' | 'menu/items' | 'orders/all'}) {
  const { restaurantId } = useParams();
  const router = useRouter();
  const query = useSearchParams().toString();
  const { t } = useI18n();
  useEffect(() => { router.replace(`/${restaurantId}/${target}${query ? `?${query}` : ''}`); }, [restaurantId, target, query, router]);
  return <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-fg-secondary"><FoodySpinner size={24}/>{t('loading')}</div>;
}
