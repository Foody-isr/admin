'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useI18n, useCurrency } from '@/lib/i18n';
import { useWs } from '@/lib/ws-context';
import {
  getMyRoutes,
  checkMyRouteNavigation,
  startRoute,
  markArrived,
  markStopDelivered,
  reorderStops,
  optimizeRoute,
  updateRouteSettings,
  updateMyStopAddress,
  type DeliveryRoute,
  type RouteSettingsInput,
  type RouteStop,
  type StopAddressInput,
} from '@/lib/delivery';
import {
  deliveryRoutingError,
  deliveryRouteWarning,
  deliveryLocationWarning,
  buildDeliveryEtaLabel,
  buildDeliveryEtaMessage,
  deliveryEtaWindow,
  type DeliveryEtaWindow,
} from '@/lib/delivery-planning';
import { callUrl, whatsappUrl } from '@/lib/delivery-links';
import { NavigationAppMenu } from '@/components/delivery/NavigationAppMenu';
import { RouteSettingsEditor } from '@/components/delivery/RouteSettingsEditor';
import { CourierAddressEditor } from '@/components/delivery/CourierAddressEditor';
import { DeliveryDuration } from '@/components/delivery/DeliveryDuration';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import { useLocationReporter } from '@/lib/useLocationReporter';
import {
  Button,
  ConfirmDialog,
  Drawer,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
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
  PackageIcon,
  MessageCircleIcon,
  PencilIcon,
  SearchIcon,
  MoreVerticalIcon,
  SlidersHorizontalIcon,
  XIcon,
  StickyNoteIcon,
  HomeIcon,
} from 'lucide-react';
import styles from './CourierItinerary.module.css';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });
type Translator = (key: string) => string;

function formatEta(seconds: number, t: Translator): string {
  if (seconds <= 0) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ${t('unitMin')}`;
  const h = Math.floor(m / 60),
    rem = m % 60;
  return rem > 0 ? `${h}${t('unitHour')} ${rem}${t('unitMin')}` : `${h}${t('unitHour')}`;
}

function stopWhatsappMessage(
  stop: RouteStop,
  etaWindow: DeliveryEtaWindow | null,
  t: Translator
): string {
  return buildDeliveryEtaMessage(
    t(etaWindow ? 'deliveryEtaWhatsappTemplate' : 'deliveryEtaWhatsappTemplateNoTime'),
    stop,
    etaWindow
  );
}

function NoStopsCard({ t }: { t: Translator }) {
  return (
    <div className={styles.empty}>
      <PackageIcon className="mx-auto mb-3 h-8 w-8 text-[var(--fg-subtle)]" />
      <p>{t('noStopsYet')}</p>
    </div>
  );
}

function RouteEndpointRow({
  kind,
  address,
  lat,
  lng,
  time,
  t,
}: {
  kind: 'start' | 'end';
  address: string;
  lat?: number | null;
  lng?: number | null;
  time?: string;
  t: Translator;
}) {
  return (
    <div className={`${styles.stop} ${styles.endpoint}`}>
      <div className={styles.rail}>
        {kind === 'start' ? <HomeIcon /> : <FlagIcon />}
        {time && <span dir="ltr">{time}</span>}
      </div>
      <div className={styles.stopBody}>
        <p className={styles.address}>{address}</p>
        <p className={styles.stopMeta}>
          {t(kind === 'start' ? 'routeTimelineStartReminder' : 'routeTimelineTerminus')}
        </p>
        {kind === 'end' && (
          <div className={styles.stopActions}>
            <NavigationAppMenu destination={{ address, lat, lng }} label={t('navigate')} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}

/** One destination in the route timeline; selecting it never changes delivery status. */
function TimelineStop({
  stop,
  route,
  current,
  selected,
  busy,
  index,
  total,
  onSelect,
  onEdit,
  onMove,
  onArrived,
  onDelivered,
}: {
  stop: RouteStop;
  route: DeliveryRoute;
  current: boolean;
  selected: boolean;
  busy: boolean;
  index: number;
  total: number;
  onSelect: () => void;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onArrived: () => void;
  onDelivered: () => void;
}) {
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const eta = deliveryEtaWindow(route, stop, locale);
  const details = formatDeliveryAddress(
    {
      address: stop.address,
      city: stop.city,
      floor: stop.delivery_floor,
      apt: stop.delivery_apt,
      entryCode: stop.delivery_entry_code,
    },
    t
  )?.line2;
  const finished = stop.status === 'delivered' || stop.status === 'skipped';
  const canDeliver = route.status === 'active';
  return (
    <div
      data-stop-id={stop.id}
      aria-current={current ? 'step' : undefined}
      className={`${styles.stop} ${selected ? styles.selected : ''}`}
    >
      <div className={styles.rail}>
        <strong>
          {finished ? (
            <CheckIcon
              className="h-4 w-4"
              aria-label={t(stop.status === 'delivered' ? 'stopStatusDelivered' : 'courierSkipped')}
            />
          ) : (
            String(stop.sequence).padStart(2, '0')
          )}
        </strong>
        {eta && <span dir="ltr">{eta.start}</span>}
      </div>
      <div className={styles.stopBody}>
        <button
          type="button"
          className={styles.destination}
          onClick={onSelect}
          aria-expanded={selected}
          aria-label={`${t('courierSelectStop')} ${stop.sequence}: ${stop.address || stop.customer_name}`}
        >
          <span className={styles.address}>{stop.address || stop.customer_name}</span>
          <span className={styles.order}>#{stop.order_id}</span>
        </button>
        {stop.city && <p className={styles.stopMeta}>{stop.city}</p>}
        <div className={`${styles.stopMeta} ${styles.notes}`}>
          <StickyNoteIcon aria-hidden="true" />
          <div>
            <p>{stop.customer_name}</p>
            {stop.customer_phone && (
              <a href={callUrl(stop.customer_phone)} dir="ltr" aria-label={t('callCustomer')}>
                {stop.customer_phone}
              </a>
            )}
            {details && <p>{details}</p>}
            {stop.delivery_notes?.trim() && <p>{stop.delivery_notes.trim()}</p>}
          </div>
        </div>
        {selected && (
          <div>
            {eta && (
              <p className={`${styles.stopMeta} text-[var(--info-500)]`}>
                {buildDeliveryEtaLabel(t('deliveryExpectedArrival'), eta)}
              </p>
            )}
            {stop.payment_method === 'cash' && stop.total_amount > 0 && (
              <p className={styles.stopMeta}>{money(stop.total_amount, { decimals: 0 })}</p>
            )}
            {stop.needs_geocode && (
              <p className="mt-2 text-fs-xs text-[var(--warning-500)]">
                {deliveryLocationWarning(route, t)}
              </p>
            )}
            {!finished && (
              <>
                <div className={styles.stopActions}>
                  <NavigationAppMenu
                    destination={stop}
                    variant="secondary"
                    size="sm"
                    label={t('navigate')}
                    t={t}
                  />
                  {stop.customer_phone && (
                    <Button asChild variant="ghost" size="md" icon>
                      <a
                        href={whatsappUrl(stop.customer_phone, stopWhatsappMessage(stop, eta, t))}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('deliveryPlanWhatsApp')}
                      >
                        <MessageCircleIcon />
                      </a>
                    </Button>
                  )}
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="md" icon aria-label={t('courierStopOptions')}>
                        <MoreVerticalIcon />
                      </Button>
                    </MenuTrigger>
                    <MenuContent side="top">
                      <MenuItem disabled={busy} onSelect={onEdit}>
                        <PencilIcon />
                        {t('correctAddress')}
                      </MenuItem>
                      <MenuItem disabled={busy || index === 0} onSelect={() => onMove(-1)}>
                        <ChevronUpIcon />
                        {t('moveUp')}
                      </MenuItem>
                      <MenuItem disabled={busy || index === total - 1} onSelect={() => onMove(1)}>
                        <ChevronDownIcon />
                        {t('moveDown')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  {canDeliver && current && stop.status !== 'arrived' && (
                    <Button variant="ghost" size="md" disabled={busy} onClick={onArrived}>
                      <MapPinIcon />
                      {t('markArrived')}
                    </Button>
                  )}
                  {!current && (
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={busy || !canDeliver}
                      onClick={onDelivered}
                    >
                      <CheckCircle2Icon />
                      {t('markDelivered')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CourierRouteView({
  rid,
  assignedRoute,
  onReload,
  canStart,
  reportLocation,
  onCompleted,
  visible,
}: {
  rid: number;
  assignedRoute: DeliveryRoute;
  onReload: () => Promise<void>;
  canStart: boolean;
  reportLocation: boolean;
  visible: boolean;
  onCompleted: (route: DeliveryRoute) => void;
}) {
  const { t, locale } = useI18n();
  const [route, setRoute] = useState<DeliveryRoute>(assignedRoute);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(56);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef<number | null>(null);
  const [addressEditorStop, setAddressEditorStop] = useState<RouteStop | null>(null);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const { denied: locationDenied } = useLocationReporter(
    rid,
    reportLocation && route.status === 'active'
  );

  const load = onReload;
  useEffect(() => {
    setRoute(assignedRoute);
  }, [assignedRoute]);

  // Completion, reordering and GPS updates must not repeat paid address checks.
  const navigationKey = JSON.stringify(
    [...route.stops]
      .sort((a, b) => a.id - b.id)
      .map((stop) => [stop.id, stop.address, stop.city, stop.lat, stop.lng])
  );
  const [navigationChecks, setNavigationChecks] = useState<{
    key: string;
    values: Map<number, boolean>;
  } | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(true);
  const [navigationUnavailable, setNavigationUnavailable] = useState(false);
  const [navigationRetry, setNavigationRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setNavigationLoading(true);
    checkMyRouteNavigation(rid, route.id, controller.signal)
      .then((checks) => {
        if (!controller.signal.aborted) {
          setNavigationChecks({
            key: navigationKey,
            values: new Map(checks.map((check) => [check.stop_id, check.verified])),
          });
          setNavigationUnavailable(checks.some((check) => check.reason === 'unavailable'));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNavigationChecks({ key: navigationKey, values: new Map() });
          setNavigationUnavailable(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setNavigationLoading(false);
      });
    return () => controller.abort();
  }, [rid, route.id, navigationKey, navigationRetry]);
  const stops = useMemo(
    () =>
      route.stops
        .map((stop) => ({
          ...stop,
          navigation_verified:
            navigationChecks?.key === navigationKey &&
            navigationChecks.values.get(stop.id) === true,
        }))
        .sort((a, b) => a.sequence - b.sequence),
    [route.stops, navigationChecks, navigationKey]
  );
  const navigationUnverified = stops.filter(
    (stop) => stop.status !== 'delivered' && stop.status !== 'skipped' && !stop.navigation_verified
  );

  const currentStop = stops.find((s) => s.status !== 'delivered' && s.status !== 'skipped') ?? null;
  const delivered = stops.filter((s) => s.status === 'delivered').length;
  const unresolvedStops = stops.filter(
    (s) => s.needs_geocode && s.status !== 'delivered' && s.status !== 'skipped'
  );

  async function withBusy<T>(
    fn: () => Promise<T>,
    failureKey = 'deliveryPlanFailed'
  ): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      await load();
      setError(deliveryRoutingError(e, t) ?? t(failureKey));
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

  const selectedId = stops.some((stop) => stop.id === selectedStopId)
    ? selectedStopId
    : currentStop?.id;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredStops = stops.filter((stop) =>
    [
      stop.address,
      stop.city,
      stop.customer_name,
      stop.customer_phone,
      String(stop.order_id),
      stop.delivery_notes,
    ].some((value) => value?.toLocaleLowerCase(locale).includes(normalizedQuery))
  );
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(`${route.date.slice(0, 10)}T12:00:00`)
  );
  const reference = route.eta_reference_at || route.started_at || route.planned_departure_at;
  const finishAt = reference
    ? new Date(new Date(reference).getTime() + route.est_duration_s * 1000)
    : null;
  const finish =
    !route.needs_recalculation &&
    route.est_duration_s > 0 &&
    finishAt &&
    !Number.isNaN(finishAt.getTime())
      ? new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: route.timezone,
        }).format(finishAt)
      : null;
  const departure = route.planned_departure_at ? new Date(route.planned_departure_at) : null;
  const departureTime =
    departure && !Number.isNaN(departure.getTime())
      ? new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: route.timezone,
        }).format(departure)
      : undefined;
  const selectStop = (stop: RouteStop, fromMap = false) => {
    setSelectedStopId(stop.id);
    setSelectionRequest((value) => value + 1);
    if (fromMap) {
      setQuery('');
      setPanelHeight((height) => Math.max(height, 56));
    }
  };
  useEffect(() => {
    if (!visible || selectionRequest === 0) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-stop-id="${selectedId}"]`);
    // Scroll only the timeline: never move the outer page or obscure the action dock.
    if (row && scrollRef.current)
      scrollRef.current.scrollTop = Math.max(0, row.offsetTop - scrollRef.current.offsetTop - 8);
  }, [selectedId, visible, selectionRequest]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  const snapPanel = (value: number) =>
    setPanelHeight(
      [34, 56, 86].reduce((closest, step) =>
        Math.abs(step - value) < Math.abs(closest - value) ? step : closest
      )
    );

  return (
    <div
      className={styles.routeView}
      style={
        {
          '--panel-height': `clamp(260px, ${panelHeight}%, calc(100% - 72px - var(--safe-top)))`,
        } as CSSProperties
      }
    >
      <div className={styles.map} aria-label={t('courierRouteMap')}>
        {visible && (
          <DeliveryMap
            restaurantId={rid}
            geometry={route.route_geometry}
            routingProvider={route.routing_provider}
            stops={stops}
            start={
              route.start_lat != null && route.start_lng != null
                ? { lat: route.start_lat, lng: route.start_lng }
                : undefined
            }
            end={
              route.end_lat != null && route.end_lng != null
                ? { lat: route.end_lat, lng: route.end_lng }
                : undefined
            }
            variant="courier"
            selectedStopId={selectedId}
            onStopClick={(stop) => selectStop(stop, true)}
            className="h-full w-full"
          />
        )}
      </div>
      <div className={styles.sheet}>
        <div
          className={styles.grip}
          role="slider"
          tabIndex={0}
          aria-label={t('courierResizePanel')}
          aria-valuemin={34}
          aria-valuemax={86}
          aria-valuenow={panelHeight}
          aria-orientation="vertical"
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (dragStart.current == null) return;
            const delta = dragStart.current - event.clientY;
            const height =
              event.currentTarget.closest(`.${styles.routeView}`)?.getBoundingClientRect().height ||
              1;
            dragStart.current = null;
            if (Math.abs(delta) < 8)
              setPanelHeight((value) => (value === 86 ? 34 : value === 34 ? 56 : 86));
            else snapPanel(panelHeight + (delta / height) * 100);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
          onKeyDown={(event) => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            setPanelHeight((value) =>
              event.key === 'Home'
                ? 34
                : event.key === 'End'
                  ? 86
                  : event.key === 'ArrowUp'
                    ? value < 56
                      ? 56
                      : 86
                    : value > 56
                      ? 56
                      : 34
            );
          }}
        />
        <div className={styles.summary}>
          <div className={styles.summaryLine}>
            <div className={styles.summaryText}>
              <p>
                <strong>
                  {finish
                    ? `${t('courierEstimatedFinish')} ${finish}`
                    : t(route.status === 'active' ? 'routeStatusActive' : 'routeStatusDraft')}
                </strong>
              </p>
              <p>
                {stops.length} {t('deliveryPlanStops')}
                {!route.needs_recalculation && route.total_distance_m > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                      route.total_distance_m / 1000
                    )}{' '}
                    km
                  </>
                )}
              </p>
            </div>
            <div className={styles.tools}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('courierSearchStops')}
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen((value) => !value);
                  setQuery('');
                }}
              >
                <SearchIcon />
              </button>
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={t('courierRouteOptions')}
                  >
                    <MoreVerticalIcon />
                  </button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onSelect={() => setSettingsOpen(true)}>
                    <SlidersHorizontalIcon />
                    {t('routeSettingsTitle')}
                  </MenuItem>
                  <MenuItem
                    disabled={busy || stops.length === 0}
                    onSelect={() => void onReoptimize()}
                  >
                    <ZapIcon />
                    {t('reoptimize')}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
          {error && (
            <div role="alert" className={`${styles.notice} ${styles.error}`}>
              <p>{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                {t('close')}
              </Button>
            </div>
          )}
          {searchOpen && (
            <div className={styles.search}>
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('courierSearchPlaceholder')}
                aria-label={t('courierSearchStops')}
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('close')}
                onClick={() => {
                  setSearchOpen(false);
                  setQuery('');
                }}
              >
                <XIcon />
              </button>
            </div>
          )}
          {route.status === 'active' && (
            <div className={styles.progress}>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label={t('courierDeliveryProgress')}
                aria-valuenow={delivered}
                aria-valuemin={0}
                aria-valuemax={stops.length}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${stops.length ? (delivered / stops.length) * 100 : 0}%` }}
                />
              </div>
              <span>
                {delivered}/{stops.length}
              </span>
            </div>
          )}
        </div>
        <div className={styles.scroll} ref={scrollRef}>
          <div className={styles.notices}>
            {locationDenied && <p>{t('locationOffNotice')}</p>}
            {(route.needs_recalculation || unresolvedStops.length > 0) && (
              <div className={styles.notice}>
                <p>{deliveryRouteWarning(route, t)}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onReoptimize()}
                >
                  {t('retry')}
                </Button>
              </div>
            )}
            {!navigationLoading && navigationUnavailable && (
              <div role="alert" className={styles.notice}>
                <p>{t('navigationCheckUnavailable')}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNavigationRetry((value) => value + 1)}
                >
                  {t('retry')}
                </Button>
              </div>
            )}
            {navigationLoading ? (
              <p role="status">{t('navigationCheckLoading')}</p>
            ) : (
              navigationUnverified.length > 0 && (
                <p role="alert" className="text-[var(--warning-500)]">
                  <AlertCircleIcon className="me-1 inline h-3.5 w-3.5" />
                  {t('navigationReviewCount').replace(
                    '{count}',
                    String(navigationUnverified.length)
                  )}
                </p>
              )
            )}
          </div>
          {!query && route.start_address && (
            <RouteEndpointRow
              kind="start"
              address={route.start_address}
              time={departureTime}
              t={t}
            />
          )}
          {filteredStops.map((stop) => (
            <TimelineStop
              key={stop.id}
              stop={stop}
              route={route}
              current={stop.id === currentStop?.id}
              selected={stop.id === selectedId}
              index={stops.indexOf(stop)}
              total={stops.length}
              busy={busy}
              onSelect={() => selectStop(stop)}
              onEdit={() => setAddressEditorStop(stop)}
              onMove={(direction) => void move(stop, direction)}
              onArrived={() => void onArrived(stop)}
              onDelivered={() => void onDelivered(stop)}
            />
          ))}
          {filteredStops.length === 0 && (
            <p role="status" className="px-6 py-8 text-center text-fs-sm text-[var(--fg-muted)]">
              {t(query ? 'courierNoSearchResults' : 'noStopsYet')}
            </p>
          )}
          {!query && route.end_address && (
            <RouteEndpointRow
              kind="end"
              address={route.end_address}
              lat={route.end_lat}
              lng={route.end_lng}
              t={t}
            />
          )}
        </div>
        <div
          className={`${styles.dock} ${route.status === 'draft' && canStart ? styles.draftDock : ''}`}
          data-testid="courier-action-dock"
        >
          <div className={styles.dockTop}>
            <div>
              <p className={styles.duration}>
                {route.needs_recalculation ? '—' : formatEta(route.est_duration_s, t)}
              </p>
              <p className={styles.date}>{date}</p>
            </div>
            {currentStop && route.status === 'active' && (
              <div className={styles.nextStop}>
                <p>
                  {t('courierNextStop')} {String(currentStop.sequence).padStart(2, '0')}
                </p>
                <p className="font-semibold text-[var(--fg)]">
                  {currentStop.address || currentStop.customer_name}
                </p>
              </div>
            )}
          </div>
          <div className={styles.dockActions}>
            {route.status === 'draft' ? (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={busy}
                  onClick={() => setSettingsOpen(true)}
                >
                  <SlidersHorizontalIcon />
                  {t('courierRefineRoute')}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy || !canStart || navigationLoading || stops.length === 0}
                  onClick={onStart}
                  aria-label={t('startRoute')}
                >
                  <RouteIcon />
                  {t('courierStartAction')}
                </Button>
              </>
            ) : currentStop && route.status === 'active' ? (
              <>
                <NavigationAppMenu
                  destination={currentStop}
                  label={t('navigate')}
                  size="lg"
                  t={t}
                />
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  onClick={() => void onDelivered(currentStop)}
                >
                  <CheckCircle2Icon />
                  {t('markDelivered')}
                </Button>
              </>
            ) : null}
          </div>
          {route.status === 'draft' && !canStart && (
            <p className="mt-2 text-fs-xs text-[var(--fg-subtle)]">
              {t('courierFinishCurrentRoute')}
            </p>
          )}
        </div>
      </div>
      <Drawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={t('routeSettingsTitle')}
        width={480}
        closeDisabled={busy}
      >
        <RouteSettingsEditor
          route={route}
          locale={locale}
          disabled={busy || route.status !== 'draft'}
          onSave={onSaveSettings}
          t={t}
        />
        <div className="mt-5">
          <DeliveryDuration route={route} t={t} />
        </div>
        <Button
          variant="secondary"
          className="mt-5"
          disabled={busy || stops.length === 0}
          onClick={() => void onReoptimize()}
        >
          <ZapIcon />
          {t('reoptimize')}
        </Button>
      </Drawer>
      <CourierAddressEditor
        open={addressEditorStop != null}
        onOpenChange={(open) => {
          if (!open) setAddressEditorStop(null);
        }}
        restaurantId={rid}
        stop={addressEditorStop}
        onSave={onSaveStopAddress}
        t={t}
      />
      <ConfirmDialog
        open={startConfirmOpen}
        onOpenChange={setStartConfirmOpen}
        title={t('navigationUnverifiedTitle')}
        description={t('navigationReviewBeforeStart').replace(
          '{count}',
          String(navigationUnverified.length)
        )}
        confirmLabel={t('startAnyway')}
        cancelLabel={t('back')}
        onConfirm={() => {
          setStartConfirmOpen(false);
          void startNow();
        }}
      />
    </div>
  );
}

/** Map and timeline for every assigned route, retaining the active location reporter across selections. */
export default function CourierItineraryView({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { lastEvent } = useWs();
  const [routes, setRoutes] = useState<DeliveryRoute[] | null>(null);
  const [completedDestination, setCompletedDestination] = useState<DeliveryRoute | null>(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await getMyRoutes(rid);
      if (id === requestId.current) {
        setRoutes(next);
        setError(false);
      }
    } catch {
      if (id === requestId.current) setError(true);
    }
  }, [rid]);
  useEffect(() => {
    const requests = requestId;
    setRoutes(null);
    setCompletedDestination(null);
    void load();
    return () => {
      requests.current++;
    };
  }, [load]);
  useEffect(() => {
    if (lastEvent?.type === 'route.updated' || lastEvent?.type.startsWith('order.')) void load();
  }, [lastEvent, load]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const selectedRoute =
    routes?.find((route) => route.id === selectedRouteId) ??
    routes?.find((route) => route.status === 'active') ??
    routes?.[0];
  return (
    <div className={styles.workspace}>
      {routes && routes.length > 0 && (
        <div className={styles.routePicker}>
          <label className="sr-only" htmlFor={`courier-routes-${rid}`}>
            {t('courierSelectRoute')}
          </label>
          <select
            id={`courier-routes-${rid}`}
            value={selectedRoute?.id}
            onChange={(event) => setSelectedRouteId(Number(event.target.value))}
          >
            {routes.map((route, index) => (
              <option value={route.id} key={route.id}>
                {t('courierRouteNumber').replace('{number}', String(index + 1))} ·{' '}
                {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                  new Date(`${route.date.slice(0, 10)}T12:00:00`)
                )}{' '}
                · {t(route.status === 'active' ? 'routeStatusActive' : 'routeStatusDraft')}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <div className="absolute inset-x-4 top-20 z-40 rounded-lg bg-[var(--danger-50)] p-4">
          <p role="alert">{t('couldNotLoad')}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {routes === null && !error && (
        <p role="status" className={styles.empty}>
          {t('loading')}
        </p>
      )}
      {completedDestination?.end_address && (
        <div className="absolute inset-x-3 top-20 z-40 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2">
          <section aria-label={t('routeTimelineTerminus')}>
            <RouteEndpointRow
              kind="end"
              address={completedDestination.end_address}
              lat={completedDestination.end_lat}
              lng={completedDestination.end_lng}
              t={t}
            />
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="sm" onClick={() => setCompletedDestination(null)}>
                {t('close')}
              </Button>
            </div>
          </section>
        </div>
      )}
      {routes?.length === 0 && <NoStopsCard t={t} />}
      {routes?.map((route) => (
        <section
          className={styles.route}
          hidden={route.id !== selectedRoute?.id}
          data-route-id={route.id}
          key={`${rid}:${route.id}`}
          aria-label={`${t('assignedToMe')} · ${route.date.slice(0, 10)}`}
        >
          <CourierRouteView
            rid={rid}
            assignedRoute={route}
            onReload={load}
            visible={route.id === selectedRoute?.id}
            canStart={!routes.some((other) => other.status === 'active' && other.id !== route.id)}
            reportLocation={route.id === routes.find((other) => other.status === 'active')?.id}
            onCompleted={(finished) => {
              if (finished.end_address) setCompletedDestination(finished);
            }}
          />
        </section>
      ))}
    </div>
  );
}
