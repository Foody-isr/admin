'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { PageHead } from '@/components/ds';
import CateringOffersManager from '@/components/catering/CateringOffersManager';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  listCateringGroups,
  listCateringItems,
  listCateringOffers,
  listCateringServices,
  type CateringCatalogGroup,
  type CateringCatalogItem,
  type CateringOffer,
  type CateringService,
} from '@/lib/api';

export default function CateringServiceOffersPage() {
  const { restaurantId, serviceId } = useParams();
  const restaurantID = Number(restaurantId);
  const currentServiceID = Number(serviceId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');
  const [service, setService] = useState<CateringService>();
  const [offers, setOffers] = useState<CateringOffer[]>([]);
  const [groups, setGroups] = useState<CateringCatalogGroup[]>([]);
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [services, nextOffers] = await Promise.all([
        listCateringServices(restaurantID),
        listCateringOffers(restaurantID, currentServiceID),
      ]);
      // Listing offers performs the one-time legacy conversion, so load the
      // catalog only after it has assigned old groups/items to their offer.
      const [nextGroups, nextItems] = await Promise.all([
        listCateringGroups(restaurantID, currentServiceID),
        listCateringItems(restaurantID, currentServiceID),
      ]);
      setService(services.find((candidate) => candidate.id === currentServiceID));
      setOffers(nextOffers);
      setGroups(nextGroups);
      setItems(nextItems);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('catering_configurable_offers_load_error'));
    } finally {
      setLoading(false);
    }
  }, [currentServiceID, restaurantID, t]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={() => router.push(`/${restaurantID}/catering/services`)}
        className="flex items-center gap-1.5 text-sm font-medium text-fg-secondary transition-colors hover:text-fg-primary"
      >
        <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        {t('catering_offer_back_to_catalog')}
      </button>

      <PageHead
        title={service?.name ?? t('catering_offer_group_title')}
        desc={service?.description || t('catering_configurable_service_hint')}
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <CateringOffersManager
          restaurantId={restaurantID}
          serviceId={currentServiceID}
          offers={offers}
          groups={groups}
          items={items}
          canEdit={canEdit}
          onChanged={reload}
        />
      )}
    </div>
  );
}
