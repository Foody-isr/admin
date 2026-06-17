'use client';

import { useEffect, useRef, useState } from 'react';
import { reportLocation } from '@/lib/delivery';

/**
 * While `active`, reports the device's GPS to the server roughly every
 * `intervalMs`. No-ops when inactive or when geolocation is unavailable. Returns
 * `{ denied }` so the UI can show a non-blocking "location off" notice if the
 * user denies the permission. Never throws into the render tree.
 */
export function useLocationReporter(rid: number, active: boolean, intervalMs = 10000): { denied: boolean } {
  const [denied, setDenied] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const onPos = (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSent.current < intervalMs) return;
      lastSent.current = now;
      const { latitude, longitude, heading, speed, accuracy } = pos.coords;
      void reportLocation(rid, {
        lat: latitude,
        lng: longitude,
        heading: heading ?? undefined,
        speed: speed ?? undefined,
        accuracy: accuracy ?? undefined,
      }).catch(() => {
        /* 204/429/transient — ignore; the itinerary keeps working */
      });
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setDenied(true);
    };

    const watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [rid, active, intervalMs]);

  return { denied };
}
