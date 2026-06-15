'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, CalendarDays, Info, PauseCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  getRestaurant,
  updateRestaurant,
  getRestaurantSettings,
  updateRestaurantSettings,
  BatchFulfillmentDay,
  DayHours,
  OpeningHoursConfig,
  Restaurant,
  WeeklyHours,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Section, Select } from '@/components/ds';
import { clampWeekStartDay, getEffectiveWorkdays, type WeekStartDay } from '@/lib/weeks';
import { FulfillmentDayRow, ModeCard, ServiceToggle, Switch, WEEKDAYS_FR } from './_components';

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

interface ExceptionalClosure {
  id: string;
  date: string;
  reason: string;
}

// "2026-06-15T18:30:00Z" → "2026-06-15T18:30" in the browser's local zone, the
// shape an <input type="datetime-local"> expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OrdersAvailabilityPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Pause (auto-saves on change — it's a kill switch) ─────────────────────
  const [paused, setPaused] = useState(false);
  const [pauseUntilMode, setPauseUntilMode] = useState<'manual' | 'time'>('manual');
  const [pauseUntil, setPauseUntil] = useState(''); // datetime-local value
  const [pauseSaving, setPauseSaving] = useState(false);

  // ── Order types (Restaurant) ──────────────────────────────────────────────
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [dineInEnabled, setDineInEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);

  // ── Opening hours (Restaurant) ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<OrderType>('pickup');
  const [config, setConfig] = useState<OpeningHoursConfig>(defaultConfig());
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [closures, setClosures] = useState<ExceptionalClosure[]>([]);

  // ── Pre-order (RestaurantSettings) ────────────────────────────────────────
  const [mode, setMode] = useState<PreorderMode>('off');
  // Batch
  const [openDay, setOpenDay] = useState(3);
  const [openTime, setOpenTime] = useState('22:00');
  const [cutoffDay, setCutoffDay] = useState(3);
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [batchDays, setBatchDays] = useState<BatchFulfillmentDay[]>([]);
  const [batchPrepayment, setBatchPrepayment] = useState(true);
  // Slots
  const [slotMinDays, setSlotMinDays] = useState(1);
  const [slotMaxDays, setSlotMaxDays] = useState(7);
  const [slotDuration, setSlotDuration] = useState(30);
  const [slotPrepayment, setSlotPrepayment] = useState(false);

  // ── Service rules (RestaurantSettings) ────────────────────────────────────
  const [serviceMode, setServiceMode] = useState('table');
  const [prepTime, setPrepTime] = useState(20);
  const [autoSendToKitchen, setAutoSendToKitchen] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);

  useEffect(() => {
    Promise.all([getRestaurant(rid), getRestaurantSettings(rid)])
      .then(([r, s]) => {
        // Order types
        setPickupEnabled(r.pickup_enabled ?? true);
        setDineInEnabled(r.dine_in_enabled ?? true);
        setDeliveryEnabled(r.delivery_enabled ?? false);
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
        }
        // Pre-order
        setMode(s.batch_fulfillment_enabled ? 'batch' : s.scheduling_enabled ? 'slots' : 'off');
        setOpenDay(s.batch_order_open_day ?? s.batch_cutoff_day ?? 3);
        setOpenTime(s.batch_order_open_time || s.batch_cutoff_time || '22:00');
        setCutoffDay(s.batch_cutoff_day ?? 3);
        setCutoffTime(s.batch_cutoff_time || '22:00');
        setBatchDays(s.batch_fulfillment_days ?? []);
        setBatchPrepayment(s.batch_require_prepayment ?? true);
        setSlotMinDays(s.scheduling_min_days_ahead ?? 1);
        setSlotMaxDays(s.scheduling_max_days_ahead ?? 7);
        setSlotDuration(s.scheduling_slot_duration_minutes ?? 30);
        setSlotPrepayment(s.scheduling_require_prepayment ?? false);
        // Service rules
        setServiceMode(s.service_mode || 'table');
        setPrepTime(s.pickup_prep_time_minutes ?? 20);
        setAutoSendToKitchen(s.auto_send_to_kitchen ?? true);
        setTipsEnabled(s.tips_enabled ?? true);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const usedBatchDays = useMemo(() => new Set(batchDays.map((d) => d.day)), [batchDays]);

  const isServiceEnabled = (ot: OrderType): boolean =>
    ot === 'pickup' ? pickupEnabled : ot === 'delivery' ? deliveryEnabled : dineInEnabled;

  const isScheduleOpenNow = (ot: OrderType): boolean => {
    const week = config[ot] ?? defaultWeek();
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Mon=0
    const dh = week[DAYS[dayIdx]];
    if (!dh || dh.closed) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = dh.open.split(':').map(Number);
    const [ch, cm] = dh.close.split(':').map(Number);
    const o = oh * 60 + om;
    let c = ch * 60 + cm;
    if (c <= o) c += 24 * 60;
    return cur >= o && cur <= c;
  };

  const allTabs: { key: OrderType; label: string }[] = [
    { key: 'pickup', label: t('pickup') || 'À emporter' },
    { key: 'dine_in', label: t('dineIn') || 'Sur place' },
    { key: 'delivery', label: t('delivery') || 'Livraison' },
  ];
  const tabs = allTabs.filter((tb) => isServiceEnabled(tb.key));
  const noServiceEnabled = tabs.length === 0;
  const effectiveActiveTab: OrderType = isServiceEnabled(activeTab) ? activeTab : tabs[0]?.key ?? activeTab;
  const weeklyHours = config[effectiveActiveTab] ?? defaultWeek();
  const openSomewhere = tabs.some((tb) => isScheduleOpenNow(tb.key));

  // Persist the pause immediately so it behaves like a real kill switch.
  const savePause = async (nextPaused: boolean, untilMode: 'manual' | 'time', untilLocal: string) => {
    setPauseSaving(true);
    try {
      const until =
        nextPaused && untilMode === 'time' && untilLocal ? new Date(untilLocal).toISOString() : '';
      await updateRestaurantSettings(rid, {
        orders_paused: nextPaused,
        orders_paused_until: until,
        // Retire the legacy rush_mode field — Pause is now the single control.
        rush_mode: false,
      });
    } catch {
      // leave the toggle where the operator put it; the next save will retry
    } finally {
      setPauseSaving(false);
    }
  };

  const togglePause = (v: boolean) => {
    setPaused(v);
    void savePause(v, pauseUntilMode, pauseUntil);
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
      await updateRestaurant(rid, {
        pickup_enabled: pickupEnabled,
        delivery_enabled: deliveryEnabled,
        dine_in_enabled: dineInEnabled,
        opening_hours_config: config,
        week_start_day: weekStartDay,
        workdays,
      } as Partial<Restaurant>);
      await updateRestaurantSettings(rid, {
        // Pre-order mode (mutually exclusive — only one is ever true)
        scheduling_enabled: mode === 'slots',
        batch_fulfillment_enabled: mode === 'batch',
        batch_cutoff_day: cutoffDay,
        batch_cutoff_time: cutoffTime,
        batch_order_open_day: openDay,
        batch_order_open_time: openTime,
        batch_fulfillment_days: batchDays,
        batch_require_prepayment: batchPrepayment,
        scheduling_min_days_ahead: slotMinDays,
        scheduling_max_days_ahead: slotMaxDays,
        scheduling_slot_duration_minutes: slotDuration,
        scheduling_require_prepayment: slotPrepayment,
        // Service rules
        service_mode: serviceMode,
        pickup_prep_time_minutes: prepTime,
        auto_send_to_kitchen: autoSendToKitchen,
        tips_enabled: tipsEnabled,
      });
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

  const batchNoDays = mode === 'batch' && batchDays.length === 0;

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('ordersAndAvailability') || 'Commandes & disponibilité'}
        desc={
          t('ordersHubDesc') ||
          'Tout ce qui contrôle quand et comment vos clients commandent en ligne.'
        }
        actions={
          paused ? (
            <Badge tone="danger" dot>
              {t('ordersPausedBadge') || 'Commandes en pause'}
            </Badge>
          ) : noServiceEnabled ? (
            <Badge tone="neutral" dot>
              {t('closedNow') || 'Fermé'}
            </Badge>
          ) : (
            <Badge tone={openSomewhere ? 'success' : 'neutral'} dot>
              {openSomewhere ? t('openNow') || 'Ouvert maintenant' : t('closedNow') || 'Fermé maintenant'}
            </Badge>
          )
        }
      />

      {/* ── Pause: the panic button, first and unmistakable ──────────────── */}
      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <PauseCircle className="w-4 h-4" />
            {t('pauseSectionTitle') || 'Pause des commandes'}
          </span>
        }
      >
        <div
          className="rounded-r-md border p-[var(--s-4)]"
          style={{
            background: paused
              ? 'color-mix(in oklab, var(--danger-500) 8%, var(--surface))'
              : 'var(--surface)',
            borderColor: paused
              ? 'color-mix(in oklab, var(--danger-500) 40%, var(--line))'
              : 'var(--line)',
          }}
        >
          <div className="flex items-center justify-between gap-[var(--s-4)]">
            <div className="min-w-0">
              <div className="text-fs-sm font-semibold text-[var(--fg)]">
                {t('pauseOnlineOrders') || 'Mettre en pause les commandes en ligne'}
              </div>
              <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                {t('pauseOnlineOrdersDesc') ||
                  'Met en pause À emporter, Sur place et Livraison d’un coup. Prioritaire sur les horaires.'}
              </div>
            </div>
            <div className="flex items-center gap-[var(--s-3)]">
              {pauseSaving && (
                <span className="text-fs-xs text-[var(--fg-subtle)]">{t('saving') || 'Saving…'}</span>
              )}
              <Switch checked={paused} onChange={togglePause} label={t('pauseOnlineOrders') || 'Pause'} />
            </div>
          </div>

          {paused && (
            <div className="mt-[var(--s-4)] pt-[var(--s-4)] border-t border-[color-mix(in_oklab,var(--danger-500)_20%,var(--line))] flex flex-wrap items-end gap-[var(--s-4)]">
              <Field label={t('pauseUntilLabel') || 'Reprise des commandes'}>
                <Select
                  value={pauseUntilMode}
                  onChange={(e) => {
                    const m = e.target.value as 'manual' | 'time';
                    setPauseUntilMode(m);
                    void savePause(true, m, pauseUntil);
                  }}
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
                    onChange={(e) => setPauseUntil(e.target.value)}
                    onBlur={() => void savePause(true, 'time', pauseUntil)}
                    className="font-mono"
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── Order types ──────────────────────────────────────────────────── */}
      <Section
        title={t('orderModesTitle') || 'Modes de commande'}
        desc={
          t('orderModesDesc') ||
          'Choisissez les modes de commande proposés à vos clients en ligne.'
        }
      >
        <div className="flex flex-col gap-[var(--s-3)]">
          <ServiceToggle
            label={t('pickup') || 'À emporter'}
            sub={t('pickupServiceDesc') || 'Le client retire sa commande au comptoir.'}
            checked={pickupEnabled}
            onChange={setPickupEnabled}
          />
          <ServiceToggle
            label={t('dineIn') || 'Sur place'}
            sub={t('dineInServiceDesc') || 'Le client commande à table, via QR ou serveur.'}
            checked={dineInEnabled}
            onChange={setDineInEnabled}
          />
          <ServiceToggle
            label={t('delivery') || 'Livraison'}
            sub={t('deliveryServiceDesc') || 'Le client se fait livrer à son adresse.'}
            checked={deliveryEnabled}
            onChange={setDeliveryEnabled}
          />
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
        title={t('openingHours') || 'Horaires d’ouverture'}
        desc={
          t('openingHoursDescNew') ||
          'Affichés sur votre menu en ligne. Les commandes sont bloquées en dehors de ces horaires. Pour fermer tout de suite, utilisez la pause ci-dessus.'
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
                    aria-selected={effectiveActiveTab === key}
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
                    className="grid items-center gap-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)]"
                    style={{
                      gridTemplateColumns: '140px 1fr 220px 80px',
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
                    <div>
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
                            className="font-mono text-center"
                            style={{ width: 100 }}
                          />
                          <span className="text-[var(--fg-subtle)]">—</span>
                          <Input
                            type="time"
                            value={dh.close}
                            onChange={(e) => updateDay(effectiveActiveTab, day, { close: e.target.value })}
                            className="font-mono text-center"
                            style={{ width: 100 }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-fs-xs text-[var(--fg-subtle)]">
                      {dh.closed ? '' : t('lastOrderHint') || 'Dernière commande −30 min'}
                    </div>
                    <label className="flex items-center justify-end gap-1.5 text-fs-xs text-[var(--fg-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dh.closed}
                        onChange={(e) => updateDay(effectiveActiveTab, day, { closed: e.target.checked })}
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
                    onChange={(e) => setWeekStartDay(clampWeekStartDay(Number(e.target.value)))}
                  >
                    <option value="0">{t('weekDaySunday') || 'Dimanche'}</option>
                    <option value="1">{t('weekDayMonday') || 'Lundi'}</option>
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
                        className="inline-flex items-center gap-1 text-fs-xs text-[var(--fg-muted)] hover:text-[var(--brand-500)] transition-colors"
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

            {/* Exceptional closures (display-only list for now) */}
            <div className="mt-[var(--s-5)]">
              <div className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-2)]">
                {t('exceptionalClosures') || 'Fermetures exceptionnelles'}
              </div>
              <div className="flex flex-col gap-[var(--s-2)]">
                {closures.length === 0 ? (
                  <p className="text-fs-sm text-[var(--fg-subtle)]">
                    {t('noClosures') || 'Aucune fermeture exceptionnelle.'}
                  </p>
                ) : (
                  closures.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] bg-[var(--surface-2)] rounded-r-sm"
                    >
                      <div className="flex items-center gap-[var(--s-3)] min-w-0">
                        <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--fg-muted)]" />
                        <div className="min-w-0">
                          <div className="text-fs-sm font-medium truncate">{c.date}</div>
                          <div className="text-fs-xs text-[var(--fg-subtle)] truncate">{c.reason}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="p-1.5 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)]"
                        onClick={() => setClosures((p) => p.filter((x) => x.id !== c.id))}
                        aria-label={t('remove') || 'Supprimer'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    const date = window.prompt(t('closureDatePrompt') || 'Date (ex. 15 avril) :');
                    if (!date) return;
                    const reason = window.prompt(t('closureReasonPrompt') || 'Raison :') || '';
                    setClosures((p) => [...p, { id: Math.random().toString(36).slice(2), date, reason }]);
                  }}
                >
                  <Plus />
                  {t('addClosure') || 'Ajouter une fermeture'}
                </Button>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ── Pre-order ────────────────────────────────────────────────────── */}
      <Section
        title={t('preorderTitle') || 'Précommande'}
        desc={
          t('preorderExplainer') ||
          'La précommande permet à vos clients de commander à l’avance pour un retrait ou une livraison ultérieurs. Un seul mode peut être actif à la fois.'
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
          <ModeCard
            title={t('preorderModeOff') || 'Désactivée'}
            desc={t('preorderModeOffDesc') || 'Service immédiat selon les horaires d’ouverture.'}
            selected={mode === 'off'}
            onClick={() => setMode('off')}
          />
          <ModeCard
            title={t('preorderModeSlots') || 'Créneaux horaires'}
            desc={
              t('preorderModeSlotsDesc') ||
              'Le client choisit un jour et un créneau précis (ex. demain à 12h30). Idéal pour étaler le service.'
            }
            selected={mode === 'slots'}
            onClick={() => setMode('slots')}
          />
          <ModeCard
            title={t('preorderModeBatch') || 'Lot hebdomadaire'}
            desc={
              t('preorderModeBatchDesc') ||
              'Les clients commandent toute la semaine, et vous préparez tout le même jour (ex. chaque vendredi).'
            }
            selected={mode === 'batch'}
            onClick={() => setMode('batch')}
          />
        </div>

        {mode === 'slots' && (
          <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-4)]">
            <div className="flex flex-wrap gap-[var(--s-4)]">
              <Field label={t('slotMinDaysAhead') || 'Délai minimum (jours)'}>
                <Input
                  type="number"
                  min={0}
                  value={slotMinDays}
                  onChange={(e) => setSlotMinDays(Number(e.target.value))}
                  className="font-mono"
                  style={{ width: 120 }}
                />
              </Field>
              <Field label={t('slotMaxDaysAhead') || 'Délai maximum (jours)'}>
                <Input
                  type="number"
                  min={1}
                  value={slotMaxDays}
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
                  onChange={(e) => setSlotDuration(Number(e.target.value))}
                  className="font-mono"
                  style={{ width: 120 }}
                />
              </Field>
            </div>
            <PrepaymentToggle
              checked={slotPrepayment}
              onChange={setSlotPrepayment}
              label={t('slotRequirePrepayment') || 'Paiement requis à la réservation'}
              sub={t('slotRequirePrepaymentDesc') || 'Le client paie en réservant son créneau.'}
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
                    <Select value={String(openDay)} onChange={(e) => setOpenDay(Number(e.target.value))}>
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
                    <Select value={String(cutoffDay)} onChange={(e) => setCutoffDay(Number(e.target.value))}>
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBatchDays((p) => [...p, makeDefaultDay(usedBatchDays)])}
                >
                  <Plus />
                  {t('batchFulfillmentAddDay') || 'Ajouter un jour'}
                </Button>
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
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>

            <PrepaymentToggle
              checked={batchPrepayment}
              onChange={setBatchPrepayment}
              label={t('batchFulfillmentRequirePrepayment') || 'Paiement requis à la commande'}
              sub={
                t('batchFulfillmentRequirePrepaymentSubtitle') ||
                'Les clients doivent payer immédiatement lors d’une pré-commande.'
              }
            />
            {batchPrepayment && <CashNote t={t} />}
          </div>
        )}
      </Section>

      {/* ── Service rules ────────────────────────────────────────────────── */}
      <Section
        title={t('serviceRulesTitle') || 'Règles de service'}
        desc={t('serviceRulesDesc') || 'Comment les commandes circulent une fois passées.'}
      >
        <div className="flex flex-col gap-[var(--s-4)]">
          <div className="flex flex-wrap gap-[var(--s-4)]">
            {dineInEnabled && (
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    {t('serviceMode') || 'Mode de service'}
                    <ScopeTag>{t('dineIn') || 'Sur place'}</ScopeTag>
                  </span>
                }
                hint={
                  t('serviceModeHint') ||
                  'Concerne uniquement les commandes sur place (QR à table).'
                }
              >
                <Select value={serviceMode} onChange={(e) => setServiceMode(e.target.value)}>
                  <option value="table">{t('tableService') || 'Service à table'}</option>
                  <option value="counter">{t('counterService') || 'Service au comptoir'}</option>
                </Select>
              </Field>
            )}
            {pickupEnabled && (
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    {t('pickupPrepTime') || 'Temps de préparation par défaut'}
                    <ScopeTag>{t('pickup') || 'À emporter'}</ScopeTag>
                  </span>
                }
              >
                <Input
                  type="number"
                  min={0}
                  max={240}
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                  className="font-mono"
                  style={{ width: 120 }}
                />
              </Field>
            )}
          </div>
          <RuleToggle
            checked={autoSendToKitchen}
            onChange={setAutoSendToKitchen}
            label={t('autoSendToKitchen') || 'Envoi automatique en cuisine'}
            sub={t('autoSendDesc') || 'Les commandes partent en cuisine dès leur acceptation.'}
          />
          <RuleToggle
            checked={tipsEnabled}
            onChange={setTipsEnabled}
            label={t('enableTips') || 'Pourboires'}
            sub={t('enableTipsDesc') || 'Proposer une étape pourboire au client.'}
          />
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-8)] flex-wrap">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving || batchNoDays}
        >
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>}
        {saveError && <span className="text-fs-sm text-[var(--danger-500)] font-medium">{saveError}</span>}
      </div>
    </div>
  );
}

// A small pill marking which service a setting applies to — so it's obvious
// that "Mode de service" and the prep time aren't global rules.
function ScopeTag({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center h-[18px] px-[6px] rounded-r-full text-fs-micro font-medium normal-case tracking-normal"
      style={{
        background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
        color: 'var(--brand-600)',
      }}
    >
      {children}
    </span>
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
}) {
  return <RuleToggle {...props} />;
}

function RuleToggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <label className="flex items-center justify-between gap-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md border border-[var(--line)] cursor-pointer hover:border-[var(--line-strong)] transition-colors">
      <div className="min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
        <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{sub}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}
