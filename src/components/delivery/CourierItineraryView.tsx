'use client';

import { DeliveryDuration } from '@/components/delivery/DeliveryDuration';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n, useCurrency } from '@/lib/i18n';
import { useWs } from '@/lib/ws-context';
import {
  getMyRoutes, checkMyRouteNavigation, startRoute, markArrived, markStopDelivered, reorderStops, optimizeRoute,
  updateRouteSettings, updateMyStopAddress,
  type DeliveryRoute, type RouteSettingsInput, type RouteStop, type StopAddressInput,
} from '@/lib/delivery';
import { deliveryRoutingError } from '@/lib/delivery-planning';
import { callUrl, whatsappUrl } from '@/lib/delivery-links';
import { NavigationAppMenu } from '@/components/delivery/NavigationAppMenu';
import { RouteSettingsEditor } from '@/components/delivery/RouteSettingsEditor';
import { CourierAddressEditor } from '@/components/delivery/CourierAddressEditor';
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
  ConfirmDialog,
} from '@/components/ds';
import {
  PhoneIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  RouteIcon,
  ZapIcon,
  AlertCircleIcon,
  MapPinIcon,
  FlagIcon,
  Maximize2Icon,
  Minimize2Icon,
  PackageIcon,
  UserRoundIcon,
  MessageCircleIcon,
  PencilIcon,
} from 'lucide-react';

// ── Dynamic import: Leaflet crashes on SSR ────────────────────────────────────
const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

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

/** Optional route endpoint rendered as part of the courier's stop timeline. */
function RouteEndpointRow({
  kind,
  address,
  lat,
  lng,
  t,
}: {
  kind: 'start' | 'end';
  address: string;
  lat?: number | null;
  lng?: number | null;
  t: (k: string) => string;
}) {
  const isStart = kind === 'start';
  const Icon = isStart ? MapPinIcon : FlagIcon;
  const accent = isStart ? 'var(--success-500)' : 'var(--danger-500)';

  return (
    <div
      className={`relative flex items-stretch ${isStart ? 'border-b border-[var(--line)]' : ''}`}
      style={{ background: `color-mix(in oklab, ${accent} 5%, var(--surface))` }}
    >
      <div className="relative flex w-16 shrink-0 justify-center py-4 sm:w-[76px]">
        <span
          className={`absolute start-1/2 w-0.5 -translate-x-1/2 ${
            isStart ? 'bg-[var(--success-500)]' : 'bg-[var(--danger-500)]'
          } ${
            isStart ? 'bottom-0 top-8' : 'bottom-8 top-0'
          }`}
          aria-hidden="true"
        />
        <span
          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border shadow-1 ${
            isStart
              ? 'border-[var(--success-500)] bg-[var(--success-50)] text-[var(--success-500)]'
              : 'border-[var(--danger-500)] bg-[var(--danger-50)] text-[var(--danger-500)]'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0 flex-1 py-3.5 pe-4">
        <Badge tone={isStart ? 'success' : 'danger'} dot>
          {t(isStart ? 'routeTimelineStartReminder' : 'routeTimelineTerminus')}
        </Badge>
        <p className="mt-2 break-words text-fs-md font-semibold leading-snug text-[var(--fg)] sm:text-fs-lg">
          {address}
        </p>
        <NavigationAppMenu
          destination={{ address, lat, lng }}
          variant="ghost"
          size="sm"
          className="mt-2 -ms-2"
          label={t('navigate')}
          t={t}
        />
      </div>
    </div>
  );
}

/** Hero card for the currently active stop. */
function CurrentStopCard({
  stop,
  etaWindow,
  hasFollowing,
  busy,
  onEditAddress,
  onDelivered,
  onArrived,
  canDeliver,
  t,
}: {
  stop: RouteStop;
  etaWindow: DeliveryEtaWindow | null;
  hasFollowing: boolean;
  busy: boolean;
  onEditAddress: () => void;
  onDelivered: () => void;
  onArrived: () => void;
  canDeliver: boolean;
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
      className={`relative flex items-stretch ${hasFollowing ? 'border-b border-[var(--line)]' : ''}`}
      style={{ background: 'color-mix(in oklab, var(--brand-500) 4%, var(--surface))' }}
      aria-current="step"
      data-stop-id={stop.id}
    >
      <div className="relative flex w-16 shrink-0 flex-col items-center px-2 py-4 text-center sm:w-[76px] sm:py-5">
        <span className="num text-fs-md font-semibold text-[var(--brand-600)] sm:text-fs-lg">
          {String(stop.sequence).padStart(2, '0')}
        </span>
        {etaWindow && (
          <span className="num mt-2 text-[11px] font-medium leading-tight text-[var(--fg-muted)]">
            {etaWindow.start}<br />{etaWindow.end}
          </span>
        )}
        {hasFollowing && (
          <span className="absolute bottom-0 top-[76px] w-0.5 rounded-full bg-[var(--brand-500)]" />
        )}
      </div>

      <div className="min-w-0 flex-1 py-5 pe-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fs-lg font-semibold leading-snug text-[var(--fg)] sm:text-fs-xl">
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

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <NavigationAppMenu destination={stop} variant="ghost" size="sm" label={t('navigate')} t={t} />
          <Button variant="ghost" size="sm" onClick={onEditAddress} disabled={busy}>
            <PencilIcon />
            {t('correctAddress')}
          </Button>
          {stop.customer_phone && (
            <a
              href={whatsappUrl(stop.customer_phone, stopWhatsappMessage(stop, etaWindow, t))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('deliveryPlanWhatsApp')}
              title={t('deliveryPlanWhatsApp')}
            >
              <Button variant="ghost" size="sm" icon><MessageCircleIcon /></Button>
            </a>
          )}
        </div>

        <CourierStopActions stop={stop} busy={busy} canDeliver={canDeliver} onDelivered={onDelivered} onArrived={onArrived} t={t} />

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
  onEditAddress,
  hasFollowingEndpoint,
  onDelivered,
  canDeliver,
  t,
}: {
  stop: RouteStop;
  etaWindow: DeliveryEtaWindow | null;
  index: number;
  total: number;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditAddress: () => void;
  hasFollowingEndpoint: boolean;
  onDelivered: () => void;
  canDeliver: boolean;
  t: (k: string) => string;
}) {
  const isDelivered = stop.status === 'delivered' || stop.status === 'skipped';
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
      data-stop-id={stop.id}
      style={{
        opacity: isDelivered ? 0.5 : 1,
        borderBottom: index < total - 1 || hasFollowingEndpoint ? '1px solid var(--line)' : 'none',
      }}
    >
      <div className="relative flex w-16 shrink-0 flex-col items-center px-2 py-4 text-center sm:w-[76px] sm:py-5">
        <span className="num text-fs-md font-medium text-[var(--fg-muted)]">
          {isDelivered ? <CheckIcon className="h-4 w-4" /> : String(stop.sequence).padStart(2, '0')}
        </span>
        {etaWindow && (
          <span className="num mt-2 text-[11px] leading-tight text-[var(--fg-subtle)]">
            {etaWindow.start}<br />{etaWindow.end}
          </span>
        )}
        {(index < total - 1 || hasFollowingEndpoint) && (
          <span className="absolute bottom-0 top-[76px] w-0.5 rounded-full bg-[var(--brand-300)]" />
        )}
      </div>

      <div className="min-w-0 flex-1 py-5 pe-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fs-md font-semibold leading-snug text-[var(--fg)] sm:text-fs-lg">
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
        {!isDelivered && <CourierStopActions stop={stop} busy={busy} canDeliver={canDeliver} onDelivered={onDelivered} t={t} />}
        {!isDelivered && (
          <div className="mt-3 flex items-center gap-1">
            <NavigationAppMenu destination={stop} variant="ghost" size="sm" label={t('navigate')} t={t} />
            <Button variant="ghost" size="sm" icon onClick={onEditAddress} disabled={busy} aria-label={t('correctAddress')} title={t('correctAddress')}>
              <PencilIcon />
            </Button>
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

// ── Main component ────────────────────────────────────────────────────────────

function CourierRouteView({ rid, assignedRoute, onReload, canStart, reportLocation, onCompleted }: { rid: number; assignedRoute: DeliveryRoute; onReload: () => Promise<void>; canStart: boolean; reportLocation: boolean; onCompleted: (route: DeliveryRoute) => void }) {
  const { t, locale } = useI18n();
  const [route, setRoute] = useState<DeliveryRoute>(assignedRoute);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [addressEditorStop, setAddressEditorStop] = useState<RouteStop | null>(null);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const { denied: locationDenied } = useLocationReporter(rid, reportLocation && route.status === 'active');

  const load = onReload;
  useEffect(() => { setRoute(assignedRoute); }, [assignedRoute]);

  // Completion, reordering and GPS updates must not repeat paid address checks.
  const navigationKey = JSON.stringify([...route.stops].sort((a, b) => a.id - b.id).map(stop => [stop.id, stop.address, stop.city, stop.lat, stop.lng]));
  const [navigationChecks, setNavigationChecks] = useState<{ key: string; values: Map<number, boolean> } | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(true);
  const [navigationUnavailable, setNavigationUnavailable] = useState(false);
  const [navigationRetry, setNavigationRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setNavigationLoading(true);
    checkMyRouteNavigation(rid, route.id, controller.signal).then(checks => {
      if (!controller.signal.aborted) { setNavigationChecks({ key: navigationKey, values: new Map(checks.map(check => [check.stop_id, check.verified])) }); setNavigationUnavailable(checks.some(check => check.reason === 'unavailable')); }
    }).catch(() => {
      if (!controller.signal.aborted) { setNavigationChecks({ key: navigationKey, values: new Map() }); setNavigationUnavailable(true); }
    }).finally(() => { if (!controller.signal.aborted) setNavigationLoading(false); });
    return () => controller.abort();
  }, [rid, route.id, navigationKey, navigationRetry]);
  const stops = useMemo(
    () => route.stops.map(stop => ({ ...stop, navigation_verified: navigationChecks?.key === navigationKey && navigationChecks.values.get(stop.id) === true })).sort((a, b) => a.sequence - b.sequence),
    [route.stops, navigationChecks, navigationKey],
  );
  const navigationUnverified = stops.filter(stop => stop.status !== 'delivered' && stop.status !== 'skipped' && !stop.navigation_verified);

  const currentStop = stops.find((s) => s.status !== 'delivered' && s.status !== 'skipped') ?? null;
  const delivered = stops.filter((s) => s.status === 'delivered').length;
  const unresolvedStops = stops.filter((s) => s.needs_geocode && s.status !== 'delivered' && s.status !== 'skipped');
  const locatedStops = stops.length - unresolvedStops.length;

  async function withBusy<T>(fn: () => Promise<T>, failureKey = 'deliveryPlanFailed'): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      await load();
      setError(deliveryRoutingError(e,t) ?? t(failureKey));
    } finally {
      setBusy(false);
    }
  }

  const onReoptimize = () =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await optimizeRoute(rid, route.id, undefined, true));
    });

  const startNow = () =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await startRoute(rid, route.id));
      await onReload();
    });

  const onStart = () => {
    if (unresolvedStops.length > 0 || navigationUnverified.length > 0) {
      setStartConfirmOpen(true);
      return;
    }
    void startNow();
  };

  const onSaveStopAddress = async (input: StopAddressInput) => {
    if (!route || !addressEditorStop) return;
    setError(null);
    const updated = await updateMyStopAddress(rid, route.id, addressEditorStop.id, input);
    setRoute(updated);
  };

  const onSaveSettings = async (input: RouteSettingsInput) => {
    if (!route) return;
    setBusy(true);
    setError(null);
    try {
      setRoute(await updateRouteSettings(rid, route.id, input, true));
    } catch (cause) {
      setError(deliveryRoutingError(cause, t) ?? t('routeSettingsSaveFailed'));
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const onArrived = (stop: RouteStop) =>
    withBusy(async () => {
      if (!route) return;
      setRoute(await markArrived(rid, route.id, stop.id));
    });

  const onDelivered = (stop: RouteStop) =>
    withBusy(async () => {
      if (!route) return;
      const updated = await markStopDelivered(rid, route.id, stop.id);
      setRoute(updated);
      if (updated.status === 'completed') onCompleted(updated);
      await onReload();
    }, 'courierDeliveryFailed');

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
    <div className="flex flex-col gap-3 pb-4 sm:gap-[var(--s-4)]">
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
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>
      )}
      {/* ── Location off notice (non-blocking) ─────────────────────── */}
      {locationDenied && (
        <p className="text-fs-xs text-[var(--fg-muted)]">{t('locationOffNotice')}</p>
      )}
      {/* Route state sits below the courier shell without repeating its title. */}
      <div className="flex min-h-8 items-center justify-between gap-3 px-1 sm:px-0">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone={routeTone} dot>{routeStatusLabel}</Badge>
          <span className="truncate text-fs-xs text-[var(--fg-muted)]">
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${route.date.slice(0, 10)}T12:00:00`))} · {route.status === 'active' && route.est_duration_s > 0
              ? t('etaToFinish').replace('{time}', formatEta(route.est_duration_s, t))
              : `${stops.length} ${t('deliveryPlanStops')}`}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 sm:px-3"
          disabled={busy || stops.length === 0}
          onClick={onReoptimize}
        >
          <ZapIcon />
          {t('reoptimize')}
        </Button>
      </div>

          <div className="flex flex-col gap-[var(--s-4)]">
            {stops.length > 0 && (
              <RouteSettingsEditor
                route={route}
                locale={locale}
                disabled={busy || route.status !== 'draft'}
                onSave={onSaveSettings}
                t={t}
              />
            )}

            {/* Compact route overview. The timeline remains the primary surface. */}
            {stops.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-fs-sm font-semibold text-[var(--fg)]">
                      {unresolvedStops.length > 0 ? `${locatedStops}/${stops.length}` : stops.length} {t('deliveryPlanStops')}
                    </p>
                    <DeliveryDuration route={route} t={t} />
                    {(route.needs_recalculation || unresolvedStops.length > 0) && (
                      <p className="mt-0.5 text-[11px] text-[var(--warning-500)]">{t(route.needs_recalculation ? 'deliveryRouteNeedsRecalculation' : 'routeEstimatePartial')}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-2"
                    onClick={() => setMapExpanded((current) => !current)}
                    aria-expanded={mapExpanded}
                    aria-label={t(mapExpanded ? 'deliveryMapCollapse' : 'deliveryMapExpand')}
                  >
                    {t(mapExpanded ? 'deliveryMapCollapse' : 'deliveryMapExpand')}
                    {mapExpanded ? <Minimize2Icon /> : <Maximize2Icon />}
                  </Button>
                </div>
                <div className={`overflow-hidden transition-[height] duration-slow ease-out ${mapExpanded ? 'h-[42vh] min-h-[280px] sm:min-h-[320px]' : reportLocation ? 'h-0 sm:h-52' : 'h-0'}`}>
                  {(mapExpanded || reportLocation) && <DeliveryMap
                    restaurantId={rid}
                    geometry={route.route_geometry}
                    routingProvider={route.routing_provider}
                    stops={stops}
                    start={route.start_lat != null && route.start_lng != null ? { lat: route.start_lat, lng: route.start_lng } : undefined}
                    end={route.end_lat != null && route.end_lng != null ? { lat: route.end_lat, lng: route.end_lng } : undefined}
                    className="h-full w-full"
                  />}
                </div>
              </Card>
            )}

            {/* Progress bar */}
            {stops.length > 0 && (
              <RouteProgress delivered={delivered} total={stops.length} />
            )}

            {unresolvedStops.length > 0 && (
              <div className="flex items-start gap-3 rounded-r-lg border border-[var(--warning-500)]/30 bg-[var(--warning-50)] px-4 py-3">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-500)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-fs-sm font-medium text-[var(--fg)]">
                    {t('unlocatedStopsCount').replace('{count}', String(unresolvedStops.length))}
                  </p>
                  <p className="mt-0.5 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('unlocatedStopsExplanation')}</p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" disabled={busy} onClick={onReoptimize}>
                  {t('retry')}
                </Button>
              </div>
            )}

            {!navigationLoading && navigationUnavailable && <div role="alert" className="rounded-r-lg border border-[var(--warning-500)]/30 p-3 text-fs-sm text-[var(--fg-muted)]"><p>{t('navigationCheckUnavailable')}</p><Button variant="secondary" size="sm" onClick={() => setNavigationRetry(value => value + 1)}>{t('retry')}</Button></div>}
            {navigationLoading ? <p role="status" className="text-fs-xs text-[var(--fg-muted)]">{t('navigationCheckLoading')}</p> : navigationUnverified.length > 0 && <p role="alert" className="text-fs-sm text-[var(--warning-500)]">{t('navigationReviewCount').replace('{count}', String(navigationUnverified.length))}</p>}
            {route.status === 'draft' && stops.length > 0 && (
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center shadow-2"
                disabled={busy || !canStart || navigationLoading}
                onClick={onStart}
              >
                <RouteIcon />
                {t('startRoute')}
              </Button>
            )}

            {route.status === 'draft' && !canStart && <p className="text-fs-xs text-[var(--fg-muted)]">{t('courierFinishCurrentRoute')}</p>}
            {stops.length === 0 ? (
              <NoStopsCard t={t} />
            ) : (
              <Card className="overflow-hidden">
                {route.start_address && (
                  <RouteEndpointRow
                    kind="start"
                    address={route.start_address}
                    lat={route.start_lat}
                    lng={route.start_lng}
                    t={t}
                  />
                )}
                {stops.map((stop, index) => (
                  stop.id === currentStop?.id ? (
                    <CurrentStopCard
                      key={stop.id}
                      stop={stop}
                      etaWindow={deliveryEtaWindow(route, stop, locale)}
                      hasFollowing={index < stops.length - 1 || !!route.end_address}
                      busy={busy}
                      onEditAddress={() => setAddressEditorStop(stop)}
                      onDelivered={() => void onDelivered(stop)}
                      onArrived={() => void onArrived(stop)}
                      canDeliver={route.status === 'active'}
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
                      onEditAddress={() => setAddressEditorStop(stop)}
                      onDelivered={() => void onDelivered(stop)}
                      canDeliver={route.status === 'active'}
                      hasFollowingEndpoint={!!route.end_address}
                      t={t}
                    />
                  )
                ))}
                {route.end_address && (
                  <RouteEndpointRow
                    kind="end"
                    address={route.end_address}
                    lat={route.end_lat}
                    lng={route.end_lng}
                    t={t}
                  />
                )}
              </Card>
            )}
          </div>


      <CourierAddressEditor
        open={addressEditorStop != null}
        onOpenChange={(open) => { if (!open) setAddressEditorStop(null); }}
        restaurantId={rid}
        stop={addressEditorStop}
        onSave={onSaveStopAddress}
        t={t}
      />

      <ConfirmDialog
        open={startConfirmOpen}
        onOpenChange={setStartConfirmOpen}
        title={t('navigationUnverifiedTitle')}
        description={t('navigationReviewBeforeStart').replace('{count}', String(navigationUnverified.length))}
        confirmLabel={t('startAnyway')}
        cancelLabel={t('back')}
        onConfirm={() => { setStartConfirmOpen(false); void startNow(); }}
      />
    </div>
  );
}

/** Direct assigned-delivery list, with one section per current or future route. */
export default function CourierItineraryView({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { lastEvent } = useWs();
  const [routes, setRoutes] = useState<DeliveryRoute[] | null>(null);
  const [completedDestination, setCompletedDestination] = useState<DeliveryRoute | null>(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await getMyRoutes(rid);
      if (id === requestId.current) { setRoutes(next); setError(false); }
    } catch {
      if (id === requestId.current) setError(true);
    }
  }, [rid]);
  useEffect(() => { setRoutes(null); setCompletedDestination(null); void load(); return () => { requestId.current++; }; }, [load]);
  useEffect(() => {
    if (lastEvent?.type === 'route.updated' || lastEvent?.type.startsWith('order.')) void load();
  }, [lastEvent, load]);
  return (
    <div className="space-y-6">
      {error && <Card><CardBody><p role="alert">{t('couldNotLoad')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></CardBody></Card>}
      {routes === null && !error && <p role="status" className="py-12 text-center text-[var(--fg-muted)]">{t('loading')}</p>}
      {completedDestination?.end_address && <section aria-label={t('routeTimelineTerminus')}><Card className="overflow-hidden"><RouteEndpointRow kind="end" address={completedDestination.end_address} lat={completedDestination.end_lat} lng={completedDestination.end_lng} t={t} /><div className="flex justify-end p-2"><Button variant="ghost" size="sm" onClick={() => setCompletedDestination(null)}>{t('close')}</Button></div></Card></section>}
      {routes?.length === 0 && <NoStopsCard t={t} />}
      {routes?.map(route => <section data-route-id={route.id} key={`${rid}:${route.id}`} aria-label={`${t('assignedToMe')} · ${route.date.slice(0, 10)}`}><CourierRouteView rid={rid} assignedRoute={route} onReload={load} canStart={!routes.some(other => other.status === 'active' && other.id !== route.id)} reportLocation={route.id === routes.find(other => other.status === 'active')?.id} onCompleted={finished => { if (finished.end_address) setCompletedDestination(finished); }} /></section>)}
    </div>
  );
}

function CourierStopActions({ stop, busy, canDeliver, onDelivered, onArrived, t }: { stop: RouteStop; busy: boolean; canDeliver: boolean; onDelivered: () => void; onArrived?: () => void; t: (key: string) => string }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {stop.customer_phone && <Button asChild variant="secondary" size="md"><a href={callUrl(stop.customer_phone)}><PhoneIcon />{t('callCustomer')}</a></Button>}
        {canDeliver && onArrived && stop.status !== 'arrived' && <Button variant="secondary" size="md" disabled={busy} onClick={onArrived}><CheckIcon />{t('markArrived')}</Button>}
        <Button variant="primary" size="md" disabled={busy || !canDeliver} onClick={onDelivered}><CheckCircle2Icon />{t('markDelivered')}</Button>
      </div>
      {!canDeliver && <p className="text-fs-xs text-[var(--fg-subtle)]">{t('courierStartBeforeDelivered')}</p>}
    </div>
  );
}
