'use client';

import { useEffect, useState } from 'react';
import type { CourierLocationDTO } from '@/lib/delivery';
import { useI18n } from '@/lib/i18n';

/** Identifies the last received GPS fix without presenting an old position as live. */
export function CourierLocationStatus({ location }: { location?: CourierLocationDTO | null }) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const updated = location ? Date.parse(location.updated_at) : NaN;
  const known = Number.isFinite(updated);
  const stale = known && now - updated > 60000;
  const message = !known ? t('courierLocationMissing') : t(stale ? 'courierLocationStale' : 'courierLocationUpdated')
    .replace('{time}', new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(updated));
  return <p role="status" className={`mb-2 text-fs-xs ${!known || stale ? 'text-[var(--warning-500)]' : 'text-[var(--fg-muted)]'}`}>{message}</p>;
}
