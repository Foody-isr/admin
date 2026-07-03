'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Circle, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryZone } from '@/lib/api';

const BRAND = '#F18A47';
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

// react-leaflet expects [lat, lng]; our storage is [lng, lat].
function toLatLng(ring: [number, number][]): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

export default function ZoneMap({
  center, zones, activeZoneId, drawMode, draftPolygon, draftCenter, draftRadiusM, onMapClick, className, cityMarkers,
  interactive = true,
}: ZoneMapProps) {
  const draftLatLng = useMemo(() => toLatLng(draftPolygon), [draftPolygon]);

  return (
    <div className={className}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        zoomControl={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[center.lat, center.lng]} icon={HOME_ICON} />

        {/* Saved zones */}
        {zones.map((z) => {
          const active = z.id === activeZoneId;
          const color = active ? BRAND : '#3b82f6';
          const opts = { color, weight: active ? 3 : 2, fillOpacity: active ? 0.18 : 0.08 };
          if (z.type === 'polygon' && z.polygon && z.polygon.length >= 3) {
            return <Polygon key={z.id} positions={toLatLng(z.polygon)} pathOptions={opts} />;
          }
          if (z.type === 'radius' && z.center_lat != null && z.center_lng != null && z.radius_m != null) {
            return <Circle key={z.id} center={[z.center_lat, z.center_lng]} radius={z.radius_m} pathOptions={opts} />;
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
      </MapContainer>
    </div>
  );
}
