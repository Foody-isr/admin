import type { DeliveryRoute, RouteStop } from '@/lib/delivery';
import type { Order } from '@/lib/api';

const ETA_EARLY_MINUTES = 5;
const ETA_LATE_MINUTES = 10;

/** Scheduled delivery dates are civil dates; immediate orders have no promised day. */
export function deliveryMatchesRouteDate(order: Pick<Order, 'scheduled_for'>, date: string): boolean {
  return !order.scheduled_for || order.scheduled_for.slice(0, 10) === date.slice(0, 10);
}

/** Format a duration in seconds, including an explicitly measured zero. */
export function formatDeliveryDuration(seconds: number, t: (key: string) => string): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${t('unitMin')}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}${t('unitHour')} ${rest}${t('unitMin')}` : `${hours}${t('unitHour')}`;
}

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
  route: Pick<DeliveryRoute, 'started_at' | 'planned_departure_at' | 'eta_reference_at' | 'needs_recalculation' | 'customer_window_minutes' | 'timezone'>,
  stop: Pick<RouteStop, 'eta_seconds'> & Partial<Pick<RouteStop, 'needs_geocode'>>,
  locale: string,
): DeliveryEtaWindow | null {
  if (route.needs_recalculation || stop.needs_geocode) return null;
  const anchor = route.eta_reference_at || route.started_at || route.planned_departure_at;
  if (!anchor || stop.eta_seconds < 0 || (stop.eta_seconds === 0 && route.customer_window_minutes == null)) return null;
  const arrival = new Date(anchor).getTime() + stop.eta_seconds * 1000;
  const margin = route.customer_window_minutes;
  const startAt = new Date(margin != null ? Math.floor(arrival / 60_000) * 60_000 : arrival - ETA_EARLY_MINUTES * 60_000);
  const endAt = new Date(margin != null ? startAt.getTime() + margin * 60_000 : arrival + ETA_LATE_MINUTES * 60_000);
  const language = locale === 'he' ? 'he-IL' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  const formatter = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone: route.timezone });
  const dayFormatter = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: route.timezone });
  const start = formatter.format(startAt);
  const end = formatter.format(endAt);
  const startDay = dayFormatter.format(startAt);
  const endDay = dayFormatter.format(endAt);
  const day = startDay === endDay ? startDay : `${startDay} → ${endDay}`;
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
    'delivery date differs from route date': 'deliveryRouteDateMismatch',
    'location service quota exceeded': 'deliveryRoutingQuota',
    'routing service unavailable': 'deliveryRoutingUnavailable',
    'some deliveries could not be routed': 'deliveryRoutingInfeasible',
    'address lookup unavailable': 'deliveryRoutingUnavailable',
    'address not located': 'deliveryAddressUnresolved',
  } as Record<string, string>)[message];
  return key ? t(key) : null;
}

/** Describe provider limits separately from a changed route or an unlocated address. */
export function deliveryRouteWarning(route: Pick<DeliveryRoute, 'routing_error' | 'needs_recalculation'>, t: (key: string) => string): string {
  if (route.routing_error) return deliveryRoutingError(new Error(route.routing_error), t) ?? t('deliveryRoutingUnavailable');
  return t(route.needs_recalculation ? 'deliveryRouteNeedsRecalculation' : 'routeEstimatePartial');
}

/** A provider failure leaves a location pending rather than proving the address invalid. */
export function deliveryLocationWarning(route: Pick<DeliveryRoute, 'routing_error'>, t: (key: string) => string): string {
  return t(route.routing_error ? 'deliveryLocationPending' : 'addressNeedsAttention');
}
