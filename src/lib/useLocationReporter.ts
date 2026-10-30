'use client';

import { useCallback, useEffect, useState } from 'react';
import { reportLocation, type CourierLocationDTO } from '@/lib/delivery';

export type LocationReporterStatus = 'inactive' | 'locating' | 'sharing' | 'denied' | 'unavailable' | 'send-error';

/** Reports GPS only during the courier's own active route, preserving the latest throttled reading. */
export function useLocationReporter(rid: number, active: boolean, intervalMs = 10000) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: LocationReporterStatus; location: CourierLocationDTO | null }>({ status: 'inactive', location: null });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!active) {
      setState({ status: 'inactive', location: null });
      return;
    }
    if (!navigator.geolocation) {
      setState({ status: 'unavailable', location: null });
      return;
    }
    let disposed = false;
    let inFlight = false;
    let lastAttempt = 0;
    let acquisitionError: LocationReporterStatus | null = null;
    let pending: GeolocationPosition | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ status: 'locating', location: null });

    const flush = async () => {
      timer = undefined;
      if (disposed || inFlight || !pending) return;
      if (Date.now() - pending.timestamp > 20000) {
        pending = null;
        setState(current => ({ ...current, status: 'unavailable' }));
        return;
      }
      const delay = lastAttempt + intervalMs - Date.now();
      if (delay > 0) {
        timer = setTimeout(() => void flush(), delay);
        return;
      }
      const reading = pending;
      pending = null;
      inFlight = true;
      lastAttempt = Date.now();
      const { latitude, longitude, heading, speed, accuracy } = reading.coords;
      try {
        const location = await reportLocation(rid, {
          lat: latitude, lng: longitude, heading: heading ?? undefined,
          speed: speed ?? undefined, accuracy: accuracy ?? undefined,
        });
        if (!disposed) setState(current => ({
          status: acquisitionError ?? (location ? 'sharing' : 'send-error'),
          location: location ?? current.location,
        }));
      } catch {
        if (!disposed) setState(current => ({ ...current, status: acquisitionError ?? 'send-error' }));
      } finally {
        inFlight = false;
        if (!disposed && pending && timer === undefined) void flush();
      }
    };
    const onPosition = (position: GeolocationPosition) => {
      if (disposed) return;
      acquisitionError = null;
      pending = position;
      if (timer === undefined) void flush();
    };
    const onError = (error: GeolocationPositionError) => {
      if (disposed) return;
      pending = null;
      clearTimeout(timer);
      timer = undefined;
      acquisitionError = error.code === 1 ? 'denied' : 'unavailable';
      setState(current => ({ ...current, status: acquisitionError! }));
    };
    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 20000,
    });
    const resume = () => { if (document.visibilityState === 'visible') retry(); };
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [rid, active, intervalMs, attempt, retry]);

  return { ...state, retry };
}
