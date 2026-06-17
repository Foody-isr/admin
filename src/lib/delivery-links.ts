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

/** tel: link from a phone number (strips spaces/dashes). */
export function callUrl(phone: string): string {
  return `tel:${phone.replace(/[\s-]/g, '')}`;
}

/** WhatsApp deep link (digits only). */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}
