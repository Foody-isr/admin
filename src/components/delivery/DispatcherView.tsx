'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  ListChecksIcon,
  MapPinIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  RouteIcon,
  SparklesIcon,
  Undo2Icon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import { whatsappUrl } from '@/lib/delivery-links';
import {
  buildDeliveryEtaLabel,
  buildDeliveryEtaMessage,
  deliveryEtaWindow,
  type DeliveryEtaWindow,
} from '@/lib/delivery-planning';
import { useWs } from '@/lib/ws-context';
import {
  cancelDeliveryRoute,
  listDeliveryRoutes,
  listOpenDeliveryRoutes,
  optimizeRoute,
  planDeliveryRoutes,
  transferRouteStop,
  unassignRouteStop,
  type DeliveryRoute,
  type RouteStop,
} from '@/lib/delivery';
import {
  listOrders,
  listCouriers,
  type Order,
  type StaffMember,
} from '@/lib/api';
import { localizeStatus } from '@/lib/orders/status-presentation';
import type { RouteLayer, CourierMarker } from '@/components/delivery/DeliveryMap';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge, Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';
import { Checkbox } from '@/components/ui/checkbox';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

const COURIER_COLORS = ['#F18A47', '#5AA9E6', '#C792EA', '#5BBF84', '#E6A75A', '#E26D9B'];
type Translator = (key: string) => string;
type DistributionMode = 'smart' | 'zone' | 'manual';

function deliveryZone(order: Order, fallback: string): string {
  return order.delivery_city?.trim() || fallback;
}

function colorFor(index: number): string {
  return COURIER_COLORS[index % COURIER_COLORS.length];
}

function formatDuration(seconds: number, t: Translator): string {
  if (seconds <= 0) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${t('unitMin')}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}${t('unitHour')} ${rest}${t('unitMin')}` : `${hours}${t('unitHour')}`;
}

function formatDistance(metres: number): string {
  if (metres <= 0) return '';
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

function defaultDepartureValue(): string {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function routePlanningDate(route: DeliveryRoute): string {
  return route.date.slice(0, 10);
}

function departureValueForRoute(route: DeliveryRoute, fallback: string): string {
  if (route.planned_departure_at) return localDateTimeValue(route.planned_departure_at);
  return `${routePlanningDate(route)}T${fallback.slice(11, 16) || '09:00'}`;
}

function routeStatusTone(status: DeliveryRoute['status']): 'neutral' | 'success' | 'info' | 'warning' {
  switch (status) {
    case 'active': return 'info';
    case 'completed': return 'success';
    case 'cancelled': return 'warning';
    default: return 'neutral';
  }
}

function deliveryMessage(t: Translator, stop: RouteStop, window: DeliveryEtaWindow | null): string {
  const key = window ? 'deliveryEtaWhatsappTemplate' : 'deliveryEtaWhatsappTemplateNoTime';
  return buildDeliveryEtaMessage(t(key), stop, window);
}

interface RouteRibbonProps {
  route: DeliveryRoute;
  courier?: StaffMember;
  color: string;
  locale: string;
  selectedStopId: number | null;
  busy: boolean;
  onSelectCourier: () => void;
  onSelectStop: (stopId: number) => void;
  onOptimize: () => void;
  onCancel: () => void;
  t: Translator;
}

function RouteRibbon({
  route,
  courier,
  color,
  locale,
  selectedStopId,
  busy,
  onSelectCourier,
  onSelectStop,
  onOptimize,
  onCancel,
  t,
}: RouteRibbonProps) {
  const delivered = route.stops.filter((stop) => stop.status === 'delivered').length;
  const unresolved = route.stops.filter((stop) => stop.needs_geocode).length;
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const progress = route.stops.length > 0 ? (delivered / route.stops.length) * 100 : 0;

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="h-1" style={{ background: color }} />
      <CardHeader className="px-3 py-2.5">
        <button type="button" onClick={onSelectCourier} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-fs-sm font-semibold text-[var(--fg)]">
            {courier?.full_name ?? `#${route.courier_id}`}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {unresolved > 0 && (
            <Badge tone="warning" title={t('addressNeedsAttention')}>
              <AlertCircleIcon className="h-3 w-3" />
              {unresolved}
            </Badge>
          )}
          <Badge tone={routeStatusTone(route.status)}>
            {t(`routeStatus${route.status.charAt(0).toUpperCase()}${route.status.slice(1)}`)}
          </Badge>
        </span>
      </CardHeader>
      <CardBody className="px-3 pb-3 pt-0">
        <div className="mb-2 grid grid-cols-3 divide-x divide-[var(--line)] rounded-r-md bg-[var(--surface-2)] px-2 py-1.5 text-center">
          <div>
            <div className="text-fs-sm font-semibold text-[var(--fg)]">{route.stops.length}</div>
            <div className="text-[11px] text-[var(--fg-subtle)]">{t('deliveryPlanStops')}</div>
          </div>
          <div>
            <div className="text-fs-sm font-semibold text-[var(--fg)]">{formatDuration(route.est_duration_s, t) || '—'}</div>
            <div className="text-[11px] text-[var(--fg-subtle)]">{t('deliveryPlanDuration')}</div>
          </div>
          <div>
            <div className="text-fs-sm font-semibold text-[var(--fg)]">{formatDistance(route.total_distance_m) || '—'}</div>
            <div className="text-[11px] text-[var(--fg-subtle)]">{t('deliveryPlanDistance')}</div>
          </div>
        </div>

        <div className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: color }} />
        </div>

        {route.status === 'draft' && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 border-b border-[var(--line)] pb-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || route.stops.length === 0}
              onClick={onOptimize}
              title={t('deliveryPlanRecalculate')}
            >
              <RefreshCwIcon className={busy ? 'animate-spin' : undefined} />
              {t('deliveryPlanRecalculate')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onCancel}
              className="text-[var(--danger-500)] hover:text-[var(--danger-500)]"
              title={t('deliveryPlanUnassignRoute')}
            >
              <Undo2Icon />
              {t('deliveryPlanUnassignRoute')}
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-r-lg border border-[var(--line)]">
          <div className="flex flex-col">
            {ordered.map((stop, index) => {
              const window = deliveryEtaWindow(route, stop, locale);
              const address = formatDeliveryAddress({
                address: stop.address,
                city: stop.city,
                floor: stop.delivery_floor,
                apt: stop.delivery_apt,
                entryCode: stop.delivery_entry_code,
              }, t);
              const deliveryNotes = stop.delivery_notes?.trim();
              const isSelected = selectedStopId === stop.id;
              const message = deliveryMessage(t, stop, window);
              return (
                <div
                  key={stop.id}
                  className={`relative flex items-stretch transition-colors ${index < ordered.length - 1 ? 'border-b border-[var(--line)]' : ''} ${
                    isSelected
                      ? 'bg-[var(--brand-50)]'
                      : 'hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStop(stop.id)}
                    className="flex min-w-0 flex-1 items-stretch text-left focus-visible:outline-none focus-visible:shadow-ring"
                  >
                    <span className="relative flex w-14 shrink-0 flex-col items-center px-1 py-2.5 text-center">
                      <span className="num text-fs-xs font-semibold" style={{ color }}>
                        {String(stop.sequence).padStart(2, '0')}
                      </span>
                      {window && (
                        <span className="num mt-1.5 text-[10px] leading-tight text-[var(--fg-subtle)]">
                          {window.start}<br />{window.end}
                        </span>
                      )}
                      {index < ordered.length - 1 && (
                        <span className="absolute bottom-0 top-[52px] w-0.5 rounded-full opacity-60" style={{ background: color }} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1 py-2.5 pe-2">
                      <span className="block text-fs-sm font-semibold leading-snug text-[var(--fg)]">
                        {address?.line1 || stop.customer_name}
                      </span>
                      {address?.line2 && (
                        <span className="mt-0.5 block text-[11px] font-medium text-[var(--fg-muted)]">{address.line2}</span>
                      )}
                      <span className="mt-1 block truncate text-fs-xs text-[var(--fg-muted)]">{stop.customer_name}</span>
                      {deliveryNotes && (
                        <span className="mt-0.5 block line-clamp-1 text-[11px] text-[var(--fg-subtle)]">
                          {t('deliveryNotes')}: {deliveryNotes}
                        </span>
                      )}
                      {window ? (
                        <span className="mt-1 block text-[11px] font-medium leading-snug text-[var(--info-500)]">
                          {window.label}
                        </span>
                      ) : stop.needs_geocode ? (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium leading-snug text-[var(--warning-500)]">
                          <AlertCircleIcon className="h-3 w-3 shrink-0" />
                          {t('addressNeedsAttention')}
                        </span>
                      ) : null}
                    </span>
                    <span className="num me-2 mt-2.5 h-fit shrink-0 rounded-r-md bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold text-[var(--fg-muted)] shadow-1">
                      #{stop.order_id}
                    </span>
                  </button>
                  {stop.customer_phone && (
                    <a
                      href={whatsappUrl(stop.customer_phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="me-2 mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-r-md text-[#1FA855] transition-colors hover:bg-[#1FA855]/10 focus-visible:outline-none focus-visible:shadow-ring"
                      aria-label={t('deliveryPlanWhatsApp')}
                      title={t('deliveryPlanWhatsApp')}
                    >
                      <MessageCircleIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function DispatcherView({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { lastEvent } = useWs();
  const prevEvent = useRef(lastEvent);
  const initialPlanResolved = useRef(false);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [openRoutes, setOpenRoutes] = useState<DeliveryRoute[]>([]);
  const [livePositions, setLivePositions] = useState<Map<number, { lat: number; lng: number; updatedAt: number }>>(new Map());
  const [ready, setReady] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('smart');
  const [plannerCouriers, setPlannerCouriers] = useState<Set<number>>(new Set());
  const [zoneCouriers, setZoneCouriers] = useState<Map<string, number>>(new Map());
  const [manualCouriers, setManualCouriers] = useState<Map<number, number>>(new Map());
  const [departure, setDeparture] = useState(defaultDepartureValue);
  const [planning, setPlanning] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [routeBusy, setRouteBusy] = useState<number | null>(null);
  const [undoAction, setUndoAction] = useState<
    | { kind: 'route'; routeId: number; stopCount: number }
    | { kind: 'stop'; routeId: number; stopId: number; customerName: string }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [routeRows, openRouteRows, candidateRows, courierRows] = await Promise.all([
        listDeliveryRoutes(rid, departure.slice(0, 10)),
        listOpenDeliveryRoutes(rid),
        listOrders(rid, { type: 'delivery', status: 'accepted,in_kitchen,ready_for_delivery', payment_status: 'paid' }),
        listCouriers(rid),
      ]);
      const routedOrderIds = new Set([
        ...routeRows.flatMap((route) => route.stops.map((stop) => stop.order_id)),
        ...openRouteRows.flatMap((route) => route.stops.map((stop) => stop.order_id)),
      ]);
      const available = candidateRows.orders.filter((order) => !routedOrderIds.has(order.id));
      let visibleRoutes = routeRows;

      if (!initialPlanResolved.current) {
        initialPlanResolved.current = true;
        const candidateOrderIds = new Set(candidateRows.orders.map((order) => order.id));
        const relatedOpenRoute = openRouteRows.find((route) =>
          route.stops.some((stop) => candidateOrderIds.has(stop.order_id)),
        );
        if (routeRows.length === 0 && relatedOpenRoute) {
          const recoveredDate = routePlanningDate(relatedOpenRoute);
          if (recoveredDate !== departure.slice(0, 10)) {
            setDeparture(departureValueForRoute(relatedOpenRoute, departure));
            visibleRoutes = openRouteRows.filter((route) => routePlanningDate(route) === recoveredDate);
          }
        }
      }

      setRoutes(visibleRoutes);
      setOpenRoutes(openRouteRows);
      setReady(candidateRows.orders);
      setCouriers(courierRows);
      setPicked((current) => {
        const availableIds = new Set(available.map((order) => order.id));
        const retained = new Set(Array.from(current).filter((id) => availableIds.has(id)));
        return current.size === 0 ? availableIds : retained;
      });
      setPlannerCouriers((current) => {
        const activeCourierIds = new Set(
          visibleRoutes.filter((route) => route.status === 'active').map((route) => route.courier_id),
        );
        const selectableCouriers = courierRows.filter((courier) => !activeCourierIds.has(courier.id));
        const valid = new Set(Array.from(current).filter((id) => selectableCouriers.some((courier) => courier.id === id)));
        if (valid.size > 0) return valid;
        return new Set(selectableCouriers.slice(0, Math.min(2, selectableCouriers.length)).map((courier) => courier.id));
      });
      const seed = new Map<number, { lat: number; lng: number; updatedAt: number }>();
      visibleRoutes.forEach((route) => {
        if (!route.last_location) return;
        seed.set(route.courier_id, {
          lat: route.last_location.lat,
          lng: route.last_location.lng,
          updatedAt: Date.parse(route.last_location.updated_at),
        });
      });
      setLivePositions(seed);
    } catch (cause) {
      setError((cause as Error)?.message || t('couldNotLoad'));
    }
  }, [departure, rid, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;
    if (lastEvent.type === 'courier.location') {
      const position = lastEvent.payload as unknown as { courier_id: number; lat: number; lng: number; updated_at: string };
      setLivePositions((current) => {
        const next = new Map(current);
        next.set(position.courier_id, {
          lat: position.lat,
          lng: position.lng,
          updatedAt: Date.parse(position.updated_at),
        });
        return next;
      });
      return;
    }
    if (lastEvent.type === 'route.updated' || lastEvent.type.startsWith('order.')) void load();
  }, [lastEvent, load]);

  const routeColorMap = useMemo(() => {
    const colors = new Map<number, string>();
    routes.forEach((route, index) => colors.set(route.id, colorFor(index)));
    return colors;
  }, [routes]);

  const layers = useMemo<RouteLayer[]>(
    () => routes.map((route) => ({
      routeId: route.id,
      courierId: route.courier_id,
      color: routeColorMap.get(route.id) ?? colorFor(0),
      stops: route.stops,
    })),
    [routes, routeColorMap],
  );

  const courierMarkers = useMemo<CourierMarker[]>(() => {
    const markers: CourierMarker[] = [];
    routes.forEach((route) => {
      const position = livePositions.get(route.courier_id);
      if (!position) return;
      markers.push({
        courierId: route.courier_id,
        color: routeColorMap.get(route.id) ?? colorFor(0),
        lat: position.lat,
        lng: position.lng,
        stale: nowTick - position.updatedAt > 60_000,
      });
    });
    return markers;
  }, [routes, livePositions, nowTick, routeColorMap]);

  const courierById = useMemo(() => {
    const map = new Map<number, StaffMember>();
    couriers.forEach((courier) => map.set(courier.id, courier));
    return map;
  }, [couriers]);

  const openRouteByOrderId = useMemo(() => {
    const map = new Map<number, DeliveryRoute>();
    openRoutes.forEach((route) => {
      route.stops.forEach((stop) => map.set(stop.order_id, route));
    });
    return map;
  }, [openRoutes]);

  const unplannedOrders = useMemo(
    () => ready.filter((order) => !openRouteByOrderId.has(order.id)),
    [ready, openRouteByOrderId],
  );

  const activeCourierIds = useMemo(
    () => new Set(routes.filter((route) => route.status === 'active').map((route) => route.courier_id)),
    [routes],
  );
  const planningCouriers = useMemo(
    () => couriers.filter((courier) => !activeCourierIds.has(courier.id)),
    [couriers, activeCourierIds],
  );
  const selectedOrders = useMemo(
    () => ready.filter((order) => picked.has(order.id)),
    [ready, picked],
  );
  const selectedZones = useMemo(
    () => Array.from(new Set(selectedOrders.map((order) => deliveryZone(order, t('deliveryPlanUnknownZone'))))),
    [selectedOrders, t],
  );

  useEffect(() => {
    setZoneCouriers((current) => {
      const next = new Map<string, number>();
      selectedZones.forEach((zone, index) => {
        const currentCourier = current.get(zone);
        const fallback = planningCouriers[index % Math.max(planningCouriers.length, 1)]?.id;
        if (currentCourier && planningCouriers.some((courier) => courier.id === currentCourier)) {
          next.set(zone, currentCourier);
        } else if (fallback) {
          next.set(zone, fallback);
        }
      });
      return next;
    });
  }, [selectedZones, planningCouriers]);

  useEffect(() => {
    setManualCouriers((current) => {
      const next = new Map<number, number>();
      selectedOrders.forEach((order, index) => {
        const currentCourier = current.get(order.id);
        const fallback = planningCouriers[index % Math.max(planningCouriers.length, 1)]?.id;
        if (currentCourier && planningCouriers.some((courier) => courier.id === currentCourier)) {
          next.set(order.id, currentCourier);
        } else if (fallback) {
          next.set(order.id, fallback);
        }
      });
      return next;
    });
  }, [selectedOrders, planningCouriers]);

  const selectedEntry = useMemo(() => {
    for (const route of routes) {
      const stop = route.stops.find((candidate) => candidate.id === selectedStopId);
      if (stop) return { route, stop };
    }
    return null;
  }, [routes, selectedStopId]);

  const allPicked = unplannedOrders.length > 0 && picked.size === unplannedOrders.length;
  const toggleOrder = (id: number) => setPicked((current) => {
    if (openRouteByOrderId.has(id)) return current;
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(unplannedOrders.map((order) => order.id)));
  const toggleCourier = (id: number) => setPlannerCouriers((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const createPlan = async () => {
    if (picked.size === 0 || !departure) return;
    let assignments: Array<{ courier_id: number; order_ids: number[] }> | undefined;
    let selectedCourierIds = Array.from(plannerCouriers);

    if (distributionMode === 'zone') {
      if (selectedZones.some((zone) => !zoneCouriers.get(zone))) {
        setError(t('deliveryPlanMissingAssignments'));
        return;
      }
      const grouped = new Map<number, number[]>();
      selectedOrders.forEach((order) => {
        const courierId = zoneCouriers.get(deliveryZone(order, t('deliveryPlanUnknownZone')));
        if (!courierId) return;
        grouped.set(courierId, [...(grouped.get(courierId) ?? []), order.id]);
      });
      assignments = Array.from(grouped, ([courier_id, order_ids]) => ({ courier_id, order_ids }));
      selectedCourierIds = Array.from(grouped.keys());
    }

    if (distributionMode === 'manual') {
      if (selectedOrders.some((order) => !manualCouriers.get(order.id))) {
        setError(t('deliveryPlanMissingAssignments'));
        return;
      }
      const grouped = new Map<number, number[]>();
      selectedOrders.forEach((order) => {
        const courierId = manualCouriers.get(order.id);
        if (!courierId) return;
        grouped.set(courierId, [...(grouped.get(courierId) ?? []), order.id]);
      });
      assignments = Array.from(grouped, ([courier_id, order_ids]) => ({ courier_id, order_ids }));
      selectedCourierIds = Array.from(grouped.keys());
    }

    if (selectedCourierIds.length === 0) {
      setError(t('deliveryPlanMissingAssignments'));
      return;
    }
    setPlanning(true);
    try {
      await planDeliveryRoutes(
        rid,
        selectedCourierIds,
        Array.from(picked),
        new Date(departure).toISOString(),
        assignments,
      );
      setPicked(new Set());
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanFailed'));
      await load();
    } finally {
      setPlanning(false);
    }
  };

  const transferSelectedStop = async () => {
    if (!selectedEntry || moveTarget == null) return;
    setMoving(true);
    try {
      await transferRouteStop(rid, selectedEntry.route.id, selectedEntry.stop.id, moveTarget);
      setMoveTarget(null);
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanMoveFailed'));
    } finally {
      setMoving(false);
    }
  };

  const recalculateRoute = async (routeId: number) => {
    setRouteBusy(routeId);
    try {
      await optimizeRoute(rid, routeId);
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanRecalculateFailed'));
    } finally {
      setRouteBusy(null);
    }
  };

  const confirmUndo = async () => {
    if (!undoAction) return;
    const routeId = undoAction.routeId;
    setRouteBusy(routeId);
    try {
      if (undoAction.kind === 'route') {
        await cancelDeliveryRoute(rid, routeId);
      } else {
        await unassignRouteStop(rid, routeId, undoAction.stopId);
      }
      setSelectedStopId(null);
      setSelectedCourier(null);
      setMoveTarget(null);
      setUndoAction(null);
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanUndoFailed'));
    } finally {
      setRouteBusy(null);
    }
  };

  if (error && routes.length === 0 && ready.length === 0 && couriers.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-fs-sm text-[var(--fg-muted)]">{t('couldNotLoad')}</p>
          <Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button>
        </CardBody>
      </Card>
    );
  }

  const selectedWindow = selectedEntry ? deliveryEtaWindow(selectedEntry.route, selectedEntry.stop, locale) : null;
  const selectedMessage = selectedEntry ? deliveryMessage(t, selectedEntry.stop, selectedWindow) : '';
  const selectedAddress = selectedEntry ? formatDeliveryAddress({
    address: selectedEntry.stop.address,
    city: selectedEntry.stop.city,
    floor: selectedEntry.stop.delivery_floor,
    apt: selectedEntry.stop.delivery_apt,
    entryCode: selectedEntry.stop.delivery_entry_code,
  }, t) : null;
  const movableRoutes = selectedEntry
    ? routes.filter((route) => route.id !== selectedEntry.route.id && route.status === 'draft')
    : [];
  const canCreatePlan = picked.size > 0 && Boolean(departure) && (
    distributionMode === 'smart'
      ? plannerCouriers.size > 0
      : distributionMode === 'zone'
        ? selectedZones.length > 0 && selectedZones.every((zone) => Boolean(zoneCouriers.get(zone)))
        : selectedOrders.length > 0 && selectedOrders.every((order) => Boolean(manualCouriers.get(order.id)))
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          className="flex items-center justify-between gap-3 rounded-r-lg px-4 py-3 text-fs-sm"
          style={{
            background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
            color: 'var(--danger-500)',
            border: '1px solid color-mix(in oklab, var(--danger-500) 25%, transparent)',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold hover:opacity-70" aria-label={t('close')}>✕</button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="flex items-center gap-2 text-fs-xl font-semibold text-[var(--fg)]">
            <RouteIcon className="h-5 w-5 text-[var(--brand-500)]" />
            {t('deliveryPlanTitle')}
          </h1>
          <p className="mt-1 max-w-2xl text-fs-sm text-[var(--fg-muted)]">{t('deliveryPlanIntro')}</p>
        </div>
        <div className="flex items-center gap-2 text-fs-xs text-[var(--fg-muted)]">
          <Badge tone={unplannedOrders.length > 0 ? 'warning' : 'neutral'}>
            {t('deliveryPlanUnplanned').replace('{count}', String(unplannedOrders.length))}
          </Badge>
          <Badge tone={routes.length > 0 ? 'info' : 'neutral'}>
            <RouteIcon className="h-3 w-3" />
            {routes.length} {t('deliveryPlanRoutes')}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:h-[calc(100dvh-170px)] xl:min-h-[620px] xl:grid-cols-[minmax(330px,0.82fr)_minmax(380px,0.96fr)_minmax(420px,1.32fr)] xl:items-stretch">
        <div className="flex min-h-0 flex-col gap-3 xl:overflow-y-auto xl:pe-1">
          <Card className="overflow-hidden border-s-4 border-s-[var(--brand-500)] shadow-none">
            <CardHeader className="items-start px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-md bg-[var(--brand-500)] text-fs-sm font-bold text-white">1</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t('deliveryPlanStepOne')}</h2>
                <p className="mt-0.5 text-fs-xs text-[var(--fg-subtle)]">{t('deliveryPlanUnplanned').replace('{count}', String(unplannedOrders.length))}</p>
              </div>
              <Badge tone={picked.size > 0 ? 'info' : 'neutral'}>
                {t('deliveryPlanAvailableCount')
                  .replace('{selected}', String(picked.size))
                  .replace('{available}', String(unplannedOrders.length))}
              </Badge>
            </CardHeader>
            <CardBody className="px-4 pb-3 pt-0">
              {unplannedOrders.length === 0 ? (
                <div className="py-6 text-center">
                  <ListChecksIcon className="mx-auto mb-2 h-7 w-7 text-[var(--fg-subtle)]" />
                  <p className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('deliveryPlanNoUnplanned')}</p>
                </div>
              ) : (
                <div className="-mx-4 max-h-[310px] overflow-auto">
                  <DataTable responsive={false} className="rounded-none border-0 bg-transparent shadow-none dark:bg-transparent">
                    <DataTableHead>
                      <DataTableHeadCell className="w-10 p-3"><Checkbox checked={allPicked} onCheckedChange={toggleAll} /></DataTableHeadCell>
                      <DataTableHeadCell className="p-3">{t('customer')}</DataTableHeadCell>
                      <DataTableHeadCell className="p-3">{t('address')}</DataTableHeadCell>
                      <DataTableHeadCell className="p-3">{t('status')}</DataTableHeadCell>
                    </DataTableHead>
                    <DataTableBody>
                      {unplannedOrders.map((order, index) => {
                        const address = formatDeliveryAddress({
                          address: order.delivery_address,
                          city: order.delivery_city,
                          floor: order.delivery_floor,
                          apt: order.delivery_apt,
                          entryCode: order.delivery_entry_code,
                        }, t);
                        return (
                          <DataTableRow
                            key={order.id}
                            index={index}
                            onClick={() => toggleOrder(order.id)}
                            className="cursor-pointer"
                          >
                            <DataTableCell className="w-10 p-3">
                              <Checkbox
                                checked={picked.has(order.id)}
                                onCheckedChange={() => toggleOrder(order.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </DataTableCell>
                            <DataTableCell className="p-3">
                              <div className="text-fs-sm font-medium text-[var(--fg)]">{order.customer_name}</div>
                              <div className="text-fs-xs text-[var(--fg-subtle)]">#{order.id}</div>
                            </DataTableCell>
                            <DataTableCell className="p-3 text-fs-xs text-[var(--fg-muted)]">{address?.line1 || t('noAddress')}</DataTableCell>
                            <DataTableCell className="p-3">
                              <Badge tone={order.status === 'ready_for_delivery' ? 'success' : 'warning'}>
                                {localizeStatus(order.status, t)}
                              </Badge>
                            </DataTableCell>
                          </DataTableRow>
                        );
                      })}
                    </DataTableBody>
                  </DataTable>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden border-s-4 border-s-[var(--brand-300)] shadow-none">
            <CardHeader className="items-start px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-md bg-[var(--brand-100)] text-fs-sm font-bold text-[var(--brand-700)]">2</span>
              <div>
                <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t('deliveryPlanStepTwo')}</h2>
                <p className="mt-0.5 text-fs-xs text-[var(--fg-subtle)]">{t('deliveryPlanStepTwoHint')}</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-3 px-4 pb-4 pt-0">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('deliveryPlanDistributionMode')}>
                {([
                  ['smart', SparklesIcon, 'deliveryPlanModeSmart', 'deliveryPlanModeSmartHint'],
                  ['zone', MapPinIcon, 'deliveryPlanModeZone', 'deliveryPlanModeZoneHint'],
                  ['manual', UsersIcon, 'deliveryPlanModeManual', 'deliveryPlanModeManualHint'],
                ] as const).map(([mode, Icon, labelKey, hintKey]) => {
                  const active = distributionMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDistributionMode(mode)}
                      className={`relative min-h-[94px] rounded-r-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-ring ${
                        active
                          ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--fg)]'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--line-strong)]'
                      }`}
                    >
                      {active && <CheckIcon className="absolute end-2 top-2 h-4 w-4 text-[var(--brand-500)]" />}
                      <Icon className="mb-2 h-5 w-5 text-[var(--brand-500)]" />
                      <span className="block text-fs-xs font-semibold">{t(labelKey)}</span>
                      <span className="mt-1 block text-[10px] leading-snug text-[var(--fg-subtle)]">{t(hintKey)}</span>
                    </button>
                  );
                })}
              </div>

              {distributionMode === 'smart' && (
                <div>
                  <label className="mb-2 block text-fs-xs font-semibold text-[var(--fg-muted)]">{t('deliveryPlanCouriers')}</label>
                  <div className="flex flex-wrap gap-2">
                    {planningCouriers.map((courier, index) => {
                      const checked = plannerCouriers.has(courier.id);
                      return (
                        <button
                          key={courier.id}
                          type="button"
                          onClick={() => toggleCourier(courier.id)}
                          aria-pressed={checked}
                          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-fs-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-ring ${
                            checked
                              ? 'border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--fg)]'
                              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg-subtle)] hover:border-[var(--line-strong)]'
                          }`}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: checked ? colorFor(index) : 'var(--line-strong)' }} />
                          {courier.full_name}
                        </button>
                      );
                    })}
                    {planningCouriers.length === 0 && <span className="text-fs-xs text-[var(--fg-subtle)]">{t('noCouriersHint')}</span>}
                  </div>
                </div>
              )}

              {distributionMode === 'zone' && (
                <div className="space-y-2">
                  {selectedZones.map((zone) => (
                    <label key={zone} className="grid grid-cols-[minmax(0,1fr)_minmax(160px,0.8fr)] items-center gap-3 rounded-r-md border border-[var(--line)] p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-fs-sm font-medium text-[var(--fg)]">{zone}</span>
                        <span className="text-fs-xs text-[var(--fg-subtle)]">
                          {t('deliveryPlanZoneCount').replace('{count}', String(selectedOrders.filter((order) => deliveryZone(order, t('deliveryPlanUnknownZone')) === zone).length))}
                        </span>
                      </span>
                      <Select value={zoneCouriers.get(zone) ?? ''} onChange={(event) => setZoneCouriers((current) => new Map(current).set(zone, Number(event.target.value)))}>
                        <option value="">{t('selectCourier')}</option>
                        {planningCouriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
              )}

              {distributionMode === 'manual' && (
                <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
                  {selectedOrders.map((order) => (
                    <label key={order.id} className="grid grid-cols-[minmax(0,1fr)_minmax(160px,0.8fr)] items-center gap-3 rounded-r-md border border-[var(--line)] p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-fs-sm font-medium text-[var(--fg)]">{order.customer_name}</span>
                        <span className="text-fs-xs text-[var(--fg-subtle)]">#{order.id} · {deliveryZone(order, t('deliveryPlanUnknownZone'))}</span>
                      </span>
                      <Select value={manualCouriers.get(order.id) ?? ''} onChange={(event) => setManualCouriers((current) => new Map(current).set(order.id, Number(event.target.value)))}>
                        <option value="">{t('selectCourier')}</option>
                        {planningCouriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
              )}

              <div className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <label htmlFor="delivery-departure">
                  <span className="mb-2 block text-fs-xs font-semibold text-[var(--fg-muted)]">{t('deliveryPlanDeparture')}</span>
                  <Input id="delivery-departure" type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} />
                </label>
                <Button size="lg" className="w-full sm:w-auto" disabled={planning || !canCreatePlan} onClick={() => void createPlan()}>
                  <RouteIcon />
                  {planning ? t('deliveryPlanGenerating') : t('deliveryPlanGenerate').replace('{count}', String(picked.size))}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-r-xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t('deliveryPlanRoutes')}</h2>
              <p className="text-fs-xs text-[var(--fg-subtle)]">
                {t('deliveryPlanRoutesHint').replace('{count}', String(routes.length))}
              </p>
            </div>
            {routes.length > 0 && <Badge tone="neutral">{routes.length}</Badge>}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {routes.length === 0 ? (
              <div className="py-8 text-center">
                <RouteIcon className="mx-auto mb-3 h-8 w-8 text-[var(--fg-subtle)]" />
                <p className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('noStopsYet')}</p>
                <p className="mx-auto mt-1 max-w-xs text-fs-xs text-[var(--fg-subtle)]">{t('deliveryPlanEmptyHint')}</p>
              </div>
            ) : routes.map((route) => (
              <RouteRibbon
                key={route.id}
                route={route}
                courier={courierById.get(route.courier_id)}
                color={routeColorMap.get(route.id) ?? colorFor(0)}
                locale={locale}
                selectedStopId={selectedStopId}
                busy={routeBusy === route.id}
                onSelectCourier={() => setSelectedCourier((current) => current === route.courier_id ? null : route.courier_id)}
                onSelectStop={(stopId) => {
                  setSelectedStopId(stopId);
                  setSelectedCourier(route.courier_id);
                  setMoveTarget(null);
                }}
                onOptimize={() => void recalculateRoute(route.id)}
                onCancel={() => setUndoAction({ kind: 'route', routeId: route.id, stopCount: route.stops.length })}
                t={t}
              />
            ))}
          </div>
        </section>

        <div className="relative hidden min-h-0 xl:block">
          <DeliveryMap
            routes={layers}
            couriers={courierMarkers}
            highlightCourierId={selectedCourier}
            onStopClick={(stop) => {
              setSelectedStopId(stop.id);
              const route = routes.find((candidate) => candidate.stops.some((candidateStop) => candidateStop.id === stop.id));
              setSelectedCourier(route?.courier_id ?? null);
              setMoveTarget(null);
            }}
            className="h-full min-h-[560px] overflow-hidden rounded-r-xl border border-[var(--line)]"
          />

          {selectedEntry && (
            <div className="absolute bottom-4 left-4 right-4 z-[500] max-w-md rounded-r-xl border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-3">
              <div className="mb-3 flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fs-sm font-bold text-white"
                  style={{ background: routeColorMap.get(selectedEntry.route.id) ?? colorFor(0) }}
                >
                  {selectedEntry.stop.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-fs-md font-semibold text-[var(--fg)]">{selectedEntry.stop.customer_name}</p>
                  </div>
                  {selectedAddress && (
                    <div className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
                      <p>{selectedAddress.line1}</p>
                      {selectedAddress.line2 && <p className="font-medium">{selectedAddress.line2}</p>}
                    </div>
                  )}
                  {selectedWindow && (
                    <p className="mt-1 text-fs-xs font-medium leading-snug text-[var(--info-500)]">
                      {buildDeliveryEtaLabel(t('deliveryExpectedArrival'), selectedWindow)}
                    </p>
                  )}
                  {!selectedWindow && selectedEntry.stop.needs_geocode && (
                    <p className="mt-1 flex items-center gap-1 text-fs-xs font-medium leading-snug text-[var(--warning-500)]">
                      <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                      {t('addressNeedsAttention')}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
                    <UserIcon className="h-3 w-3" />
                    {courierById.get(selectedEntry.route.courier_id)?.full_name ?? `#${selectedEntry.route.courier_id}`}
                  </p>
                  {selectedEntry.stop.delivery_notes?.trim() && (
                    <div className="mt-2 rounded-r-md border-s-2 border-[var(--brand-300)] bg-[var(--surface-2)] px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">{t('deliveryNotes')}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-fs-xs text-[var(--fg)]">{selectedEntry.stop.delivery_notes.trim()}</p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedStopId(null)} className="text-[var(--fg-subtle)] hover:text-[var(--fg)]" aria-label={t('close')}>✕</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedEntry.stop.customer_phone && (
                  <Button asChild variant="primary">
                    <a href={whatsappUrl(selectedEntry.stop.customer_phone, selectedMessage)} target="_blank" rel="noopener noreferrer">
                      <MessageCircleIcon />
                      {t('deliveryPlanWhatsApp')}
                    </a>
                  </Button>
                )}
                {movableRoutes.length > 0 && selectedEntry.route.status === 'draft' && (
                  <>
                    <Select className="min-w-[170px] flex-1" value={moveTarget ?? ''} onChange={(event) => setMoveTarget(event.target.value ? Number(event.target.value) : null)}>
                      <option value="">{t('deliveryPlanMoveTo')}</option>
                      {movableRoutes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {courierById.get(route.courier_id)?.full_name ?? `#${route.courier_id}`}
                        </option>
                      ))}
                    </Select>
                    <Button variant="secondary" disabled={moveTarget == null || moving} onClick={() => void transferSelectedStop()}>
                      <ArrowRightLeftIcon />
                      {t('deliveryPlanMove')}
                    </Button>
                  </>
                )}
                {selectedEntry.route.status === 'draft' && (
                  <Button
                    variant="ghost"
                    disabled={routeBusy === selectedEntry.route.id}
                    onClick={() => setUndoAction({
                      kind: 'stop',
                      routeId: selectedEntry.route.id,
                      stopId: selectedEntry.stop.id,
                      customerName: selectedEntry.stop.customer_name,
                    })}
                    className="text-[var(--danger-500)] hover:text-[var(--danger-500)]"
                  >
                    <Undo2Icon />
                    {t('deliveryPlanReturnToPool')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-r-lg border border-[var(--line)] p-3 text-fs-sm text-[var(--fg-subtle)] xl:hidden">
        <MapPinIcon className="mr-2 inline h-4 w-4" />
        {t('dispatchDesktopHint')}
      </div>

      <AlertDialog open={undoAction != null} onOpenChange={(open) => { if (!open && routeBusy == null) setUndoAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {undoAction?.kind === 'route' ? t('deliveryPlanUnassignConfirmTitle') : t('deliveryPlanReturnConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoAction?.kind === 'route'
                ? t('deliveryPlanUnassignConfirmBody').replace('{count}', String(undoAction.stopCount))
                : t('deliveryPlanReturnConfirmBody').replace('{customer}', undoAction?.customerName ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={routeBusy != null}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={routeBusy != null}
              onClick={(event) => { event.preventDefault(); void confirmUndo(); }}
              className="bg-[var(--danger-500)] text-white hover:brightness-95"
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
