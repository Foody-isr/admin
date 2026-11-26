import { apiFetch, type KitchenStation } from './api';

export interface TabletAssignment {
  enabled: boolean;
  default_station_id: string;
  station_ids: string[];
  all_stations: boolean;
  can_act: boolean;
}

export interface KitchenTablet extends TabletAssignment {
  device_id: string;
  active_station_id: string;
  paired_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  code_expiry: string | null;
}

export interface KdsConfiguration {
  manager: boolean;
  enabled: boolean;
  devices: {id: string; kind: string; display_name: string; system_name: string; os_name?: string}[];
  categories: {id: number; name: string}[];
  tablets: KitchenTablet[];
  stations: KitchenStation[];
}

function endpoint(rid: number) {
  return `/api/v1/restaurants/${rid}/kds-tablets`;
}

/** Reads the allowed configuration fields through the restaurant settings permission. */
export function loadKdsConfiguration(rid: number) {
  return apiFetch<KdsConfiguration>(endpoint(rid), rid, {cache: 'no-store'});
}

/** Changes the restaurant pilot for its enrolled tablets. */
export function setKdsPilot(rid: number, enabled: boolean) {
  return apiFetch<void>(endpoint(rid) + '/pilot', rid, {method: 'PUT', body: JSON.stringify({enabled})});
}

/** Registers a dedicated kitchen tablet in the restaurant's existing device inventory. */
export function registerKitchenTablet(rid: number, name: string) {
  return apiFetch<{device_id: string}>(endpoint(rid) + '/inventory', rid, {method: 'POST', body: JSON.stringify({name})});
}

/** Applies the complete station assignment without renewing the tablet identity. */
export function assignKitchenTablet(rid: number, id: string, assignment: TabletAssignment) {
  return apiFetch<void>(`${endpoint(rid)}/${encodeURIComponent(id)}/assignment`, rid, {method: 'PUT', body: JSON.stringify(assignment)});
}

/** Issues a single-use code for the selected tablet. */
export function issueKitchenCode(rid: number, id: string) {
  return apiFetch<{code: string; expires_at: string}>(`${endpoint(rid)}/${encodeURIComponent(id)}/code`, rid, {method: 'POST'});
}

/** Revokes the device token and every outstanding code on the assignment. */
export function revokeKitchenTablet(rid: number, id: string) {
  return apiFetch<void>(`${endpoint(rid)}/${encodeURIComponent(id)}/identity`, rid, {method: 'DELETE'});
}
