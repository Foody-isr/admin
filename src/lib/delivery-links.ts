export interface NavigationDestination {
  lat?: number | null;
  lng?: number | null;
  address: string;
  city?: string;
  needs_geocode?: boolean;
  navigation_verified?: boolean;
}

function destinationQuery(destination: NavigationDestination): string {
  return [destination.address, destination.city].filter(Boolean).join(', ');
}

/** Google Maps directions URL for coordinates or a textual address. */
export function googleNavigationUrl(destination: NavigationDestination): string {
  const target = hasNavigationCoordinates(destination)
    ? `${destination.lat},${destination.lng}`
    : destinationQuery(destination);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}

/** Whether navigation can use a located destination rather than an ambiguous search. */
export function hasNavigationCoordinates(destination: NavigationDestination): boolean {
  return destination.navigation_verified !== false && !destination.needs_geocode && typeof destination.lat === 'number' && typeof destination.lng === 'number'
    && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
    && Math.abs(destination.lat) <= 90 && Math.abs(destination.lng) <= 180
    && (destination.lat !== 0 || destination.lng !== 0);
}

/** Waze uses a checked GPS point; older unverified destinations keep text search. */
export function wazeNavigationUrl(destination: NavigationDestination): string {
  const target = hasNavigationCoordinates(destination) && (destination.navigation_verified === true || destinationQuery(destination).trim() === '')
    ? `ll=${encodeURIComponent(`${destination.lat},${destination.lng}`)}`
    : `q=${encodeURIComponent(destinationQuery(destination).trim())}`;
  return `https://www.waze.com/ul?${target}&navigate=yes&utm_source=foody`;
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
