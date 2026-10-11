'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { TileLayer, Marker, Polygon, Circle, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { createLeafletContext, LeafletProvider, type LeafletContextInterface } from '@react-leaflet/core';
import 'leaflet/dist/leaflet.css';
import type { DeliveryZone } from '@/lib/api';
import { cn } from '@/lib/utils';

const BRAND = '#b83d00';
const RESTAURANT_GREEN = '#5BBF84';
const CITY_BLUE = '#3b82f6';

export type DrawMode = 'none' | 'draw-polygon' | 'set-center';

export interface CityMarker {
  name: string;
  lat: number;
  lng: number;
}

export interface ZoneMapProps {
  center: { lat: number; lng: number };
  /** Actual restaurant location; the viewport center can be a fallback only. */
  restaurantCenter?: { lat: number; lng: number } | null;
  zones: DeliveryZone[];
  activeZoneId?: number | null;
  drawMode: DrawMode;
  draftPolygon: [number, number][];           // [lng, lat] pairs
  draftCenter?: { lat: number; lng: number } | null;
  draftRadiusM?: number;
  onMapClick: (lat: number, lng: number) => void;
  className?: string;
  /** Optional city markers to display on the map (display-only, not persisted). */
  cityMarkers?: CityMarker[];
  /** When false, the map is a static preview: no drag/zoom/tap. Used on phones
   *  where a pannable map would trap the page's vertical scroll. Defaults true. */
  interactive?: boolean;
}

const HOME_ICON = L.divIcon({
  className: 'foody-zone-home',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${RESTAURANT_GREEN};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const CITY_ICON = L.divIcon({
  className: 'foody-zone-city',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:${CITY_BLUE};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Own the imperative map in an effect. react-leaflet 4's MapContainer ref
// callback captures a null context and can initialise a reattached node twice.
// Pair each concrete instance with its cleanup, including Strict Mode replay.
function LeafletSurface({ center, children }: { center: {lat:number;lng:number}; children: ReactNode }) {
  const container=useRef<HTMLDivElement>(null), initialCenter=useRef(center);
  const [context,setContext]=useState<LeafletContextInterface|null>(null);
  useEffect(()=>{
    if(!container.current)return;
    const map=L.map(container.current,{zoomControl:false,scrollWheelZoom:false,dragging:false,doubleClickZoom:false,touchZoom:false,keyboard:false,boxZoom:false}).setView([initialCenter.current.lat,initialCenter.current.lng],13);
    setContext(createLeafletContext(map));
    return()=>{map.remove();};
  },[]);
  return <div ref={container} className="h-full w-full">{context&&<LeafletProvider value={context}>{children}</LeafletProvider>}</div>;
}

function MapBehavior({ center, interactive }: { center: {lat:number;lng:number}; interactive:boolean }) {
  const map=useMap();
  const {t}=useI18n();
  useEffect(()=>{map.setView([center.lat,center.lng],map.getZoom(),{animate:false});},[map,center.lat,center.lng]);
  useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
  useEffect(()=>{for(const handler of [map.dragging,map.scrollWheelZoom,map.doubleClickZoom,map.touchZoom,map.keyboard,map.boxZoom]){if(interactive)handler.enable();else handler.disable();}if(!interactive)return;const control=L.control.zoom({zoomInTitle:t('deliveryZoneZoomIn'),zoomOutTitle:t('deliveryZoneZoomOut')});control.addTo(map);return()=>{control.remove();};},[map,interactive,t]);
  return null;
}

// react-leaflet expects [lat, lng]; our storage is [lng, lat].
function toLatLng(ring: [number, number][]): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

/** Draw saved geometry and a separately identified restaurant origin. */
export default function ZoneMap({
  center, restaurantCenter, zones, activeZoneId, drawMode, draftPolygon, draftCenter, draftRadiusM, onMapClick, className, cityMarkers,
  interactive = true,
}: ZoneMapProps) {
  const {t}=useI18n();
  const [tileError,setTileError]=useState(false);
  const draftLatLng = useMemo(() => toLatLng(draftPolygon), [draftPolygon]);

  return (
    <div className={cn('relative isolate', className)}>
      <LeafletSurface center={center}>
        <MapBehavior center={center} interactive={interactive} />
        <TileLayer eventHandlers={{tileerror:()=>setTileError(true)}} attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {restaurantCenter && <Marker position={[restaurantCenter.lat, restaurantCenter.lng]} icon={HOME_ICON} />}

        {/* Saved zones */}
        {zones.map((z) => {
          const active = z.id === activeZoneId;
          const color = active ? BRAND : '#3b82f6';
          const opts = { color, weight: active ? 3 : 2, fillOpacity: z.is_active ? (active ? 0.18 : 0.08) : 0.03, dashArray: z.is_active ? undefined : '4 6' };
          if (z.type === 'polygon' && z.polygon && z.polygon.length >= 3) {
            return <Polygon key={z.id} positions={toLatLng(z.polygon)} pathOptions={opts}><Tooltip>{z.name} · {t(z.is_active?'active':'inactive')}</Tooltip></Polygon>;
          }
          if (z.type === 'radius' && z.center_lat != null && z.center_lng != null && z.radius_m != null) {
            return <Circle key={z.id} center={[z.center_lat, z.center_lng]} radius={z.radius_m} pathOptions={opts}><Tooltip>{z.name} · {t(z.is_active?'active':'inactive')}</Tooltip></Circle>;
          }
          return null;
        })}

        {/* Draft polygon being drawn */}
        {draftLatLng.length >= 3 && (
          <Polygon positions={draftLatLng} pathOptions={{ color: BRAND, weight: 3, fillOpacity: 0.2, dashArray: '6' }} />
        )}
        {draftLatLng.length === 2 && (
          <Polyline positions={draftLatLng} pathOptions={{ color: BRAND, weight: 3, dashArray: '6' }} />
        )}
        {draftLatLng.map((p, i) => (
          <Circle key={`v${i}`} center={p} radius={6} pathOptions={{ color: BRAND, fillOpacity: 1 }} />
        ))}

        {/* Draft radius */}
        {draftCenter && (
          <Circle
            center={[draftCenter.lat, draftCenter.lng]}
            radius={draftRadiusM ?? 1000}
            pathOptions={{ color: BRAND, weight: 3, fillOpacity: 0.18, dashArray: '6' }}
          />
        )}

        {/* City markers (display-only) */}
        {cityMarkers?.map((cm) => (
          <Marker key={`city-${cm.name}`} position={[cm.lat, cm.lng]} icon={CITY_ICON}>
            <Tooltip permanent direction="top" offset={[0, -10]}>{cm.name}</Tooltip>
          </Marker>
        ))}

        {drawMode !== 'none' && <ClickCapture onMapClick={onMapClick} />}
      </LeafletSurface>
      {tileError && <p role="status" className="absolute bottom-7 start-3 end-3 z-[500] rounded-r-md bg-[var(--surface)] p-2 text-fs-xs text-[var(--fg)]">{t('deliveryZoneTilesUnavailable')}</p>}
    </div>
  );
}
