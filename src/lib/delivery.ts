import { apiFetch } from '@/lib/api';
import type { Order } from '@/lib/api';

export type RouteStopStatus = 'pending' | 'arrived' | 'delivered' | 'skipped';
export type DeliveryRouteStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface RouteStop {
  id: number;
  order_id: number;
  sequence: number;
  status: RouteStopStatus;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  delivery_floor?: string;
  delivery_apt?: string;
  delivery_entry_code?: string;
  delivery_notes?: string;
  lat?: number | null;
  lng?: number | null;
  distance_from_prev_m: number;
  eta_seconds: number;
  total_amount: number;
  needs_geocode: boolean;
}

export interface CourierLocationDTO {
  courier_id: number;
  route_id?: number | null;
  lat: number;
  lng: number;
  heading?: number | null;
  updated_at: string;
}

export interface DeliveryRoute {
  id: number;
  restaurant_id: number;
  courier_id: number;
  date: string; // YYYY-MM-DD
  status: DeliveryRouteStatus;
  planned_departure_at?: string | null;
  started_at?: string | null;
  total_distance_m: number;
  est_duration_s: number;
  stops: RouteStop[];
  last_location?: CourierLocationDTO | null;
}

function q(restaurantId: number, extra?: Record<string, string>): string {
  const sp = new URLSearchParams({ restaurant_id: String(restaurantId), ...(extra ?? {}) });
  return sp.toString();
}

/** The current courier's open route for today (server creates a draft if none). */
export async function getMyRoute(restaurantId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/mine?${q(restaurantId)}`, restaurantId,
  );
  return data.route;
}

/** Paid, ready-for-delivery orders the courier may self-pick. */
export async function listAvailableDeliveries(restaurantId: number): Promise<Order[]> {
  const data = await apiFetch<{ orders: Order[] }>(
    `/api/v1/delivery/available?${q(restaurantId)}`, restaurantId,
  );
  return data.orders ?? [];
}

export async function startRoute(restaurantId: number, routeId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/start?${q(restaurantId)}`, restaurantId,
    { method: 'POST' },
  );
  return data.route;
}

export async function markArrived(restaurantId: number, routeId: number, stopId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops/${stopId}/arrived?${q(restaurantId)}`, restaurantId,
    { method: 'POST' },
  );
  return data.route;
}

export async function markStopDelivered(restaurantId: number, routeId: number, stopId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops/${stopId}/delivered?${q(restaurantId)}`, restaurantId,
    { method: 'POST' },
  );
  return data.route;
}

export async function addStops(restaurantId: number, routeId: number, orderIds: number[]): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops?${q(restaurantId)}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ order_ids: orderIds }) },
  );
  return data.route;
}

export async function removeStop(restaurantId: number, routeId: number, stopId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops/${stopId}?${q(restaurantId)}`, restaurantId,
    { method: 'DELETE' },
  );
  return data.route;
}

/** Manager action: return one pending stop to the unplanned delivery pool. */
export async function unassignRouteStop(restaurantId: number, routeId: number, stopId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops/${stopId}/unassign?${q(restaurantId)}`,
    restaurantId,
    { method: 'DELETE' },
  );
  return data.route;
}

export async function reorderStops(restaurantId: number, routeId: number, stopIds: number[]): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/stops/reorder?${q(restaurantId)}`, restaurantId,
    { method: 'PATCH', body: JSON.stringify({ stop_ids: stopIds }) },
  );
  return data.route;
}

export async function optimizeRoute(
  restaurantId: number, routeId: number, from?: { lat: number; lng: number },
): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/optimize?${q(restaurantId)}`, restaurantId,
    { method: 'POST', body: JSON.stringify(from ? { from } : {}) },
  );
  return data.route;
}

export async function buildRoute(
  restaurantId: number, courierId: number, orderIds: number[],
): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes?${q(restaurantId)}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ courier_id: courierId, order_ids: orderIds }) },
  );
  return data.route;
}

export async function planDeliveryRoutes(
  restaurantId: number,
  courierIds: number[],
  orderIds: number[],
  plannedDepartureAt: string,
  assignments?: Array<{ courier_id: number; order_ids: number[] }>,
): Promise<DeliveryRoute[]> {
  const data = await apiFetch<{ routes: DeliveryRoute[] }>(
    `/api/v1/delivery/routes/plan?${q(restaurantId)}`, restaurantId,
    {
      method: 'POST',
      body: JSON.stringify({
        courier_ids: courierIds,
        order_ids: orderIds,
        planned_departure_at: plannedDepartureAt,
        assignments,
      }),
    },
  );
  return data.routes ?? [];
}

export async function transferRouteStop(
  restaurantId: number,
  routeId: number,
  stopId: number,
  targetRouteId: number,
): Promise<DeliveryRoute[]> {
  const data = await apiFetch<{ routes: DeliveryRoute[] }>(
    `/api/v1/delivery/routes/${routeId}/stops/${stopId}/transfer?${q(restaurantId)}`,
    restaurantId,
    { method: 'PATCH', body: JSON.stringify({ target_route_id: targetRouteId }) },
  );
  return data.routes ?? [];
}

export async function changeRouteCourier(
  restaurantId: number,
  routeId: number,
  courierId: number,
): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}/courier?${q(restaurantId)}`,
    restaurantId,
    { method: 'PATCH', body: JSON.stringify({ courier_id: courierId }) },
  );
  return data.route;
}

/** Dissolve a draft route and return all its deliveries to the planning pool. */
export async function cancelDeliveryRoute(restaurantId: number, routeId: number): Promise<DeliveryRoute> {
  const data = await apiFetch<{ route: DeliveryRoute }>(
    `/api/v1/delivery/routes/${routeId}?${q(restaurantId)}`,
    restaurantId,
    { method: 'DELETE' },
  );
  return data.route;
}

export async function listDeliveryRoutes(restaurantId: number, date?: string): Promise<DeliveryRoute[]> {
  const data = await apiFetch<{ routes: DeliveryRoute[] }>(
    `/api/v1/delivery/routes?${q(restaurantId, date ? { date } : undefined)}`, restaurantId,
  );
  return data.routes ?? [];
}

/** Report the courier's current GPS. 204 (no active route) and 429 (rate-limited)
 *  are both fine; the caller ignores the result. */
export async function reportLocation(
  restaurantId: number,
  pos: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number },
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/delivery/location?${q(restaurantId)}`, restaurantId,
    { method: 'POST', body: JSON.stringify(pos) },
  );
}
