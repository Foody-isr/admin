'use client';

import { useEffect, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import { API_URL, getDeliveryMapConfig } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Load restaurant-scoped map configuration without exposing provider credentials. */
export function DeliveryTiles({ restaurantId }: { restaurantId: number }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<{ provider: string; tile_url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let alive = true;
    setConfig(null); setFailed(false);
    getDeliveryMapConfig(restaurantId).then(value => { if (alive) setConfig(value); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [restaurantId]);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const geoapify = config?.provider === 'geoapify';
  const url = config && (geoapify ? API_URL + config.tile_url.replace('{style}', dark ? 'dark-matter' : 'positron') : config.tile_url);
  return <>
    {url && <TileLayer key={url} url={url} maxZoom={geoapify ? 20 : 19} eventHandlers={{ tileerror: () => setFailed(true) }} attribution={geoapify
      ? 'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />}
    {failed && <div role="status" className="absolute bottom-7 start-3 end-3 z-[500] rounded-r-md bg-[var(--surface)] p-2 text-fs-xs text-[var(--fg)]">{t('deliveryZoneTilesUnavailable')}</div>}
  </>;
}
