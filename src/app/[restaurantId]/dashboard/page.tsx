'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getPeriodSummary, getDailySeries, getDayComparison, getRestaurant, getDisplayPreferences, updateDisplayPreferences, listOrders,
  type PeriodComparison, type DaySummary, type ComparisonResult, type DashboardRevenueMode, type DateBasis, type ListOrdersResult } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import DateRangePicker, { type DateRange, type DateRangeChangeOptions } from '@/components/DateRangePicker';
import { previousBlock, seriesInRange, useOrderSeries } from '@/lib/series';
import { clampWeekStartDay, getEffectiveWorkdays, getWeekStart, addDays, isoDate, type WeekStartDay } from '@/lib/weeks';
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ds';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { failedRestaurantState, loadingRestaurantState, readyRestaurantState, RestaurantRequestGuard,
  stateForRestaurant, type RestaurantLoadState } from '@/lib/restaurant-request-state';
import { dashboardLiveOrderScope } from '@/lib/dashboard-live-order-scope';
import { PAYMENT_ATTENTION_FILTER } from '@/lib/orders/routes';
import OperationalSummary from './OperationalSummary';
import OrderVolumeChart from './OrderVolumeChart';
import PerformanceSection from './PerformanceSection';
import DashboardSidebar from './DashboardSidebar';
import './dashboard.css';

interface DashboardData {
  period: PeriodComparison | null;
  series: DaySummary[] | null;
  previousSeries: DaySummary[] | null;
  volume: ComparisonResult | null;
  review: ListOrdersResult | null;
  readyOrders: ListOrdersResult | null;
  payments: ListOrdersResult | null;
  recent: ListOrdersResult | null;
}

// The dashboard period is remembered per user and restaurant. Rolling presets
// (today, last 7 days, this week…) are stored as a re-resolving key so they stay
// fresh across days; a custom window is stored as literal dates. V3 introduces
// the user/restaurant namespace so one venue cannot leak its range into another.
const RANGE_STORAGE_PREFIX = 'foody.dashboard.range.v3';

function rangeStorageKey(userID: number | undefined, restaurantID: number): string {
  return `${RANGE_STORAGE_PREFIX}.${userID ?? 'unknown'}.${restaurantID}`;
}

type RollingPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisWeek' | 'thisMonth';
type StoredSel = { preset: RollingPreset } | { from: string; to: string };
const ROLLING_PRESETS: RollingPreset[] = ['today', 'yesterday', 'last7', 'last30', 'thisWeek', 'thisMonth'];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Inclusive day span of a range (1 = single day). */
function daysInclusive(range: DateRange): number {
  const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((strip(range.to) - strip(range.from)) / 86_400_000) + 1;
}

/** Resolves a rolling preset to a concrete [from, to] window for "now", so a
 *  stored "today" / "this week" re-resolves each day instead of freezing. */
function resolvePreset(preset: RollingPreset, wsd: WeekStartDay): DateRange {
  const today = startOfToday();
  switch (preset) {
    case 'yesterday': { const d = addDays(today, -1); return { from: d, to: d }; }
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'thisWeek': return { from: getWeekStart(today, wsd), to: today };
    case 'thisMonth': return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    default: return { from: today, to: today };
  }
}

/** Classifies a picked window as a re-resolvable rolling preset when it matches
 *  one for today, else as literal dates (custom + saved windows freeze). */
function classifySelection(range: DateRange, wsd: WeekStartDay): StoredSel {
  for (const p of ROLLING_PRESETS) {
    const r = resolvePreset(p, wsd);
    if (sameYMD(r.from, range.from) && sameYMD(r.to, range.to)) return { preset: p };
  }
  return { from: isoDate(range.from), to: isoDate(range.to) };
}

function resolveStored(sel: StoredSel, wsd: WeekStartDay): DateRange {
  if ('preset' in sel) return resolvePreset(sel.preset, wsd);
  return { from: new Date(`${sel.from}T00:00:00`), to: new Date(`${sel.to}T00:00:00`) };
}

function readStoredSel(storageKey: string): StoredSel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && (typeof v.preset === 'string' || (typeof v.from === 'string' && typeof v.to === 'string'))) {
      return v as StoredSel;
    }
  } catch { /* malformed — ignore */ }
  return null;
}

function writeStoredSel(storageKey: string, sel: StoredSel): void {
  try { localStorage.setItem(storageKey, JSON.stringify(sel)); } catch { /* quota / private mode */ }
}

const DATE_LOCALES: Record<'en' | 'he' | 'fr', string> = {
  en: 'en-US',
  he: 'he-IL',
  fr: 'fr-FR',
};

/** Restaurant home prioritizes the selected service and its operational work. */
export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const canViewOrders = hasAnyPermission('orders.view', 'orders.manage');
  const { code: currency } = useCurrency();
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value);
  const dateLocale = DATE_LOCALES[locale];
  const guardRef = useRef(new RestaurantRequestGuard());
  guardRef.current.enterRestaurant(rid);
  const [state, setState] = useState<RestaurantLoadState<DashboardData>>(() => loadingRestaurantState(rid));
  const visible = stateForRestaurant(state, rid);
  const { period, series, previousSeries, volume, review, readyOrders, payments, recent } = visible.data ?? {
    period: null, series: null, previousSeries: null, volume: null, review: null, readyOrders: null, payments: null, recent: null,
  };
  const [wsd, setWsd] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dateRange, setDateRange] = useState<DateRange>(() => resolvePreset('today', 1));
  const [basis, setBasis] = useState<DateBasis>('created');
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const [revenueMode, setRevenueMode] = useState<DashboardRevenueMode>('paid_only');
  const [ready, setReady] = useState(false);
  const [compareWeek, setCompareWeek] = useState(false);
  const rangeKey = useMemo(() => rangeStorageKey(user?.id, rid), [user?.id, rid]);
  const serieMode = basis === 'serie';
  const serieList = useOrderSeries(rid);
  const today = isoDate(startOfToday());
  const lastWeek = isoDate(addDays(startOfToday(), -7));
  const previousSerieRange = useMemo(() => serieMode ? previousBlock(serieList, {
    from: isoDate(dateRange.from), to: isoDate(dateRange.to),
  }) ?? undefined : undefined, [serieMode, serieList, dateRange]);
  const previousRange = useMemo(() => {
    if (serieMode) return previousSerieRange;
    const offset = compareWeek && daysInclusive(dateRange) === 1 ? 7 : daysInclusive(dateRange);
    return { from: isoDate(addDays(dateRange.from, -offset)), to: isoDate(addDays(dateRange.to, -offset)) };
  }, [serieMode, previousSerieRange, compareWeek, dateRange]);

  useEffect(() => {
    let active = true;
    setReady(false);
    Promise.allSettled([getRestaurant(rid), getDisplayPreferences(rid)]).then(([restaurant, prefs]) => {
      if (!active) return;
      const weekStart = restaurant.status === 'fulfilled' ? clampWeekStartDay(restaurant.value.week_start_day) : 1;
      setWsd(weekStart);
      if (restaurant.status === 'fulfilled') {
        setWorkdays(getEffectiveWorkdays(restaurant.value));
        setRevenueMode(restaurant.value.dashboard_revenue_mode ?? 'paid_only');
      }
      const stored = readStoredSel(rangeKey);
      setDateRange(stored ? resolveStored(stored, weekStart) : resolvePreset('today', weekStart));
      if (prefs.status === 'fulfilled') setBasis(prefs.value.dashboard_date_basis);
      setPreferenceSaveFailed(prefs.status === 'rejected');
      setReady(true);
    });
    return () => { active = false; };
  }, [rid, rangeKey]);

  const load = useCallback(() => {
    const guard = guardRef.current;
    const token = guard.begin(rid);
    // Keep the previous frame visible during a refresh, but never across restaurants.
    setState((old) => ({ ...loadingRestaurantState<DashboardData>(rid), data: stateForRestaurant(old, rid).data }));
    const scope = { from: isoDate(dateRange.from), to: isoDate(dateRange.to) };
    const orderScope = dashboardLiveOrderScope(scope, basis);
    const activeStatuses = 'scheduled,pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery';
    const days = daysInclusive(dateRange);
    Promise.allSettled([
      getPeriodSummary(rid, scope, basis, previousRange),
      getDailySeries(rid, days, scope.to, basis, serieMode ? scope : undefined),
      previousRange ? getDailySeries(rid, days, previousRange.to, basis, serieMode ? previousRange : undefined) : Promise.resolve([] as DaySummary[]),
      !serieMode ? getDayComparison(rid, today, lastWeek) : Promise.resolve(null),
      canViewOrders ? listOrders(rid, { ...orderScope, status: 'pending_review', limit: 1 }) : Promise.resolve(null),
      canViewOrders ? listOrders(rid, { ...orderScope, status: 'ready,ready_for_pickup,ready_for_delivery', limit: 1 }) : Promise.resolve(null),
      canViewOrders ? listOrders(rid, { ...orderScope, status: activeStatuses, payment_status: PAYMENT_ATTENTION_FILTER, limit: 1 }) : Promise.resolve(null),
      canViewOrders ? listOrders(rid, { ...orderScope, limit: 5, sort_by: 'created_at', sort_dir: 'desc' }) : Promise.resolve(null),
    ]).then(([per, daily, prior, orders, pending, readyList, unpaid, latest]) => {
      if (!guard.isCurrent(token)) return;
      const data: DashboardData = {
        period: per.status === 'fulfilled' ? per.value : null,
        series: daily.status === 'fulfilled' ? daily.value : null,
        previousSeries: prior.status === 'fulfilled' ? prior.value : null,
        volume: orders.status === 'fulfilled' ? orders.value : null,
        review: pending.status === 'fulfilled' ? pending.value : null,
        readyOrders: readyList.status === 'fulfilled' ? readyList.value : null,
        payments: unpaid.status === 'fulfilled' ? unpaid.value : null,
        recent: latest.status === 'fulfilled' ? latest.value : null,
      };
      setState([per, daily, prior, orders, pending, readyList, unpaid, latest].some((r) => r.status === 'rejected')
        ? failedRestaurantState(rid, data) : readyRestaurantState(rid, data));
    });
  }, [rid, dateRange, basis, previousRange, serieMode, today, lastWeek, canViewOrders]);
  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => () => guardRef.current.invalidate(), []);

  const onChangeBasis = (next: DateBasis) => {
    setBasis(next);
    setPreferenceSaveFailed(false);
    void updateDisplayPreferences(rid, { dashboard_date_basis: next }).catch(() => setPreferenceSaveFailed(true));
  };
  const onPickRange = (range: DateRange, options?: DateRangeChangeOptions) => {
    setDateRange(range);
    writeStoredSel(rangeKey, options?.literal ? { from: isoDate(range.from), to: isoDate(range.to) } : classifySelection(range, wsd));
  };
  const singleDay = sameYMD(dateRange.from, dateRange.to);
  const upcomingSerie = serieMode && isoDate(dateRange.to) >= today;
  const selectedSerieCount = seriesInRange(serieList, { from: isoDate(dateRange.from), to: isoDate(dateRange.to) }).length;
  const comparisonLabel = serieMode
    ? selectedSerieCount > 1 ? t('vsPreviousSeries').replace('{n}', String(selectedSerieCount)) : t('vsPreviousSerie')
    : singleDay ? t(compareWeek ? 'dashboardSameDayLastWeek' : 'previousDay') : t('vsPreviousPeriod');
  const shortDate = (date: Date) => date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const modeLabel = t(`dashboardMode_${revenueMode}`);
  const dateControl =
    <DateRangePicker value={dateRange} onChange={onPickRange} weekStartDay={wsd} workdays={workdays} restaurantId={rid}
      basis={basis} onBasisChange={onChangeBasis} series={serieList} triggerClassName="dashboard-filter"
      triggerContent={<><span>{serieMode ? t('dateBasisSerieShort') : t('date')}</span><strong>{shortDate(dateRange.from)}{!singleDay && ` – ${shortDate(dateRange.to)}`}</strong><ChevronDown size={16} /></>} />;
  const filterControls = <>
    {!upcomingSerie && <Menu><MenuTrigger asChild><button type="button" className="dashboard-filter" aria-label={`${t('comparison')}: ${comparisonLabel}`}><strong>{comparisonLabel}</strong><ChevronDown size={14} /></button></MenuTrigger>
      <MenuContent align="start">
        <MenuItem disabled={serieMode} onSelect={() => setCompareWeek(false)}>{!compareWeek && <Check size={16} />}{t(singleDay ? 'previousDay' : 'vsPreviousPeriod')}</MenuItem>
        {!serieMode && singleDay && <MenuItem onSelect={() => setCompareWeek(true)}>{compareWeek && <Check size={16} />}{t('dashboardSameDayLastWeek')}</MenuItem>}
        {serieMode && <MenuItem disabled>{comparisonLabel}</MenuItem>}
      </MenuContent>
    </Menu>}
    <Menu><MenuTrigger asChild><button type="button" className="dashboard-filter"><span>{t('dashboardRevenueMode')}</span><strong>{modeLabel}</strong><ChevronDown size={14} /></button></MenuTrigger>
      <MenuContent align="start" className="max-w-[300px]">
        <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">{t(`${revenueMode}DashboardHint`)}</p>
        {hasPermission('settings.edit') && <MenuItem asChild><Link href={`/${rid}/settings`}>{t('dashboardRevenueCalculation')}</Link></MenuItem>}
      </MenuContent>
    </Menu>
  </>;

  return <div className="dashboard-home" aria-busy={visible.status === 'loading'}>
    <header className="dashboard-header">
      <div><h1>{t('dashboardHome')}</h1><p>{t(serieMode ? 'dashboardSerieContext' : 'dashboardOrderContext').replace('{range}',
        `${dateRange.from.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}${!singleDay ? ` – ${dateRange.to.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })}` : ''}`)}</p></div>
      <div className="dashboard-header-actions">{dateControl}<button type="button" className="dashboard-refresh" onClick={load} disabled={visible.status === 'loading'} aria-label={t('refresh')}><RefreshCw size={18} /></button></div>
    </header>
    {(visible.status === 'error' || preferenceSaveFailed) && <div className="dashboard-error" role="alert">
      <span>{preferenceSaveFailed ? t('displayPreferenceSaveFailed') : t('couldNotLoad')}</span>
      <button type="button" onClick={() => { if (preferenceSaveFailed) onChangeBasis(basis); load(); }}>{t('retry')}</button>
    </div>}
    {canViewOrders && <OperationalSummary restaurantId={rid} review={review} readyOrders={readyOrders} payments={payments}
      scope={{ from: isoDate(dateRange.from), to: isoDate(dateRange.to), dateField: basis }} loading={visible.status === 'loading'} />}
    <div className="dashboard-grid">
      <div className="dashboard-main-column">
        <PerformanceSection period={period} series={series} previousSeries={previousSeries} controls={filterControls}
          comparisonLabel={comparisonLabel} comparable={!upcomingSerie && (!serieMode || !!previousSerieRange)} serieMode={serieMode}
          serieDate={isoDate(dateRange.to)} previousSerieDate={previousSerieRange?.to}
          comparisonNote={upcomingSerie ? t('dashboardOpenSerieComparison') : undefined}
          chartNote={!serieMode && daysInclusive(dateRange) > 90 ? t('dashChartLast90') : undefined}
          loading={visible.status === 'loading'} />
        {!serieMode && <OrderVolumeChart hourly={volume?.hourly ?? null} currentLabel={t('today')}
          previousLabel={new Date(`${lastWeek}T00:00:00`).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          loading={visible.status === 'loading'} />}
      </div>
      <DashboardSidebar restaurantId={rid} revenue={volume ? money(volume.current.gross_sales) : '—'} serieMode={serieMode}
        scope={{ from: isoDate(dateRange.from), to: isoDate(dateRange.to), dateField: basis }} recent={recent} loading={visible.status === 'loading'} />
    </div>
  </div>;
}
