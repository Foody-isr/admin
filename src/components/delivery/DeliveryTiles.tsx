'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { API_URL, getDeliveryMapConfig, getDeliveryMapAttribution } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type MapConfig = Awaited<ReturnType<typeof getDeliveryMapConfig>>;
const escapeAttribution = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Budgeted server tiles, with atomic provider changes and mandatory attribution. */
export function DeliveryTiles({ restaurantId, onProviderChange }: { restaurantId: number; onProviderChange?: (provider: string) => void }) {
  const map = useMap();
  const { t } = useI18n();
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [copyright, setCopyright] = useState('');
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(false);
  const request = useRef(0), lastRefresh = useRef(0);
  const refresh = useCallback(async () => {
    if (Date.now() - lastRefresh.current < 2000) return;
    lastRefresh.current = Date.now();
    const sequence = ++request.current;
    try {
      const value = await getDeliveryMapConfig(restaurantId);
      let attribution = '';
      if (value.provider === 'google') {
        const bounds = map.getBounds();
        const result = await getDeliveryMapAttribution(restaurantId, { north: Math.min(85, bounds.getNorth()), south: Math.max(-85, bounds.getSouth()), east: bounds.getEast(), west: bounds.getWest(), zoom: map.getZoom() });
        attribution = result.copyright;
      }
      if (sequence !== request.current) return;
      setCopyright(attribution); setConfig(value); setFailed(false); onProviderChange?.(value.provider);
    } catch { if (sequence === request.current) { setFailed(true); setConfig(null); onProviderChange?.('unavailable'); } }
  }, [restaurantId, map, onProviderChange]);
  useEffect(() => {
    const lifetime = request;
    lastRefresh.current = 0; void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    map.on('moveend', refresh);
    window.addEventListener('foody-map-provider-change', refresh);
    return () => { lifetime.current++; clearInterval(timer); map.off('moveend', refresh); window.removeEventListener('foody-map-provider-change', refresh); };
  }, [map, refresh]);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const google = config?.provider === 'google', geoapify = config?.provider === 'geoapify';
  const url = config && (config.tile_url.startsWith('/') ? API_URL + config.tile_url.replace('{style}', dark ? 'dark-matter' : 'positron') : config.tile_url);
  return <>
    {url && <TileLayer key={url} url={url} maxZoom={geoapify || google ? 20 : 19} eventHandlers={{ tileerror: () => { setFailed(true); void refresh(); } }} attribution={google ? escapeAttribution(copyright) : geoapify
      ? 'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />}
    {google && <a href="https://maps.google.com" aria-label="Google Maps" className="absolute bottom-2 start-3 z-[500] rounded bg-white px-[10px] pb-[5px] pt-[10px]"><Image unoptimized alt="Google Maps" src="/google-maps/attribution.svg" width={98} height={18} /></a>}
    {failed && <div role="status" className="absolute bottom-9 start-3 end-3 z-[500] rounded-r-md bg-[var(--surface)] p-2 text-fs-xs text-[var(--fg)]">{t('deliveryZoneTilesUnavailable')}</div>}
  </>;
}
