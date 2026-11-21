'use client';

import board from './DispatchWorkspace.module.css';
import { DeliveryWhatsAppDrawer } from '@/components/delivery/DeliveryWhatsAppDrawer';
import { DeliveryDuration } from '@/components/delivery/DeliveryDuration';
import { CourierLocationStatus } from '@/components/delivery/CourierLocationStatus';
import { CustomerWindowField, parseCustomerWindowMinutes } from '@/components/delivery/CustomerWindowField';
import { InsertDeliveryDrawer } from '@/components/delivery/InsertDeliveryDrawer';
import { deliveryCityKey, matchesDeliverySearch } from '@/lib/route-address';
import { RouteAddressField } from '@/components/delivery/RouteAddressField';
import { StopServiceField, validStopServiceMinutes } from '@/components/delivery/StopServiceField';
import { OrderWindowField } from '@/components/delivery/OrderWindowField';

import { ChoiceRow } from '@/components/ds/Selection';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { RestaurantTimezone } from '@/lib/restaurant-timezone-context';
import Link from 'next/link';
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  BellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  MapPinIcon,
  MessageCircleIcon,
  PencilIcon,
  ListPlusIcon,
  RefreshCwIcon,
  RouteIcon,
  Settings2Icon,
  CalendarDaysIcon,
  SparklesIcon,
  Undo2Icon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import {
  buildDeliveryEtaLabel,
  deliveryEtaWindow,
  deliveryMatchesRouteDate,
  deliveryWallTime,
  deliveryDepartureInstant,
  validDispatchDay,
  isOpenDeliveryRoute,
  isPendingDeliveryStop,
  deliveryRouteWarning,
  deliveryLocationWarning,
} from '@/lib/delivery-planning';
import { useWs } from '@/lib/ws-context';
import {
  cancelDeliveryRoute,
  deliveryIssueLabels,
  remindRouteCourier,
  listDeliveryRoutes,
  listOpenDeliveryRoutes,
  optimizeRoute,
  planDeliveryRoutes,
  resetRouteDeparture,
  transferRouteStop,
  unassignRouteStop,
  updateRouteSettings,
  type DeliveryRoute,
  type CourierLocationDTO,
  type RouteSettingsInput,
  type RouteStop,
} from '@/lib/delivery';
import { RouteSettingsEditor } from '@/components/delivery/RouteSettingsEditor';
import {
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
import { orderDetailPath } from '@/lib/orders/routes';
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
import { Badge, Button, Card, CardBody, Drawer, EmptyState, Input, Select, Tab, Tabs, TabsList } from '@/components/ds';
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

function defaultDepartureValue(timeZone: string, chosenDay?: string): string {
  const now = Date.now();
  const today = deliveryWallTime(new Date(now), timeZone).slice(0, 10);
  const next = deliveryWallTime(new Date(Math.ceil((now + 30 * 60_000) / 900_000) * 900_000), timeZone);
  const time = next.slice(0, 10) === today ? next.slice(11) : '23:59';
  return `${chosenDay ?? today}T${time}`;
}

function routePlanningDate(route: DeliveryRoute): string {
  return route.date.slice(0, 10);
}

function needsAddressReview(route: DeliveryRoute, stop: RouteStop): boolean {
  return isPendingDeliveryStop(stop) && stop.needs_geocode && !route.routing_error && !route.calculation_pending;
}

function routeStatusTone(status: DeliveryRoute['status']): 'neutral' | 'success' | 'info' | 'warning' {
  switch (status) {
    case 'active': return 'info';
    case 'completed': return 'success';
    case 'cancelled': return 'warning';
    default: return 'neutral';
  }
}


type RouteTableProps = {
  route: DeliveryRoute;
  number: number;
  courier: string;
  locale: string;
  shownStops: RouteStop[];
  selectedStopId: number | null;
  onSelectStop: (stopId: number) => void;
  t: Translator;
};

function RouteTable({ route, number, courier, locale, shownStops, selectedStopId, onSelectStop, t }: RouteTableProps) {
  return <table className={board.table}>
    <caption className="sr-only">{t('mapsRoute')} {number} · {courier}</caption>
    <thead><tr>
      <th scope="col">{t('dispatchStop')}</th><th scope="col">{t('address')}</th>
      <th scope="col">{t('dispatchWindow')}</th><th scope="col">{t('dispatchOrder')}</th>
    </tr></thead>
            <tbody>{shownStops.map(stop => {
              const window = isPendingDeliveryStop(stop) ? deliveryEtaWindow(route, stop, locale) : null;
              const city = stop.city?.trim() || '';
              const street = (stop.address || '').split(',').filter(part => !city || deliveryCityKey(part) !== deliveryCityKey(city)).join(',').trim();
              const selected = stop.id === selectedStopId;
              return <tr key={stop.id} data-stop-id={stop.id} data-selected={selected} onClick={() => onSelectStop(stop.id)}
                className={board.row}>
                <td className={board.sequence}><bdi>{stop.sequence}</bdi></td>
                <td><button type="button" onClick={event => { event.stopPropagation(); onSelectStop(stop.id); }}
                  className={board.address} aria-pressed={selected} title={stop.customer_name}>
                  <bdi>{street || city || t('noAddress')}</bdi>
                  {street && city && <bdi className={board.city}>{city}</bdi>}
                </button></td>
                <td>
                  {stop.navigation_started_at && isPendingDeliveryStop(stop) && <Badge tone="warning">{t('courierResultPending')}</Badge>}
                  {!isPendingDeliveryStop(stop) ? <Badge tone={stop.status === 'delivered' ? 'success' : 'neutral'}>{t(stop.issue_reason ? deliveryIssueLabels[stop.issue_reason] : stop.status === 'delivered' ? 'stopStatusDelivered' : 'skipped')}</Badge>
                    : window ? <bdi dir="ltr" className="num font-medium">{window.label}</bdi>
                    : <span className={needsAddressReview(route, stop) ? 'font-semibold text-[var(--warning-500)]' : 'text-[var(--fg-muted)]'}>
                      {route.calculation_pending ? t('deliveryCalculationPending') : stop.needs_geocode ? t(route.routing_error ? 'deliveryLocationPending' : 'dispatchEntrance') : '—'}
                    </span>}
                  {stop.estimated_position && <span className="block text-[var(--fg-muted)]">{t('deliveryEstimatedEntrance')}</span>}
                </td>
                <td className={board.order}><bdi dir="ltr" className="num">#{stop.order_id}</bdi></td>
              </tr>;
            })}</tbody>
  </table>;
}

function RouteHeading({ route, number, courier, locale, history, onSelect, t }: {
  route: DeliveryRoute; number: number; courier: string; locale: string; history: boolean;
  onSelect: () => void; t: Translator;
}) {
  const count = route.stops.filter(stop => isPendingDeliveryStop(stop) && deliveryEtaWindow(route, stop, locale) != null).length;
  const status = history && route.status !== 'cancelled' ? 'completed' : route.status;
  return <div className={board.routeHeading}>
    <button type="button" onClick={onSelect} aria-label={`${courier} ${t('mapsRoute')} ${number}`} className={board.driver}>
      <span aria-hidden className={board.avatar}>{Array.from(courier.trim())[0] || <UserIcon size={18}/>}</span>
      <span>
        <span className={board.routeTitle}>{t('dispatchRouteFor').replace('{courier}', courier)}</span>
        <span className={board.routeSummary}>{t('dispatchStopCount').replace('{count}', String(route.stops.length))}
          {!history && <> · {t('dispatchWindowCount').replace('{count}', String(count))}</>}
        </span>
      </span>
    </button>
    <Badge tone={routeStatusTone(status)}>{t(status === 'draft' ? 'courierDeparturePending' : status === 'completed' ? 'routeStatusCompleted' : status === 'cancelled' ? 'cancelled' : 'routeStatusActive')}</Badge>
  </div>;
}

interface RouteToolsProps {
  route: DeliveryRoute;
  title: string;
  locale: string;
  location?: CourierLocationDTO;
  busy: boolean;
  history: boolean;
  onOptimize: () => void;
  onSaveSettings: (input: RouteSettingsInput) => Promise<void>;
  onCancel: () => void;
  onResetDeparture: () => void;
  onRemind: () => void;
  reminder?: { state: 'sending' | 'sent' | 'none' | 'error' };
  t: Translator;
}

function RouteTools({ route, title, locale, location, busy, history, onOptimize, onSaveSettings, onCancel, onResetDeparture, onRemind, reminder, t }: RouteToolsProps) {
  const delivered = route.stops.filter((stop) => stop.status === 'delivered').length;
  const pending = route.stops.filter(isPendingDeliveryStop);
  const unresolved = pending.filter(stop => needsAddressReview(route, stop)).length;
  const reviewableIssue = (stop: RouteStop) => stop.status === 'skipped' && Boolean(route.started_at && stop.issue_reason && stop.issue_review_at);
  const canResetDeparture = route.stops.length > 0 && (
    route.status === 'active' && route.stops.every(stop => (stop.status === 'pending' && !stop.issue_reason) || reviewableIssue(stop)) ||
    route.status === 'completed' && route.stops.every(reviewableIssue)
  );
  return (
        <section aria-label={t('deliveryDispatchRouteActions')} className={board.routeTools}>
        {!history && route.status === 'active' && <CourierLocationStatus location={location && (location.route_id == null || location.route_id === route.id) ? location : null} />}
        {route.routing_provider === 'approximate' && <p className="px-4 pb-2 text-fs-xs text-[var(--fg-muted)]">{t('deliveryRouteApproximate')}</p>}
        {(route.needs_recalculation || unresolved > 0 || route.routing_error || route.calculation_pending) && <p role="status" className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-2 text-fs-xs text-[var(--fg-muted)]"><AlertCircleIcon className="size-4 shrink-0" />{deliveryRouteWarning(route, t)}</p>}
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-fs-xs text-[var(--fg-muted)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)]">{title}</h3>
          <span>{t('deliveryPlanProgress').replace('{done}', String(delivered)).replace('{total}', String(route.stops.length))}</span>
          <span>{t('deliveryPlanDistance')} <bdi dir="ltr">{route.needs_recalculation ? '—' : formatDistance(route.total_distance_m) || '—'}</bdi></span>
          <DeliveryDuration route={route} t={t} />
        </div>
        {canResetDeparture && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onResetDeparture} className="mb-3">
          <Undo2Icon />{t('deliveryPlanResetDeparture')}
        </Button>}
        <details className="mb-2 rounded-r-md border border-[var(--line)] px-3">
          <summary className="cursor-pointer py-2.5 text-fs-sm font-medium"><Settings2Icon aria-hidden className="me-2 inline size-4" />{t('dispatchRouteSettings')}</summary>
          <RouteSettingsEditor
            route={route}
            locale={locale}
            disabled={busy || route.status !== 'draft'}
            onSave={onSaveSettings}
            t={t}
          />
        </details>

        {!history && (route.status === 'draft' || (route.status === 'active' && route.needs_recalculation)) && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 border-b border-[var(--line)] pb-2">
            {(route.status === 'draft' || route.needs_recalculation) && <Button
              type="button"
              variant="secondary"
              disabled={busy || route.stops.length === 0}
              onClick={onOptimize}
              title={t('deliveryPlanRecalculate')}
            >
              <RefreshCwIcon className={busy ? 'animate-spin' : undefined} />
              {t('deliveryPlanRecalculate')}
            </Button>}
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

        {!history && pending.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRemind} disabled={busy || reminder?.state === 'sending'}>
              <BellIcon />{t('courierSendReminder')}
            </Button>
            {reminder && reminder.state !== 'sending' && (
              <span role="status" className="text-fs-xs text-[var(--fg-muted)]">
                {t(reminder.state === 'sent' ? 'courierReminderSent' : reminder.state === 'none' ? 'courierReminderNotAccepted' : 'courierReminderFailed')}
              </span>
            )}
          </div>
        )}
        </section>
  );
}

/** Restaurant-scoped delivery planning and completed-route history. */
export default function DispatcherView({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { lastEvent } = useWs();
  const prevEvent = useRef(lastEvent);
  const timeZone = useContext(RestaurantTimezone);
  const searchParams = useSearchParams();
  const linkedDay = validDispatchDay(searchParams?.get('date') ?? null);
  const loadRequestId = useRef(0);
  const editorRequest = useRef(0);
  const [loadFailures, setLoadFailures] = useState<string[]>([]);
  const [dayRoutes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [messageTarget, setMessageTarget] = useState<{ orderId?: number } | null>(null);
  const [view, setView] = useState<'open' | 'history'>('open');
  const [showMap, setShowMap] = useState(false);
  useEffect(() => { setShowMap(window.matchMedia('(min-width: 1024px)').matches); }, []);
  const [workFilter, setWorkFilter] = useState<'route' | 'queue' | 'address' | null>(null);
  const [queueQuery, setQueueQuery] = useState('');
  const [routeQuery, setRouteQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openRoutes, setOpenRoutes] = useState<DeliveryRoute[]>([]);
  const [livePositions, setLivePositions] = useState<Map<number, CourierLocationDTO>>(new Map());
  const [ready, setReady] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const pickedScope = useRef('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('smart');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerCouriers, setPlannerCouriers] = useState<Set<number>>(new Set());
  const [zoneCouriers, setZoneCouriers] = useState<Map<string, number>>(new Map());
  const [manualCouriers, setManualCouriers] = useState<Map<number, number>>(new Map());
  const [customerWindow, setCustomerWindow] = useState('1:30');
  const [respectOrderWindows, setRespectOrderWindows] = useState(false);
  const [resolvingEndpoints, setResolvingEndpoints] = useState<Set<string>>(new Set());
  const [courierEndpoints, setCourierEndpoints] = useState<Record<number, { start_address: string; end_address: string }>>({});
  const [departure, setDeparture] = useState(() => defaultDepartureValue(timeZone, linkedDay));
  useEffect(() => {
    const day = linkedDay ?? deliveryWallTime(new Date(), timeZone).slice(0, 10);
    setDeparture(current => current.slice(0, 10) === day ? current : defaultDepartureValue(timeZone, day));
  }, [linkedDay, timeZone]);
  const planningDate = departure.slice(0, 10);
  useEffect(() => { setCourierEndpoints({}); }, [rid, planningDate]);
  const [serviceMinutes, setServiceMinutes] = useState('3');
  const [planning, setPlanning] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<number | null>();
  const [pointCount, setPointCount] = useState(0);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [routeBusy, setRouteBusy] = useState<number | null>(null);
  const [reminders, setReminders] = useState<Record<number, RouteToolsProps['reminder']>>({});
  const remindersInFlight = useRef(new Set<number>());
  const [editingOrder, setEditingOrder] = useState<{ order: Order; routeId?: number } | null>(null);
  const [insertingOrder, setInsertingOrder] = useState<Order | null>(null);
  const [inserted, setInserted] = useState('');
  useEffect(() => { ++editorRequest.current; setAddressEditorLoading(false); setEditingOrder(null); setInsertingOrder(null); setInserted(''); setMessageTarget(null); return () => { ++editorRequest.current; ++loadRequestId.current; }; }, [rid, planningDate]);
  const [addressEditorLoading, setAddressEditorLoading] = useState(false);
  const [undoAction, setUndoAction] = useState<
    | { kind: 'route'; routeId: number; stopCount: number }
    | { kind: 'departure'; routeId: number; stopCount: number; startedAt: DeliveryRoute['started_at']; reports: RouteStop[] }
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
      const [dayResult, openResult, candidateResult, courierResult] = await Promise.allSettled([
        listDeliveryRoutes(rid, departure.slice(0, 10)),
        listOpenDeliveryRoutes(rid),
        // Acceptance is the manager's operational gate: once a delivery has
        // entered preparation it must be plannable even when payment will be
        // collected later. The courier self-pick pool remains paid-only.
        listOrders(rid, { type: 'delivery', status: 'accepted,in_kitchen,ready_for_delivery' }),
        listCouriers(rid),
      ]);
      if (requestId !== loadRequestId.current) return;

      const sections = ['mapsRoute', 'deliveryPlanRoutes', 'orders', 'deliveryPlanCouriers'];
      const failures = [dayResult, openResult, candidateResult, courierResult].flatMap((result, i) => result.status === 'rejected' ? [sections[i]] : []);
      setLoadFailures(failures);
      const routeRows = dayResult.status === 'fulfilled' ? dayResult.value : [];
      const openRouteRows = openResult.status === 'fulfilled' ? openResult.value : [];
      const candidateRows = candidateResult.status === 'fulfilled' && dayResult.status === 'fulfilled' && openResult.status === 'fulfilled' ? candidateResult.value : { orders: [] };
      const courierRows = courierResult.status === 'fulfilled' ? courierResult.value : [];
      // Empty drafts are courier self-pick placeholders, not dispatcher plans.
      // Keeping them visible can hide a real plan on another date.
      const managerRouteRows = routeRows.filter((route) => route.status !== 'draft' || route.stops.length > 0);
      const managerOpenRouteRows = openRouteRows.filter(isOpenDeliveryRoute);
      const routedOrderIds = new Set([
        ...managerRouteRows.flatMap((route) => route.stops.filter((stop) => !stop.issue_reason).map((stop) => stop.order_id)),
        ...managerOpenRouteRows.flatMap((route) => route.stops.filter((stop) => !stop.issue_reason).map((stop) => stop.order_id)),
      ]);
      const available = candidateRows.orders.filter((order) => !routedOrderIds.has(order.id));
      const visibleRoutes = managerRouteRows;
      setRoutes(visibleRoutes);
      setOpenRoutes(managerOpenRouteRows);
      setReady(candidateRows.orders);
      setCouriers(courierRows);
      const visibleDate = visibleRoutes[0]?.date ?? departure.slice(0, 10);
      const scope = [rid, visibleDate.slice(0, 10)].join(':');
      const firstLoadForDay = pickedScope.current !== scope;
      if (dayResult.status === 'fulfilled' && openResult.status === 'fulfilled' && candidateResult.status === 'fulfilled') pickedScope.current = scope;
      const availableIds = new Set(available.filter(order => deliveryMatchesRouteDate(order, visibleDate)).map(order => order.id));
      setPicked(current => firstLoadForDay ? availableIds : new Set(Array.from(current).filter(id => availableIds.has(id))));
      setPlannerCouriers((current) => {
        const activeCourierIds = new Set(
          visibleRoutes.filter((route) => route.status === 'active').map((route) => route.courier_id),
        );
        const selectableCouriers = courierRows.filter((courier) => !activeCourierIds.has(courier.id));
        const valid = new Set(Array.from(current).filter((id) => selectableCouriers.some((courier) => courier.id === id)));
        if (valid.size > 0) return valid;
        return new Set(selectableCouriers.slice(0, Math.min(2, selectableCouriers.length)).map((courier) => courier.id));
      });
      const seed = new Map<number, CourierLocationDTO>();
      visibleRoutes.forEach((route) => {
        if (!route.last_location) return;
        seed.set(route.courier_id, route.last_location);
      });
      setLivePositions(current => {
        for (const route of visibleRoutes) {
          const latest = current.get(route.courier_id);
          const saved = seed.get(route.courier_id);
          if (latest && latest.route_id === route.id && (!saved || Date.parse(latest.updated_at) > Date.parse(saved.updated_at))) seed.set(route.courier_id, latest);
        }
        return seed;
      });
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
      const position = lastEvent.payload as unknown as CourierLocationDTO;
      setLivePositions((current) => {
        const next = new Map(current);
        const previous = current.get(position.courier_id);
        if (previous && Date.parse(previous.updated_at) > Date.parse(position.updated_at)) return current;
        next.set(position.courier_id, position);
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
    routes.forEach((route, index) => {
      const color = COURIER_COLORS[index] ?? `hsl(${(route.id * 137.508) % 360} 64% 36%)`;
      colors.set(route.id, color);
    });
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
      if (route.status !== 'active' || !position || (position.route_id != null && position.route_id !== route.id)) return;
      markers.push({
        courierId: route.courier_id,
        color: routeColorMap.get(route.id) ?? colorFor(0),
        lat: position.lat,
        lng: position.lng,
        stale: nowTick - Date.parse(position.updated_at) > 60_000,
      });
    });
    return markers;
  }, [routes, livePositions, nowTick, routeColorMap]);



  const openRouteByOrderId = useMemo(() => {
    const map = new Map<number, DeliveryRoute>();
    openRoutes.forEach((route) => {
      route.stops.filter(isPendingDeliveryStop).forEach((stop) => map.set(stop.order_id, route));
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
    () => {
      const zones = new Map<string, { key: string; label: string; count: number }>();
      for (const order of selectedOrders) {
        const key = deliveryCityKey(order.delivery_city ?? '');
        const zone = zones.get(key);
        if (zone) zone.count++;
        else zones.set(key, { key, label: deliveryZone(order, t('deliveryPlanUnknownZone')), count: 1 });
      }
      return Array.from(zones.values());
    },
    [selectedOrders, t],
  );

  useEffect(() => {
    setZoneCouriers((current) => {
      const next = new Map<string, number>();
      selectedZones.forEach(({ key: zone }, index) => {
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
    // Undefined opens a useful initial desktop detail. Null records an explicit dismissal.
    if (selectedStopId === undefined && showMap && view === 'open' && workFilter !== 'queue' && !routeQuery && window.matchMedia('(min-width: 1024px)').matches) {
      const entries = routes.flatMap(route => route.stops.filter(isPendingDeliveryStop).map(stop => ({ route, stop })));
      return entries.find(({ route, stop }) => needsAddressReview(route, stop)) ?? (workFilter === 'address' ? null : entries[0] ?? null);
    }
    for (const route of routes) {
      const stop = route.stops.find((candidate) => candidate.id === selectedStopId);
      if (stop) return { route, stop };
    }
    return null;
  }, [routes, selectedStopId, showMap, view, workFilter, routeQuery]);

  const sendCourierReminder = async (routeId: number) => {
    if (remindersInFlight.current.has(routeId)) return;
    remindersInFlight.current.add(routeId);
    setReminders((current) => ({ ...current, [routeId]: { state: 'sending' } }));
    try {
      const { accepted } = await remindRouteCourier(rid, routeId);
      setReminders((current) => ({ ...current, [routeId]: { state: accepted > 0 ? 'sent' : 'none' } }));
    } catch {
      setReminders((current) => ({ ...current, [routeId]: { state: 'error' } }));
    } finally {
      remindersInFlight.current.delete(routeId);
    }
  };

  const reportedIssues = dayRoutes.flatMap((route) =>
    route.stops.flatMap((stop) => stop.issue_reason ? [{ route, stop, reason: stop.issue_reason }] : []),
  );
  const visibleOrders = unplannedOrders.filter(order => matchesDeliverySearch(queueQuery, order.id, order.customer_name, order.delivery_address, order.delivery_city));
  const allPicked = visibleOrders.length > 0 && visibleOrders.every(order => picked.has(order.id));
  const toggleOrder = (id: number) => setPicked((current) => {
    if (openRouteByOrderId.has(id)) return current;
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(current => {
    const next = new Set(current);
    for (const order of visibleOrders) {
      if (allPicked) next.delete(order.id);
      else next.add(order.id);
    }
    return next;
  });
  const toggleCourier = (id: number) => setPlannerCouriers((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const createPlan = async () => {
    if (resolvingEndpoints.size > 0 || picked.size === 0 || !departure || !validStopServiceMinutes(serviceMinutes) || parseCustomerWindowMinutes(customerWindow) == null) return;
    if (selectedOrders.length !== picked.size) {
      setError(t('deliveryRouteDateMismatch'));
      return;
    }
    let assignments: Array<{ courier_id: number; order_ids: number[] }> | undefined;
    let selectedCourierIds = Array.from(plannerCouriers);

    if (distributionMode === 'zone') {
      if (selectedZones.some(({ key }) => !zoneCouriers.get(key))) {
        setError(t('deliveryPlanMissingAssignments'));
        return;
      }
      const grouped = new Map<number, number[]>();
      selectedOrders.forEach((order) => {
        const courierId = zoneCouriers.get(deliveryCityKey(order.delivery_city ?? ''));
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
    const plannedInstant = deliveryDepartureInstant(departure, timeZone);
    if (!plannedInstant) { setError(t('deliveryDepartureTimeInvalid')); return; }
    setPlanning(true);
    try {
      await planDeliveryRoutes(
        rid,
        selectedCourierIds,
        Array.from(picked),
        plannedInstant.toISOString(),
        assignments,
        Number(serviceMinutes),
        parseCustomerWindowMinutes(customerWindow)!,
        selectedCourierIds.filter(id => courierEndpoints[id]).map(courier_id => ({ courier_id, ...courierEndpoints[courier_id] })),
        respectOrderWindows,
      );
      setPicked(new Set());
      setCourierEndpoints({});
      setRespectOrderWindows(false);
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

  const openAddressEditor = async (orderId: number, routeId?: number) => {
    const request = ++editorRequest.current;
    setAddressEditorLoading(true);
    try {
      setError(null);
      const order = await getOrder(rid, orderId);
      if (request === editorRequest.current) setEditingOrder({ order, routeId });
    } catch (cause) {
      if (request === editorRequest.current) setError((cause as Error)?.message || t('couldNotLoad'));
    } finally {
      if (request === editorRequest.current) setAddressEditorLoading(false);
    }
  };

  const saveAddressCorrection = async (input: OrderCustomerDetailsInput) => {
    if (!editingOrder) throw new Error(t('couldNotSave'));
    const { order, routeId } = editingOrder;
    const stop = routes.find(route => route.id === routeId)?.stops.find(item => item.order_id === order.id);
    await updateOrderCustomerDetails(rid, order.id, {
      ...input, expected_updated_at: order.updated_at,
      ...(stop?.needs_geocode ? { retry_delivery_position: true } : {}),
    });
    await load();
  };

  const confirmUndo = async () => {
    if (!undoAction) return;
    const routeId = undoAction.routeId;
    setRouteBusy(routeId);
    try {
      if (undoAction.kind === 'route') {
        await cancelDeliveryRoute(rid, routeId);
      } else if (undoAction.kind === 'departure') {
        await resetRouteDeparture(rid, routeId, undoAction.startedAt, undoAction.reports);
        setView('open');
        setInserted(t('deliveryDepartureRestored'));
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
      setError(t(undoAction.kind !== 'departure' ? 'deliveryPlanUndoFailed' : undoAction.reports.length ? 'deliveryDepartureReviewedConflict' : 'deliveryPlanResetDepartureFailed'));
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
  const selectedAddress = selectedEntry ? formatDeliveryAddress({
    address: selectedEntry.stop.address,
    city: selectedEntry.stop.city,
    floor: selectedEntry.stop.delivery_floor,
    apt: selectedEntry.stop.delivery_apt,
    entryCode: selectedEntry.stop.delivery_entry_code,
  }, t) : null;
  const filter = view === 'history' ? 'route' : workFilter ?? (!routes.length && unplannedOrders.length ? 'queue' : 'route');
  const dayOpenRoutes = dayRoutes.filter(isOpenDeliveryRoute);
  const assignedCount = dayOpenRoutes.reduce((count, route) => count + route.stops.filter(isPendingDeliveryStop).length, 0);
  const addressCount = dayOpenRoutes.reduce((count, route) => count + route.stops.filter(stop => needsAddressReview(route, stop)).length, 0);
  const selectFilter = (next: typeof workFilter) => {
    setWorkFilter(next);
    setSelectedStopId(undefined);
    setSelectedRoute(null);
    setSelectedCourier(null);
    setMoveTarget(null);
  };
  const visibleRoutes = routes.flatMap((route, index) => {
    const number = index + 1;
    const match = matchesDeliverySearch(routeQuery, courierById.get(route.courier_id)?.full_name, `${t('mapsRoute')} ${number}`);
    const stops = view === 'history' ? route.stops : route.stops.filter(isPendingDeliveryStop);
    const shownStops = stops.filter(stop => (filter !== 'address' || needsAddressReview(route, stop)) &&
      (match || matchesDeliverySearch(routeQuery, stop.order_id, stop.customer_name, stop.address, stop.city)))
      .sort((a, b) => a.sequence - b.sequence);
    return shownStops.length ? [{ route, number, shownStops, filtered: shownStops.length !== stops.length }] : [];
  });
  const mapLayers = filter === 'queue' ? [] : visibleRoutes.flatMap(({ route, shownStops, filtered }) => {
    const layer = layers.find(item => item.routeId === route.id);
    return layer ? [{ ...layer, stops: shownStops, ...(filtered ? { pinsOnly: true, geometry: undefined, start: undefined, end: undefined } : {}) }] : [];
  });
  const changeDay = (day: string) => {
    if (!day || day === planningDate) return;
    const url = new URL(window.location.href);
    url.searchParams.set('date', day);
    window.history.replaceState(null, '', url);
    ++loadRequestId.current;
    ++editorRequest.current;
    setEditingOrder(null);
    setLoadFailures([]);
    setLoading(true);
    setRoutes([]);
    setReady([]);
    setPlannerOpen(false);
    setUndoAction(null);
    setPicked(new Set());
    setSelectedStopId(undefined);
    setSelectedCourier(null);
    setSelectedRoute(null);
    setQueueQuery('');
    setWorkFilter(null);
    setRouteQuery('');
    setDeparture(`${day}T${(departure || defaultDepartureValue(timeZone)).slice(11)}`);
  };
  const today = deliveryWallTime(new Date(nowTick), timeZone).slice(0, 10);
  const nextPlannedDay = openRoutes.map(routePlanningDate).filter(day => day > today).sort()[0];
  const stepDay = (offset: number) => {
    const date = new Date((planningDate || defaultDepartureValue(timeZone).slice(0, 10)) + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    changeDay(date.toISOString().slice(0, 10));
  };
  const insertRoutes = routes.flatMap((route, index) => route.status === 'draft' && routePlanningDate(route) === planningDate
    ? [{ route, number: index + 1 }] : []);
  const movableRoutes = selectedEntry
    ? routes.filter((route) => route.id !== selectedEntry.route.id && route.status === 'draft' && route.date.slice(0, 10) === selectedEntry.route.date.slice(0, 10))
    : [];
  const endpointCouriers = planningCouriers.filter(courier => distributionMode === 'smart' ? plannerCouriers.has(courier.id) : distributionMode === 'zone' ? selectedZones.some(({ key }) => zoneCouriers.get(key) === courier.id) : selectedOrders.some(order => manualCouriers.get(order.id) === courier.id));
  const savedCourierEndpoints = (id: number) => {
    const existing = dayRoutes.find(route => route.courier_id === id && route.status === 'draft' && route.date.slice(0, 10) === departure.slice(0, 10));
    const courier = couriers.find(member => member.id === id);
    return { start_address: existing?.start_address ?? '', end_address: existing ? existing.end_address ?? '' : courier?.courier_default_end_address ?? (courier?.courier_final_same_as_address ? courier.address : courier?.courier_final_address) ?? '' };
  };
  const setEndpoint = (id: number, field: 'start_address' | 'end_address', value: string) => setCourierEndpoints(current => ({ ...current, [id]: { ...(current[id] ?? savedCourierEndpoints(id)), [field]: value } }));

  const setEndpointResolving = (key: string, resolving: boolean) => setResolvingEndpoints(current => {
    if (current.has(key) === resolving) return current;
    const next = new Set(current);
    if (resolving) next.add(key); else next.delete(key);
    return next;
  });

  const canCreatePlan = resolvingEndpoints.size === 0 && picked.size > 0 && Boolean(departure) && validStopServiceMinutes(serviceMinutes) && parseCustomerWindowMinutes(customerWindow) != null && (
    distributionMode === 'smart'
      ? plannerCouriers.size > 0
      : distributionMode === 'zone'
        ? selectedZones.length > 0 && selectedZones.every(({ key }) => Boolean(zoneCouriers.get(key)))
        : selectedOrders.length > 0 && selectedOrders.every((order) => Boolean(manualCouriers.get(order.id)))
  );
  const addDelivery = () => {
    setWorkFilter('queue');
    setSelectedStopId(null);
    setQueueQuery('');
    if (unplannedOrders.length === 1 && insertRoutes.length) setInsertingOrder(unplannedOrders[0]);
  };
  const queueMap = visibleOrders.flatMap(order => typeof order.delivery_latitude === 'number' && typeof order.delivery_longitude === 'number'
    ? [{ id: order.id, lat: order.delivery_latitude, lng: order.delivery_longitude }] : []);

  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const dayLabel = dayFormatter.format(new Date((planningDate || today) + 'T12:00:00Z'));
  const zoneLabel = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' }).formatToParts(nowTick).find(part => part.type === 'timeZoneName')?.value ?? timeZone;
  const courierName = (route: DeliveryRoute) => courierById.get(route.courier_id)?.full_name || t('courier');
  const routeHeading = (route: DeliveryRoute, number: number) => <RouteHeading route={route} number={number} locale={locale} history={view === 'history'} courier={courierName(route)} t={t}
    onSelect={() => { setSelectedRoute(current => current === route.id ? null : route.id); setSelectedCourier(null); setSelectedStopId(null); }} />;
  const displayedCount = filter === 'queue' ? visibleOrders.length : visibleRoutes.reduce((n, item) => n + item.shownStops.length, 0);
  const mapTitle = filter === 'queue' ? t('dispatchQueue') : visibleRoutes.length === 1 ? t('dispatchMapFor').replace('{courier}', courierName(visibleRoutes[0].route)) : t('mapsAllRoutes');

  return (
    <div className={board.content} aria-busy={loading}>
      {loadFailures.length > 0 && <div role="alert" className="flex items-center justify-between gap-3 p-3"><span>{t('couldNotLoad')} · {loadFailures.map(key => t(key)).join(', ')}</span><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>}
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

      <div className={board.pageHead}>
        <div className="min-w-0">
          <div className={board.dayControls}>
            <label className={board.date}>
              <span>{dayLabel}</span><CalendarDaysIcon size={15} aria-hidden />
              <input type="date" aria-label={t('deliveryPlanDate')} value={planningDate} onChange={event => changeDay(event.target.value)} />
            </label>
            <button type="button" aria-label={t('previousDay')} onClick={() => stepDay(-1)}><ChevronLeftIcon className="rtl:rotate-180" /></button>
            <button type="button" aria-label={t('nextDay')} onClick={() => stepDay(1)}><ChevronRightIcon className="rtl:rotate-180" /></button>
            {planningDate !== today && <button type="button" onClick={() => changeDay(today)}>{t('today')}</button>}
            {nextPlannedDay && planningDate !== nextPlannedDay && <button type="button" onClick={() => changeDay(nextPlannedDay)}>{t('deliveryNextPlannedDay').replace('{date}', dayFormatter.format(new Date(nextPlannedDay + 'T12:00:00Z')))}</button>}
          </div>
          <h1>{t('dispatchWorkspaceTitle')}</h1>
        </div>
        {view === 'open' && <Button className={board.primary} disabled={loading || loadFailures.includes('orders')} onClick={addDelivery}>{t('dispatchAddDelivery')}</Button>}
      </div>
      {reportedIssues.length > 0 && (
        <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4" aria-label={t('courierReportedIssues')}>
          <h2 className="mb-2 text-fs-sm font-semibold">{t('courierReportedIssues')}</h2>
          <ul className="space-y-2">
            {reportedIssues.map(({ route, stop, reason }) => (
              <li key={stop.id} className="flex flex-wrap items-center justify-between gap-2 text-fs-sm">
                <span>
                  <bdi>#{stop.order_id}</bdi> · {t(deliveryIssueLabels[reason])} · {courierById.get(route.courier_id)?.full_name ?? t('courier')}
                </span>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={orderDetailPath(rid, stop.order_id)}>{t('courierReviewOrder')}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inserted && <p role="status" className="flex items-center gap-2 text-fs-sm"><CheckIcon className="h-4 w-4" />{inserted}</p>}
      <div className={board.filtersBar}>
        {view === 'open' && <div role="group" aria-label={t('deliveries')} className={board.filters}>
          {([['route', 'mapsRoute', assignedCount], ['queue', 'dispatchQueue', unplannedOrders.length], ['address', 'dispatchAddresses', addressCount]] as const)
            .map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} data-issue={value === 'address' && count > 0} onClick={() => selectFilter(value)}>
              {value === 'address' && count > 0 && <AlertCircleIcon size={17} aria-hidden/>}
              {t(label)} <span className="num">{loading || loadFailures.includes('mapsRoute') || (value === 'queue' && (loadFailures.includes('orders') || loadFailures.includes('deliveryPlanRoutes'))) ? '—' : count}</span>
            </button>)}
        </div>}
        <div className={board.utilities}>
          <Tabs value={view} onValueChange={value => { setView(value as 'open' | 'history'); selectFilter(null); setRouteQuery(''); }}>
            <TabsList aria-label={t('deliveries')}><Tab value="open">{t('deliveryPlanInProgress')}</Tab><Tab value="history">{t('deliveryPlanHistory')}</Tab></TabsList>
          </Tabs>
          {view === 'open' && dayOpenRoutes.length > 0 && <Button variant="ghost" icon aria-label={t('deliveryWhatsAppTitle')} title={t('deliveryWhatsAppTitle')} disabled={loading} onClick={() => setMessageTarget({})}><MessageCircleIcon /></Button>}
          <Button variant="ghost" icon aria-label={t('refresh')} title={t('refresh')} disabled={loading} onClick={() => void load()}><RefreshCwIcon className={loading ? 'animate-spin' : undefined} /></Button>
        </div>
      </div>
      <div className={board.grid} data-map={showMap}>
        <section className={board.panel} aria-label={t(filter === 'queue' ? 'dispatchQueue' : view === 'history' ? 'deliveryPlanHistory' : 'deliveryPlanRoutes')}>
          {filter === 'queue' ? <div className={board.queueHead}>
            <Checkbox checked={allPicked || (visibleOrders.some(order => picked.has(order.id)) ? 'indeterminate' : false)} disabled={!visibleOrders.length} onCheckedChange={toggleAll} aria-label={t('selectAll')} />
            <div><h2>{t('deliveryPlanUnplanned').replace('{count}', String(unplannedOrders.length))}</h2>
              <span className={board.routeSummary}>{t('deliveryPlanAvailableCount').replace('{selected}', String(picked.size)).replace('{available}', String(unplannedOrders.length))}</span></div>
          </div> : routes.length === 1 ? routeHeading(routes[0], 1) : <h2 className={board.groupHeading}>{t(view === 'history' ? 'deliveryPlanHistory' : 'deliveryPlanRoutes')}</h2>}
          <div className={board.toolbar}>
            <input type="search" aria-label={t(filter === 'queue' ? 'deliveryQueueSearch' : 'deliveryRouteSearch')} placeholder={t('dispatchSearch')}
              value={filter === 'queue' ? queueQuery : routeQuery}
              onChange={event => { (filter === 'queue' ? setQueueQuery : setRouteQuery)(event.target.value); setSelectedStopId(null); setSelectedRoute(null); setSelectedCourier(null); }} />
            <button type="button" aria-pressed={showMap} onClick={() => setShowMap(current => !current)}>{t(showMap ? 'dispatchHideMap' : 'deliveryPlanShowMap')}</button>
          </div>
          {filter === 'queue' && <>
            <div className={board.scroller}>
              {!visibleOrders.length && <EmptyState icon={<ListPlusIcon />} title={t(loadFailures.length ? 'couldNotLoad' : queueQuery ? 'noResults' : 'dispatchQueueEmpty')} action={queueQuery ? <Button variant="ghost" onClick={() => setQueueQuery('')}>{t('deliveryFiltersClear')}</Button> : undefined} />}
              {visibleOrders.map((order) => {
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
                      <span className="mt-2 flex flex-wrap items-center gap-1" onClick={event => event.stopPropagation()}>
                        {insertRoutes.length > 0 && <Button size="sm" variant="secondary" disabled={loading}
                          onClick={() => { setInserted(''); setInsertingOrder(order); }}>
                          <ListPlusIcon />{t('deliveryInsertTitle')}
                        </Button>}
                        <Button size="sm" variant="ghost" disabled={addressEditorLoading} onClick={() => void openAddressEditor(order.id)}
                          aria-label={`${t('correctAddress')} #${order.id}`} title={t('correctAddress')}>
                          <PencilIcon /><span>{t('correctAddress')}</span>
                        </Button>
                      </span>
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
          </>}
          {filter !== 'queue' && <div className={board.scroller}>
            {loadFailures.includes('mapsRoute') ? <p role="status" className="p-4">{t('couldNotLoad')}</p> : routes.length === 0 ? (
              <EmptyState icon={view === 'history' ? <CheckIcon /> : <RouteIcon />} title={t(loading ? 'loading' : view === 'history' ? 'deliveryPlanNoHistory' : 'deliveryPlanNoActiveRoutes')} desc={loading ? undefined : t(view === 'history' ? 'deliveryPlanHistoryHint' : 'deliveryPlanActiveHint')} />
            ) : !visibleRoutes.length ? (
              <EmptyState icon={<SearchIcon />} title={t(!routeQuery && filter === 'address' ? 'dispatchAddressesClear' : 'noResults')} action={routeQuery ? <Button variant="ghost" onClick={() => setRouteQuery('')}>{t('deliveryFiltersClear')}</Button> : undefined} />
            ) : visibleRoutes.map(({ route, number, shownStops }) => <div key={route.id}>
              {routes.length > 1 && routeHeading(route, number)}
              <RouteTable route={route} number={number} shownStops={shownStops} courier={courierName(route)} locale={locale} selectedStopId={selectedEntry?.stop.id ?? null} t={t}
                onSelectStop={id => { setSelectedStopId(id); setSelectedRoute(route.id); setSelectedCourier(route.courier_id); setMoveTarget(null); }} />
            </div>)}
          </div>}
          <footer className={board.footer}><span>{t('dispatchDisplayedCount').replace('{count}', String(displayedCount))}</span><span>{zoneLabel}</span></footer>
        </section>
        {(showMap || selectedEntry) && <aside aria-label={t('dispatchMapDetail')} className={showMap ? board.mapPanel : board.floatingPanel}>
          {showMap && <>
            <div className={board.mapHeading}><h2>{mapTitle}</h2><span>{t('dispatchPointCount').replace('{count}', String(pointCount))}</span></div>
          <DeliveryMap
            restaurantId={rid}
            routes={mapLayers}
            queueOrders={filter === 'queue' ? queueMap : undefined}
            onQueueClick={orderId => {
              const order = visibleOrders.find(item => item.id === orderId);
              if (!order) return;
              if (insertRoutes.length) setInsertingOrder(order);
              else {
                setQueueQuery(String(order.id));
                setPicked(new Set([order.id]));
              }
            }}
            selectedStopId={selectedEntry?.stop.id ?? null}
            onPointCountChange={setPointCount}
            couriers={filter === 'queue' || filter === 'address' ? [] : courierMarkers.filter(marker => visibleRoutes.some(({ route }) => route.courier_id === marker.courierId))}
            highlightCourierId={selectedCourier}
            highlightRouteId={selectedRoute}
            onRouteSelect={id => { setSelectedRoute(id); setSelectedCourier(null); setSelectedStopId(null); }}
            onStopClick={(stop) => {
              setSelectedStopId(stop.id);
              const row = document.querySelector<HTMLElement>(`[data-stop-id="${stop.id}"]`);
              if (row && window.matchMedia('(min-width: 1024px)').matches) row.scrollIntoView({ block: 'nearest' });
              const route = routes.find((candidate) => candidate.stops.some((candidateStop) => candidateStop.id === stop.id));
              setSelectedRoute(route?.id ?? null);
              setSelectedCourier(route?.courier_id ?? null);
              setMoveTarget(null);
            }}
            className={board.map}
          />
          </>}

          {selectedEntry && editingOrder === null && (
            <div role="region" aria-label={t('dispatchStopDetail')} className={board.detail}>
              <div className={board.detailHead}>
                <div className="min-w-0">
                  <p className={board.context}>{t('dispatchStopOf').replace('{stop}', String(selectedEntry.stop.sequence)).replace('{courier}', courierName(selectedEntry.route))} · <bdi>#{selectedEntry.stop.order_id}</bdi></p>
                  <h3><bdi>{selectedAddress?.line1 || t('noAddress')}</bdi></h3>
                  <p className={board.contact}><bdi>{selectedEntry.stop.customer_name}</bdi>{selectedAddress?.line2 && <> · <bdi>{selectedAddress.line2}</bdi></>}</p>
                  {selectedWindow && (
                    <p className="mt-1 text-fs-xs font-medium leading-snug text-[var(--info-500)]">
                      {buildDeliveryEtaLabel(t('deliveryExpectedArrival'), selectedWindow)}
                    </p>
                  )}
                  {selectedEntry.stop.estimated_position && <p className="mt-1 text-fs-xs">{t('deliveryEstimatedEntrance')}</p>}
                  {!selectedWindow && selectedEntry.stop.needs_geocode && (
                    <p className={board.issue}>
                      <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                      {needsAddressReview(selectedEntry.route, selectedEntry.stop) ? t('dispatchSavedAddress') : deliveryLocationWarning(selectedEntry.route, t)}
                    </p>
                  )}
                  {selectedEntry.stop.delivery_notes?.trim() && (
                    <div className="mt-2 rounded-r-md border-s-2 border-[var(--brand-300)] bg-[var(--surface-2)] px-2.5 py-2">
                      <p className="text-fs-xs font-semibold text-[var(--fg-subtle)]">{t('deliveryNotes')}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-fs-xs text-[var(--fg)]">{selectedEntry.stop.delivery_notes.trim()}</p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedStopId(null)} className="text-[var(--fg-subtle)] hover:text-[var(--fg)]" aria-label={t('close')}>✕</button>
              </div>

              <div className={board.detailActions}>
                {selectedEntry.stop.navigation_started_at && isPendingDeliveryStop(selectedEntry.stop) && (
                  <Button variant="secondary" asChild>
                    <Link href={orderDetailPath(rid, selectedEntry.stop.order_id)}>{t('courierReviewOrder')}</Link>
                  </Button>
                )}
                {view === 'open' && <Button variant="secondary" disabled={addressEditorLoading} onClick={() => void openAddressEditor(selectedEntry.stop.order_id, selectedEntry.route.id)}>
                  <PencilIcon />
                  {t('correctAddress')}
                </Button>}
                {view === 'open' && selectedEntry.stop.customer_phone && (
                  <Button variant="primary" onClick={() => setMessageTarget({ orderId: selectedEntry.stop.order_id })}><MessageCircleIcon />{t('deliveryPlanWhatsApp')}</Button>
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
        </aside>}
      </div>

      {filter !== 'queue' && visibleRoutes.length > 0 && <div className={board.tools}>
        {visibleRoutes.map(({ route }) => <RouteTools key={route.id} route={route} title={t('dispatchRouteFor').replace('{courier}', courierName(route))}
          locale={locale} t={t} location={livePositions.get(route.courier_id)} busy={loading || routeBusy === route.id} history={view === 'history'}
          onOptimize={() => void recalculateRoute(route.id)} onSaveSettings={input => saveRouteSettings(route.id, input)}
          onCancel={() => setUndoAction({ kind: 'route', routeId: route.id, stopCount: route.stops.filter(isPendingDeliveryStop).length })}
          onResetDeparture={() => setUndoAction({ kind: 'departure', routeId: route.id, stopCount: route.stops.length, startedAt: route.started_at, reports: route.stops.filter(stop => stop.issue_reason && stop.issue_review_at) })}
          onRemind={() => void sendCourierReminder(route.id)} reminder={reminders[route.id]} />)}
      </div>}
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
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><StopServiceField value={serviceMinutes} onChange={setServiceMinutes} disabled={planning} t={t} /><CustomerWindowField value={customerWindow} onChange={setCustomerWindow} disabled={planning} t={t} /></div>
            <div className="sm:col-span-2"><OrderWindowField checked={respectOrderWindows} onChange={setRespectOrderWindows} disabled={planning} t={t} /></div>
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

          {endpointCouriers.map(courier => <fieldset key={courier.id} className="space-y-3 rounded-r-md border border-[var(--line)] p-3">
            <legend className="px-1 text-fs-sm font-semibold">{courier.full_name}</legend>
            <p className="text-fs-xs text-[var(--fg-subtle)]">{t('routeSettingsHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <RouteAddressField restaurantId={rid} locale={locale} label={t('routeSettingsStartAddress')} placeholder={t('routeSettingsStartPlaceholder')} value={courierEndpoints[courier.id]?.start_address ?? savedCourierEndpoints(courier.id).start_address} onChange={value => setEndpoint(courier.id, 'start_address', value)} onResolvingChange={resolving => setEndpointResolving(`${courier.id}:start`, resolving)} disabled={planning} t={t} />
              <RouteAddressField restaurantId={rid} locale={locale} label={t('routeSettingsEndAddress')} placeholder={t('routeSettingsEndPlaceholder')} value={courierEndpoints[courier.id]?.end_address ?? savedCourierEndpoints(courier.id).end_address} onChange={value => setEndpoint(courier.id, 'end_address', value)} onResolvingChange={resolving => setEndpointResolving(`${courier.id}:end`, resolving)} disabled={planning} t={t} />
            </div>
          </fieldset>)}

          {distributionMode === 'zone' && (
            <div className="space-y-2">
              {selectedZones.map(({ key: zone, label, count }) => (
                <label key={zone} className="grid grid-cols-1 items-center gap-3 rounded-r-md border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]">
                  <span className="min-w-0">
                    <span className="block truncate text-fs-sm font-medium text-[var(--fg)]">{label}</span>
                    <span className="text-fs-xs text-[var(--fg-subtle)]">
                      {t('deliveryPlanZoneCount').replace('{count}', String(count))}
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

      {insertingOrder && <InsertDeliveryDrawer restaurantId={rid} order={insertingOrder} routes={insertRoutes} initialRouteId={selectedRoute} couriers={courierById}
        onClose={() => setInsertingOrder(null)} onRefresh={load} onSaved={(route, number) => {
          setInserted(t('deliveryInsertSaved').replace('{order}', String(insertingOrder.id)).replace('{route}', String(number)));
          setInsertingOrder(null);
          setWorkFilter('route');
          setRouteQuery('');
          setSelectedStopId(route.stops.find(stop => stop.order_id === insertingOrder.id)?.id ?? null);
          setSelectedRoute(route.id);
          void load();
        }} />}
      <EditCustomerDialog
        allowMapPin
        restaurantId={rid}
        open={editingOrder !== null}
        onOpenChange={(open) => { if (!open) setEditingOrder(null); }}
        order={editingOrder?.order ?? null}
        onConfirm={saveAddressCorrection}
      />

      <AlertDialog open={undoAction != null} onOpenChange={(open) => { if (!open && routeBusy == null) setUndoAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {undoAction?.kind === 'departure' ? t('deliveryPlanResetDeparture') : undoAction?.kind === 'route' ? t('deliveryPlanUnassignConfirmTitle') : t('deliveryPlanReturnConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoAction?.kind === 'departure'
                ? t(undoAction.reports.length ? 'deliveryDepartureReviewedBody' : 'deliveryPlanResetDepartureConfirmBody').replace('{count}', String(undoAction.stopCount))
                : undoAction?.kind === 'route'
                ? t('deliveryPlanUnassignConfirmBody').replace('{count}', String(undoAction.stopCount))
                : t('deliveryPlanReturnConfirmBody').replace('{customer}', undoAction?.customerName ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {undoAction?.kind === 'departure' && undoAction.reports.length > 0 && <div>
            <p className="text-fs-sm font-medium">{t('deliveryDepartureReviewIssues')}</p>
            <ul className="mt-2 space-y-1 text-fs-sm">{undoAction.reports.map(stop => <li key={stop.id}>
              <bdi>#{stop.order_id}</bdi> · {t(deliveryIssueLabels[stop.issue_reason!])}
            </li>)}</ul>
          </div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={routeBusy != null}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={routeBusy != null}
              onClick={(event) => { event.preventDefault(); void confirmUndo(); }}
              className="bg-[var(--danger-500)] text-white hover:brightness-95"
            >
              {t(undoAction?.kind === 'departure' && undoAction.reports.length ? 'deliveryDepartureCorrectAndReset' : 'confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {messageTarget && <DeliveryWhatsAppDrawer key={`${rid}:${departure.slice(0, 10)}:${messageTarget.orderId ?? 'all'}`} open onOpenChange={open => { if (!open) setMessageTarget(null); }} restaurantId={rid} date={departure.slice(0, 10)} routes={dayRoutes} couriers={courierById} orderId={messageTarget.orderId} />}
    </div>
  );
}
