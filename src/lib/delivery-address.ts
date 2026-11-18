import { formatRouteAddress } from './route-address';
import { validZoneCoordinate } from './delivery-zone-state';

// Single source of truth for how a delivery address is rendered across the
// admin. The Clients table column, the order-detail drawer and the deliveries
// dispatcher all format the same fields the same way through this helper, so
// "the address" reads identically wherever it appears.

export type DeliveryAddressParts = {
  address?: string | null;
  city?: string | null;
  floor?: string | null;
  apt?: string | null;
  entryCode?: string | null;
};

type Translate = (key: string) => string;

/**
 * Format a delivery address into two display lines:
 *   line1 — street + city (e.g. "Rue Herzl 12, Tel Aviv")
 *   line2 — floor / apartment / building code, each labelled
 *
 * `compact` uses the short "Code" label (tight Clients column); the default
 * uses the full "Code immeuble" label (drawer / dispatcher, more room).
 * Returns null when there is nothing to show.
 */
export function formatDeliveryAddress(
  p: DeliveryAddressParts,
  t: Translate,
  opts?: { compact?: boolean },
): { line1: string; line2: string } | null {
  const clean = (s?: string | null) => (s ?? '').trim();
  const line1 = formatRouteAddress({ address: clean(p.address), city: clean(p.city) });
  const codeLabel = opts?.compact ? t('code') : t('buildingCode');
  const line2 = [
    clean(p.floor) ? `${t('floor')} ${clean(p.floor)}` : '',
    clean(p.apt) ? `${t('apartment')} ${clean(p.apt)}` : '',
    clean(p.entryCode) ? `${codeLabel} ${clean(p.entryCode)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  if (!line1 && !line2) return null;
  // Guard against an empty first line if only unit info exists.
  if (!line1) return { line1: line2, line2: '' };
  return { line1, line2 };
}

/** Parse the decimal latitude and longitude copied from a map pin. */
export function parseDeliveryPin(value: string): { lat: number; lng: number } | null {
  const pair = /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!pair) return null;
  const point = { lat: Number(pair[1]), lng: Number(pair[2]) };
  return validZoneCoordinate(point) && (point.lat !== 0 || point.lng !== 0) ? point : null;
}
