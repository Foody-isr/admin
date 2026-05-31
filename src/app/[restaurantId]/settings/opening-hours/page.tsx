'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, CalendarDays, Plus, Trash2 } from 'lucide-react';
import {
  getRestaurant,
  updateRestaurant,
  OpeningHoursConfig,
  DayHours,
  Restaurant,
  WeeklyHours,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Section, Select } from '@/components/ds';
import { clampWeekStartDay, getEffectiveWorkdays, type WeekStartDay } from '@/lib/weeks';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];

// Indexed by JS Date.getDay() so the chip picker matches the same convention
// the rest of the codebase uses for the `workdays` array (Sun=0 … Sat=6).
const DAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ORDER_TYPES = ['pickup', 'dine_in', 'delivery'] as const;
type OrderType = typeof ORDER_TYPES[number];

const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };

function defaultWeek(): WeeklyHours {
  return Object.fromEntries(DAYS.map((d) => [d, { ...DEFAULT_DAY }])) as WeeklyHours;
}

function defaultConfig(): OpeningHoursConfig {
  return { pickup: defaultWeek(), dine_in: defaultWeek(), delivery: defaultWeek() };
}

interface ExceptionalClosure {
  id: string;
  date: string;
  reason: string;
}

export default function OpeningHoursPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderType>('pickup');
  const [config, setConfig] = useState<OpeningHoursConfig>(defaultConfig());
  const [closures, setClosures] = useState<ExceptionalClosure[]>([]);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [dineInEnabled, setDineInEnabled] = useState(true);

  // ── Week settings (separate save flow from the hour grid below) ───────────
  // `weekMode` mirrors the API: "auto" stores [] (derive from hours), "custom"
  // stores the explicit workdays array. We keep both in state so toggling
  // doesn't drop the operator's manual selection mid-session.
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [savedWeekStartDay, setSavedWeekStartDay] = useState<WeekStartDay>(1);
  const [weekMode, setWeekMode] = useState<'auto' | 'custom'>('auto');
  const [savedWeekMode, setSavedWeekMode] = useState<'auto' | 'custom'>('auto');
  const [customWorkdays, setCustomWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [savedCustomWorkdays, setSavedCustomWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekFlash, setWeekFlash] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        if (r.opening_hours_config) {
          const merged: OpeningHoursConfig = defaultConfig();
          for (const ot of ORDER_TYPES) {
            const src = (r.opening_hours_config as OpeningHoursConfig)[ot];
            if (src) {
              for (const day of DAYS) {
                if (src[day]) merged[ot]![day] = src[day];
              }
            }
          }
          setConfig(merged);
        }
        setPickupEnabled(r.pickup_enabled ?? true);
        setDeliveryEnabled(r.delivery_enabled ?? false);
        setDineInEnabled(r.dine_in_enabled ?? true);
        const wsd = clampWeekStartDay(r.week_start_day);
        setWeekStartDay(wsd);
        setSavedWeekStartDay(wsd);
        const explicit = Array.isArray(r.workdays) && r.workdays.length > 0;
        const mode: 'auto' | 'custom' = explicit ? 'custom' : 'auto';
        setWeekMode(mode);
        setSavedWeekMode(mode);
        if (explicit) {
          setCustomWorkdays(r.workdays!);
          setSavedCustomWorkdays(r.workdays!);
        }
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateRestaurant(rid, { opening_hours_config: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Échec de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // Workdays the picker would resolve to under the current (unsaved) config —
  // shown beneath the "Auto" radio so the owner sees what's about to apply
  // without having to read the opening-hours grid below.
  const autoDerivedWorkdays = useMemo(
    () => getEffectiveWorkdays({ opening_hours_config: config }),
    [config],
  );
  const toggleCustomWorkday = (d: number) => {
    setCustomWorkdays((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      return next.sort((a, b) => a - b);
    });
  };

  const workdaysToPersist = weekMode === 'custom' ? customWorkdays : [];
  const sameArray = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  const savedWorkdaysToPersist = savedWeekMode === 'custom' ? savedCustomWorkdays : [];
  const weekChanged =
    weekStartDay !== savedWeekStartDay ||
    weekMode !== savedWeekMode ||
    (weekMode === 'custom' && !sameArray(customWorkdays, savedCustomWorkdays));

  const handleSaveWeek = async () => {
    setSavingWeek(true);
    setWeekError(null);
    try {
      await updateRestaurant(rid, {
        week_start_day: weekStartDay,
        workdays: workdaysToPersist,
      } as Partial<Restaurant>);
      setSavedWeekStartDay(weekStartDay);
      setSavedWeekMode(weekMode);
      setSavedCustomWorkdays(workdaysToPersist.length > 0 ? workdaysToPersist : customWorkdays);
      setWeekFlash(true);
      setTimeout(() => setWeekFlash(false), 2500);
    } catch (e) {
      setWeekError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingWeek(false);
    }
  };

  const updateDay = (orderType: OrderType, day: Day, patch: Partial<DayHours>) => {
    setConfig((prev) => ({
      ...prev,
      [orderType]: {
        ...prev[orderType],
        [day]: { ...prev[orderType]![day], ...patch },
      },
    }));
  };

  const isServiceEnabled = (ot: OrderType): boolean => {
    if (ot === 'pickup') return pickupEnabled;
    if (ot === 'delivery') return deliveryEnabled;
    return dineInEnabled;
  };

  const isScheduleOpenNow = (ot: OrderType): boolean => {
    const week = config[ot] ?? defaultWeek();
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Mon=0
    const day = DAYS[dayIdx];
    const dh = week[day];
    if (!dh || dh.closed) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = dh.open.split(':').map(Number);
    const [ch, cm] = dh.close.split(':').map(Number);
    const o = oh * 60 + om;
    let c = ch * 60 + cm;
    if (c <= o) c += 24 * 60;
    return cur >= o && cur <= c;
  };

  const isOpenNow = isScheduleOpenNow(activeTab);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const allTabs: { key: OrderType; label: string }[] = [
    { key: 'pickup', label: t('pickup') || 'À emporter' },
    { key: 'dine_in', label: t('dineIn') || 'Sur place' },
    { key: 'delivery', label: t('delivery') || 'Livraison' },
  ];
  const tabs = allTabs.filter((tb) => isServiceEnabled(tb.key));
  const noServiceEnabled = tabs.length === 0;
  const effectiveActiveTab: OrderType = isServiceEnabled(activeTab)
    ? activeTab
    : (tabs[0]?.key ?? activeTab);

  const weeklyHours = config[effectiveActiveTab] ?? defaultWeek();

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('openingHours') || 'Horaires'}
        desc={
          t('openingHoursDescNew') ||
          'Affichés sur votre menu en ligne. Les commandes sont bloquées en dehors de ces horaires.'
        }
        actions={
          noServiceEnabled ? null : (
            <Badge tone={isOpenNow ? 'success' : 'neutral'} dot>
              {isOpenNow ? t('openNow') || 'Ouvert maintenant' : t('closedNow') || 'Fermé maintenant'}
            </Badge>
          )
        }
      />

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {t('weekSectionTitle') || 'Week'}
          </span>
        }
        desc={
          t('weekSectionDesc') ||
          'Controls how every weekly editor (menu group rotation, orders date picker) interprets a "week" for this restaurant.'
        }
      >
        <Field label={t('weekStartFieldLabel') || 'First day of the week'}>
          <Select
            value={String(weekStartDay)}
            onChange={(e) => setWeekStartDay(clampWeekStartDay(Number(e.target.value)))}
            disabled={savingWeek}
          >
            <option value="0">{t('weekDaySunday') || 'Sunday'}</option>
            <option value="1">{t('weekDayMonday') || 'Monday'}</option>
            <option value="6">{t('weekDaySaturday') || 'Saturday'}</option>
          </Select>
        </Field>

        <Field label={t('workdaysFieldLabel') || 'Work days'}>
          <div className="flex flex-col gap-[var(--s-3)]">
            <label className="flex items-start gap-2 cursor-pointer text-fs-sm">
              <input
                type="radio"
                name="workdays-mode"
                checked={weekMode === 'auto'}
                onChange={() => setWeekMode('auto')}
                disabled={savingWeek}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-[var(--fg)]">
                  {t('workdaysModeAuto') || 'Auto from opening hours'}
                </div>
                <div className="text-fs-xs text-[var(--fg-muted)]">
                  {(t('workdaysAutoPreview') || 'Currently: {days}').replace(
                    '{days}',
                    autoDerivedWorkdays.map((d) => DAY_SHORT_LABELS[d]).join(', ') || '—',
                  )}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer text-fs-sm">
              <input
                type="radio"
                name="workdays-mode"
                checked={weekMode === 'custom'}
                onChange={() => setWeekMode('custom')}
                disabled={savingWeek}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-[var(--fg)]">
                  {t('workdaysModeCustom') || 'Custom'}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DAY_SHORT_LABELS.map((label, idx) => {
                    const active = customWorkdays.includes(idx);
                    const disabled = weekMode !== 'custom' || savingWeek;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleCustomWorkday(idx)}
                        disabled={disabled}
                        className={`px-3 py-1.5 rounded-full text-fs-xs font-medium border transition-colors ${
                          active
                            ? 'bg-[var(--brand-500)] text-white border-[var(--brand-500)]'
                            : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)] hover:text-[var(--fg)]'
                        } ${disabled && !active ? 'opacity-50' : ''}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </label>
          </div>
        </Field>

        <div className="mt-[var(--s-4)] flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handleSaveWeek}
            disabled={!weekChanged || savingWeek}
          >
            {savingWeek ? t('saving') || 'Saving…' : t('save') || 'Save'}
          </Button>
          {weekFlash && (
            <span className="text-fs-sm text-[var(--success-500)]">{t('saved') || 'Saved'}</span>
          )}
          {weekError && (
            <span className="text-fs-sm text-[var(--danger-500)]">{weekError}</span>
          )}
        </div>
      </Section>

      {noServiceEnabled ? (
        <div
          className="mb-[var(--s-4)] px-[var(--s-4)] py-[var(--s-4)] rounded-r-md text-fs-sm"
          style={{
            background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
            color: 'var(--warning-500)',
            border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
          }}
        >
          {t('noServiceEnabledBanner') ||
            'Aucun mode de commande n’est activé. Activez À emporter, Sur place ou Livraison dans Paramètres → Général → Service & disponibilité pour configurer leurs horaires.'}
        </div>
      ) : (
        tabs.length > 1 && (
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
        )
      )}

      {!noServiceEnabled && (
      <Section title={t('businessHours') || "Heures d'ouverture"}>
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
      </Section>
      )}

      {!noServiceEnabled && (
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)] flex-wrap">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
        {saveError && (
          <span className="text-fs-sm text-[var(--danger-500)] font-medium">
            {saveError}
          </span>
        )}
      </div>
      )}

      <Section title={t('exceptionalClosures') || 'Fermetures exceptionnelles'}>
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
              setClosures((p) => [
                ...p,
                { id: Math.random().toString(36).slice(2), date, reason },
              ]);
            }}
          >
            <Plus />
            {t('addClosure') || 'Ajouter une fermeture'}
          </Button>
        </div>
      </Section>
    </div>
  );
}
