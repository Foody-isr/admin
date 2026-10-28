import type { DeliveryZone, DeliveryZoneInput, DeliveryZoneType, DeliverySchedule } from './api';
import { parsePrice } from './delivery-pricing';

export interface ZoneCoordinate { lat: number; lng: number }
export interface DeliveryZoneDraft {
  id?: number;
  name: string;
  type: DeliveryZoneType;
  isActive: boolean;
  polygon: [number, number][];
  center: ZoneCoordinate | null;
  radiusKm: string;
  cities: string[];
  departments: string[];
  departmentsText: string;
  postalCodes: string[];
  postalCodesText: string;
  schedule: DeliverySchedule | null;
  deliveryFee: string;
  minOrder: string;
}
/** Accept only finite geographic coordinates usable by Leaflet and the API. */
export function validZoneCoordinate(value: ZoneCoordinate | null | undefined): value is ZoneCoordinate {
  return !!value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
}
/** Validate identity and field shapes without discarding inactive or tour-only records. */
export function checkedDeliveryZones(value: DeliveryZone[], rid: number): DeliveryZone[] {
  if (!Array.isArray(value) || value.some(zone => !zone || !Number.isInteger(zone.id) || zone.id <= 0 || zone.restaurant_id !== rid || typeof zone.name !== 'string' || !['polygon','radius','cities','departments','postal_codes'].includes(zone.type) || typeof zone.is_active !== 'boolean' || (zone.schedule != null && !validDeliverySchedule(zone.schedule)) || (zone.departments != null && (!Array.isArray(zone.departments) || zone.departments.some(code => typeof code !== 'string'))) || (zone.postal_codes != null && (!Array.isArray(zone.postal_codes) || zone.postal_codes.some(code => typeof code !== 'string'))) || (zone.tour_only != null && typeof zone.tour_only !== 'boolean') || (zone.cities != null && (!Array.isArray(zone.cities) || zone.cities.some(city => typeof city !== 'string'))) || (zone.polygon != null && (!Array.isArray(zone.polygon) || zone.polygon.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n))))) || [zone.center_lat,zone.center_lng,zone.radius_m,zone.delivery_fee,zone.min_order].some(n => n != null && !Number.isFinite(n))) || new Set(value.map(zone => zone.id)).size !== value.length) throw new Error('Invalid delivery zones');
  return value;
}
/** Preserve a saved zone's origin rather than moving it to a newly geocoded address. */
export function deliveryZoneDraft(zone?: DeliveryZone, center: ZoneCoordinate | null = null): DeliveryZoneDraft {
  return zone ? { id:zone.id,name:zone.name,type:zone.type,isActive:zone.is_active,polygon:zone.polygon ?? [],center:zone.center_lat != null && zone.center_lng != null ? {lat:zone.center_lat,lng:zone.center_lng} : null,radiusKm:zone.radius_m != null ? String(zone.radius_m/1000) : '5',cities:zone.cities ?? [],departments:zone.departments ?? [],departmentsText:(zone.departments??[]).join(", "),postalCodes:zone.postal_codes??[],postalCodesText:(zone.postal_codes??[]).join(", "),schedule:zone.schedule ? structuredClone(zone.schedule) : null,deliveryFee:zone.delivery_fee != null ? String(zone.delivery_fee) : '',minOrder:zone.min_order != null ? String(zone.min_order) : '' } : {name:'',type:'radius',isActive:true,polygon:[],center,radiusKm:'5',cities:[],departments:[],departmentsText:"",postalCodes:[],postalCodesText:"",schedule:null,deliveryFee:'',minOrder:''};
}
/** Return a translation key for invalid user input, without coercing blank money to zero. */
export function deliveryZoneDraftError(draft: DeliveryZoneDraft): string | null {
  if (!draft.name.trim()) return 'deliveryZoneNameRequired';
  if (parsePrice(draft.deliveryFee) === undefined || parsePrice(draft.minOrder) === undefined) return 'invalidPrice';
  if (draft.type === 'radius' && (!validZoneCoordinate(draft.center) || !draft.radiusKm.trim() || !Number.isFinite(Number(draft.radiusKm)) || !Number.isSafeInteger(Math.round(Number(draft.radiusKm)*1000)) || Math.round(Number(draft.radiusKm)*1000) <= 0)) return 'deliveryZoneRadiusInvalid';
  if (draft.type === 'cities' && (!draft.cities.length || draft.cities.some(city => !city.trim()))) return 'deliveryZoneCitiesRequired';
  if (draft.type === 'postal_codes' && (!draft.postalCodes.length || draft.postalCodes.length > 1000 || draft.postalCodes.some(code => !/^[0-9]{5}$/.test(code)))) return 'deliveryPostalCodesRequired';
  if (draft.type === 'departments' && draft.departments.some(code => /^[0-9]{5}$/.test(code))) return 'deliveryDepartmentPostalCode';
  if (draft.type === 'departments' && (!draft.departments.length || draft.departments.some(code => !/^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-46])$/.test(code)))) return 'deliveryDepartmentsRequired';
  if (draft.schedule && !validDeliverySchedule(draft.schedule)) return 'deliveryScheduleInvalid';
  if (draft.type === 'polygon' && (draft.polygon.length < 3 || draft.polygon.some(([lng,lat]) => !validZoneCoordinate({lat,lng})))) return 'deliveryZonePolygonInvalid';
  return null;
}
/** Serialize the active geometry while keeping every original inactive field intact. */
export function deliveryZonePayload(draft: DeliveryZoneDraft, original?: DeliveryZone): DeliveryZoneInput {
  const problem = deliveryZoneDraftError(draft); if (problem) throw new Error(problem);
  const input: DeliveryZoneInput = { name:draft.name.trim(),type:draft.type,is_active:draft.isActive,delivery_fee:parsePrice(draft.deliveryFee)!,min_order:parsePrice(draft.minOrder)!,departments:draft.departments,postal_codes:draft.postalCodes,schedule:draft.schedule };
  if (original?.polygon != null || draft.type === 'polygon') input.polygon = draft.polygon;
  if (original?.cities != null || draft.type === 'cities') input.cities = draft.cities;
  if (draft.center && (original?.center_lat != null || draft.type === 'radius')) { input.center_lat=draft.center.lat;input.center_lng=draft.center.lng; }
  if (draft.type === 'radius') input.radius_m=Math.round(Number(draft.radiusKm)*1000); else if (original?.radius_m != null) input.radius_m=original.radius_m;
  return input;
}
/** Compare canonical persisted fields without identity, timestamps or JSON omission differences. */
export function deliveryZoneSignature(zone: DeliveryZone | DeliveryZoneInput): string {
  return JSON.stringify({name:zone.name,type:zone.type,is_active:zone.is_active,polygon:zone.polygon??[],center_lat:zone.center_lat??null,center_lng:zone.center_lng??null,radius_m:zone.radius_m??null,cities:zone.cities??[],departments:zone.departments??[],postal_codes:zone.postal_codes??[],schedule:zone.schedule??null,delivery_fee:zone.delivery_fee??null,min_order:zone.min_order??null});
}
/** Exclude only invalid drawing geometry; do not remove records from the editable inventory. */
export function deliveryZoneCanDraw(zone: DeliveryZone): boolean {
  return zone.type === 'radius' ? validZoneCoordinate({lat:zone.center_lat!,lng:zone.center_lng!}) && Number.isFinite(zone.radius_m) && zone.radius_m! > 0 : zone.type === 'polygon' && !!zone.polygon && zone.polygon.length >= 3 && zone.polygon.every(([lng,lat]) => validZoneCoordinate({lat,lng}));
}

/** Validate route calendars before rendering or persisting their window controls. */
export function validDeliverySchedule(value: DeliverySchedule): boolean {
  if (!value || !['customer','automatic','restaurant'].includes(value.mode) || typeof value.offer_pickup !== 'boolean' || !Array.isArray(value.windows) || !value.windows.length || value.windows.length > 28) return false;
  const days = new Map<number, { start: string; end: string }[]>();
  for (const window of value.windows) {
    if (!window || !Array.isArray(window.days) || !window.days.length || new Set(window.days).size !== window.days.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) || window.start >= window.end) return false;
    for (const day of window.days) {
      if (!Number.isInteger(day) || day < 0 || day > 6) return false;
      const previous = days.get(day) ?? [];
      if (previous.some(other => window.start < other.end && other.start < window.end)) return false;
      days.set(day, [...previous, window]);
    }
  }
  return true;
}

/** Split pasted postal lists without losing line breaks, order or leading zeros. */
export function parseDeliveryPostalCodes(text: string): string[] {
  return Array.from(new Set(text.split(/[,;\s]+/).filter(Boolean)));
}
