'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import { useWs } from '@/lib/ws-context';
import { listDeliveryRoutes, buildRoute, type DeliveryRoute } from '@/lib/delivery';
import {
  listOrders, listCouriers, markOrderReadyForDelivery, sendOrderToKitchen,
  type Order, type StaffMember,
} from '@/lib/api';
import { localizeStatus } from '@/components/orders/OrderDetailDrawer';
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
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Section,
  Select,
} from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';
import { Checkbox } from '@/components/ui/checkbox';
import { TruckIcon, MapPinIcon, ClockIcon, UserIcon } from 'lucide-react';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

// ── Colour palette per courier ────────────────────────────────────────────────
const COURIER_COLORS = ['#F18A47', '#5AA9E6', '#C792EA', '#5BBF84', '#E6A75A', '#E26D9B'];
function colorFor(index: number): string { return COURIER_COLORS[index % COURIER_COLORS.length]; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatEta(seconds: number, t: (k: string) => string): string {
  if (seconds <= 0) return '';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ${t('unitMin')}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}${t('unitHour')} ${rem}${t('unitMin')}` : `${h}${t('unitHour')}`;
}

function routeStatusTone(status: DeliveryRoute['status']): 'neutral' | 'success' | 'info' | 'warning' {
  switch (status) {
    case 'active': return 'info';
    case 'completed': return 'success';
    case 'cancelled': return 'warning';
    default: return 'neutral';
  }
}

// ── Courier progress card ─────────────────────────────────────────────────────
interface CourierCardProps {
  route: DeliveryRoute;
  courier?: StaffMember;
  color: string;
  selected: boolean;
  onSelect: () => void;
  t: (key: string, replacements?: Record<string, string>) => string;
}

function CourierCard({ route, courier, color, selected, onSelect, t }: CourierCardProps) {
  const delivered = route.stops.filter((s) => s.status === 'delivered').length;
  const total = route.stops.length;
  const progress = total > 0 ? (delivered / total) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left rounded-lg border transition-all duration-150 p-3 focus-visible:outline-none focus-visible:shadow-ring',
        selected
          ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_8%,transparent)] shadow-sm'
          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* Colour swatch */}
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: color }}
        />
        <span className="text-fs-sm font-semibold text-[var(--fg)] truncate flex-1">
          {courier?.full_name ?? `#${route.courier_id}`}
        </span>
        <Badge tone={routeStatusTone(route.status)} className="shrink-0">
          {t(`routeStatus${route.status.charAt(0).toUpperCase()}${route.status.slice(1)}`)}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-fs-xs text-[var(--fg-subtle)] flex items-center gap-1">
          <MapPinIcon className="w-3 h-3" />
          {t('stopsProgress').replace('{done}', String(delivered)).replace('{total}', String(total))}
        </span>
        {route.est_duration_s > 0 && (
          <span className="text-fs-xs text-[var(--fg-subtle)] flex items-center gap-1">
            <ClockIcon className="w-3 h-3" />
            {t('etaToFinish').replace('{time}', formatEta(route.est_duration_s, t))}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DispatcherView({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { lastEvent } = useWs();
  const prevEvent = useRef(lastEvent);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [livePositions, setLivePositions] = useState<Map<number, { lat: number; lng: number; updatedAt: number }>>(new Map());
  const [ready, setReady] = useState<Order[]>([]);
  // Paid delivery orders still being prepared (accepted / in_kitchen). The
  // dispatcher can pre-assign these — confirming bumps them to ready-for-delivery.
  const [preparing, setPreparing] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [assignTo, setAssignTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Pre-assign (preparing) section state + its confirmation dialog.
  const [pickedPrep, setPickedPrep] = useState<Set<number>>(new Set());
  const [assignToPrep, setAssignToPrep] = useState<number | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rts, orders, prep, crs] = await Promise.all([
        listDeliveryRoutes(rid),
        // An order is dispatchable only once it is paid AND marked ready for
        // delivery. The empty state spells out both conditions so staff know
        // why an order isn't showing up yet.
        listOrders(rid, { type: 'delivery', status: 'ready_for_delivery', payment_status: 'paid' }),
        // Paid orders still in the kitchen pipeline — eligible for pre-assignment.
        // The server only allows in_kitchen → ready_for_delivery (accepted goes
        // via the kitchen first), so we surface exactly those two statuses.
        listOrders(rid, { type: 'delivery', status: 'accepted,in_kitchen', payment_status: 'paid' }),
        listCouriers(rid),
      ]);
      setRoutes(rts);
      const seed = new Map<number, { lat: number; lng: number; updatedAt: number }>();
      for (const r of rts) {
        if (r.last_location) {
          seed.set(r.courier_id, {
            lat: r.last_location.lat,
            lng: r.last_location.lng,
            updatedAt: Date.parse(r.last_location.updated_at),
          });
        }
      }
      setLivePositions(seed);
      // "Ready to dispatch" = ready_for_delivery + paid orders not yet on a
      // route. Filtering by route membership (rather than courier_id) is the
      // correct signal now that route-building is the only way to assign a
      // courier: it also surfaces orders left assigned-but-unrouted by the
      // legacy per-order courier picker, which would otherwise be invisible.
      const routedOrderIds = new Set<number>(rts.flatMap((r) => r.stops.map((s) => s.order_id)));
      setReady(orders.orders.filter((o) => !routedOrderIds.has(o.id)));
      setPreparing(prep.orders.filter((o) => !routedOrderIds.has(o.id)));
      setCouriers(crs);
    } catch (e) {
      setError((e as Error)?.message || 'load failed');
    }
  }, [rid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;
    if (lastEvent.type === 'courier.location') {
      const p = lastEvent.payload as unknown as { courier_id: number; lat: number; lng: number; updated_at: string };
      setLivePositions((prev) => {
        const next = new Map(prev);
        next.set(p.courier_id, { lat: p.lat, lng: p.lng, updatedAt: Date.parse(p.updated_at) });
        return next;
      });
      return; // a position tick should not trigger a full reload
    }
    if (lastEvent.type === 'route.updated' || lastEvent.type.startsWith('order.')) load();
  }, [lastEvent, load]);

  const layers = useMemo<RouteLayer[]>(
    () => routes.map((r, i) => ({ courierId: r.courier_id, color: colorFor(i), stops: r.stops })),
    [routes],
  );

  // Map courier_id → index for colour lookup
  const courierColorMap = useMemo<Map<number, string>>(() => {
    const m = new Map<number, string>();
    routes.forEach((r, i) => m.set(r.courier_id, colorFor(i)));
    return m;
  }, [routes]);

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allPicked = ready.length > 0 && picked.size === ready.length;
  const toggleAll = () => {
    if (allPicked) {
      setPicked(new Set());
    } else {
      setPicked(new Set(ready.map((o) => o.id)));
    }
  };

  const onAssign = async () => {
    if (assignTo == null || picked.size === 0) return;
    setBusy(true);
    try {
      await buildRoute(rid, assignTo, Array.from(picked));
      setPicked(new Set());
      await load();
    } catch (e) {
      setError((e as Error)?.message || 'action failed');
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ── Pre-assign (orders still being prepared) ───────────────────────────────
  const togglePickPrep = (id: number) =>
    setPickedPrep((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allPickedPrep = preparing.length > 0 && pickedPrep.size === preparing.length;
  const toggleAllPrep = () =>
    setPickedPrep(allPickedPrep ? new Set() : new Set(preparing.map((o) => o.id)));

  const prepCourier = couriers.find((c) => c.id === assignToPrep);

  // Confirmed pre-assign: push each selected order to ready-for-delivery (via the
  // kitchen when still "accepted", since the server only allows in_kitchen →
  // ready_for_delivery), then build the route — so it lands straight on the
  // courier's tournée without a second assignment step.
  const onPrepAssign = async () => {
    if (assignToPrep == null || pickedPrep.size === 0) return;
    setPrepBusy(true);
    try {
      const ids = Array.from(pickedPrep);
      for (const id of ids) {
        const o = preparing.find((p) => p.id === id);
        if (!o) continue;
        if (o.status === 'accepted') await sendOrderToKitchen(rid, id);
        await markOrderReadyForDelivery(rid, id);
      }
      await buildRoute(rid, assignToPrep, ids);
      setPickedPrep(new Set());
      setAssignToPrep(null);
      setConfirmOpen(false);
      await load();
    } catch (e) {
      setError((e as Error)?.message || 'action failed');
      setConfirmOpen(false);
      await load();
    } finally {
      setPrepBusy(false);
    }
  };

  // ── Live courier markers ───────────────────────────────────────────────────
  const courierMarkers = useMemo<CourierMarker[]>(() => {
    const markers: CourierMarker[] = [];
    routes.forEach((r, i) => {
      const lp = livePositions.get(r.courier_id);
      if (!lp) return;
      markers.push({
        courierId: r.courier_id,
        color: colorFor(i),
        lat: lp.lat,
        lng: lp.lng,
        stale: nowTick - lp.updatedAt > 60000,
      });
    });
    return markers;
  }, [routes, livePositions, nowTick]);

  // ── Courier lookup map ─────────────────────────────────────────────────────
  const courierById = useMemo<Map<number, StaffMember>>(() => {
    const m = new Map<number, StaffMember>();
    couriers.forEach((c) => m.set(c.id, c));
    return m;
  }, [couriers]);

  const handleSelectCourier = (routeCourierId: number) => {
    setSelectedCourier((prev) => (prev === routeCourierId ? null : routeCourierId));
  };

  // Failed initial load with nothing to show - offer retry
  if (error && routes.length === 0 && ready.length === 0 && couriers.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-[var(--s-3)] py-10 text-center">
          <p className="text-fs-sm text-[var(--fg-muted)]">{t('couldNotLoad')}</p>
          <Button variant="secondary" size="md" onClick={load}>
            {t('retry')}
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
      {/* ── Inline error banner ─────────────────────────────────────────────── */}
      {error && (
        <div
          className="col-span-full flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-lg text-fs-sm"
          style={{ background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)', color: 'var(--danger-500)', border: '1px solid color-mix(in oklab, var(--danger-500) 25%, transparent)' }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 font-semibold hover:opacity-70 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* ── Left rail ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {/* Couriers section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="w-4 h-4 text-[var(--brand-500)]" />
              {t('couriersTitle')}
            </CardTitle>
            {routes.length > 0 && (
              <Badge tone="neutral">{routes.length}</Badge>
            )}
          </CardHeader>
          <CardBody>
            {routes.length === 0 ? (
              <div className="py-2 text-center">
                <p className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('noStopsYet')}</p>
                <p className="text-fs-xs text-[var(--fg-subtle)] mt-1">{t('noStopsYetHint')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {routes.map((route, i) => (
                  <CourierCard
                    key={route.id}
                    route={route}
                    courier={courierById.get(route.courier_id)}
                    color={courierColorMap.get(route.courier_id) ?? colorFor(i)}
                    selected={selectedCourier === route.courier_id}
                    onSelect={() => handleSelectCourier(route.courier_id)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Ready to dispatch section */}
        <Section title={t('readyToDispatch')}>
          {ready.length === 0 ? (
            <div className="py-2 text-center">
              <p className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('noAvailableDeliveries')}</p>
              <p className="text-fs-xs text-[var(--fg-subtle)] mt-1">{t('noReadyDeliveriesHint')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-[var(--s-5)]">
                <DataTable responsive={false} className="border-0 rounded-none shadow-none bg-transparent dark:bg-transparent">
                  <DataTableHead>
                    <DataTableHeadCell className="p-3 w-10">
                      <Checkbox
                        checked={allPicked}
                        onCheckedChange={toggleAll}
                      />
                    </DataTableHeadCell>
                    <DataTableHeadCell className="p-3">
                      {t('customer')}
                    </DataTableHeadCell>
                    <DataTableHeadCell className="p-3">
                      {t('address')}
                    </DataTableHeadCell>
                  </DataTableHead>
                  <DataTableBody>
                    {ready.map((order, idx) => (
                      <DataTableRow
                        key={order.id}
                        index={idx}
                        onClick={() => togglePick(order.id)}
                        className="cursor-pointer"
                      >
                        <DataTableCell className="p-3 w-10">
                          <Checkbox
                            checked={picked.has(order.id)}
                            onCheckedChange={() => togglePick(order.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </DataTableCell>
                        <DataTableCell className="p-3">
                          <div className="text-fs-sm font-medium text-[var(--fg)]">
                            {order.customer_name}
                          </div>
                          <div className="text-fs-xs text-[var(--fg-subtle)]">#{order.id}</div>
                        </DataTableCell>
                        <DataTableCell className="p-3">
                          {(() => {
                            const addr = formatDeliveryAddress(
                              {
                                address: order.delivery_address,
                                city: order.delivery_city,
                                floor: order.delivery_floor,
                                apt: order.delivery_apt,
                                entryCode: order.delivery_entry_code,
                              },
                              t,
                            );
                            if (!addr) {
                              return <span className="text-fs-xs text-[var(--fg-subtle)]">{t('noAddress')}</span>;
                            }
                            return (
                              <div className="flex items-start gap-1">
                                <MapPinIcon className="w-3 h-3 text-[var(--fg-subtle)] mt-0.5 shrink-0" />
                                <div className="leading-tight">
                                  <div className="text-fs-xs text-[var(--fg)]">{addr.line1}</div>
                                  {addr.line2 && (
                                    <div className="text-fs-xs text-[var(--fg-subtle)]">{addr.line2}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              </div>

              {/* Assign controls */}
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-1 text-fs-xs text-[var(--fg-subtle)]">
                  <UserIcon className="w-3 h-3" />
                  {t('couriersTitle')}
                </div>
                <div className="flex gap-2">
                  <Select
                    className="flex-1"
                    value={assignTo ?? ''}
                    onChange={(e) => setAssignTo(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t('selectCourier')}</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={picked.size === 0 || assignTo == null || busy}
                    onClick={onAssign}
                  >
                    {picked.size > 0
                      ? t('assignNOrders').replace('{n}', String(picked.size))
                      : t('assignNOrders').replace('{n}', '0')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Being prepared — pre-assign before an order is marked ready. Only
            shows when there are paid orders still in the kitchen pipeline. */}
        {preparing.length > 0 && (
          <Section title={t('beingPreparedTitle')}>
            <p className="text-fs-xs text-[var(--fg-subtle)] mb-2">{t('beingPreparedHint')}</p>
            <div className="overflow-x-auto -mx-[var(--s-5)]">
              <DataTable responsive={false} className="border-0 rounded-none shadow-none bg-transparent dark:bg-transparent">
                <DataTableHead>
                  <DataTableHeadCell className="p-3 w-10">
                    <Checkbox checked={allPickedPrep} onCheckedChange={toggleAllPrep} />
                  </DataTableHeadCell>
                  <DataTableHeadCell className="p-3">{t('customer')}</DataTableHeadCell>
                  <DataTableHeadCell className="p-3">{t('status')}</DataTableHeadCell>
                </DataTableHead>
                <DataTableBody>
                  {preparing.map((order, idx) => (
                    <DataTableRow
                      key={order.id}
                      index={idx}
                      onClick={() => togglePickPrep(order.id)}
                      className="cursor-pointer"
                    >
                      <DataTableCell className="p-3 w-10">
                        <Checkbox
                          checked={pickedPrep.has(order.id)}
                          onCheckedChange={() => togglePickPrep(order.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </DataTableCell>
                      <DataTableCell className="p-3">
                        <div className="text-fs-sm font-medium text-[var(--fg)]">{order.customer_name}</div>
                        <div className="text-fs-xs text-[var(--fg-subtle)]">#{order.id}</div>
                      </DataTableCell>
                      <DataTableCell className="p-3">
                        <Badge tone="warning">{localizeStatus(order.status, t)}</Badge>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>

            {/* Assign controls — opens a confirmation before bumping status. */}
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-1 text-fs-xs text-[var(--fg-subtle)]">
                <UserIcon className="w-3 h-3" />
                {t('couriersTitle')}
              </div>
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={assignToPrep ?? ''}
                  onChange={(e) => setAssignToPrep(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('selectCourier')}</option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  size="md"
                  disabled={pickedPrep.size === 0 || assignToPrep == null || prepBusy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('assignNOrders').replace('{n}', String(pickedPrep.size))}
                </Button>
              </div>
            </div>
          </Section>
        )}
      </div>

      {/* ── Confirm dialog: pre-assign marks orders ready for delivery ────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!prepBusy) setConfirmOpen(o); }}>
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
            <AlertDialogAction onClick={(e) => { e.preventDefault(); onPrepAssign(); }} disabled={prepBusy}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Map (desktop only) ───────────────────────────────────────────────── */}
      <DeliveryMap
        routes={layers}
        couriers={courierMarkers}
        highlightCourierId={selectedCourier}
        className="h-[70vh] rounded-xl overflow-hidden hidden lg:block"
      />
      <div className="lg:hidden text-[var(--fg-subtle)] text-fs-sm px-1">
        {t('dispatchDesktopHint')}
      </div>
    </div>
  );
}
