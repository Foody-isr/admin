'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n';
import { useWs } from '@/lib/ws-context';
import { listDeliveryRoutes, buildRoute, type DeliveryRoute } from '@/lib/delivery';
import { listOrders, listCouriers, type Order, type StaffMember } from '@/lib/api';
import type { RouteLayer, CourierMarker } from '@/components/delivery/DeliveryMap';
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
  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [assignTo, setAssignTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rts, orders, crs] = await Promise.all([
        listDeliveryRoutes(rid),
        listOrders(rid, { type: 'delivery', status: 'ready_for_delivery', payment_status: 'paid' }),
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
      setReady(orders.orders.filter((o) => o.courier_id == null));
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
              <p className="text-fs-sm text-[var(--fg-subtle)] py-2 text-center">
                {t('noStopsYet')}
              </p>
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
            <p className="text-fs-sm text-[var(--fg-subtle)] py-2 text-center">
              {t('noAvailableDeliveries')}
            </p>
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
                          {order.delivery_address ? (
                            <div className="flex items-start gap-1">
                              <MapPinIcon className="w-3 h-3 text-[var(--fg-subtle)] mt-0.5 shrink-0" />
                              <div>
                                <div className="text-fs-xs text-[var(--fg)]">{order.delivery_address}</div>
                                {order.delivery_city && (
                                  <div className="text-fs-xs text-[var(--fg-subtle)]">{order.delivery_city}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-fs-xs text-[var(--fg-subtle)]">{t('noAddress')}</span>
                          )}
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
      </div>

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
