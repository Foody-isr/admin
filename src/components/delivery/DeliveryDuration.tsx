import type { DeliveryRoute } from '@/lib/delivery';
import { formatDeliveryDuration } from '@/lib/delivery-planning';

/** Display the total with separately measured driving, window waiting and handover times. */
export function DeliveryDuration({ route, t }: { route: DeliveryRoute; t: (key: string) => string }) {
  const measured = !route.needs_recalculation;
  const parts = [
    { key: 'deliveryPlanTravel', seconds: route.est_travel_s },
    { key: 'deliveryPlanWaiting', seconds: route.est_waiting_s },
    { key: 'deliveryPlanService', seconds: route.est_service_s },
  ];
  return (
    <div>
      <div className="text-fs-sm font-semibold text-[var(--fg)]">{measured && route.est_duration_s > 0 ? formatDeliveryDuration(route.est_duration_s, t) : '—'}</div>
      <div className="text-[11px] text-[var(--fg-subtle)]">{t('deliveryPlanTotalDuration')}</div>
      {measured && parts.every(part => part.seconds != null) && (
        <dl className="mt-1 text-[11px] text-[var(--fg-muted)]">
          {parts.map(part => <div key={part.key}><dt className="inline">{t(part.key)} : </dt><dd className="inline"><bdi>{formatDeliveryDuration(part.seconds!, t)}</bdi></dd></div>)}
        </dl>
      )}
    </div>
  );
}
