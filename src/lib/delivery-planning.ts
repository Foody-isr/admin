import type { DeliveryRoute, RouteStop } from '@/lib/delivery';

const ETA_EARLY_MINUTES = 5;
const ETA_LATE_MINUTES = 10;

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
  route: Pick<DeliveryRoute, 'started_at' | 'planned_departure_at'>,
  stop: Pick<RouteStop, 'eta_seconds'>,
  locale: string,
): DeliveryEtaWindow | null {
  const anchor = route.started_at || route.planned_departure_at;
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
