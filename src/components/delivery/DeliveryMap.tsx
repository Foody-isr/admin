'use client';

import { Fragment, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RouteStop } from '@/lib/delivery';

export interface RouteLayer {
  courierId: number;
  color: string;
  stops: RouteStop[];
}

export interface DeliveryMapProps {
  /** Single-route convenience (courier view). Ignored if `routes` is provided. */
  stops?: RouteStop[];
  /** Multi-route (dispatcher view), each colored per courier. */
  routes?: RouteLayer[];
  restaurant?: { lat: number; lng: number };
  highlightCourierId?: number | null;
  onStopClick?: (stop: RouteStop) => void;
  className?: string;
}

const BRAND = '#F18A47';
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

const numberedIconCache = new Map<string, L.DivIcon>();
function numberedIcon(label: string, color: string): L.DivIcon {
  const key = `${label}|${color}`;
  let icon = numberedIconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: 'foody-stop-pin',
      html: `<div style="background:${color};color:#1a1a1a;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff">${label}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    numberedIconCache.set(key, icon);
  }
  return icon;
}

/** Fit the map to all visible points whenever the coordinate SET changes (not array identity). */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => `${p[0]},${p[1]}`).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function DeliveryMap({
  stops, routes, restaurant, highlightCourierId, onStopClick, className,
}: DeliveryMapProps) {
  const layers: RouteLayer[] = useMemo(() => {
    if (routes && routes.length) return routes;
    if (stops && stops.length) return [{ courierId: 0, color: BRAND, stops }];
    return [];
  }, [routes, stops]);

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (restaurant) pts.push([restaurant.lat, restaurant.lng]);
    for (const layer of layers) {
      for (const s of located(layer.stops)) pts.push([s.lat as number, s.lng as number]);
    }
    return pts;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: compare by primitive values to avoid re-snapping on object identity change
  }, [layers, restaurant?.lat, restaurant?.lng]);

  const center: [number, number] = points[0] ?? [32.0853, 34.7818]; // Tel Aviv fallback

  return (
    <div className={className}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {restaurant && <Marker position={[restaurant.lat, restaurant.lng]} icon={HOME_ICON} />}
        {layers.map((layer) => {
          const dim = highlightCourierId != null && layer.courierId !== highlightCourierId;
          const seq = located(layer.stops).sort((a, b) => a.sequence - b.sequence);
          const line: [number, number][] = [];
          if (restaurant) line.push([restaurant.lat, restaurant.lng]);
          seq.forEach((s) => line.push([s.lat as number, s.lng as number]));
          return (
            <Fragment key={layer.courierId}>
              {line.length > 1 && (
                <Polyline positions={line} pathOptions={{ color: layer.color, opacity: dim ? 0.2 : 0.7, dashArray: '6 8' }} />
              )}
              {seq.map((s) => (
                <Marker
                  key={s.id}
                  position={[s.lat as number, s.lng as number]}
                  icon={numberedIcon(String(s.sequence), dim ? '#9aa0a6' : layer.color)}
                  eventHandlers={onStopClick ? { click: () => onStopClick(s) } : undefined}
                />
              ))}
            </Fragment>
          );
        })}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
