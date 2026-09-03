import type { RouteStop } from '@/lib/delivery';

/**
 * Build a maps URL for a stop. Prefers precise coordinates; falls back to the
 * text address. Opens the device's default maps app (Google/Apple/Waze) for
 * real turn-by-turn — Foody does not draw road routes itself.
 */
export function navUrl(stop: Pick<RouteStop, 'lat' | 'lng' | 'address' | 'city'>): string {
  if (stop.lat != null && stop.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
  }
  const addr = [stop.address, stop.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
}

/** Build a maps URL for a route endpoint. */
export function endpointNavUrl(address: string, lat?: number | null, lng?: number | null): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** tel: link from a phone number (strips spaces/dashes). */
export function callUrl(phone: string): string {
  return `tel:${phone.replace(/[\s-]/g, '')}`;
}

/** WhatsApp deep link (digits only), optionally with a pre-filled message. */
export function whatsappUrl(phone: string, message?: string): string {
  const base = `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
