'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowRightLeftIcon,
  MapPinIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  RouteIcon,
  SparklesIcon,
  Undo2Icon,
  UserIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import { whatsappUrl } from '@/lib/delivery-links';
import {
  buildDeliveryEtaMessage,
  deliveryEtaWindow,
  type DeliveryEtaWindow,
} from '@/lib/delivery-planning';
import { useWs } from '@/lib/ws-context';
import {
  buildRoute,
  cancelDeliveryRoute,
  changeRouteCourier,
  listDeliveryRoutes,
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
  markOrderReadyForDelivery,
  sendOrderToKitchen,
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
import { Badge, Button, Card, CardBody, CardHeader, Input, Section, Select } from '@/components/ds';
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
  availableCouriers: StaffMember[];
  busy: boolean;
  onSelectCourier: () => void;
  onSelectStop: (stopId: number) => void;
  onChangeCourier: (courierId: number) => void;
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
  availableCouriers,
  busy,
  onSelectCourier,
  onSelectStop,
  onChangeCourier,
  onOptimize,
  onCancel,
  t,
}: RouteRibbonProps) {
  const delivered = route.stops.filter((stop) => stop.status === 'delivered').length;
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const progress = route.stops.length > 0 ? (delivered / route.stops.length) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ background: color }} />
      <CardHeader>
        <button type="button" onClick={onSelectCourier} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-fs-sm font-semibold text-[var(--fg)]">
            {courier?.full_name ?? `#${route.courier_id}`}
          </span>
        </button>
        <Badge tone={routeStatusTone(route.status)}>
          {t(`routeStatus${route.status.charAt(0).toUpperCase()}${route.status.slice(1)}`)}
        </Badge>
      </CardHeader>
      <CardBody className="pt-0">
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-r-md bg-[var(--surface-2)] p-2 text-center">
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

        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: color }} />
        </div>

        {route.status === 'draft' && (
          <div className="mb-3 flex flex-wrap items-end gap-2 border-b border-[var(--line)] pb-3">
            <label className="min-w-[150px] flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--fg-subtle)]">
                {t('deliveryPlanAssignedCourier')}
              </span>
              <Select
                className="h-8 text-fs-xs"
                value={route.courier_id}
                disabled={busy}
                onChange={(event) => onChangeCourier(Number(event.target.value))}
              >
                {availableCouriers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>
                ))}
              </Select>
            </label>
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

        <div className="relative">
          <div className="absolute bottom-4 left-[13px] top-4 w-px opacity-30" style={{ background: color }} />
          <div className="flex flex-col gap-1">
            {ordered.map((stop) => {
              const window = deliveryEtaWindow(route, stop, locale);
              const isSelected = selectedStopId === stop.id;
              const message = deliveryMessage(t, stop, window);
              return (
                <div
                  key={stop.id}
                  className={`relative flex items-center gap-2 rounded-r-md border p-2 transition-colors ${
                    isSelected
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)]'
                      : 'border-transparent hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStop(stop.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                  >
                    <span
                      className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-sm"
                      style={{ background: color }}
                    >
                      {stop.sequence}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fs-xs font-semibold text-[var(--fg)]">{stop.customer_name}</span>
                      <span className="block truncate text-[11px] text-[var(--fg-subtle)]">{stop.address}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold tabular-nums text-[var(--fg-muted)]">
                      {window?.label ?? formatDuration(stop.eta_seconds, t) ?? '—'}
                    </span>
                  </button>
                  {stop.customer_phone && (
                    <a
                      href={whatsappUrl(stop.customer_phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-md text-[#1FA855] transition-colors hover:bg-[#1FA855]/10 focus-visible:outline-none focus-visible:shadow-ring"
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
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [livePositions, setLivePositions] = useState<Map<number, { lat: number; lng: number; updatedAt: number }>>(new Map());
  const [ready, setReady] = useState<Order[]>([]);
  const [preparing, setPreparing] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [plannerCouriers, setPlannerCouriers] = useState<Set<number>>(new Set());
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
  const [pickedPrep, setPickedPrep] = useState<Set<number>>(new Set());
  const [assignToPrep, setAssignToPrep] = useState<number | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [routeRows, readyRows, prepRows, courierRows] = await Promise.all([
        listDeliveryRoutes(rid),
        listOrders(rid, { type: 'delivery', status: 'ready_for_delivery', payment_status: 'paid' }),
        listOrders(rid, { type: 'delivery', status: 'accepted,in_kitchen', payment_status: 'paid' }),
        listCouriers(rid),
      ]);
      setRoutes(routeRows);
      const routedOrderIds = new Set(routeRows.flatMap((route) => route.stops.map((stop) => stop.order_id)));
      const available = readyRows.orders.filter((order) => !routedOrderIds.has(order.id));
      setReady(available);
      setPreparing(prepRows.orders.filter((order) => !routedOrderIds.has(order.id)));
      setCouriers(courierRows);
      setPicked((current) => {
        const availableIds = new Set(available.map((order) => order.id));
        const retained = new Set(Array.from(current).filter((id) => availableIds.has(id)));
        return current.size === 0 ? availableIds : retained;
      });
      setPlannerCouriers((current) => {
        const activeCourierIds = new Set(
          routeRows.filter((route) => route.status === 'active').map((route) => route.courier_id),
        );
        const selectableCouriers = courierRows.filter((courier) => !activeCourierIds.has(courier.id));
        const valid = new Set(Array.from(current).filter((id) => selectableCouriers.some((courier) => courier.id === id)));
        if (valid.size > 0) return valid;
        return new Set(selectableCouriers.slice(0, Math.min(2, selectableCouriers.length)).map((courier) => courier.id));
      });
      const seed = new Map<number, { lat: number; lng: number; updatedAt: number }>();
      routeRows.forEach((route) => {
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
  }, [rid, t]);

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

  const selectedEntry = useMemo(() => {
    for (const route of routes) {
      const stop = route.stops.find((candidate) => candidate.id === selectedStopId);
      if (stop) return { route, stop };
    }
    return null;
  }, [routes, selectedStopId]);

  const allPicked = ready.length > 0 && picked.size === ready.length;
  const toggleOrder = (id: number) => setPicked((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(ready.map((order) => order.id)));
  const toggleCourier = (id: number) => setPlannerCouriers((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const createPlan = async () => {
    if (picked.size === 0 || plannerCouriers.size === 0 || !departure) return;
    setPlanning(true);
    try {
      await planDeliveryRoutes(rid, Array.from(plannerCouriers), Array.from(picked), new Date(departure).toISOString());
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

  const replaceRouteCourier = async (routeId: number, courierId: number) => {
    setRouteBusy(routeId);
    try {
      await changeRouteCourier(rid, routeId, courierId);
      setSelectedCourier(courierId);
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanCourierChangeFailed'));
      await load();
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

  const allPickedPrep = preparing.length > 0 && pickedPrep.size === preparing.length;
  const togglePrep = (id: number) => setPickedPrep((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const prepCourier = couriers.find((courier) => courier.id === assignToPrep);
  const assignPreparing = async () => {
    if (assignToPrep == null || pickedPrep.size === 0) return;
    setPrepBusy(true);
    try {
      const ids = Array.from(pickedPrep);
      for (const id of ids) {
        const order = preparing.find((candidate) => candidate.id === id);
        if (!order) continue;
        if (order.status === 'accepted') await sendOrderToKitchen(rid, id);
        await markOrderReadyForDelivery(rid, id);
      }
      await buildRoute(rid, assignToPrep, ids);
      setPickedPrep(new Set());
      setAssignToPrep(null);
      setConfirmOpen(false);
      await load();
    } catch (cause) {
      setError((cause as Error)?.message || t('deliveryPlanFailed'));
      setConfirmOpen(false);
      await load();
    } finally {
      setPrepBusy(false);
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
  const movableRoutes = selectedEntry
    ? routes.filter((route) => route.id !== selectedEntry.route.id && route.status === 'draft')
    : [];
  const occupiedCourierIds = new Set(
    routes
      .filter((route) => route.status === 'draft' || route.status === 'active')
      .map((route) => route.courier_id),
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

      <Card className="overflow-hidden">
        <div className="h-1 bg-[var(--brand-500)]" />
        <CardBody className="p-4 md:p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(230px,0.7fr)_minmax(280px,1.2fr)_220px_auto] xl:items-end">
            <div>
              <div className="mb-1 flex items-center gap-2 text-fs-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-500)]">
                <SparklesIcon className="h-4 w-4" />
                {t('deliveryPlanEyebrow')}
              </div>
              <h1 className="text-fs-xl font-semibold text-[var(--fg)]">{t('deliveryPlanTitle')}</h1>
              <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
                {t('deliveryPlanSubtitle').replace('{count}', String(picked.size))}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-fs-xs font-semibold text-[var(--fg-muted)]">{t('deliveryPlanCouriers')}</label>
              <div className="flex flex-wrap gap-2">
                {couriers.map((courier, index) => {
                  const checked = plannerCouriers.has(courier.id);
                  const isActive = routes.some((route) => route.courier_id === courier.id && route.status === 'active');
                  return (
                    <button
                      key={courier.id}
                      type="button"
                      onClick={() => toggleCourier(courier.id)}
                      disabled={isActive}
                      aria-pressed={checked}
                      title={isActive ? t('deliveryPlanCourierActive') : undefined}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-fs-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-ring ${
                        checked
                          ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--fg)]'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg-subtle)] hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-45'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: checked ? colorFor(index) : 'var(--line-strong)' }} />
                      {courier.full_name}
                    </button>
                  );
                })}
                {couriers.length === 0 && <span className="text-fs-xs text-[var(--fg-subtle)]">{t('noCouriersHint')}</span>}
              </div>
            </div>

            <div>
              <label htmlFor="delivery-departure" className="mb-2 block text-fs-xs font-semibold text-[var(--fg-muted)]">
                {t('deliveryPlanDeparture')}
              </label>
              <Input id="delivery-departure" type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} />
            </div>

            <Button
              size="lg"
              className="w-full xl:w-auto"
              disabled={planning || picked.size === 0 || plannerCouriers.size === 0 || !departure}
              onClick={() => void createPlan()}
            >
              <RouteIcon />
              {planning
                ? t('deliveryPlanGenerating')
                : t('deliveryPlanGenerate').replace('{count}', String(picked.size))}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[390px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-fs-md font-semibold text-[var(--fg)]">{t('deliveryPlanRoutes')}</h2>
              <p className="text-fs-xs text-[var(--fg-subtle)]">
                {t('deliveryPlanRoutesHint').replace('{count}', String(routes.length))}
              </p>
            </div>
            {routes.length > 0 && <Badge tone="neutral">{routes.length}</Badge>}
          </div>

          {routes.length === 0 ? (
            <Card>
              <CardBody className="py-8 text-center">
                <RouteIcon className="mx-auto mb-3 h-8 w-8 text-[var(--fg-subtle)]" />
                <p className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('noStopsYet')}</p>
                <p className="mx-auto mt-1 max-w-xs text-fs-xs text-[var(--fg-subtle)]">{t('deliveryPlanEmptyHint')}</p>
              </CardBody>
            </Card>
          ) : routes.map((route) => (
            <RouteRibbon
              key={route.id}
              route={route}
              courier={courierById.get(route.courier_id)}
              color={routeColorMap.get(route.id) ?? colorFor(0)}
              locale={locale}
              selectedStopId={selectedStopId}
              availableCouriers={couriers.filter(
                (courier) => courier.id === route.courier_id || !occupiedCourierIds.has(courier.id),
              )}
              busy={routeBusy === route.id}
              onSelectCourier={() => setSelectedCourier((current) => current === route.courier_id ? null : route.courier_id)}
              onSelectStop={(stopId) => {
                setSelectedStopId(stopId);
                setSelectedCourier(route.courier_id);
                setMoveTarget(null);
              }}
              onChangeCourier={(courierId) => void replaceRouteCourier(route.id, courierId)}
              onOptimize={() => void recalculateRoute(route.id)}
              onCancel={() => setUndoAction({ kind: 'route', routeId: route.id, stopCount: route.stops.length })}
              t={t}
            />
          ))}

          <Section title={t('deliveryPlanUnplanned').replace('{count}', String(ready.length))}>
            {ready.length === 0 ? (
              <div className="py-3 text-center text-fs-xs text-[var(--fg-subtle)]">{t('deliveryPlanNoUnplanned')}</div>
            ) : (
              <div className="-mx-[var(--s-5)] overflow-x-auto">
                <DataTable responsive={false} className="rounded-none border-0 bg-transparent shadow-none dark:bg-transparent">
                  <DataTableHead>
                    <DataTableHeadCell className="w-10 p-3"><Checkbox checked={allPicked} onCheckedChange={toggleAll} /></DataTableHeadCell>
                    <DataTableHeadCell className="p-3">{t('customer')}</DataTableHeadCell>
                    <DataTableHeadCell className="p-3">{t('address')}</DataTableHeadCell>
                  </DataTableHead>
                  <DataTableBody>
                    {ready.map((order, index) => {
                      const address = formatDeliveryAddress({
                        address: order.delivery_address,
                        city: order.delivery_city,
                        floor: order.delivery_floor,
                        apt: order.delivery_apt,
                        entryCode: order.delivery_entry_code,
                      }, t);
                      return (
                        <DataTableRow key={order.id} index={index} onClick={() => toggleOrder(order.id)} className="cursor-pointer">
                          <DataTableCell className="w-10 p-3">
                            <Checkbox checked={picked.has(order.id)} onCheckedChange={() => toggleOrder(order.id)} onClick={(event) => event.stopPropagation()} />
                          </DataTableCell>
                          <DataTableCell className="p-3">
                            <div className="text-fs-sm font-medium text-[var(--fg)]">{order.customer_name}</div>
                            <div className="text-fs-xs text-[var(--fg-subtle)]">#{order.id}</div>
                          </DataTableCell>
                          <DataTableCell className="p-3 text-fs-xs text-[var(--fg-muted)]">{address?.line1 || t('noAddress')}</DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              </div>
            )}
          </Section>

          {preparing.length > 0 && (
            <Section title={t('beingPreparedTitle')}>
              <p className="mb-2 text-fs-xs text-[var(--fg-subtle)]">{t('beingPreparedHint')}</p>
              <div className="flex flex-col gap-2">
                {preparing.map((order) => (
                  <label key={order.id} className="flex cursor-pointer items-center gap-3 rounded-r-md border border-[var(--line)] p-3 hover:bg-[var(--surface-2)]">
                    <Checkbox checked={pickedPrep.has(order.id)} onCheckedChange={() => togglePrep(order.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fs-sm font-medium text-[var(--fg)]">{order.customer_name}</span>
                      <span className="text-fs-xs text-[var(--fg-subtle)]">#{order.id}</span>
                    </span>
                    <Badge tone="warning">{localizeStatus(order.status, t)}</Badge>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Select className="flex-1" value={assignToPrep ?? ''} onChange={(event) => setAssignToPrep(event.target.value ? Number(event.target.value) : null)}>
                  <option value="">{t('selectCourier')}</option>
                  {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
                </Select>
                <Button disabled={pickedPrep.size === 0 || assignToPrep == null || prepBusy} onClick={() => setConfirmOpen(true)}>
                  {t('assignNOrders').replace('{n}', String(pickedPrep.size))}
                </Button>
              </div>
              {preparing.length > 1 && (
                <button type="button" className="mt-2 text-fs-xs text-[var(--brand-500)]" onClick={() => setPickedPrep(allPickedPrep ? new Set() : new Set(preparing.map((order) => order.id)))}>
                  {allPickedPrep ? t('deselectAll') : t('selectAll')}
                </button>
              )}
            </Section>
          )}
        </div>

        <div className="relative hidden lg:block lg:sticky lg:top-4">
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
            className="h-[calc(100vh-180px)] min-h-[560px] overflow-hidden rounded-r-xl border border-[var(--line)]"
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
                    {selectedWindow && <Badge tone="info">{selectedWindow.label}</Badge>}
                  </div>
                  <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
                    {[selectedEntry.stop.address, selectedEntry.stop.city].filter(Boolean).join(', ')}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
                    <UserIcon className="h-3 w-3" />
                    {courierById.get(selectedEntry.route.courier_id)?.full_name ?? `#${selectedEntry.route.courier_id}`}
                  </p>
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

      <div className="rounded-r-lg border border-[var(--line)] p-3 text-fs-sm text-[var(--fg-subtle)] lg:hidden">
        <MapPinIcon className="mr-2 inline h-4 w-4" />
        {t('dispatchDesktopHint')}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!prepBusy) setConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmReadyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmReadyBody')
                .replace('{n}', String(pickedPrep.size))
                .replace('{courier}', prepCourier?.full_name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={prepBusy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void assignPreparing(); }} disabled={prepBusy}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
