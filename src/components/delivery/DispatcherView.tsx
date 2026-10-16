'use client';

import { DeliveryDuration } from '@/components/delivery/DeliveryDuration';
import { StopServiceField, validStopServiceMinutes } from '@/components/delivery/StopServiceField';

import { ChoiceRow } from '@/components/ds/Selection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  MessageCircleIcon,
  PencilIcon,
  RefreshCwIcon,
  RouteIcon,
  Settings2Icon,
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
  deliveryMatchesRouteDate,
  isOpenDeliveryRoute,
  isPendingDeliveryStop,
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
  updateRouteSettings,
  type DeliveryRoute,
  type RouteSettingsInput,
  type RouteStop,
} from '@/lib/delivery';
import { RouteSettingsEditor } from '@/components/delivery/RouteSettingsEditor';
import {
  geocodeAddress,
  getOrder,
  listOrders,
  listCouriers,
  updateOrderCustomerDetails,
  type Order,
  type OrderCustomerDetailsInput,
  type StaffMember,
} from '@/lib/api';
import { EditCustomerDialog } from '@/components/orders/EditCustomerDialog';
import { localizeStatus } from '@/lib/orders/status-presentation';
import { deliveryRoutingError } from '@/lib/delivery-planning';
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
import { Badge, Button, Card, CardBody, CardHeader, Drawer, EmptyState, Input, PageHead, Select, Tab, Tabs, TabsList } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

const COURIER_COLORS = ['#525252', '#245B8C', '#7557A0', '#237049', '#865800', '#A04768'];
type Translator = (key: string) => string;
type DistributionMode = 'smart' | 'zone' | 'manual';

function deliveryZone(order: Order, fallback: string): string {
  return order.delivery_city?.trim() || fallback;
}

function colorFor(index: number): string {
  return COURIER_COLORS[index % COURIER_COLORS.length];
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
  routeNumber: number;
  courier?: StaffMember;
  color: string;
  locale: string;
  selectedStopId: number | null;
  busy: boolean;
  history: boolean;
  onSelectCourier: () => void;
  onSelectStop: (stopId: number) => void;
  onOptimize: () => void;
  onSaveSettings: (input: RouteSettingsInput) => Promise<void>;
  onCancel: () => void;
  t: Translator;
}

function RouteRibbon({
  route,
  routeNumber,
  courier,
  color,
  locale,
  selectedStopId,
  busy,
  history,
  onSelectCourier,
  onSelectStop,
  onOptimize,
  onSaveSettings,
  onCancel,
  t,
}: RouteRibbonProps) {
  const delivered = route.stops.filter((stop) => stop.status === 'delivered').length;
  const pending = route.stops.filter(isPendingDeliveryStop);
  const unresolved = pending.filter((stop) => stop.needs_geocode).length;
  const ordered = [...(history ? route.stops : pending)].sort((a, b) => a.sequence - b.sequence);
  const progress = route.stops.length > 0 ? (delivered / route.stops.length) * 100 : 0;
  const courierInk = `color-mix(in srgb, ${color} 40%, var(--fg))`;

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="px-4 py-3">
        <button type="button" onClick={onSelectCourier} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-r-md text-start focus-visible:outline-none focus-visible:shadow-ring">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-md bg-[var(--surface-2)]" style={{ color: courierInk }}><UserIcon className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block truncate text-fs-sm font-semibold text-[var(--fg)]">{courier?.full_name ?? t('courier')}</span>
            <span className="mt-1 flex items-center gap-2 text-fs-xs text-[var(--fg-muted)]"><span aria-hidden className="h-1 w-5 shrink-0 rounded-full" style={{ background: color }} />{t('mapsRoute')} {routeNumber}</span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {unresolved > 0 && (
            <Badge tone="warning" title={t('addressNeedsAttention')}>
              <AlertCircleIcon className="h-3 w-3" />
              {unresolved}
            </Badge>
          )}
          <Badge tone={routeStatusTone(history ? 'completed' : route.status)}>
            {history ? t('routeStatusCompleted') : t(`routeStatus${route.status.charAt(0).toUpperCase()}${route.status.slice(1)}`)}
          </Badge>
        </span>
      </CardHeader>
      <CardBody className="px-4 pb-4 pt-0">
        {route.routing_provider !== 'geoapify' && <p className="mb-2 text-fs-xs text-[var(--fg-muted)]">{t('deliveryRouteApproximate')}</p>}
        <div className="mb-2 grid grid-cols-3 divide-x divide-[var(--line)] rounded-r-md bg-[var(--surface-2)] px-2 py-1.5 text-center">
          <div>
            <div className="num text-fs-sm font-semibold text-[var(--fg)]">{history ? route.stops.length : pending.length}</div>
            <div className="text-fs-xs text-[var(--fg-subtle)]">{t(history ? 'deliveryPlanStops' : 'deliveryPlanRemaining')}</div>
          </div>
          <div>
            <DeliveryDuration route={route} t={t} />
          </div>
          <div>
            <div className="text-fs-sm font-semibold text-[var(--fg)]"><bdi dir="ltr">{route.needs_recalculation ? '—' : formatDistance(route.total_distance_m) || '—'}</bdi></div>
            <div className="text-[11px] text-[var(--fg-subtle)]">{t('deliveryPlanDistance')}</div>
          </div>
        </div>
        {(route.needs_recalculation || unresolved > 0) && (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] leading-snug text-[var(--warning-500)]">
            <AlertCircleIcon className="h-3 w-3 shrink-0" />
            {t(route.needs_recalculation ? 'deliveryRouteNeedsRecalculation' : 'routeEstimatePartial')}
          </p>
        )}

        <div className="mb-3">
          <p className="mb-1.5 text-fs-xs text-[var(--fg-muted)]">{t('deliveryPlanProgress').replace('{done}', String(delivered)).replace('{total}', String(route.stops.length))}</p>
          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-label={t('stopStatusDelivered')} aria-valuenow={delivered} aria-valuemin={0} aria-valuemax={route.stops.length}>
            <div className="h-full rounded-full bg-[var(--fg)]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mb-2">
          <RouteSettingsEditor
            route={route}
            locale={locale}
            disabled={busy || route.status !== 'draft'}
            onSave={onSaveSettings}
            t={t}
          />
        </div>

        {!history && (route.status === 'draft' || (route.status === 'active' && route.needs_recalculation)) && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 border-b border-[var(--line)] pb-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || route.stops.length === 0}
              onClick={onOptimize}
              title={t('deliveryPlanRecalculate')}
            >
              <RefreshCwIcon className={busy ? 'animate-spin' : undefined} />
              {t('deliveryPlanRecalculate')}
            </Button>
            {route.status === 'draft' && <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onCancel}
              className="text-[var(--danger-500)] hover:text-[var(--danger-500)]"
              title={t('deliveryPlanUnassignRoute')}
            >
              <Undo2Icon />
              {t('deliveryPlanUnassignRoute')}
            </Button>}
          </div>
        )}

        <div className="overflow-hidden rounded-r-lg border border-[var(--line)]">
          <div className="flex flex-col">
            {ordered.map((stop, index) => {
              const window = isPendingDeliveryStop(stop) ? deliveryEtaWindow(route, stop, locale) : null;
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
                      ? 'bg-[var(--selection)]'
                      : 'hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStop(stop.id)}
                    className="flex min-w-0 flex-1 items-stretch text-start focus-visible:outline-none focus-visible:shadow-ring"
                  >
                    <span className="relative flex w-14 shrink-0 flex-col items-center px-1 py-2.5 text-center">
                      <span dir="ltr" className="num text-fs-xs font-semibold" style={{ color: courierInk }}>
                        {String(stop.sequence).padStart(2, '0')}
                      </span>
                      {window && (
                        <span dir="ltr" className="num mt-1.5 text-[10px] leading-tight text-[var(--fg-subtle)]">
                          {window.start}<br />{window.end}
                        </span>
                      )}
                      {index < ordered.length - 1 && (
                        <span className="absolute bottom-0 top-[52px] w-0.5 rounded-full opacity-60" style={{ background: color }} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1 py-2.5 pe-2">
                      <span dir="auto" className="block text-fs-sm font-semibold leading-snug text-[var(--fg)]">
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
                      {!isPendingDeliveryStop(stop) ? (
                        <Badge className="mt-1" tone={stop.status === 'delivered' ? 'success' : 'neutral'}>{t(stop.status === 'delivered' ? 'stopStatusDelivered' : 'skipped')}</Badge>
                      ) : window ? (
                        <span dir="ltr" className="mt-1 block w-fit text-[11px] font-medium leading-snug text-[var(--info-500)]">
                          {window.label}
                        </span>
                      ) : stop.needs_geocode ? (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium leading-snug text-[var(--warning-500)]">
                          <AlertCircleIcon className="h-3 w-3 shrink-0" />
                          {t('addressNeedsAttention')}
                        </span>
                      ) : null}
                    </span>
                    <span dir="ltr" className="num me-2 mt-2.5 h-fit shrink-0 rounded-r-md bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold text-[var(--fg-muted)] shadow-1">
                      #{stop.order_id}
                    </span>
                  </button>
                  {stop.customer_phone && !history && (
                    <a
                      href={whatsappUrl(stop.customer_phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="me-1 mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-r-md text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-ring"
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

/** Restaurant-scoped delivery planning and completed-route history. */
export default function DispatcherView({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { lastEvent } = useWs();
  const prevEvent = useRef(lastEvent);
  const initialPlanResolved = useRef(false);
  const loadRequestId = useRef(0);
  const [dayRoutes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [view, setView] = useState<'open' | 'history'>('open');
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openRoutes, setOpenRoutes] = useState<DeliveryRoute[]>([]);
  const [livePositions, setLivePositions] = useState<Map<number, { lat: number; lng: number; updatedAt: number }>>(new Map());
  const [ready, setReady] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('smart');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerCouriers, setPlannerCouriers] = useState<Set<number>>(new Set());
  const [zoneCouriers, setZoneCouriers] = useState<Map<string, number>>(new Map());
  const [manualCouriers, setManualCouriers] = useState<Map<number, number>>(new Map());
  const [departure, setDeparture] = useState(defaultDepartureValue);
  const [serviceMinutes, setServiceMinutes] = useState('3');
  const [planning, setPlanning] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [routeBusy, setRouteBusy] = useState<number | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [addressEditorLoading, setAddressEditorLoading] = useState(false);
  const [undoAction, setUndoAction] = useState<
    | { kind: 'route'; routeId: number; stopCount: number }
    | { kind: 'stop'; routeId: number; stopId: number; customerName: string }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const routes = useMemo(() => dayRoutes.filter((route) => view === 'open'
    ? isOpenDeliveryRoute(route)
    : route.status === 'completed' || (route.stops.length > 0 && !isOpenDeliveryRoute(route))), [dayRoutes, view]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    try {
      setError(null);
      const [routeRows, openRouteRows, candidateRows, courierRows] = await Promise.all([
        listDeliveryRoutes(rid, departure.slice(0, 10)),
        listOpenDeliveryRoutes(rid),
        // Acceptance is the manager's operational gate: once a delivery has
        // entered preparation it must be plannable even when payment will be
        // collected later. The courier self-pick pool remains paid-only.
        listOrders(rid, { type: 'delivery', status: 'accepted,in_kitchen,ready_for_delivery' }),
        listCouriers(rid),
      ]);
      if (requestId !== loadRequestId.current) return;

      // Empty drafts are courier self-pick placeholders, not dispatcher plans.
      // Keeping them visible can hide a real plan on another date.
      const managerRouteRows = routeRows.filter((route) => route.status !== 'draft' || route.stops.length > 0);
      const managerOpenRouteRows = openRouteRows.filter(isOpenDeliveryRoute);
      const routedOrderIds = new Set([
        ...managerRouteRows.flatMap((route) => route.stops.map((stop) => stop.order_id)),
        ...managerOpenRouteRows.flatMap((route) => route.stops.map((stop) => stop.order_id)),
      ]);
      const available = candidateRows.orders.filter((order) => !routedOrderIds.has(order.id));
      let visibleRoutes = managerRouteRows;

      if (!initialPlanResolved.current) {
        initialPlanResolved.current = true;
        const candidateOrderIds = new Set(candidateRows.orders.map((order) => order.id));
        const relatedOpenRoute = managerOpenRouteRows.find((route) =>
          route.stops.some((stop) => candidateOrderIds.has(stop.order_id)),
        );
        if (!managerRouteRows.some(isOpenDeliveryRoute) && relatedOpenRoute) {
          const recoveredDate = routePlanningDate(relatedOpenRoute);
          if (recoveredDate !== departure.slice(0, 10)) {
            setDeparture(departureValueForRoute(relatedOpenRoute, departure));
            visibleRoutes = managerOpenRouteRows.filter((route) => routePlanningDate(route) === recoveredDate);
          }
        }
      }

      setRoutes(visibleRoutes);
      setOpenRoutes(managerOpenRouteRows);
      setReady(candidateRows.orders);
      setCouriers(courierRows);
      const visibleDate = visibleRoutes[0]?.date ?? departure.slice(0, 10);
      setPicked((current) => {
        const availableIds = new Set(available.filter(order => deliveryMatchesRouteDate(order, visibleDate)).map((order) => order.id));
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
      if (requestId !== loadRequestId.current) return;
      setError((cause as Error)?.message || t('couldNotLoad'));
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
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

  const courierById = useMemo(() => {
    const map = new Map<number, StaffMember>();
    couriers.forEach((courier) => map.set(courier.id, courier));
    return map;
  }, [couriers]);

  const routeColorMap = useMemo(() => {
    const colors = new Map<number, string>();
    routes.forEach(route => colors.set(route.id, `hsl(${(route.id * 137.508) % 360} 64% 36%)`));
    return colors;
  }, [routes]);

  const layers = useMemo<RouteLayer[]>(
    () => routes.map((route, index) => ({
      routeId: route.id,
      label: `${courierById.get(route.courier_id)?.full_name ?? t('courier')} · ${t('mapsRoute')} ${index + 1}`,
      geometry: route.route_geometry,
      routingProvider: route.routing_provider,
      courierId: route.courier_id,
      color: routeColorMap.get(route.id) ?? colorFor(0),
      stops: view === 'history' ? route.stops : route.stops.filter(isPendingDeliveryStop),
      start: route.start_lat != null && route.start_lng != null
        ? { lat: route.start_lat, lng: route.start_lng }
        : undefined,
      end: route.end_lat != null && route.end_lng != null
        ? { lat: route.end_lat, lng: route.end_lng }
        : undefined,
    })),
    [routes, routeColorMap, view, courierById, t],
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



  const openRouteByOrderId = useMemo(() => {
    const map = new Map<number, DeliveryRoute>();
    openRoutes.forEach((route) => {
      route.stops.forEach((stop) => map.set(stop.order_id, route));
    });
    return map;
  }, [openRoutes]);

  const unplannedOrders = useMemo(
    () => ready.filter((order) => !openRouteByOrderId.has(order.id) && deliveryMatchesRouteDate(order, departure)),
    [ready, openRouteByOrderId, departure],
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
    () => unplannedOrders.filter((order) => picked.has(order.id)),
    [unplannedOrders, picked],
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
    if (picked.size === 0 || !departure || !validStopServiceMinutes(serviceMinutes)) return;
    if (selectedOrders.length !== picked.size) {
      setError(t('deliveryRouteDateMismatch'));
      return;
    }
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
        Number(serviceMinutes),
      );
      setPicked(new Set());
      setPlannerOpen(false);
      await load();
    } catch (cause) {
      await load();
      setError(deliveryRoutingError(cause,t) ?? t('deliveryPlanFailed'));
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
      setError(deliveryRoutingError(cause, t) ?? t('deliveryPlanMoveFailed'));
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
      setError(deliveryRoutingError(cause,t) ?? t('deliveryPlanRecalculateFailed'));
    } finally {
      setRouteBusy(null);
    }
  };

  const saveRouteSettings = async (routeId: number, input: RouteSettingsInput) => {
    setRouteBusy(routeId);
    setError(null);
    try {
      const updated = await updateRouteSettings(rid, routeId, input);
      setRoutes((current) => current.map((route) => route.id === routeId ? updated : route));
      setOpenRoutes((current) => current.map((route) => route.id === routeId ? updated : route));
    } catch (cause) {
      setError(deliveryRoutingError(cause, t) ?? t('routeSettingsSaveFailed'));
      throw cause;
    } finally {
      setRouteBusy(null);
    }
  };

  const openAddressEditor = async () => {
    if (!selectedEntry) return;
    setAddressEditorLoading(true);
    try {
      setError(null);
      setEditingOrder(await getOrder(rid, selectedEntry.stop.order_id));
    } catch (cause) {
      setError((cause as Error)?.message || t('couldNotLoad'));
    } finally {
      setAddressEditorLoading(false);
    }
  };

  const saveVerifiedAddress = async (input: OrderCustomerDetailsInput) => {
    if (!editingOrder || !selectedEntry) return;
    const result = await geocodeAddress(rid, input.delivery_address ?? '', input.delivery_city);
    if (!result.found || result.lat == null || result.lng == null) {
      throw new Error(t('addressVerificationFailed'));
    }
    await updateOrderCustomerDetails(rid, editingOrder.id, {
      ...input,
      delivery_latitude: result.lat,
      delivery_longitude: result.lng,
    });
    await optimizeRoute(rid, selectedEntry.route.id);
    await load();
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
      setUndoAction(null);
      await load();
      setError(t('deliveryPlanUndoFailed'));
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

  const selectedWindow = selectedEntry && view === 'open' && isPendingDeliveryStop(selectedEntry.stop)
    ? deliveryEtaWindow(selectedEntry.route, selectedEntry.stop, locale) : null;
  const selectedMessage = selectedEntry ? deliveryMessage(t, selectedEntry.stop, selectedWindow) : '';
  const selectedAddress = selectedEntry ? formatDeliveryAddress({
    address: selectedEntry.stop.address,
    city: selectedEntry.stop.city,
    floor: selectedEntry.stop.delivery_floor,
    apt: selectedEntry.stop.delivery_apt,
    entryCode: selectedEntry.stop.delivery_entry_code,
  }, t) : null;
  const movableRoutes = selectedEntry
    ? routes.filter((route) => route.id !== selectedEntry.route.id && route.status === 'draft' && route.date.slice(0, 10) === selectedEntry.route.date.slice(0, 10))
    : [];
  const canCreatePlan = picked.size > 0 && Boolean(departure) && validStopServiceMinutes(serviceMinutes) && (
    distributionMode === 'smart'
      ? plannerCouriers.size > 0
      : distributionMode === 'zone'
        ? selectedZones.length > 0 && selectedZones.every((zone) => Boolean(zoneCouriers.get(zone)))
        : selectedOrders.length > 0 && selectedOrders.every((order) => Boolean(manualCouriers.get(order.id)))
  );
  const routeCountLabel = t(routes.length === 1 ? 'deliveryPlanRouteCountOne' : 'deliveryPlanRouteCountMany')
    .replace('{count}', String(routes.length));

  return (
    <div className="flex flex-col gap-5" aria-busy={loading}>
      {error && (
        <div
          role="alert"
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

      <PageHead className="mb-0" title={t('deliveries')} desc={t('deliveryPlanWorkspaceIntro')} actions={
        <>
          <Button variant="secondary" asChild><Link href={`/${rid}/settings/delivery/maps`}><Settings2Icon aria-hidden />{t('mapsTitle')}</Link></Button>
          <Button variant="secondary" icon aria-label={t('refresh')} disabled={loading} onClick={() => void load()}><RefreshCwIcon className={loading ? 'animate-spin' : undefined} /></Button>
          {view === 'open' && unplannedOrders.length > 0 && <Button disabled={picked.size === 0} onClick={() => setPlannerOpen(true)}>{t('deliveryPlanStepTwo')}</Button>}
        </>
      } />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <Tabs value={view} onValueChange={(value) => { setView(value as 'open' | 'history'); setSelectedStopId(null); setSelectedCourier(null); }}>
          <TabsList aria-label={t('deliveries')}>
            <Tab value="open">{t('deliveryPlanInProgress')} <span className="num">{dayRoutes.filter(isOpenDeliveryRoute).length}</span></Tab>
            <Tab value="history">{t('deliveryPlanHistory')} <span className="num">{dayRoutes.filter((route) => route.stops.length > 0 && !isOpenDeliveryRoute(route)).length}</span></Tab>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-fs-sm text-[var(--fg-muted)]">
            {t('deliveryPlanDate')}
            <Input type="date" className="w-auto min-h-11" value={departure.slice(0, 10)} onChange={(event) => {
              if (!event.target.value) return;
              initialPlanResolved.current = true;
              setSelectedStopId(null);
              setSelectedCourier(null);
              setDeparture(`${event.target.value}T${departure.slice(11)}`);
            }} />
          </label>
          {routes.length > 0 && <Button className="xl:hidden" variant="secondary" aria-pressed={showMap} onClick={() => setShowMap((current) => !current)}>
            {showMap ? <ListIcon /> : <MapIcon />}{t(showMap ? 'deliveryPlanShowList' : 'deliveryPlanShowMap')}
          </Button>}
        </div>
      </div>

      <div
        className={`grid min-h-0 grid-cols-1 gap-4 xl:min-h-[480px] ${routes.length > 0 ? 'xl:h-[calc(100dvh-300px)]' : ''} ${
          view === 'open' && unplannedOrders.length > 0
            ? routes.length > 0 ? 'xl:grid-cols-[minmax(230px,0.65fr)_minmax(340px,1fr)_minmax(0,1.25fr)]' : 'lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]'
            : routes.length > 0 ? 'xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.5fr)]' : ''
        }`}
      >
        {view === 'open' && unplannedOrders.length > 0 && (
          <section className={`${showMap && routes.length > 0 ? 'hidden xl:flex' : 'flex'} min-h-0 flex-col overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]`}>
            <div className="flex items-start gap-3 border-b border-[var(--line)] px-3 py-3">
              <Checkbox checked={allPicked} onCheckedChange={toggleAll} aria-label={t('selectAll')} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t('deliveryPlanUnplanned').replace('{count}', String(unplannedOrders.length))}</h2>
                <p className="mt-0.5 text-fs-xs text-[var(--fg-subtle)]">
                  {t('deliveryPlanAvailableCount')
                    .replace('{selected}', String(picked.size))
                    .replace('{available}', String(unplannedOrders.length))}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {unplannedOrders.map((order) => {
                const address = formatDeliveryAddress({
                  address: order.delivery_address,
                  city: order.delivery_city,
                  floor: order.delivery_floor,
                  apt: order.delivery_apt,
                  entryCode: order.delivery_entry_code,
                }, t);
                const selected = picked.has(order.id);
                return (
                  <div
                    key={order.id}
                    onClick={() => toggleOrder(order.id)}
                    className={`flex w-full cursor-pointer items-start gap-3 border-b border-[var(--line)] px-3 py-3 text-start transition-colors last:border-b-0 hover:bg-[var(--surface-2)] ${
                      selected ? 'bg-[var(--selection)]' : 'bg-[var(--surface)]'
                    }`}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleOrder(order.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${t('customer')} ${order.customer_name}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-fs-sm font-semibold text-[var(--fg)]">{order.customer_name}</span>
                        <span className="shrink-0 text-[10px] font-medium text-[var(--fg-subtle)]">#{order.id}</span>
                      </span>
                      <span className="mt-1 block text-fs-xs leading-snug text-[var(--fg-muted)]">
                        {address?.line1 || t('noAddress')}
                      </span>
                      <Badge className="mt-2" tone={order.status === 'ready_for_delivery' ? 'success' : 'warning'}>
                        {localizeStatus(order.status, t)}
                      </Badge>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-[var(--line)] p-3">
              <Button className="w-full" disabled={picked.size === 0} onClick={() => setPlannerOpen(true)}>
                <SparklesIcon />
                {t('deliveryPlanStepTwo')}
              </Button>
            </div>
          </section>
        )}

        <section className={`${showMap && routes.length > 0 ? 'hidden xl:flex' : 'flex'} min-h-0 flex-col overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]`}>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t(view === 'history' ? 'deliveryPlanHistory' : 'deliveryPlanRoutes')}</h2>
              <p className="text-fs-xs text-[var(--fg-subtle)]">
                {routeCountLabel}
              </p>
            </div>
            {routes.length > 0 && <Badge tone="neutral">{routes.length}</Badge>}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {routes.length === 0 ? (
              <EmptyState icon={view === 'history' ? <CheckIcon /> : <RouteIcon />} title={t(loading ? 'loading' : view === 'history' ? 'deliveryPlanNoHistory' : 'deliveryPlanNoActiveRoutes')} desc={loading ? undefined : t(view === 'history' ? 'deliveryPlanHistoryHint' : 'deliveryPlanActiveHint')} />
            ) : routes.map((route, index) => (
              <RouteRibbon
                key={route.id}
                route={route}
                routeNumber={index + 1}
                courier={courierById.get(route.courier_id)}
                color={routeColorMap.get(route.id) ?? colorFor(0)}
                locale={locale}
                selectedStopId={selectedStopId}
                busy={loading || routeBusy === route.id}
                history={view === 'history'}
                onSelectCourier={() => { setSelectedRoute(current => current === route.id ? null : route.id); setSelectedCourier(null); }}
                onSelectStop={(stopId) => {
                  setSelectedStopId(stopId);
                  setSelectedRoute(route.id);
                  setSelectedCourier(route.courier_id);
                  setMoveTarget(null);
                }}
                onOptimize={() => void recalculateRoute(route.id)}
                onSaveSettings={(input) => saveRouteSettings(route.id, input)}
                onCancel={() => setUndoAction({ kind: 'route', routeId: route.id, stopCount: route.stops.filter(isPendingDeliveryStop).length })}
                t={t}
              />
            ))}
          </div>
        </section>

        {routes.length > 0 && <div className="relative min-h-0">
          <div className={`${showMap ? 'block' : 'hidden'} xl:block h-[420px] xl:h-full`}>
          <DeliveryMap
            restaurantId={rid}
            routes={layers}
            couriers={courierMarkers}
            highlightCourierId={selectedCourier}
            highlightRouteId={selectedRoute}
            onRouteSelect={id => { setSelectedRoute(id); setSelectedCourier(null); setSelectedStopId(null); }}
            onStopClick={(stop) => {
              setSelectedStopId(stop.id);
              const route = routes.find((candidate) => candidate.stops.some((candidateStop) => candidateStop.id === stop.id));
              setSelectedRoute(route?.id ?? null);
              setSelectedCourier(route?.courier_id ?? null);
              setMoveTarget(null);
            }}
            className="h-full overflow-hidden rounded-r-lg border border-[var(--line)]"
          />
          </div>

          {selectedEntry && editingOrder === null && (
            <div className="relative mt-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 xl:absolute xl:bottom-4 xl:left-4 xl:right-4 xl:z-[500] xl:mt-0 xl:max-w-md xl:shadow-3">
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
                      <p className="text-fs-xs font-semibold text-[var(--fg-subtle)]">{t('deliveryNotes')}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-fs-xs text-[var(--fg)]">{selectedEntry.stop.delivery_notes.trim()}</p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedStopId(null)} className="text-[var(--fg-subtle)] hover:text-[var(--fg)]" aria-label={t('close')}>✕</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {view === 'open' && <Button variant="secondary" disabled={addressEditorLoading} onClick={() => void openAddressEditor()}>
                  <PencilIcon />
                  {t('correctAddress')}
                </Button>}
                {view === 'open' && selectedEntry.stop.customer_phone && (
                  <Button asChild variant="primary">
                    <a href={whatsappUrl(selectedEntry.stop.customer_phone, selectedMessage)} target="_blank" rel="noopener noreferrer">
                      <MessageCircleIcon />
                      {t('deliveryPlanWhatsApp')}
                    </a>
                  </Button>
                )}
                {view === 'open' && movableRoutes.length > 0 && selectedEntry.route.status === 'draft' && selectedEntry.stop.status === 'pending' && (
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
                {view === 'open' && selectedEntry.route.status === 'draft' && selectedEntry.stop.status === 'pending' && (
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
        </div>}
      </div>

      <Drawer
        open={plannerOpen}
        onOpenChange={setPlannerOpen}
        title={t('deliveryPlanStepTwo')}
        subtitle={t('deliveryPlanAvailableCount')
          .replace('{selected}', String(picked.size))
          .replace('{available}', String(unplannedOrders.length))}
        width={760}
        footer={(
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="delivery-departure">
              <span className="mb-2 block text-fs-xs font-semibold text-[var(--fg-muted)]">{t('deliveryPlanDeparture')}</span>
              <Input id="delivery-departure" type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} />
            </label>
            <StopServiceField value={serviceMinutes} onChange={setServiceMinutes} disabled={planning} t={t} />
            <Button size="lg" className="w-full sm:col-span-2" disabled={planning || !canCreatePlan} onClick={() => void createPlan()}>
              <RouteIcon />
              {planning ? t('deliveryPlanGenerating') : t('deliveryPlanGenerate').replace('{count}', String(picked.size))}
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-fs-sm text-[var(--fg-muted)]">{t('deliveryPlanStepTwoHint')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('deliveryPlanDistributionMode')}>
              {([
                ['smart', SparklesIcon, 'deliveryPlanModeSmart', 'deliveryPlanModeSmartHint'],
                ['zone', MapPinIcon, 'deliveryPlanModeZone', 'deliveryPlanModeZoneHint'],
                ['manual', UsersIcon, 'deliveryPlanModeManual', 'deliveryPlanModeManualHint'],
              ] as const).map(([mode, Icon, labelKey, hintKey]) => {
                const active = distributionMode === mode;
                return (
                  <ChoiceRow type="radio" name="delivery-distribution" key={mode} checked={active}
                    onChange={() => setDistributionMode(mode)} description={t(hintKey)}
                    label={<span className="flex items-center gap-3"><Icon className="h-5 w-5 shrink-0" aria-hidden /><span>{t(labelKey)}</span></span>} />
                );
              })}
            </div>
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
                <label key={zone} className="grid grid-cols-1 items-center gap-3 rounded-r-md border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]">
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
            <div className="space-y-2">
              {selectedOrders.map((order) => (
                <label key={order.id} className="grid grid-cols-1 items-center gap-3 rounded-r-md border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]">
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
        </div>
      </Drawer>

      <EditCustomerDialog
        open={editingOrder !== null}
        onOpenChange={(open) => { if (!open) setEditingOrder(null); }}
        order={editingOrder}
        onConfirm={saveVerifiedAddress}
      />

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
