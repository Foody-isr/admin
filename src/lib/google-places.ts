// Injects the Google Maps Places JS once per page load. Resolves when
// window.google.maps.places is available. Caller handles failures
// (missing key, blocked network) by falling back to plain text input.
let placesLoaderPromise: Promise<void> | null = null;

export function loadGooglePlaces(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (placesLoaderPromise) return placesLoaderPromise;
  placesLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=quarterly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      placesLoaderPromise = null;
      reject(new Error('failed to load Google Places script'));
    };
    document.head.appendChild(script);
  });
  return placesLoaderPromise;
}
