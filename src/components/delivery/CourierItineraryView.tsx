'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n, useCurrency } from '@/lib/i18n';
import { useWs } from '@/lib/ws-context';
import {
  getMyRoute, startRoute, markArrived, markStopDelivered, reorderStops, optimizeRoute,
  listAvailableDeliveries, addStops,
  type DeliveryRoute, type RouteStop,
} from '@/lib/delivery';
import type { Order } from '@/lib/api';
import { navUrl, callUrl, whatsappUrl } from '@/lib/delivery-links';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import {
  buildDeliveryEtaLabel,
  buildDeliveryEtaMessage,
  deliveryEtaWindow,
  type DeliveryEtaWindow,
} from '@/lib/delivery-planning';
import { useLocationReporter } from '@/lib/useLocationReporter';
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
  MapIcon,
  Maximize2Icon,
  Minimize2Icon,
  PackageIcon,
  UserRoundIcon,
  MessageCircleIcon,
} from 'lucide-react';

// ── Dynamic import: Leaflet crashes on SSR ────────────────────────────────────
const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'assigned' | 'available';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(seconds: number, t: (k: string) => string): string {
  if (seconds <= 0) return '';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ${t('unitMin')}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}${t('unitHour')} ${rem}${t('unitMin')}` : `${h}${t('unitHour')}`;
}

function stopStatusTone(status: RouteStop['status']): 'success' | 'info' | 'neutral' {
  if (status === 'delivered') return 'success';
  if (status === 'arrived') return 'info';
  return 'neutral';
}

function stopAddress(stop: RouteStop, t: (k: string) => string) {
  return formatDeliveryAddress({
    address: stop.address,
    city: stop.city,
    floor: stop.delivery_floor,
    apt: stop.delivery_apt,
    entryCode: stop.delivery_entry_code,
  }, t);
}

function stopWhatsappMessage(
  stop: RouteStop,
  etaWindow: DeliveryEtaWindow | null,
  t: (k: string) => string,
): string {
  return buildDeliveryEtaMessage(
    t(etaWindow ? 'deliveryEtaWhatsappTemplate' : 'deliveryEtaWhatsappTemplateNoTime'),
    stop,
    etaWindow,
  );
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
  etaWindow,
  t,
}: {
  stop: RouteStop;
  etaWindow: DeliveryEtaWindow | null;
  t: (k: string) => string;
}) {
  const { money } = useCurrency();
  const isArrived = stop.status === 'arrived';
  const address = stopAddress(stop, t);
  const deliveryNotes = stop.delivery_notes?.trim();
  const expectedArrival = etaWindow
    ? buildDeliveryEtaLabel(t('deliveryExpectedArrival'), etaWindow)
    : null;

  return (
    <div
      className="relative flex items-stretch border-b border-[var(--line)]"
      style={{ background: 'color-mix(in oklab, var(--brand-500) 4%, var(--surface))' }}
      aria-current="step"
    >
      <div className="relative flex w-[76px] shrink-0 flex-col items-center px-2 py-5 text-center">
        <span className="num text-fs-lg font-semibold text-[var(--brand-600)]">
          {String(stop.sequence).padStart(2, '0')}
        </span>
        {etaWindow && (
          <span className="num mt-2 text-[11px] font-medium leading-tight text-[var(--fg-muted)]">
            {etaWindow.start}<br />{etaWindow.end}
          </span>
        )}
        <span className="absolute bottom-0 top-[76px] w-0.5 rounded-full bg-[var(--brand-500)]" />
      </div>

      <div className="min-w-0 flex-1 py-5 pe-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fs-xl font-semibold leading-snug text-[var(--fg)]">
              {address?.line1 || stop.customer_name}
            </p>
            {address?.line2 && (
              <p className="mt-1 text-fs-xs font-medium text-[var(--fg-muted)]">{address.line2}</p>
            )}
          </div>
          <span className="num shrink-0 rounded-r-md bg-[var(--surface-2)] px-2.5 py-1.5 text-fs-xs font-semibold text-[var(--brand-600)]">
            #{stop.order_id}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-fs-sm text-[var(--fg-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <UserRoundIcon className="h-3.5 w-3.5" />
            {stop.customer_name}
          </span>
          {stop.customer_phone && <span className="num" dir="ltr">{stop.customer_phone}</span>}
          {stop.total_amount > 0 && <span className="num">{money(stop.total_amount, { decimals: 0 })}</span>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={stopStatusTone(stop.status)} dot>
            {t(isArrived ? 'stopStatusArrived' : 'stopStatusPending')}
          </Badge>
          {expectedArrival && (
            <span className="text-fs-xs font-medium leading-snug text-[var(--info-500)]">{expectedArrival}</span>
          )}
        </div>

        {stop.needs_geocode && (
          <p className="mt-2 flex items-center gap-1 text-fs-xs text-[var(--warning-500)]">
            <AlertCircleIcon className="h-3 w-3 shrink-0" />
            {t('addressNeedsAttention')}
          </p>
        )}

        {deliveryNotes && (
          <div className="mt-3 rounded-r-md border-s-2 border-[var(--brand-300)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">{t('deliveryNotes')}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-fs-sm text-[var(--fg)]">{deliveryNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Single row in the upcoming stops list. */
function StopRow({
  stop,
  etaWindow,
  index,
  total,
  busy,
  onMoveUp,
  onMoveDown,
  t,
}: {
  stop: RouteStop;
  etaWindow: DeliveryEtaWindow | null;
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
  const address = stopAddress(stop, t);
  const deliveryNotes = stop.delivery_notes?.trim();
  const expectedArrival = etaWindow
    ? buildDeliveryEtaLabel(t('deliveryExpectedArrival'), etaWindow)
    : null;

  return (
    <div
      className="relative flex items-stretch"
      style={{
        opacity: isDelivered ? 0.5 : 1,
        borderBottom: index < total - 1 ? '1px solid var(--line)' : 'none',
      }}
    >
      <div className="relative flex w-[76px] shrink-0 flex-col items-center px-2 py-5 text-center">
        <span className="num text-fs-md font-medium text-[var(--fg-muted)]">
          {isDelivered ? <CheckIcon className="h-4 w-4" /> : String(stop.sequence).padStart(2, '0')}
        </span>
        {etaWindow && (
          <span className="num mt-2 text-[11px] leading-tight text-[var(--fg-subtle)]">
            {etaWindow.start}<br />{etaWindow.end}
          </span>
        )}
        {index < total - 1 && (
          <span className="absolute bottom-0 top-[76px] w-0.5 rounded-full bg-[var(--brand-300)]" />
        )}
      </div>

      <div className="min-w-0 flex-1 py-5 pe-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fs-lg font-semibold leading-snug text-[var(--fg)]">
              {address?.line1 || stop.customer_name}
            </p>
          </div>
          <span className="num shrink-0 rounded-r-md bg-[var(--surface-2)] px-2.5 py-1.5 text-fs-xs font-semibold text-[var(--fg-muted)]">
            #{stop.order_id}
          </span>
        </div>
        {address?.line2 && (
          <p className="mt-1 text-fs-xs font-medium text-[var(--fg-muted)]">{address.line2}</p>
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 text-fs-sm text-[var(--fg-muted)]">
          <UserRoundIcon className="h-3.5 w-3.5" />
          {stop.customer_name}
        </p>
        {deliveryNotes && (
          <p className="mt-1 line-clamp-2 text-fs-xs text-[var(--fg-subtle)]">
            {t('deliveryNotes')}: {deliveryNotes}
          </p>
        )}
        {expectedArrival ? (
          <p className="mt-2 text-fs-xs font-medium leading-snug text-[var(--info-500)]">
            {expectedArrival}
          </p>
        ) : stop.eta_seconds > 0 ? (
          <p className="text-fs-xs" style={{ color: 'var(--fg-subtle)' }}>
            {formatEta(stop.eta_seconds, t)}
          </p>
        ) : null}
        {!isDelivered && (
          <div className="mt-3 flex items-center gap-1">
            <a href={navUrl(stop)} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
                <NavigationIcon />
                {t('navigate')}
              </Button>
            </a>
            {stop.customer_phone && (
              <a
                href={whatsappUrl(stop.customer_phone, stopWhatsappMessage(stop, etaWindow, t))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('deliveryPlanWhatsApp')}
                title={t('deliveryPlanWhatsApp')}
              >
                <Button variant="ghost" size="sm" icon>
                  <MessageCircleIcon />
                </Button>
              </a>
            )}
            <Button variant="ghost" size="sm" icon onClick={onMoveUp} disabled={busy || isFirst} aria-label={t('moveUp')}>
              <ChevronUpIcon />
            </Button>
            <Button variant="ghost" size="sm" icon onClick={onMoveDown} disabled={busy || isLast} aria-label={t('moveDown')}>
              <ChevronDownIcon />
            </Button>
          </div>
        )}
      </div>
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
  const { money } = useCurrency();
  const address = formatDeliveryAddress({
    address: order.delivery_address,
    city: order.delivery_city,
    floor: order.delivery_floor,
    apt: order.delivery_apt,
    entryCode: order.delivery_entry_code,
  }, t);
  const deliveryNotes = order.delivery_notes?.trim();

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
        <p className="text-fs-xs text-[var(--fg-muted)] truncate mt-0.5">{address?.line1 || `#${order.id}`}</p>
        {address?.line2 && (
          <p className="text-fs-xs font-medium text-[var(--fg-muted)] truncate">{address.line2}</p>
        )}
        {deliveryNotes && (
          <p className="text-fs-xs text-[var(--fg-subtle)] line-clamp-2 mt-0.5">
            {t('deliveryNotes')}: {deliveryNotes}
          </p>
        )}
      </div>

      {/* Total */}
      {order.total_amount > 0 && (
        <span className="text-fs-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--fg-muted)' }}>
          {money(order.total_amount, { decimals: 0 })}
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
  const { t, locale } = useI18n();
  const { lastEvent } = useWs();
  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [tab, setTab] = useState<Tab>('assigned');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<Order[]>([]);
  const [mapExpanded, setMapExpanded] = useState(false);
  const prevEvent = useRef(lastEvent);
  const { denied: locationDenied } = useLocationReporter(rid, route?.status === 'active');

  const load = useCallback(async () => {
    try {
      setError(null);
      setRoute(await getMyRoute(rid));
    } catch (e) {
      setError((e as Error)?.message || 'load failed');
    }
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

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error)?.message || 'action failed');
      await load();
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

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (!route) {
    if (error) {
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
    <div className="flex flex-col gap-[var(--s-4)] pb-28">
      {/* ── Inline error banner ─────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-lg text-fs-sm"
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
      {/* ── Location off notice (non-blocking) ─────────────────────── */}
      {locationDenied && (
        <p className="text-fs-xs text-[var(--fg-muted)]">{t('locationOffNotice')}</p>
      )}
      {/* ── Page header ────────────────────────────────────────────────── */}
      <PageHead
        title={t('deliveryRouteToday')}
        desc={
          <span className="flex items-center gap-[var(--s-2)]">
            <Badge tone={routeTone} dot>{routeStatusLabel}</Badge>
            {route.status === 'active' && route.est_duration_s > 0 && (
              <span className="text-fs-xs text-[var(--fg-subtle)]">
                {t('etaToFinish').replace('{time}', formatEta(route.est_duration_s, t))}
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
            {/* Compact route overview. The timeline remains the primary surface. */}
            {stops.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-fs-sm font-semibold text-[var(--fg)]">
                      {formatEta(route.est_duration_s, t) || '—'} · {stops.length} {t('deliveryPlanStops')}
                    </p>
                    <p className="text-[11px] text-[var(--fg-subtle)]">
                      {delivered}/{stops.length} · {routeStatusLabel}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMapExpanded((current) => !current)}
                    aria-expanded={mapExpanded}
                  >
                    <MapIcon />
                    {t(mapExpanded ? 'deliveryMapCollapse' : 'deliveryMapExpand')}
                    {mapExpanded ? <Minimize2Icon /> : <Maximize2Icon />}
                  </Button>
                </div>
                <div className={`transition-[height] duration-slow ease-out ${mapExpanded ? 'h-[42vh] min-h-[320px]' : 'h-44 sm:h-52'}`}>
                  <DeliveryMap stops={stops} className="h-full w-full" />
                </div>
              </Card>
            )}

            {/* Progress bar */}
            {stops.length > 0 && (
              <RouteProgress delivered={delivered} total={stops.length} />
            )}

            {stops.length === 0 ? (
              <NoStopsCard t={t} />
            ) : (
              <Card className="overflow-hidden">
                {stops.map((stop, index) => (
                  stop.id === currentStop?.id ? (
                    <CurrentStopCard
                      key={stop.id}
                      stop={stop}
                      etaWindow={deliveryEtaWindow(route, stop, locale)}
                      t={t}
                    />
                  ) : (
                    <StopRow
                      key={stop.id}
                      stop={stop}
                      etaWindow={deliveryEtaWindow(route, stop, locale)}
                      index={index}
                      total={stops.length}
                      busy={busy}
                      onMoveUp={() => move(stop, -1)}
                      onMoveDown={() => move(stop, 1)}
                      t={t}
                    />
                  )
                ))}
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

      {tab === 'assigned' && route.status === 'draft' && stops.length > 0 && (
        <div
          className="sticky bottom-3 z-[450] rounded-r-xl border border-[var(--line-strong)] p-3 shadow-3 backdrop-blur-xl pb-[max(var(--s-3),env(safe-area-inset-bottom))]"
          style={{ background: 'color-mix(in oklab, var(--surface) 92%, transparent)' }}
        >
          <Button variant="primary" size="lg" className="w-full justify-center" disabled={busy} onClick={onStart}>
            <RouteIcon />
            {t('startRoute')}
          </Button>
        </div>
      )}

      {tab === 'assigned' && route.status === 'active' && currentStop && (
        <div
          className="sticky bottom-3 z-[450] flex gap-2 rounded-r-xl border border-[var(--line-strong)] p-3 shadow-3 backdrop-blur-xl pb-[max(var(--s-3),env(safe-area-inset-bottom))]"
          style={{ background: 'color-mix(in oklab, var(--surface) 92%, transparent)' }}
        >
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <a href={navUrl(currentStop)} target="_blank" rel="noopener noreferrer">
              <NavigationIcon />
              {t('navigate')}
            </a>
          </Button>
          {currentStop.customer_phone && (
            <Button asChild variant="secondary" size="lg" icon aria-label={t('deliveryPlanWhatsApp')}>
              <a
                href={whatsappUrl(currentStop.customer_phone, stopWhatsappMessage(
                  currentStop,
                  deliveryEtaWindow(route, currentStop, locale),
                  t,
                ))}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircleIcon />
              </a>
            </Button>
          )}
          {currentStop.customer_phone && (
            <Button asChild variant="secondary" size="lg" icon aria-label={t('callCustomer')}>
              <a href={callUrl(currentStop.customer_phone)}><PhoneIcon /></a>
            </Button>
          )}
          {currentStop.status === 'arrived' ? (
            <Button
              variant="primary"
              size="lg"
              className="flex-1 bg-[var(--success-500)] hover:brightness-95"
              disabled={busy}
              onClick={() => onDelivered(currentStop)}
            >
              <CheckCircle2Icon />
              {t('markDelivered')}
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="flex-1" disabled={busy} onClick={() => onArrived(currentStop)}>
              <CheckIcon />
              {t('markArrived')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
