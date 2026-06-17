'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n';
import { useWs } from '@/lib/ws-context';
import {
  getMyRoute, startRoute, markArrived, markStopDelivered, reorderStops, optimizeRoute,
  listAvailableDeliveries, addStops,
  type DeliveryRoute, type RouteStop,
} from '@/lib/delivery';
import type { Order } from '@/lib/api';
import { navUrl, callUrl } from '@/lib/delivery-links';
import {
  Badge,
  Button,
  Card,
  CardBody,
  PageHead,
  Tabs,
  TabsList,
  Tab,
  TabsContent,
} from '@/components/ds';
import {
  NavigationIcon,
  PhoneIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  RouteIcon,
  ZapIcon,
  AlertCircleIcon,
  MapPinIcon,
  PackageIcon,
} from 'lucide-react';

// ── Dynamic import: Leaflet crashes on SSR ────────────────────────────────────
const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'assigned' | 'available';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function stopStatusTone(status: RouteStop['status']): 'success' | 'info' | 'neutral' {
  if (status === 'delivered') return 'success';
  if (status === 'arrived') return 'info';
  return 'neutral';
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Horizontal progress bar: delivered/total with animated fill. */
function RouteProgress({ delivered, total }: { delivered: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((delivered / total) * 100);
  return (
    <div className="flex items-center gap-[var(--s-3)]">
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: pct === 100 ? 'var(--success-500)' : 'var(--brand-500)',
          }}
        />
      </div>
      <span className="text-fs-xs font-medium tabular-nums" style={{ color: 'var(--fg-muted)', minWidth: '2.8rem', textAlign: 'end' }}>
        {delivered}/{total}
      </span>
    </div>
  );
}

/** Card shown when there is no current stop to act on. */
function NoStopsCard({ t }: { t: (k: string) => string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-[var(--s-3)] py-10 text-center rounded-lg border border-dashed"
      style={{ borderColor: 'var(--line)', color: 'var(--fg-subtle)' }}
    >
      <PackageIcon className="w-10 h-10 opacity-40" />
      <p className="text-fs-sm font-medium">{t('noStopsYet')}</p>
    </div>
  );
}

/** Hero card for the currently active stop. */
function CurrentStopCard({
  stop,
  busy,
  onArrived,
  onDelivered,
  t,
}: {
  stop: RouteStop;
  busy: boolean;
  onArrived: (s: RouteStop) => void;
  onDelivered: (s: RouteStop) => void;
  t: (k: string) => string;
}) {
  const isArrived = stop.status === 'arrived';

  return (
    <Card className="overflow-hidden">
      {/* Accent bar — brand when pending, info when arrived */}
      <div
        className="h-1 w-full"
        style={{ background: isArrived ? 'var(--info-500)' : 'var(--brand-500)' }}
      />
      <CardBody className="flex flex-col gap-[var(--s-4)]">
        {/* Stop number + status */}
        <div className="flex items-start justify-between gap-[var(--s-3)]">
          <div className="flex items-center gap-[var(--s-2)]">
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-fs-sm shrink-0"
              style={{ background: 'var(--brand-500)' }}
            >
              {stop.sequence}
            </span>
            <div className="min-w-0">
              <p className="text-fs-md font-semibold text-[var(--fg)] leading-tight truncate">
                {stop.customer_name}
              </p>
              {stop.eta_seconds > 0 && (
                <p className="text-fs-xs text-[var(--fg-muted)]">{formatEta(stop.eta_seconds)}</p>
              )}
            </div>
          </div>
          <Badge tone={stopStatusTone(stop.status)} dot>
            {t(stop.status === 'arrived' ? 'stopStatusArrived' : 'stopStatusPending')}
          </Badge>
        </div>

        {/* Address */}
        <div className="flex items-start gap-[var(--s-2)]">
          <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--fg-muted)' }} />
          <div className="min-w-0">
            <p className="text-fs-sm text-[var(--fg)] leading-snug">{stop.address}</p>
            {stop.city && (
              <p className="text-fs-xs text-[var(--fg-muted)]">{stop.city}</p>
            )}
            {stop.needs_geocode && (
              <p className="flex items-center gap-1 text-fs-xs mt-1" style={{ color: 'var(--warning-500)' }}>
                <AlertCircleIcon className="w-3 h-3 shrink-0" />
                {t('addressNeedsAttention')}
              </p>
            )}
          </div>
        </div>

        {/* Amount */}
        {stop.total_amount > 0 && (
          <p className="text-fs-sm text-[var(--fg-muted)]">
            ₪{stop.total_amount.toFixed(0)}
          </p>
        )}

        {/* Primary actions */}
        <div className="flex flex-col gap-[var(--s-2)]">
          {/* Navigate + Call in a row */}
          <div className="flex gap-[var(--s-2)]">
            <a
              href={navUrl(stop)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="primary" size="lg" className="w-full justify-center">
                <NavigationIcon />
                {t('navigate')}
              </Button>
            </a>
            {stop.customer_phone && (
              <a href={callUrl(stop.customer_phone)}>
                <Button variant="secondary" size="lg" icon aria-label={t('callCustomer')}>
                  <PhoneIcon />
                </Button>
              </a>
            )}
          </div>

          {/* Arrived → Delivered progression */}
          {!isArrived ? (
            <Button
              variant="secondary"
              size="md"
              className="w-full justify-center"
              disabled={busy}
              onClick={() => onArrived(stop)}
            >
              <CheckIcon />
              {t('markArrived')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full justify-center"
              disabled={busy}
              onClick={() => onDelivered(stop)}
              style={{ background: 'var(--success-500)' }}
            >
              <CheckCircle2Icon />
              {t('markDelivered')}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Single row in the upcoming stops list. */
function StopRow({
  stop,
  index,
  total,
  busy,
  onMoveUp,
  onMoveDown,
  t,
}: {
  stop: RouteStop;
  index: number;
  total: number;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  t: (k: string) => string;
}) {
  const isDelivered = stop.status === 'delivered';
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      className="flex items-center gap-[var(--s-3)] py-[var(--s-3)] px-[var(--s-4)]"
      style={{
        opacity: isDelivered ? 0.5 : 1,
        borderBottom: index < total - 1 ? '1px solid var(--line)' : 'none',
      }}
    >
      {/* Sequence number */}
      <span
        className="flex items-center justify-center w-7 h-7 rounded-full text-fs-xs font-bold shrink-0"
        style={{
          background: isDelivered ? 'var(--surface-2)' : 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
          color: isDelivered ? 'var(--fg-subtle)' : 'var(--brand-500)',
        }}
      >
        {isDelivered ? <CheckIcon className="w-3.5 h-3.5" /> : stop.sequence}
      </span>

      {/* Address info */}
      <div className="flex-1 min-w-0">
        <p className="text-fs-sm font-medium text-[var(--fg)] truncate leading-tight">
          {stop.customer_name}
        </p>
        <p className="text-fs-xs text-[var(--fg-muted)] truncate">{stop.address}</p>
        {stop.eta_seconds > 0 && (
          <p className="text-fs-xs" style={{ color: 'var(--fg-subtle)' }}>
            {formatEta(stop.eta_seconds)}
          </p>
        )}
      </div>

      {/* Navigate shortcut for upcoming stops */}
      {!isDelivered && (
        <a
          href={navUrl(stop)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
        >
          <Button variant="ghost" size="sm" icon aria-label={t('navigate')}>
            <NavigationIcon />
          </Button>
        </a>
      )}

      {/* Reorder controls */}
      {!isDelivered && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={busy || isFirst}
            aria-label="Move up"
            className="flex items-center justify-center w-6 h-5 rounded text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronUpIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={busy || isLast}
            aria-label="Move down"
            className="flex items-center justify-center w-6 h-5 rounded text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Single row in the available (self-pick) deliveries list. */
function AvailableOrderRow({
  order,
  index,
  total,
  busy,
  onAdd,
  t,
}: {
  order: Order;
  index: number;
  total: number;
  busy: boolean;
  onAdd: (o: Order) => void;
  t: (k: string) => string;
}) {
  return (
    <div
      className="flex items-center gap-[var(--s-3)] py-[var(--s-3)] px-[var(--s-4)]"
      style={{ borderBottom: index < total - 1 ? '1px solid var(--line)' : 'none' }}
    >
      {/* Customer */}
      <div className="flex-1 min-w-0">
        <p className="text-fs-sm font-medium text-[var(--fg)] truncate leading-tight">
          {order.customer_name}
        </p>
        <p className="text-fs-xs text-[var(--fg-muted)] truncate mt-0.5">
          {order.delivery_address
            ? [order.delivery_address, order.delivery_city].filter(Boolean).join(', ')
            : `#${order.id}`}
        </p>
      </div>

      {/* Total */}
      {order.total_amount > 0 && (
        <span className="text-fs-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--fg-muted)' }}>
          ₪{order.total_amount.toFixed(0)}
        </span>
      )}

      {/* Add button */}
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => onAdd(order)}
        className="shrink-0"
      >
        {t('addToRoute')}
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CourierItineraryView({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { lastEvent } = useWs();
  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [tab, setTab] = useState<Tab>('assigned');
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<Order[]>([]);
  const prevEvent = useRef(lastEvent);

  const load = useCallback(async () => {
    setRoute(await getMyRoute(rid));
  }, [rid]);

  useEffect(() => { load(); }, [load]);

  const loadAvailable = useCallback(async () => {
    setAvailable(await listAvailableDeliveries(rid));
  }, [rid]);

  useEffect(() => { if (tab === 'available') loadAvailable(); }, [tab, loadAvailable]);

  // Realtime: replace state when this courier's route changes.
  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;
    if (lastEvent.type === 'route.updated') {
      const r = lastEvent.payload as unknown as DeliveryRoute;
      if (!route) { load(); return; }
      if (r?.id === route.id) setRoute(r);
    } else if (lastEvent.type.startsWith('order.')) {
      load();
    }
  }, [lastEvent, route, load]);

  const stops = useMemo(
    () => [...(route?.stops ?? [])].sort((a, b) => a.sequence - b.sequence),
    [route],
  );
  const currentStop = stops.find((s) => s.status !== 'delivered' && s.status !== 'skipped') ?? null;
  const delivered = stops.filter((s) => s.status === 'delivered').length;

  async function withBusy<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      const r = await fn();
      return r;
    } finally {
      setBusy(false);
    }
  }

  const onReoptimize = () =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await optimizeRoute(rid, route.id));
    });

  const onStart = () =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await startRoute(rid, route.id));
    });

  const onArrived = (stop: RouteStop) =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await markArrived(rid, route.id, stop.id));
    });

  const onDelivered = (stop: RouteStop) =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await markStopDelivered(rid, route.id, stop.id));
    });

  // Move a stop up/down in the sequence and persist the new order.
  const move = (stop: RouteStop, dir: -1 | 1) =>
    withBusy(async () => {
      if (!route) return;
      const ids = stops.map((s) => s.id);
      const i = ids.indexOf(stop.id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      setRoute(await reorderStops(rid, route.id, ids));
    });

  const onAdd = (order: Order) =>
    withBusy(async () => {
      if (!route) return;
      const updated = await addStops(rid, route.id, [order.id]);
      setRoute(updated);
      await loadAvailable();
    });

  // Upcoming = stops after the current one (or all when no current stop)
  const upcomingStops = currentStop
    ? stops.filter((s) => s.id !== currentStop.id)
    : stops;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--s-3)] py-20">
        <div
          className="animate-spin w-8 h-8 rounded-full border-4 border-t-transparent"
          style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }}
        />
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('deliveryRouteToday')}…</p>
      </div>
    );
  }

  // ── Route status badge tone ────────────────────────────────────────────────
  const routeTone =
    route.status === 'completed' ? 'success'
    : route.status === 'active' ? 'brand'
    : route.status === 'cancelled' ? 'danger'
    : 'neutral';

  const routeStatusLabel =
    route.status === 'draft' ? t('routeStatusDraft')
    : route.status === 'active' ? t('routeStatusActive')
    : route.status === 'completed' ? t('routeStatusCompleted')
    : route.status;

  return (
    <div className="flex flex-col gap-[var(--s-4)] pb-[var(--s-8)]">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <PageHead
        title={t('deliveryRouteToday')}
        desc={
          <span className="flex items-center gap-[var(--s-2)]">
            <Badge tone={routeTone} dot>{routeStatusLabel}</Badge>
            {route.status === 'active' && route.est_duration_s > 0 && (
              <span className="text-fs-xs text-[var(--fg-subtle)]">
                {t('etaToFinish').replace('{time}', formatEta(route.est_duration_s))}
              </span>
            )}
          </span>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || stops.length === 0}
            onClick={onReoptimize}
          >
            <ZapIcon />
            {t('reoptimize')}
          </Button>
        }
      />

      {/* ── Tab toggle: Assigned / Available ───────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="segmented">
        <TabsList>
          <Tab value="assigned">
            <RouteIcon />
            {t('assignedToMe')}
            {stops.length > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                  color: 'var(--brand-500)',
                }}
              >
                {stops.length}
              </span>
            )}
          </Tab>
          <Tab value="available">
            {t('availableCount').replace('{n}', String(available.length))}
          </Tab>
        </TabsList>

        {/* ── Assigned tab ─────────────────────────────────────────────── */}
        <TabsContent value="assigned">
          <div className="flex flex-col gap-[var(--s-4)]">
            {/* Map — ~40vh, no SSR, Leaflet requires client-only */}
            {stops.length > 0 && (
              <div className="rounded-lg overflow-hidden border border-[var(--line)] shadow-1" style={{ height: '40vh' }}>
                <DeliveryMap stops={stops} className="h-full w-full" />
              </div>
            )}

            {/* Progress bar */}
            {stops.length > 0 && (
              <RouteProgress delivered={delivered} total={stops.length} />
            )}

            {/* Start button (draft state) */}
            {route.status === 'draft' && stops.length > 0 && (
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                disabled={busy}
                onClick={onStart}
              >
                <RouteIcon />
                {t('startRoute')}
              </Button>
            )}

            {/* Current-stop hero card */}
            {currentStop ? (
              <CurrentStopCard
                stop={currentStop}
                busy={busy}
                onArrived={onArrived}
                onDelivered={onDelivered}
                t={t}
              />
            ) : stops.length === 0 ? (
              <NoStopsCard t={t} />
            ) : null}

            {/* Upcoming stops list */}
            {upcomingStops.length > 0 && (
              <Card>
                <div>
                  {upcomingStops.map((s, i) => (
                    <StopRow
                      key={s.id}
                      stop={s}
                      index={i}
                      total={upcomingStops.length}
                      busy={busy}
                      onMoveUp={() => move(s, -1)}
                      onMoveDown={() => move(s, 1)}
                      t={t}
                    />
                  ))}
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Available tab ────────────────────────────────────────────── */}
        <TabsContent value="available">
          {available.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-[var(--s-3)] py-16 text-center rounded-lg border border-dashed"
              style={{ borderColor: 'var(--line)', color: 'var(--fg-subtle)' }}
            >
              <PackageIcon className="w-10 h-10 opacity-40" />
              <p className="text-fs-sm font-medium">{t('noAvailableDeliveries')}</p>
            </div>
          ) : (
            <Card>
              <div>
                {available.map((order, i) => (
                  <AvailableOrderRow
                    key={order.id}
                    order={order}
                    index={i}
                    total={available.length}
                    busy={busy}
                    onAdd={onAdd}
                    t={t}
                  />
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
