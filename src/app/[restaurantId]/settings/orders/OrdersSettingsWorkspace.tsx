'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Info,
  ListChecks,
  PackageCheck,
  PauseCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react';
import {
  getRestaurant,
  updateRestaurant,
  getRestaurantSettings,
  updateRestaurantSettings,
  previewBatchFulfillment,
  BatchCycleSummary,
  BatchFulfillmentDay,
  DayHours,
  OpeningHoursConfig,
  Restaurant,
  WeeklyHours,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Field, Input, Section, Select } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { clampWeekStartDay, getEffectiveWorkdays, type WeekStartDay } from '@/lib/weeks';
import {
  BatchCyclePreview,
  FulfillmentDayRow,
  ModeCard,
  ServiceToggle,
  Switch,
  SwitchIndicator,
  WEEKDAYS_FR,
} from './_components';
import { OrderWorkflowBuilder } from './OrderWorkflowBuilder';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];

// Indexed by JS Date.getDay() (Sun=0 … Sat=6) to match the `workdays` array.
const DAY_SHORT_KEYS = [
  'sundayShort',
  'mondayShort',
  'tuesdayShort',
  'wednesdayShort',
  'thursdayShort',
  'fridayShort',
  'saturdayShort',
];
const DAY_SHORT_FALLBACKS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ORDER_TYPES = ['pickup', 'dine_in', 'delivery'] as const;
type OrderType = typeof ORDER_TYPES[number];

type PreorderMode = 'off' | 'slots' | 'batch';
export type OrdersSettingsView = 'overview' | 'availability' | 'preorders' | 'processing' | 'workflow';

const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };

function defaultWeek(): WeeklyHours {
  return Object.fromEntries(DAYS.map((d) => [d, { ...DEFAULT_DAY }])) as WeeklyHours;
}

function defaultConfig(): OpeningHoursConfig {
  return { pickup: defaultWeek(), dine_in: defaultWeek(), delivery: defaultWeek() };
}

function makeDefaultDay(used: Set<number>): BatchFulfillmentDay {
  const candidates = [5, 4, 6, 0, 1, 2, 3];
  const day = candidates.find((d) => !used.has(d)) ?? 5;
  return { day, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '14:00', delivery_end: '18:00' };
}

// "2026-06-15T18:30:00Z" → "2026-06-15T18:30" in the browser's local zone, the
// shape an <input type="datetime-local"> expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OrdersSettingsPage({ view = 'overview' }: { view?: OrdersSettingsView }) {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  // Catering-only mode is offered only when this restaurant has catering (the
  // same catering.manage gate used across the catering section).
  const canManageCatering = hasAnyPermission('catering.manage');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Pause (auto-saves on change — it's a kill switch) ─────────────────────
  const [paused, setPaused] = useState(false);
  const [pauseUntilMode, setPauseUntilMode] = useState<'manual' | 'time'>('manual');
  const [pauseUntil, setPauseUntil] = useState(''); // datetime-local value
  const [pauseSaving, setPauseSaving] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  // ── Order types (Restaurant) ──────────────────────────────────────────────
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [dineInEnabled, setDineInEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [cateringOnly, setCateringOnly] = useState(false);

  // ── Opening hours (Restaurant) ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<OrderType>('pickup');
  const [config, setConfig] = useState<OpeningHoursConfig>(defaultConfig());
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // ── Pre-order (RestaurantSettings) ────────────────────────────────────────
  const [mode, setMode] = useState<PreorderMode>('off');
  // Batch
  const [openDay, setOpenDay] = useState(3);
  const [openTime, setOpenTime] = useState('22:00');
  const [cutoffDay, setCutoffDay] = useState(3);
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [batchDays, setBatchDays] = useState<BatchFulfillmentDay[]>([]);
  const [batchPrepayment, setBatchPrepayment] = useState(true);
  // Live preview of the resulting opening/cutoff/delivery dates for the batch
  // config being edited — so a cutoff that pushes delivery a week out is visible
  // before saving. Computed by the server (single date resolver, no drift).
  const [batchPreview, setBatchPreview] = useState<BatchCycleSummary[]>([]);
  // Slots
  const [slotLeadMinutes, setSlotLeadMinutes] = useState(1440);
  const [slotMaxDays, setSlotMaxDays] = useState(7);
  const [slotDuration, setSlotDuration] = useState(30);
  const [slotPrepayment, setSlotPrepayment] = useState(false);

  // ── Service rules (RestaurantSettings) ────────────────────────────────────
  const [serviceMode, setServiceMode] = useState('table');
  const [prepTime, setPrepTime] = useState(20);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([getRestaurant(rid), getRestaurantSettings(rid)])
      .then(([r, s]) => {
        // Order types
        setPickupEnabled(r.pickup_enabled ?? true);
        setDineInEnabled(r.dine_in_enabled ?? true);
        setDeliveryEnabled(r.delivery_enabled ?? false);
        setCateringOnly(r.catering_only ?? false);
        // Opening hours
        if (r.opening_hours_config) {
          const merged = defaultConfig();
          for (const ot of ORDER_TYPES) {
            const src = (r.opening_hours_config as OpeningHoursConfig)[ot];
            if (src) for (const day of DAYS) if (src[day]) merged[ot]![day] = src[day];
          }
          setConfig(merged);
        }
        const wsd = clampWeekStartDay(r.week_start_day);
        setWeekStartDay(wsd);
        const explicit = Array.isArray(r.workdays) && r.workdays.length > 0;
        setWorkdays(explicit ? r.workdays! : getEffectiveWorkdays(r));
        // Pause
        // The legacy rush_mode field did the same thing (hard-block all online
        // orders); fold it into the single Pause control so there's one source.
        setPaused((s.orders_paused ?? false) || (s.rush_mode ?? false));
        if (s.orders_paused_until) {
          setPauseUntilMode('time');
          setPauseUntil(toLocalInput(s.orders_paused_until));
        } else {
          setPauseUntilMode('manual');
          setPauseUntil('');
        }
        // Pre-order
        setMode(s.batch_fulfillment_enabled ? 'batch' : s.scheduling_enabled ? 'slots' : 'off');
        setOpenDay(s.batch_order_open_day ?? s.batch_cutoff_day ?? 3);
        setOpenTime(s.batch_order_open_time || s.batch_cutoff_time || '22:00');
        setCutoffDay(s.batch_cutoff_day ?? 3);
        setCutoffTime(s.batch_cutoff_time || '22:00');
        setBatchDays(s.batch_fulfillment_days ?? []);
        setBatchPrepayment(s.batch_require_prepayment ?? true);
        setSlotLeadMinutes(s.scheduling_lead_time_minutes ?? (s.scheduling_min_days_ahead ?? 1) * 1440);
        setSlotMaxDays(s.scheduling_max_days_ahead ?? 7);
        setSlotDuration(s.scheduling_slot_duration_minutes ?? 30);
        setSlotPrepayment(s.scheduling_require_prepayment ?? false);
        // Service rules
        setServiceMode(s.service_mode || 'table');
        setPrepTime(s.pickup_prep_time_minutes ?? 20);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : t('ordersLoadError'));
      })
      .finally(() => setLoading(false));
  }, [rid, reloadKey, t]);

  const usedBatchDays = useMemo(() => new Set(batchDays.map((d) => d.day)), [batchDays]);

  // Debounced live preview: recompute the upcoming cycles whenever the batch
  // config changes. Skipped unless batch mode is active with at least one day.
  useEffect(() => {
    if (mode !== 'batch' || batchDays.length === 0) {
      setBatchPreview([]);
      return;
    }
    const handle = setTimeout(() => {
      previewBatchFulfillment(rid, {
        batch_order_open_day: openDay,
        batch_order_open_time: openTime,
        batch_cutoff_day: cutoffDay,
        batch_cutoff_time: cutoffTime,
        batch_fulfillment_days: batchDays,
      })
        .then((res) => setBatchPreview(res.upcoming_cycles ?? []))
        .catch(() => setBatchPreview([]));
    }, 400);
    return () => clearTimeout(handle);
  }, [rid, mode, openDay, openTime, cutoffDay, cutoffTime, batchDays]);

  const isServiceEnabled = (ot: OrderType): boolean =>
    ot === 'pickup' ? pickupEnabled : ot === 'delivery' ? deliveryEnabled : dineInEnabled;

  const isScheduleOpenNow = (ot: OrderType): boolean => {
    const week = config[ot] ?? defaultWeek();
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Mon=0
    const cur = now.getHours() * 60 + now.getMinutes();
    const minutes = (value: string) => {
      const [hours, mins] = value.split(':').map(Number);
      return hours * 60 + mins;
    };

    const today = week[DAYS[dayIdx]];
    if (today && !today.closed) {
      const opens = minutes(today.open);
      const closes = minutes(today.close);
      if (closes > opens ? cur >= opens && cur <= closes : cur >= opens) return true;
    }

    // An overnight service belongs to the preceding day's row. Without this
    // check, a Friday 22:00–02:00 service incorrectly appeared closed at 01:00.
    const previous = week[DAYS[(dayIdx + 6) % 7]];
    if (!previous || previous.closed) return false;
    const previousOpens = minutes(previous.open);
    const previousCloses = minutes(previous.close);
    return previousCloses <= previousOpens && cur <= previousCloses;
  };

  const allTabs: { key: OrderType; label: string }[] = [
    { key: 'pickup', label: t('pickup') || 'À emporter' },
    { key: 'dine_in', label: t('dineIn') || 'Sur place' },
    { key: 'delivery', label: t('delivery') || 'Livraison' },
  ];
  const tabs = allTabs.filter((tb) => isServiceEnabled(tb.key));
  const noServiceEnabled = tabs.length === 0;
  const hasProcessingSettings = dineInEnabled || pickupEnabled;
  const effectiveActiveTab: OrderType = isServiceEnabled(activeTab) ? activeTab : tabs[0]?.key ?? activeTab;
  const weeklyHours = config[effectiveActiveTab] ?? defaultWeek();
  const openSomewhere = tabs.some((tb) => isScheduleOpenNow(tb.key));
  const preorderModeLabel =
    mode === 'batch'
      ? t('preorderModeBatch') || 'Lot hebdomadaire'
      : mode === 'slots'
        ? t('preorderModeSlots') || 'Date et créneau'
        : t('preorderModeOff') || 'Dès que possible';

  // Persist the pause immediately so it behaves like a real kill switch.
  const savePause = async (
    nextPaused: boolean,
    untilMode: 'manual' | 'time',
    untilLocal: string,
  ): Promise<boolean> => {
    setPauseSaving(true);
    setPauseError(null);
    try {
      const until =
        nextPaused && untilMode === 'time' && untilLocal ? new Date(untilLocal).toISOString() : '';
      await updateRestaurantSettings(rid, {
        orders_paused: nextPaused,
        orders_paused_until: until,
        // Retire the legacy rush_mode field — Pause is now the single control.
        rush_mode: false,
      });
      return true;
    } catch {
      setPauseError(t('ordersPauseSaveError'));
      return false;
    } finally {
      setPauseSaving(false);
    }
  };

  const togglePause = async (v: boolean) => {
    const previous = paused;
    setPaused(v);
    if (!(await savePause(v, pauseUntilMode, pauseUntil))) setPaused(previous);
  };

  const updateDay = (ot: OrderType, day: Day, patch: Partial<DayHours>) => {
    setConfig((prev) => ({
      ...prev,
      [ot]: { ...prev[ot], [day]: { ...prev[ot]![day], ...patch } },
    }));
  };

  const toggleWorkday = (d: number) =>
    setWorkdays((prev) =>
      (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]).sort((a, b) => a - b),
    );

  const seedWorkdays = () =>
    setWorkdays(
      getEffectiveWorkdays({
        opening_hours_config: config,
        pickup_enabled: pickupEnabled,
        dine_in_enabled: dineInEnabled,
        delivery_enabled: deliveryEnabled,
      }),
    );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (view === 'availability') {
        await updateRestaurant(rid, {
          pickup_enabled: pickupEnabled,
          delivery_enabled: deliveryEnabled,
          dine_in_enabled: dineInEnabled,
          catering_only: cateringOnly,
          opening_hours_config: config,
          week_start_day: weekStartDay,
          workdays,
        } as Partial<Restaurant>);
      } else if (view === 'preorders') {
        await updateRestaurantSettings(rid, {
          scheduling_enabled: mode === 'slots',
          batch_fulfillment_enabled: mode === 'batch',
          batch_cutoff_day: cutoffDay,
          batch_cutoff_time: cutoffTime,
          batch_order_open_day: openDay,
          batch_order_open_time: openTime,
          batch_fulfillment_days: batchDays,
          batch_require_prepayment: batchPrepayment,
          scheduling_lead_time_minutes: slotLeadMinutes,
          // Keep the legacy field coherent for older clients during rollout.
          scheduling_min_days_ahead: Math.ceil(slotLeadMinutes / 1440),
          scheduling_max_days_ahead: slotMaxDays,
          scheduling_slot_duration_minutes: slotDuration,
          scheduling_require_prepayment: slotPrepayment,
        });
      } else if (view === 'processing') {
        await updateRestaurantSettings(rid, {
          service_mode: serviceMode,
          pickup_prep_time_minutes: prepTime,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Échec de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-[720px] py-[var(--s-8)]">
        <div className="rounded-r-xl border border-[var(--danger-200)] bg-[var(--surface)] p-[var(--s-6)] shadow-1">
          <h1 className="text-fs-xl font-semibold text-[var(--fg)]">
            {t('ordersLoadError')}
          </h1>
          <p className="mt-2 text-fs-sm text-[var(--fg-muted)]">{loadError}</p>
          <Button className="mt-[var(--s-5)]" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="h-4 w-4" />
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const batchNoDays = mode === 'batch' && batchDays.length === 0;
  const pageTitle =
    view === 'availability'
      ? t('ordersAvailabilityTitle') || 'Disponibilité'
      : view === 'preorders'
        ? t('preorderTitle') || 'Précommandes'
        : view === 'processing'
          ? t('ordersProcessingTitle') || 'Traitement des commandes'
          : view === 'workflow'
            ? t('orderWorkflow') || 'Parcours des commandes'
            : t('ordersAndAvailability') || 'Commandes en ligne';
  const pageDesc =
    view === 'availability'
      ? t('ordersAvailabilityDesc') || 'Choisissez où et quand vos clients peuvent commander.'
      : view === 'preorders'
        ? t('ordersPreordersDesc') || 'Définissez quand vos clients peuvent commander pour plus tard.'
        : view === 'processing'
          ? t('ordersProcessingDesc') || 'Définissez comment le service traite une nouvelle commande.'
          : view === 'workflow'
            ? t('ordersWorkflowDesc') || 'Personnalisez les étapes visibles par votre équipe et vos clients.'
            : t('ordersHubDesc') || 'Vérifiez l’état des commandes et choisissez le réglage à modifier.';
  const navigation = [
    {
      id: 'overview',
      href: `/${rid}/settings/orders`,
      label: t('overview') || 'Résumé',
      icon: ShoppingBag,
    },
    {
      id: 'availability',
      href: `/${rid}/settings/orders/availability`,
      label: t('ordersAvailabilityTitle') || 'Disponibilité',
      icon: Clock3,
    },
    {
      id: 'preorders',
      href: `/${rid}/settings/orders/preorders`,
      label: t('preorderTitle') || 'Précommandes',
      icon: CalendarDays,
    },
    {
      id: 'processing',
      href: `/${rid}/settings/orders/processing`,
      label: t('ordersProcessingShort') || 'Traitement',
      icon: Settings2,
    },
    {
      id: 'workflow',
      href: `/${rid}/settings/orders/workflow`,
      label: t('ordersWorkflowShort') || 'Parcours',
      icon: ListChecks,
    },
  ];

  return (
    <SettingsWorkspace
      title={pageTitle}
      description={pageDesc}
      activeId={view}
      navLabel={t('ordersSettingsNavigation') || 'Réglages des commandes'}
      items={navigation}
    >

      {view === 'overview' && (
        <>
          <OperationalStatus
            paused={paused}
            openSomewhere={openSomewhere}
            noServiceEnabled={noServiceEnabled}
            pauseSaving={pauseSaving}
            pauseError={pauseError}
            canEdit={canEdit}
            pauseUntilMode={pauseUntilMode}
            pauseUntil={pauseUntil}
            activeServices={tabs.length}
            totalServices={allTabs.length}
            preorderModeLabel={preorderModeLabel}
            onTogglePause={(value) => void togglePause(value)}
            onPauseModeChange={(nextMode) => {
              const previousMode = pauseUntilMode;
              setPauseUntilMode(nextMode);
              void savePause(true, nextMode, pauseUntil).then((didSave) => {
                if (!didSave) setPauseUntilMode(previousMode);
              });
            }}
            onPauseUntilChange={setPauseUntil}
            onPauseUntilSave={() => void savePause(true, 'time', pauseUntil)}
            t={t}
          />

          <div className="overflow-hidden rounded-r-xl border border-[var(--line)] bg-[var(--surface)]">
            <SettingsDestination
              href={`/${rid}/settings/orders/availability`}
              icon={<Clock3 />}
              title={t('ordersAvailabilityTitle') || 'Disponibilité'}
              description={t('ordersAvailabilityDesc') || 'Choisissez où et quand vos clients peuvent commander.'}
              status={`${tabs.length} / ${allTabs.length}`}
            />
            <SettingsDestination
              href={`/${rid}/settings/orders/preorders`}
              icon={<CalendarDays />}
              title={t('preorderTitle') || 'Précommandes'}
              description={t('ordersPreordersDesc') || 'Définissez quand vos clients peuvent commander pour plus tard.'}
              status={preorderModeLabel}
            />
            <SettingsDestination
              href={`/${rid}/settings/orders/processing`}
              icon={<Settings2 />}
              title={t('ordersProcessingTitle') || 'Traitement des commandes'}
              description={t('ordersProcessingDesc') || 'Définissez comment le service traite une nouvelle commande.'}
              status={pickupEnabled ? `${prepTime} min` : undefined}
            />
            <SettingsDestination
              href={`/${rid}/settings/orders/workflow`}
              icon={<ListChecks />}
              title={t('orderWorkflow') || 'Parcours des commandes'}
              description={t('ordersWorkflowDesc') || 'Personnalisez les étapes visibles par votre équipe et vos clients.'}
            />
          </div>
        </>
      )}

      {view === 'availability' && (
        <>

      {/* ── Order types ──────────────────────────────────────────────────── */}
      <Section
        id="order-modes"
        className="scroll-mt-24 shadow-none"
        title={t('orderModesTitle') || 'Modes de commande'}
        desc={
          t('orderModesDesc') ||
          'Choisissez les modes de commande proposés à vos clients en ligne.'
        }
      >
        <div className="grid grid-cols-1 gap-[var(--s-3)] md:grid-cols-2">
          <ServiceToggle
            label={t('pickup') || 'À emporter'}
            sub={t('pickupServiceDesc') || 'Le client retire sa commande au comptoir.'}
            checked={pickupEnabled}
            onChange={setPickupEnabled}
            disabled={!canEdit}
          />
          <ServiceToggle
            label={t('dineIn') || 'Sur place'}
            sub={t('dineInServiceDesc') || 'Le client commande à table, via QR ou serveur.'}
            checked={dineInEnabled}
            onChange={setDineInEnabled}
            disabled={!canEdit}
          />
          <ServiceToggle
            label={t('delivery') || 'Livraison'}
            sub={t('deliveryServiceDesc') || 'Le client se fait livrer à son adresse.'}
            checked={deliveryEnabled}
            onChange={setDeliveryEnabled}
            disabled={!canEdit}
          />
          {canManageCatering && (
            <ServiceToggle
              label={t('cateringOnlyMode')}
              sub={t('cateringOnlyModeDesc')}
              checked={cateringOnly}
              onChange={setCateringOnly}
              disabled={!canEdit}
            />
          )}
          {noServiceEnabled && (
            <div
              className="text-fs-xs px-[var(--s-3)] py-[var(--s-2)] rounded-r-md"
              style={{
                background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
                color: 'var(--warning-500)',
              }}
            >
              {t('noServiceWarning') ||
                'Aucun mode de commande activé : les clients ne pourront pas commander en ligne.'}
            </div>
          )}
        </div>
      </Section>

      {/* ── Opening hours ────────────────────────────────────────────────── */}
      <Section
        id="opening-hours"
        className="scroll-mt-24 shadow-none"
        title={t('openingHours') || 'Horaires d’ouverture'}
        desc={
          t('openingHoursDescNew') ||
          'Affichés sur votre menu en ligne. Les commandes sont bloquées en dehors de ces horaires.'
        }
      >
        {noServiceEnabled ? (
          <div
            className="px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm"
            style={{
              background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
              color: 'var(--warning-500)',
              border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
            }}
          >
            {t('noServiceEnabledHoursBanner') ||
              'Activez un mode de commande ci-dessus pour configurer ses horaires.'}
          </div>
        ) : (
          <>
            {tabs.length > 1 && (
              <div className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md mb-[var(--s-4)]">
                {tabs.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={effectiveActiveTab === key}
                    onClick={() => setActiveTab(key)}
                    className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ${
                      effectiveActiveTab === key
                        ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                        : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="border border-[var(--line)] rounded-r-md overflow-hidden">
              {DAYS.map((day, i) => {
                const dh = weeklyHours[day] ?? { ...DEFAULT_DAY };
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[var(--s-4)] gap-y-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] lg:grid-cols-[100px_minmax(225px,1fr)_auto_auto]"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                      background: dh.closed ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <div
                      className="text-fs-sm font-medium capitalize"
                      style={{ color: dh.closed ? 'var(--fg-muted)' : 'var(--fg)' }}
                    >
                      {t(day) || day}
                    </div>
                    <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-auto">
                      {dh.closed ? (
                        <span className="text-fs-sm text-[var(--fg-subtle)] italic">
                          {t('closedDay') || 'Fermé'}
                        </span>
                      ) : (
                        <div className="flex items-center gap-[var(--s-2)]">
                          <Input
                            type="time"
                            value={dh.open}
                            onChange={(e) => updateDay(effectiveActiveTab, day, { open: e.target.value })}
                            disabled={!canEdit}
                            className="font-mono text-center"
                            style={{ width: 100 }}
                          />
                          <span className="text-[var(--fg-subtle)]">—</span>
                          <Input
                            type="time"
                            value={dh.close}
                            onChange={(e) => updateDay(effectiveActiveTab, day, { close: e.target.value })}
                            disabled={!canEdit}
                            className="font-mono text-center"
                            style={{ width: 100 }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="hidden whitespace-nowrap text-fs-xs text-[var(--fg-subtle)] lg:block">
                      {dh.closed ? '' : t('lastOrderHint') || 'Dernière commande −30 min'}
                    </div>
                    <label className="col-start-2 row-start-1 flex items-center justify-end gap-1.5 text-fs-xs text-[var(--fg-muted)] lg:col-auto lg:row-auto">
                      <input
                        type="checkbox"
                        checked={dh.closed}
                        disabled={!canEdit}
                        onChange={(e) => updateDay(effectiveActiveTab, day, { closed: e.target.checked })}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {t('closedLabel') || 'Fermé'}
                    </label>
                  </div>
                );
              })}
            </div>

            {/* Week settings — secondary, drives the weekly editors */}
            <details className="mt-[var(--s-4)]">
              <summary className="cursor-pointer select-none text-fs-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors inline-flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {t('weekSectionTitle') || 'Semaine'}
              </summary>
              <div className="mt-[var(--s-3)] grid grid-cols-1 md:grid-cols-[220px_1fr] gap-x-[var(--s-5)] gap-y-[var(--s-4)] items-start">
                <Field label={t('weekStartFieldLabel') || 'Premier jour de la semaine'}>
                  <Select
                    value={String(weekStartDay)}
                    disabled={!canEdit}
                    onChange={(e) => setWeekStartDay(clampWeekStartDay(Number(e.target.value)))}
                  >
                    <option value="0">{t('weekDaySunday') || 'Dimanche'}</option>
                    <option value="1">{t('weekDayMonday') || 'Lundi'}</option>
                    <option value="2">{t('weekDayTuesday') || 'Mardi'}</option>
                    <option value="3">{t('weekDayWednesday') || 'Mercredi'}</option>
                    <option value="4">{t('weekDayThursday') || 'Jeudi'}</option>
                    <option value="5">{t('weekDayFriday') || 'Vendredi'}</option>
                    <option value="6">{t('weekDaySaturday') || 'Samedi'}</option>
                  </Select>
                </Field>
                <Field
                  label={
                    <div className="flex items-center justify-between gap-2">
                      <span>{t('workdaysFieldLabel') || 'Jours d’ouverture'}</span>
                      <button
                        type="button"
                        onClick={seedWorkdays}
                        disabled={!canEdit}
                        className="inline-flex items-center gap-1 text-fs-xs text-[var(--fg-muted)] transition-colors hover:text-[var(--brand-500)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {t('workdaysSeedAction') || 'Auto depuis les horaires'}
                      </button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-7 gap-1 rounded-r-md p-1" style={{ background: 'var(--surface-2)' }}>
                    {DAY_SHORT_KEYS.map((key, idx) => {
                      const active = workdays.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleWorkday(idx)}
                          disabled={!canEdit}
                          aria-pressed={active}
                          className={`relative h-10 rounded-r-sm text-fs-sm font-medium transition-all duration-fast ${
                            active
                              ? 'bg-[var(--brand-500)] text-white shadow-1'
                              : 'text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]'
                          }`}
                        >
                          {t(key) || DAY_SHORT_FALLBACKS[idx]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </details>

          </>
        )}
      </Section>
        </>
      )}

      {/* ── Pre-order ────────────────────────────────────────────────────── */}
      {view === 'preorders' && (
      <Section
        id="preorders"
        className="scroll-mt-24 shadow-none"
        title={t('preorderTitle') || 'Précommande'}
        desc={
          t('preorderExplainer') ||
          'La précommande permet à vos clients de commander à l’avance pour un retrait ou une livraison ultérieurs. Un seul mode peut être actif à la fois.'
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
          <ModeCard
            title={t('preorderModeOff') || 'Dès que possible'}
            desc={t('preorderModeOffDesc') || 'Le client commande pour le prochain service disponible.'}
            selected={mode === 'off'}
            onClick={() => setMode('off')}
            disabled={!canEdit}
          />
          <ModeCard
            title={t('preorderModeSlots') || 'Date et créneau'}
            desc={
              t('preorderModeSlotsDesc') ||
              'Le client choisit un jour et un créneau précis (ex. demain à 12h30). Idéal pour étaler le service.'
            }
            selected={mode === 'slots'}
            onClick={() => setMode('slots')}
            disabled={!canEdit}
          />
          <ModeCard
            title={t('preorderModeBatch') || 'Lot hebdomadaire'}
            desc={
              t('preorderModeBatchDesc') ||
              'Les clients commandent toute la semaine, et vous préparez tout le même jour (ex. chaque vendredi).'
            }
            selected={mode === 'batch'}
            onClick={() => setMode('batch')}
            disabled={!canEdit}
          />
        </div>

        {mode === 'slots' && (
          <div
            className="mt-[var(--s-4)] rounded-r-lg border border-[var(--line)] p-[var(--s-4)]"
            style={{ background: 'color-mix(in oklab, var(--brand-500) 7%, var(--surface))' }}
          >
            <div className="flex items-center gap-[var(--s-3)] text-fs-sm font-semibold text-[var(--fg)]">
              <Clock3 className="w-4 h-4 text-[var(--brand-500)]" />
              {t('customerPromiseTitle') || 'Ce que verra le client'}
            </div>
            <div className="mt-[var(--s-3)] grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-[var(--s-2)] text-fs-xs text-[var(--fg-muted)]">
              <span className="rounded-full bg-[var(--surface)] border border-[var(--line)] px-[var(--s-3)] py-2">
                {t('promiseOrderPlaced') || 'Commande passée'}
              </span>
              <span className="hidden sm:block h-px bg-[var(--line-strong)]" />
              <span className="rounded-full bg-[var(--surface)] border border-[var(--line)] px-[var(--s-3)] py-2 font-semibold text-[var(--brand-500)]">
                +{Math.round(slotLeadMinutes / 60)} h
              </span>
              <span className="hidden sm:block h-px bg-[var(--line-strong)]" />
              <span className="rounded-full bg-[var(--surface)] border border-[var(--line)] px-[var(--s-3)] py-2">
                {t('promiseFirstOpenSlot') || 'Premier créneau ouvert'}
              </span>
            </div>
          </div>
        )}

        {mode === 'slots' && (
          <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-4)]">
            <div className="flex flex-wrap gap-[var(--s-4)]">
              <Field label={t('slotMinDaysAhead') || 'Temps de préparation par défaut'}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={Math.round(slotLeadMinutes / 60)}
                  disabled={!canEdit}
                  onChange={(e) => setSlotLeadMinutes(Math.max(0, Number(e.target.value)) * 60)}
                  className="font-mono"
                  style={{ width: 120 }}
                />
                <span className="ms-[var(--s-2)] text-fs-xs text-[var(--fg-muted)]">{t('hours') || 'heures'}</span>
              </Field>
              <Field label={t('slotMaxDaysAhead') || 'Réservation possible jusqu’à'}>
                <Input
                  type="number"
                  min={1}
                  value={slotMaxDays}
                  disabled={!canEdit}
                  onChange={(e) => setSlotMaxDays(Number(e.target.value))}
                  className="font-mono"
                  style={{ width: 120 }}
                />
              </Field>
              <Field label={t('slotDuration') || 'Durée d’un créneau (min)'}>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={slotDuration}
                  disabled={!canEdit}
                  onChange={(e) => setSlotDuration(Number(e.target.value))}
                  className="font-mono"
                  style={{ width: 120 }}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-[var(--s-2)]">
              {[0, 6, 24, 48, 72].map((hours) => (
                <Button
                  key={hours}
                  type="button"
                  size="sm"
                  disabled={!canEdit}
                  variant={slotLeadMinutes === hours * 60 ? 'primary' : 'secondary'}
                  onClick={() => setSlotLeadMinutes(hours * 60)}
                >
                  {hours === 0 ? t('itemPreparationSameDay') || 'Même jour' : `${hours} h`}
                </Button>
              ))}
            </div>
            <PrepaymentToggle
              checked={slotPrepayment}
              onChange={setSlotPrepayment}
              label={t('slotRequirePrepayment') || 'Paiement requis à la réservation'}
              sub={t('slotRequirePrepaymentDesc') || 'Le client paie en réservant son créneau.'}
              disabled={!canEdit}
            />
            {slotPrepayment && <CashNote t={t} />}
          </div>
        )}

        {mode === 'batch' && (
          <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-5)]">
            <div className="flex flex-wrap gap-[var(--s-5)]">
              <div>
                <div className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-2)]">
                  {t('batchOrderOpens') || 'Ouverture des commandes'}
                </div>
                <div className="flex flex-wrap gap-[var(--s-4)]">
                  <Field label={t('batchOrderOpenDay') || 'Jour'}>
                    <Select
                      value={String(openDay)}
                      disabled={!canEdit}
                      onChange={(e) => setOpenDay(Number(e.target.value))}
                    >
                      {WEEKDAYS_FR.map((label, i) => (
                        <option key={i} value={i}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('batchOrderOpenTime') || 'Heure'}>
                    <Input
                      type="time"
                      value={openTime}
                      disabled={!canEdit}
                      onChange={(e) => setOpenTime(e.target.value)}
                      className="font-mono text-center"
                      style={{ width: 120 }}
                    />
                  </Field>
                </div>
              </div>
              <div>
                <div className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-2)]">
                  {t('batchFulfillmentCutoff') || 'Clôture des commandes'}
                </div>
                <div className="flex flex-wrap gap-[var(--s-4)]">
                  <Field label={t('batchFulfillmentCutoffDay') || 'Jour'}>
                    <Select
                      value={String(cutoffDay)}
                      disabled={!canEdit}
                      onChange={(e) => setCutoffDay(Number(e.target.value))}
                    >
                      {WEEKDAYS_FR.map((label, i) => (
                        <option key={i} value={i}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('batchFulfillmentCutoffTime') || 'Heure'}>
                    <Input
                      type="time"
                      value={cutoffTime}
                      disabled={!canEdit}
                      onChange={(e) => setCutoffTime(e.target.value)}
                      className="font-mono text-center"
                      style={{ width: 120 }}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-[var(--s-2)]">
                <div className="text-fs-sm font-semibold text-[var(--fg)]">
                  {t('batchFulfillmentDays') || 'Jours de livraison / retrait'}
                </div>
                {canEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setBatchDays((p) => [...p, makeDefaultDay(usedBatchDays)])}
                  >
                    <Plus />
                    {t('batchFulfillmentAddDay') || 'Ajouter un jour'}
                  </Button>
                )}
              </div>
              {batchNoDays ? (
                <div
                  className="px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm"
                  style={{
                    background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
                    color: 'var(--warning-500)',
                    border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
                  }}
                >
                  {t('batchFulfillmentNoDays') ||
                    'Aucun jour défini. Ajoutez-en au moins un pour activer le mode lot hebdomadaire.'}
                </div>
              ) : (
                <div className="flex flex-col gap-[var(--s-3)]">
                  {batchDays.map((d, idx) => (
                    <FulfillmentDayRow
                      key={idx}
                      value={d}
                      used={usedBatchDays}
                      onChange={(patch) =>
                        setBatchDays((p) => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                      }
                      onRemove={() => setBatchDays((p) => p.filter((_, i) => i !== idx))}
                      disabled={!canEdit}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>

            <BatchCyclePreview cycles={batchPreview} locale={locale} t={t} />

            <PrepaymentToggle
              checked={batchPrepayment}
              onChange={setBatchPrepayment}
              label={t('batchFulfillmentRequirePrepayment') || 'Paiement requis à la commande'}
              sub={
                t('batchFulfillmentRequirePrepaymentSubtitle') ||
                'Les clients doivent payer immédiatement lors d’une pré-commande.'
              }
              disabled={!canEdit}
            />
            {batchPrepayment && <CashNote t={t} />}
          </div>
        )}

        {mode !== 'off' && (
          <div className="mt-[var(--s-5)] flex items-start gap-[var(--s-3)] rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
            <PackageCheck className="w-5 h-5 mt-0.5 shrink-0 text-[var(--brand-500)]" />
            <div className="min-w-0 flex-1">
              <div className="text-fs-sm font-semibold text-[var(--fg)]">{t('productExceptionsTitle') || 'Exceptions par produit'}</div>
              <p className="mt-1 text-fs-xs text-[var(--fg-muted)] leading-[var(--lh-base)]">
                {t('productExceptionsDesc') || 'Un produit peut demander plus de préparation, ou être disponible aujourd’hui grâce à un stock déjà prêt.'}
              </p>
            </div>
            <Link href={`/${rid}/menu`} className="shrink-0 text-fs-xs font-semibold text-[var(--brand-500)] hover:underline">
              {t('manageProducts') || 'Gérer les produits'}
            </Link>
          </div>
        )}
      </Section>
      )}

      {/* ── Service rules ────────────────────────────────────────────────── */}
      {view === 'processing' && (
        <>
          <Section
            className="shadow-none"
            title={t('ordersProcessingGuideTitle') || 'Ce que cet écran contrôle'}
          >
            <div className="flex items-start gap-[var(--s-3)] rounded-r-md bg-[var(--surface-2)] p-[var(--s-4)]">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--info-500)]" />
              <p className="max-w-[72ch] text-fs-sm leading-[var(--lh-base)] text-[var(--fg-muted)]">
                {t('ordersProcessingGuideDesc') ||
                  'Ces réglages décrivent ce qui se passe après une commande : qui la remet au client et quel délai de préparation lui est annoncé.'}
              </p>
            </div>
          </Section>

          <Section
            id="service-rules"
            className="scroll-mt-24 shadow-none"
            title={t('ordersProcessingSettingsTitle') || 'Réglages par mode de commande'}
            desc={t('ordersProcessingSettingsDesc') || 'Chaque réglage s’applique uniquement au mode indiqué.'}
          >
            <div className="divide-y divide-[var(--line)] overflow-hidden rounded-r-lg border border-[var(--line)]">
              <div className="grid gap-[var(--s-4)] p-[var(--s-4)] sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
                <div className="flex items-start gap-[var(--s-3)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]">
                    <UtensilsCrossed className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-fs-sm font-semibold text-[var(--fg)]">
                      {t('ordersProcessingDineInTitle') || 'Commandes sur place'}
                    </div>
                    <p className="mt-1 text-fs-xs leading-[var(--lh-base)] text-[var(--fg-muted)]">
                      {t('ordersProcessingDineInDesc') ||
                        'Choisissez si le client récupère sa commande au comptoir ou si un serveur l’apporte à table. Ce choix modifie les étapes suivies par l’équipe.'}
                    </p>
                  </div>
                </div>

                {dineInEnabled ? (
                  <div>
                    <Field label={t('serviceMode') || 'Mode de service'}>
                      <Select
                        value={serviceMode}
                        disabled={!canEdit}
                        onChange={(e) => setServiceMode(e.target.value)}
                      >
                        <option value="table">{t('tableService') || 'Service à table'}</option>
                        <option value="counter">{t('counterService') || 'Service au comptoir'}</option>
                      </Select>
                    </Field>
                    <p className="mt-2 text-fs-xs leading-[var(--lh-base)] text-[var(--fg-subtle)]">
                      {serviceMode === 'counter'
                        ? t('ordersCounterServiceImpact') ||
                          'Les clients récupèrent au comptoir. La commande passe par l’étape « Prête ».'
                        : t('ordersTableServiceImpact') ||
                          'Le personnel apporte la commande à table. Elle passe directement à l’étape « Servie ».'}
                    </p>
                  </div>
                ) : (
                  <InactiveOrderMode rid={rid} t={t} />
                )}
              </div>

              <div className="grid gap-[var(--s-4)] p-[var(--s-4)] sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
                <div className="flex items-start gap-[var(--s-3)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-fs-sm font-semibold text-[var(--fg)]">
                      {t('ordersProcessingPickupTitle') || 'Commandes à emporter'}
                    </div>
                    <p className="mt-1 text-fs-xs leading-[var(--lh-base)] text-[var(--fg-muted)]">
                      {t('ordersProcessingPickupDesc') ||
                        'Définissez le délai de préparation estimé présenté au client avant une commande à emporter.'}
                    </p>
                  </div>
                </div>

                {pickupEnabled ? (
                  <Field
                    label={t('pickupPrepTime') || 'Temps de préparation par défaut'}
                    hint={t('ordersPickupPrepHint') || 'Délai estimé affiché au client.'}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={240}
                        value={prepTime}
                        disabled={!canEdit}
                        onChange={(e) => setPrepTime(Number(e.target.value))}
                        className="w-[104px] font-mono"
                      />
                      <span className="text-fs-sm text-[var(--fg-muted)]">{t('ordersMinutesShort') || 'min'}</span>
                    </div>
                  </Field>
                ) : (
                  <InactiveOrderMode rid={rid} t={t} />
                )}
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ── Order workflow builder ───────────────────────────────────────── */}
      {view === 'workflow' && (
      <Section
        id="order-workflow"
        className="scroll-mt-24 shadow-none"
        title={t('orderWorkflow') || 'Suivi des commandes'}
        desc={
          t('workflowBuilderSectionDesc') ||
          'Le parcours de vos commandes, par type de service. Ajoutez, renommez et réordonnez les étapes, et branchez les automatisations.'
        }
      >
        <OrderWorkflowBuilder rid={rid} canEdit={canEdit} />
      </Section>
      )}

          {view !== 'overview' &&
            view !== 'workflow' &&
            !(view === 'processing' && !hasProcessingSettings) &&
            (canEdit || saved || saveError) && (
            <div className="sticky bottom-[var(--s-4)] z-10 mb-[var(--s-8)] flex flex-wrap items-center justify-end gap-[var(--s-3)] rounded-r-lg border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] p-[var(--s-3)] shadow-3 backdrop-blur-xl">
              {saved && (
                <span className="me-auto text-fs-sm font-medium text-[var(--success-500)]">
                  {t('saved')}
                </span>
              )}
              {saveError && (
                <span className="me-auto text-fs-sm font-medium text-[var(--danger-500)]">
                  {saveError}
                </span>
              )}
              {canEdit && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSave}
                  disabled={saving || (view === 'preorders' && batchNoDays)}
                >
                  {saving ? t('saving') : t('saveChanges')}
                </Button>
              )}
            </div>
          )}
    </SettingsWorkspace>
  );
}

function OperationalStatus({
  paused,
  openSomewhere,
  noServiceEnabled,
  pauseSaving,
  pauseError,
  canEdit,
  pauseUntilMode,
  pauseUntil,
  activeServices,
  totalServices,
  preorderModeLabel,
  onTogglePause,
  onPauseModeChange,
  onPauseUntilChange,
  onPauseUntilSave,
  t,
}: {
  paused: boolean;
  openSomewhere: boolean;
  noServiceEnabled: boolean;
  pauseSaving: boolean;
  pauseError: string | null;
  canEdit: boolean;
  pauseUntilMode: 'manual' | 'time';
  pauseUntil: string;
  activeServices: number;
  totalServices: number;
  preorderModeLabel: string;
  onTogglePause: (value: boolean) => void;
  onPauseModeChange: (value: 'manual' | 'time') => void;
  onPauseUntilChange: (value: string) => void;
  onPauseUntilSave: () => void;
  t: (key: string) => string;
}) {
  const statusLabel = paused
    ? t('ordersPausedBadge') || 'Commandes en pause'
    : noServiceEnabled
      ? t('closedNow') || 'Fermé'
      : openSomewhere
        ? t('openNow') || 'Ouvert maintenant'
        : t('closedNow') || 'Fermé maintenant';

  return (
    <section
      aria-label={t('ordersCurrentStatus') || 'État actuel des commandes'}
      className="mb-[var(--s-6)] overflow-hidden rounded-r-xl border border-[var(--line)] bg-[var(--surface)] shadow-1"
    >
      <div className="grid lg:grid-cols-[minmax(250px,1.25fr)_minmax(420px,1fr)]">
        <div className="flex items-start gap-[var(--s-4)] p-[var(--s-5)] sm:p-[var(--s-6)]">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-r-full"
            style={{
              background: paused
                ? 'color-mix(in oklab, var(--danger-500) 12%, var(--surface))'
                : openSomewhere
                  ? 'color-mix(in oklab, var(--success-500) 12%, var(--surface))'
                  : 'var(--surface-2)',
              color: paused
                ? 'var(--danger-500)'
                : openSomewhere
                  ? 'var(--success-500)'
                  : 'var(--fg-muted)',
            }}
          >
            <span
              className={`h-3 w-3 rounded-r-full ${
                paused || openSomewhere ? 'motion-safe:animate-pulse' : ''
              }`}
              style={{ background: 'currentColor' }}
            />
          </span>
          <div className="min-w-0">
            <div className="text-fs-micro font-semibold text-[var(--fg-subtle)]">
              {t('ordersCurrentStatus') || 'État actuel'}
            </div>
            <div className="mt-1 text-fs-2xl font-semibold tracking-[-0.02em] text-[var(--fg)]">
              {statusLabel}
            </div>
            <p className="mt-1 max-w-[48ch] text-fs-sm leading-[var(--lh-base)] text-[var(--fg-muted)]">
              {paused
                ? t('ordersPausedBannerDesc') ||
                  'Les clients ne peuvent pas commander en ligne. Reprenez quand vous êtes prêt.'
                : t('ordersStatusAvailableDesc') ||
                  'Les horaires et les modes actifs déterminent ce que vos clients peuvent commander.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-[var(--line)] lg:border-s lg:border-t-0">
          <StatusMetric
            label={t('orderModesTitle') || 'Modes de commande'}
            value={`${activeServices} / ${totalServices}`}
          />
          <StatusMetric
            label={t('openingHours') || 'Horaires'}
            value={openSomewhere ? t('openNow') || 'Ouvert' : t('closedNow') || 'Fermé'}
            divided
          />
          <StatusMetric label={t('preorderTitle') || 'Précommandes'} value={preorderModeLabel} divided />
        </div>
      </div>

      <div
        className="border-t px-[var(--s-5)] py-[var(--s-4)] sm:px-[var(--s-6)]"
        style={{
          background: paused
            ? 'color-mix(in oklab, var(--danger-500) 7%, var(--surface))'
            : 'var(--surface-2)',
          borderColor: paused
            ? 'color-mix(in oklab, var(--danger-500) 24%, var(--line))'
            : 'var(--line)',
        }}
      >
        <div className="flex items-center justify-between gap-[var(--s-4)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-fs-sm font-semibold text-[var(--fg)]">
              <PauseCircle className="h-4 w-4 text-[var(--fg-muted)]" />
              <span>{paused ? t('resumeOrders') || 'Reprendre' : t('pauseOrders') || 'Mettre en pause'}</span>
            </div>
            <div className="mt-0.5 text-fs-xs text-[var(--fg-subtle)]">
              {t('pauseOnlineOrdersDesc') ||
                'Interrompt immédiatement tous les modes de commande en ligne.'}
            </div>
          </div>
          <div className="flex items-center gap-[var(--s-3)]">
            {pauseSaving && <span className="text-fs-xs text-[var(--fg-subtle)]">{t('saving')}</span>}
            <Switch
              checked={paused}
              onChange={onTogglePause}
              disabled={!canEdit}
              label={t('pauseOnlineOrders') || 'Pause'}
            />
          </div>
        </div>

        {paused && (
          <div className="mt-[var(--s-4)] flex flex-wrap items-end gap-[var(--s-4)] border-t border-[color-mix(in_oklab,var(--danger-500)_20%,var(--line))] pt-[var(--s-4)]">
            <Field label={t('pauseUntilLabel') || 'Reprise des commandes'}>
              <Select
                value={pauseUntilMode}
                disabled={!canEdit}
                onChange={(event) => onPauseModeChange(event.target.value as 'manual' | 'time')}
              >
                <option value="manual">{t('pauseUntilManual') || 'Jusqu’à la réouverture manuelle'}</option>
                <option value="time">{t('pauseUntilTime') || 'Jusqu’à une heure précise'}</option>
              </Select>
            </Field>
            {pauseUntilMode === 'time' && (
              <Field label={t('pauseUntilWhen') || 'Réouverture'}>
                <Input
                  type="datetime-local"
                  value={pauseUntil}
                  disabled={!canEdit}
                  onChange={(event) => onPauseUntilChange(event.target.value)}
                  onBlur={onPauseUntilSave}
                  className="font-mono"
                />
              </Field>
            )}
          </div>
        )}
        {pauseError && (
          <p role="alert" className="mt-[var(--s-3)] text-fs-xs font-medium text-[var(--danger-500)]">
            {pauseError}
          </p>
        )}
      </div>
    </section>
  );
}

function StatusMetric({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-center px-[var(--s-3)] py-[var(--s-4)] sm:px-[var(--s-5)] ${
        divided ? 'border-s border-[var(--line)]' : ''
      }`}
    >
      <span className="truncate text-fs-micro font-medium text-[var(--fg-subtle)]">{label}</span>
      <span className="mt-1 truncate text-fs-sm font-semibold text-[var(--fg)]" title={value}>
        {value}
      </span>
    </div>
  );
}

function SettingsDestination({
  href,
  icon,
  title,
  description,
  status,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-[var(--s-4)] border-b border-[var(--line)] px-[var(--s-5)] py-[var(--s-4)] outline-none transition-colors last:border-b-0 hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-500)] sm:px-[var(--s-6)] sm:py-[var(--s-5)]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-r-lg bg-[var(--surface-2)] text-[var(--fg-muted)] transition-colors group-hover:bg-[var(--brand-50)] group-hover:text-[var(--brand-600)] [&>svg]:h-[18px] [&>svg]:w-[18px]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-fs-md font-semibold text-[var(--fg)]">{title}</span>
        <span className="mt-0.5 block max-w-[64ch] text-fs-xs leading-[var(--lh-base)] text-[var(--fg-muted)]">
          {description}
        </span>
      </span>
      <span className="flex items-center gap-[var(--s-3)]">
        {status && (
          <span className="hidden max-w-[150px] truncate text-fs-xs font-medium text-[var(--fg-muted)] sm:block">
            {status}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-[var(--fg-subtle)] transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

// A small pill marking which service a setting applies to — so it's obvious
// that "Mode de service" and the prep time aren't global rules.
function InactiveOrderMode({ rid, t }: { rid: number; t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-r-md bg-[var(--surface-2)] px-3 py-2.5">
      <span className="text-fs-xs font-medium text-[var(--fg-subtle)]">
        {t('ordersProcessingInactive') || 'Mode non activé'}
      </span>
      <Link
        href={`/${rid}/settings/orders/availability`}
        className="text-fs-xs font-semibold text-[var(--brand-500)] hover:underline"
      >
        {t('ordersProcessingManage') || 'Gérer les modes'}
      </Link>
    </div>
  );
}

// Reminder that the cash-payment exemption (trusted customers, pickup/delivery)
// still applies even when prepayment is required — so the two don't silently
// contradict each other for the operator.
function CashNote({ t }: { t: (key: string) => string }) {
  return (
    <div
      className="flex items-start gap-2 px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-xs"
      style={{
        background: 'color-mix(in oklab, var(--info-500) 10%, transparent)',
        color: 'var(--fg-muted)',
      }}
    >
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--info-500)' }} />
      <span>
        {t('cashPrepaymentNote') ||
          'Les clients autorisés à payer en espèces (clients de confiance, retrait/livraison) restent exemptés : ils paient à la réception, même si le paiement est requis ici.'}
      </span>
    </div>
  );
}

function PrepaymentToggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
  disabled?: boolean;
}) {
  return <RuleToggle {...props} />;
}

function RuleToggle({
  checked,
  onChange,
  label,
  sub,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-[var(--s-4)] rounded-r-md border border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)] text-start outline-none transition-colors hover:border-[var(--line-strong)] focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]"
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
    >
      <div className="min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
        <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{sub}</div>
      </div>
      <SwitchIndicator checked={checked} />
    </button>
  );
}
