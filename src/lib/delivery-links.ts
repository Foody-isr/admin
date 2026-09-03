export interface NavigationDestination {
  lat?: number | null;
  lng?: number | null;
  address: string;
  city?: string;
}

function destinationQuery(destination: NavigationDestination): string {
  return [destination.address, destination.city].filter(Boolean).join(', ');
}

/** Google Maps directions URL for coordinates or a textual address. */
export function googleNavigationUrl(destination: NavigationDestination): string {
  const target = destination.lat != null && destination.lng != null
    ? `${destination.lat},${destination.lng}`
    : destinationQuery(destination);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}

/** Official Waze deep link; opens the app when installed and web otherwise. */
export function wazeNavigationUrl(destination: NavigationDestination): string {
  const target = destination.lat != null && destination.lng != null
    ? `ll=${encodeURIComponent(`${destination.lat},${destination.lng}`)}`
    : `q=${encodeURIComponent(destinationQuery(destination))}`;
  return `https://www.waze.com/ul?${target}&navigate=yes`;
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
