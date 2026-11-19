'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { API_URL, getDeliveryMapConfig, getDeliveryMapAttribution } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type MapConfig = Awaited<ReturnType<typeof getDeliveryMapConfig>>;
const escapeAttribution = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Shows the Google basemap with the attribution for the visible viewport. */
export function DeliveryTiles({ restaurantId, onProviderChange }: { restaurantId: number; onProviderChange?: (provider: string) => void }) {
  const map = useMap();
  const { t } = useI18n();
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [copyright, setCopyright] = useState('');
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    try {
      const bounds = map.getBounds();
      const [value, attribution] = await Promise.all([
        getDeliveryMapConfig(restaurantId),
        getDeliveryMapAttribution(restaurantId, {
          north: Math.min(85, bounds.getNorth()), south: Math.max(-85, bounds.getSouth()),
          east: bounds.getEast(), west: bounds.getWest(), zoom: map.getZoom(),
        }),
      ]);
      if (request.current !== sequence) return;
      setCopyright(attribution.copyright);
      setConfig(value);
      setFailed(false);
      onProviderChange?.('google');
    } catch {
      if (request.current !== sequence) return;
      setConfig(null);
      setFailed(true);
      onProviderChange?.('unavailable');
    }
  }, [restaurantId, map, onProviderChange]);

  useEffect(() => {
    void refresh();
    map.on('moveend', refresh);
    return () => {
      request.current++;
      map.off('moveend', refresh);
    };
  }, [map, refresh]);

  return <>
    {config && <TileLayer url={API_URL + config.tile_url} maxZoom={20} attribution={escapeAttribution(copyright)}
      eventHandlers={{ tileerror: () => setFailed(true), load: () => setFailed(false) }} />}
    {config && <a href="https://maps.google.com" aria-label="Google Maps" className="absolute bottom-2 start-3 z-[500] rounded bg-white px-[10px] pb-[5px] pt-[10px]"><Image unoptimized alt="Google Maps" src="/google-maps/attribution.svg" width={98} height={18} /></a>}
    {failed && <div role="status" className="absolute bottom-9 start-3 end-3 z-[500] rounded-r-md bg-[var(--surface)] p-2 text-fs-xs text-[var(--fg)]">{t('deliveryZoneTilesUnavailable')}</div>}
  </>;
}
