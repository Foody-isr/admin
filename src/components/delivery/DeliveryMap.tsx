'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Marker, Polyline, useMap } from 'react-leaflet';
import { DeliveryTiles } from '@/components/delivery/DeliveryTiles';
import { LeafletSurface } from '@/components/delivery/LeafletSurface';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoadLeg, RouteStop } from '@/lib/delivery';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface RouteLayer {
  geometry?: RoadLeg[];
  routingProvider?: string;
  routeId?: number;
  label?: string;
  courierId: number;
  color: string;
  stops: RouteStop[];
  start?: { lat: number; lng: number };
  end?: { lat: number; lng: number };
}

export interface CourierMarker {
  courierId: number;
  color: string;
  lat: number;
  lng: number;
  stale?: boolean;
}

export interface DeliveryMapProps {
  restaurantId: number;
  geometry?: RoadLeg[];
  routingProvider?: string;
  /** Single-route convenience (courier view). Ignored if `routes` is provided. */
  stops?: RouteStop[];
  /** Optional endpoints for the single courier route. */
  start?: { lat: number; lng: number };
  end?: { lat: number; lng: number };
  /** Multi-route (dispatcher view), each colored per courier. */
  routes?: RouteLayer[];
  /** Live courier position dots (dispatcher view). */
  couriers?: CourierMarker[];
  restaurant?: { lat: number; lng: number };
  highlightCourierId?: number | null;
  highlightRouteId?: number | null;
  onRouteSelect?: (id: number | null) => void;
  onStopClick?: (stop: RouteStop) => void;
  className?: string;
}

const BRAND = '#525252';
const RESTAURANT_GREEN = '#5BBF84';

function located(stops: RouteStop[]): RouteStop[] {
  return stops.filter((s) => s.lat != null && s.lng != null);
}

const HOME_ICON = L.divIcon({
  className: 'foody-home-pin',
  html: `<div style="background:${RESTAURANT_GREEN};color:#10271a;width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff">★</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const START_ICON = L.divIcon({
  className: 'foody-route-start-pin',
  html: `<div style="background:${RESTAURANT_GREEN};color:#10271a;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff">▶</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const END_ICON = L.divIcon({
  className: 'foody-route-end-pin',
  html: `<div style="background:#252525;color:#fff;width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff">⚑</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const numberedIconCache = new Map<string, L.DivIcon>();
function numberedIcon(label: string, color: string): L.DivIcon {
  const key = `${label}|${color}`;
  let icon = numberedIconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: 'foody-stop-pin',
      html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.25);border:2px solid #fff">${label}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    numberedIconCache.set(key, icon);
  }
  return icon;
}

const courierIconCache = new Map<string, L.DivIcon>();
function courierIcon(color: string, stale: boolean): L.DivIcon {
  const key = `${color}|${stale}`;
  let icon = courierIconCache.get(key);
  if (!icon) {
    const op = stale ? 0.4 : 1;
    icon = L.divIcon({
      className: 'foody-courier-pin',
      html: `<div style="opacity:${op};width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 4px ${color}33,0 2px 6px rgba(0,0,0,.45)"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    courierIconCache.set(key, icon);
  }
  return icon;
}

/** Fit all geocodes once the responsive map has a real, stable visible size. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => `${p[0]},${p[1]}`).join('|');

  useEffect(() => {
    const container = map.getContainer();
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const fitToPoints = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width < 2 || height < 2) return;

      map.invalidateSize({ animate: false });
      if (points.length === 0) return;
      if (points.length === 1) {
        map.setView(points[0], 14, { animate: false });
        return;
      }
      map.fitBounds(L.latLngBounds(points), {
        animate: false,
        maxZoom: 15,
        padding: [32, 32],
      });
    };

    const onResize = () => {
      map.invalidateSize({ animate: false });
      if (settleTimer) clearTimeout(settleTimer);
      // The mobile map opens with a height transition. Fit after it settles so
      // Leaflet measures the final viewport instead of the initial 0px box.
      settleTimer = setTimeout(fitToPoints, 100);
    };

    fitToPoints();
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function DeliveryMap({
  restaurantId, geometry, routingProvider, stops, start, end, routes, couriers, restaurant, highlightCourierId, highlightRouteId, onRouteSelect, onStopClick, className,
}: DeliveryMapProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState('unavailable');
  const layers: RouteLayer[] = useMemo(() => {
    if (routes && routes.length) return routes.map(layer => ({ ...layer, geometry: layer.routingProvider === 'google' && provider !== 'google' ? undefined : layer.geometry, stops: layer.stops.filter(stop => stop.coordinate_provider !== 'google' || provider === 'google') }));
    if (stops && stops.length) return [{ courierId: 0, color: BRAND, stops: stops.filter(stop => stop.coordinate_provider !== 'google' || provider === 'google'), start, end, geometry: routingProvider === 'google' && provider !== 'google' ? undefined : geometry, routingProvider }];
    return [];
  }, [end, routes, start, stops, geometry, routingProvider, provider]);

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (restaurant) pts.push([restaurant.lat, restaurant.lng]);
    for (const layer of layers) {
      if (layer.start) pts.push([layer.start.lat, layer.start.lng]);
      for (const s of located(layer.stops)) pts.push([s.lat as number, s.lng as number]);
      for (const leg of layer.geometry ?? []) {
        if (leg.order_id === 0 ? !!layer.end : layer.stops.some(stop => stop.order_id === leg.order_id)) pts.push(...leg.path);
      }
      if (layer.end) pts.push([layer.end.lat, layer.end.lng]);
    }
    return pts;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: compare by primitive values to avoid re-snapping on object identity change
  }, [layers, restaurant?.lat, restaurant?.lng]);

  const center: [number, number] = points[0] ?? [32.0853, 34.7818]; // Tel Aviv fallback

  return (
    <div className={cn('relative isolate', className)}>
      <LeafletSurface center={{ lat: center[0], lng: center[1] }}>
        <DeliveryTiles restaurantId={restaurantId} onProviderChange={setProvider} />
        {restaurant && <Marker position={[restaurant.lat, restaurant.lng]} icon={HOME_ICON} />}
        {layers.map((layer) => {
          const dim = highlightRouteId != null ? layer.routeId !== highlightRouteId : highlightCourierId != null && layer.courierId !== highlightCourierId;
          const seq = located(layer.stops).sort((a, b) => a.sequence - b.sequence);
          const line: [number, number][] = [];
          if (layer.start) line.push([layer.start.lat, layer.start.lng]);
          else if (restaurant) line.push([restaurant.lat, restaurant.lng]);
          seq.forEach((s) => line.push([s.lat as number, s.lng as number]));
          if (layer.end) line.push([layer.end.lat, layer.end.lng]);
          return (
            <Fragment key={layer.routeId ?? layer.courierId}>
              {layer.geometry?.length ? layer.geometry.filter(leg => leg.order_id === 0 ? !!layer.end : seq.some(stop => stop.order_id === leg.order_id)).map((leg, index) => (
                <Polyline key={`${leg.order_id}-${index}`} positions={leg.path} eventHandlers={onRouteSelect && layer.routeId ? { click: () => onRouteSelect(layer.routeId!) } : undefined} pathOptions={{ color: layer.color, opacity: dim ? 0.15 : 0.9, weight: dim ? 3 : 5 }} />
              )) : !['geoapify', 'google'].includes(layer.routingProvider ?? '') && line.length > 1 && (
                <Polyline positions={line} pathOptions={{ color: layer.color, opacity: dim ? 0.2 : 0.7, dashArray: '6 8' }} />
              )}
              {layer.start && <Marker position={[layer.start.lat, layer.start.lng]} icon={START_ICON} />}
              {seq.map((s) => (
                <Marker
                  key={s.id}
                  position={[s.lat as number, s.lng as number]}
                  icon={numberedIcon(String(s.sequence), dim ? '#9aa0a6' : layer.color)}
                  eventHandlers={onStopClick ? { click: () => onStopClick(s) } : undefined}
                />
              ))}
              {layer.end && <Marker position={[layer.end.lat, layer.end.lng]} icon={END_ICON} />}
            </Fragment>
          );
        })}
        {(couriers ?? []).map((c) => (
          <Marker key={`courier-${c.courierId}`} position={[c.lat, c.lng]} icon={courierIcon(c.color, !!c.stale)} />
        ))}
        <FitBounds points={points} />
      </LeafletSurface>
      {routes && routes.length > 0 && onRouteSelect && <div aria-label={t('mapsLegend')} className="absolute end-3 top-3 z-[500] max-h-48 max-w-[240px] overflow-auto rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-2 shadow-sm">
        <p className="px-2 py-1 text-fs-xs font-semibold">{t('mapsLegend')}</p>
        <button type="button" aria-pressed={highlightRouteId == null && highlightCourierId == null} onClick={() => onRouteSelect(null)} className="w-full rounded px-2 py-2 text-start text-fs-xs focus-visible:outline focus-visible:outline-2">{t('mapsAllRoutes')}</button>
        {routes.map(layer => <button key={layer.routeId} type="button" aria-pressed={highlightRouteId === layer.routeId} onClick={() => onRouteSelect(highlightRouteId === layer.routeId ? null : layer.routeId ?? null)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-start text-fs-xs hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2" style={{ background: highlightRouteId === layer.routeId ? 'var(--surface-2)' : undefined }}><span aria-hidden="true" className="h-1 w-5 shrink-0 rounded" style={{ background: layer.color }} /><span>{layer.label ?? `${t('mapsRoute')} ${layer.routeId}`}</span></button>)}
      </div>}
      {routes?.some(layer => layer.routingProvider === 'google') && provider !== 'google' && <p role="status" className="absolute bottom-10 start-3 end-3 z-[500] rounded bg-[var(--surface)] p-2 text-fs-xs">{t('mapsProviderChanged')}</p>}
    </div>
  );
}
