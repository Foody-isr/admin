"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Store } from 'lucide-react';
import AccessShell from '@/components/brand/AccessShell';
import FoodyAdminBrand from '@/components/brand/FoodyAdminBrand';
import { getStoredRestaurantIds, getStoredUser, getRestaurant, type Restaurant, isAuthenticated, canAccessAdmin, logout } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { restaurantHomePath } from '@/lib/courier-access';

type RestaurantChoice = { id: number; restaurant?: Restaurant };

/** Select an accessible establishment, retaining access when its details fail to load. */
export default function SelectRestaurantPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [choices, setChoices] = useState<RestaurantChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    const user = getStoredUser();
    const ids = getStoredRestaurantIds();
    if (!canAccessAdmin(user, ids)) { logout(); router.replace('/login'); return; }
    if (ids.length === 1) { router.replace(restaurantHomePath(ids[0], user?.role ?? '')); return; }
    let active = true;
    setLoading(true);
    // Keep every authorized restaurant reachable even if its details fail.
    Promise.allSettled(ids.map(id => getRestaurant(id))).then(results => {
      if (active) setChoices(results.map((result, index) => ({ id: ids[index], restaurant: result.status === 'fulfilled' ? result.value : undefined })));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, attempt]);

  const incomplete = choices.some(choice => !choice.restaurant);
  return <AccessShell>
    <div className="w-full max-w-md">
      <div className="mb-8 flex justify-center"><FoodyAdminBrand subtitle={t('restaurantPortal')} /></div>
      <h1 className="mb-6 text-2xl font-semibold">{t('chooseRestaurant')}</h1>
      {loading && <p role="status" className="mb-4 flex items-center gap-3 text-sm text-fg-secondary"><LoaderCircle aria-hidden className="size-5 animate-spin" />{t('loading')}</p>}
      {!loading && incomplete && <div role="alert" className="mb-4 rounded-r-md bg-[var(--warning-50)] p-4 text-sm text-[var(--warning-500)]">
        <p>{t('restaurantDetailsUnavailable')}</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 min-h-11 font-semibold underline underline-offset-4">{t('retry')}</button>
      </div>}
      {!loading && choices.length === 0 && <p role="status" className="rounded-r-lg border border-[var(--line)] p-5 text-sm text-fg-secondary">{t('noLinkedRestaurants')}</p>}
      <div className="space-y-3" aria-busy={loading}>
        {choices.map(({ id, restaurant }) => <button key={id} type="button"
          onClick={() => router.push(restaurantHomePath(id, getStoredUser()?.role ?? ''))}
          className="flex w-full items-center gap-4 rounded-r-lg border border-[var(--line-strong)] p-4 text-start transition-colors hover:border-[var(--brand-ink)] hover:bg-[var(--surface-2)]">
          {restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" className="size-12 shrink-0 rounded-r-md object-cover" />
            : <span className="grid size-12 shrink-0 place-items-center rounded-r-md bg-[var(--summary-bg)] text-[var(--summary-fg)]"><Store aria-hidden className="size-6" /></span>}
          <span className="min-w-0 flex-1 break-words">
            <span className="block font-semibold">{restaurant?.name ?? `${t('restaurant')} #${id}`}</span>
            {restaurant?.address && <span className="mt-1 block text-sm text-fg-secondary">{restaurant.address}</span>}
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-fg-secondary rtl:rotate-180" />
        </button>)}
      </div>
      <button type="button" onClick={() => { logout(); router.replace('/login'); }} className="mt-6 min-h-11 w-full text-center text-sm font-medium text-fg-secondary hover:text-fg-primary">{t('signOut')}</button>
    </div>
  </AccessShell>;
}
