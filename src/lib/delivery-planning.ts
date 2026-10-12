import type { DeliveryRoute, RouteStop } from '@/lib/delivery';

const ETA_EARLY_MINUTES = 5;
const ETA_LATE_MINUTES = 10;

/** Whether a route still contains delivery work for the dispatcher. */
export function isOpenDeliveryRoute(route: DeliveryRoute): boolean {
  return (route.status === 'draft' || route.status === 'active') && route.stops.some(isPendingDeliveryStop);
}

/** Delivered and skipped stops belong to history, rather than the planning pool. */
export function isPendingDeliveryStop(stop: RouteStop): boolean {
  return stop.status === 'pending' || stop.status === 'arrived';
}

export interface DeliveryEtaWindow {
  label: string;
  day: string;
  start: string;
  end: string;
  startAt: Date;
  endAt: Date;
}

/** Convert a route's cumulative ETA into a deliberately honest arrival range. */
export function deliveryEtaWindow(
  route: Pick<DeliveryRoute, 'started_at' | 'planned_departure_at' | 'eta_reference_at'>,
  stop: Pick<RouteStop, 'eta_seconds'>,
  locale: string,
): DeliveryEtaWindow | null {
  const anchor = route.eta_reference_at || route.started_at || route.planned_departure_at;
  if (!anchor || stop.eta_seconds <= 0) return null;
  const arrival = new Date(anchor).getTime() + stop.eta_seconds * 1000;
  const startAt = new Date(arrival - ETA_EARLY_MINUTES * 60_000);
  const endAt = new Date(arrival + ETA_LATE_MINUTES * 60_000);
  const language = locale === 'he' ? 'he-IL' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  const formatter = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  const dayFormatter = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' });
  const start = formatter.format(startAt);
  const end = formatter.format(endAt);
  const startDay = dayFormatter.format(startAt);
  const endDay = dayFormatter.format(endAt);
  const day = startAt.toDateString() === endAt.toDateString() ? startDay : `${startDay} → ${endDay}`;
  return { label: `${start}–${end}`, day, start, end, startAt, endAt };
}

/** Fill the localized, user-facing expected-arrival label. */
export function buildDeliveryEtaLabel(template: string, window: DeliveryEtaWindow): string {
  return template
    .replace('{day}', window.day)
    .replace('{start}', window.start)
    .replace('{end}', window.end);
}

/** Fill the editable WhatsApp ETA copy without coupling the helper to i18n. */
export function buildDeliveryEtaMessage(
  template: string,
  stop: Pick<RouteStop, 'customer_name' | 'order_id'>,
  window: DeliveryEtaWindow | null,
): string {
  return template
    .replace('{name}', stop.customer_name || '')
    .replace('{order}', String(stop.order_id))
    .replace('{start}', window?.start ?? '')
    .replace('{end}', window?.end ?? '');
}

/** Translate provider errors without exposing provider details or credentials. */
export function deliveryRoutingError(error: unknown, t: (key: string) => string): string | null {
  const message = error instanceof Error ? error.message : '';
  const key = ({
    'location service quota exceeded': 'deliveryRoutingQuota',
    'routing service unavailable': 'deliveryRoutingUnavailable',
    'some deliveries could not be routed': 'deliveryRoutingInfeasible',
    'address lookup unavailable': 'deliveryRoutingUnavailable',
  } as Record<string, string>)[message];
  return key ? t(key) : null;
}
