'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPeriodSummary,
  getTopSellers,
  getDailySeries,
  getBreakdown,
  getRestaurant,
  listOrders,
  type BreakdownRow,
  type PeriodComparison,
  type DaySummary,
  type TopSeller,
  type Order,
  type DateBasis,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import SeriePicker from '@/components/SeriePicker';
import { useOrderSeries, previousBlock, seriesInRange, type SerieRange } from '@/lib/series';
import {
  clampWeekStartDay,
  getEffectiveWorkdays,
  getWeekStart,
  addDays,
  isoDate,
  type WeekStartDay,
} from '@/lib/weeks';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  DollarSign,
  Edit,
  Package,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHead,
  Section,
} from '@/components/ds';
import { InfoTip } from '@/components/help/InfoTip';

type MetricKey = 'revenue' | 'orders' | 'avgTicket' | 'itemsSold';

const LIVE_ORDER_STATUSES = [
  'pending_review',
  'accepted',
  'in_kitchen',
  'ready',
  'ready_for_pickup',
  'ready_for_delivery',
  'out_for_delivery',
].join(',');

interface LiveSummary {
  active: number;
  pendingReview: number;
  ready: number;
  payments?: number;
  oldestCreatedAt?: string;
}

interface ChannelDatum {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  color: string;
}

// The dashboard period is remembered across navigation as a single shared
// preference. Rolling presets (today, last 7 days, this week…) are stored as a
// re-resolving KEY so they stay fresh across days; a custom or saved window is
// stored as literal dates. Bumped to v2 when the enum toggle became the picker.
const RANGE_STORAGE_KEY = 'foody.dashboard.range.v2';
// Persisted separately from the window so the chosen date basis (order date vs
// série/fulfillment date) survives navigation just like the range does.
const BASIS_STORAGE_KEY = 'foody.dashboard.basis.v1';

function readStoredBasis(): DateBasis {
  if (typeof window === 'undefined') return 'created';
  return localStorage.getItem(BASIS_STORAGE_KEY) === 'serie' ? 'serie' : 'created';
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

function readStoredSel(): StoredSel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && (typeof v.preset === 'string' || (typeof v.from === 'string' && typeof v.to === 'string'))) {
      return v as StoredSel;
    }
  } catch { /* malformed — ignore */ }
  return null;
}

function writeStoredSel(sel: StoredSel): void {
  try { localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(sel)); } catch { /* quota / private mode */ }
}

const DATE_LOCALES: Record<'en' | 'he' | 'fr', string> = {
  en: 'en-US',
  he: 'he-IL',
  fr: 'fr-FR',
};

const ORDER_TYPE_KEY: Record<string, 'dineIn' | 'pickup' | 'delivery'> = {
  dine_in: 'dineIn',
  pickup: 'pickup',
  delivery: 'delivery',
};

function fmtMoney(n: number, locale = 'fr-FR', digits = 0) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function pct(now: number, before: number) {
  if (!before) return now > 0 ? 100 : 0;
  return ((now - before) / before) * 100;
}

// Per-metric accessor into a day of the series — keeps the chart, sparklines and
// KPI cards reading from the same source.
function seriesValue(metric: MetricKey, d: DaySummary): number {
  switch (metric) {
    case 'orders':
      return d.transactions;
    case 'avgTicket':
      return d.avg_sale;
    case 'itemsSold':
      return d.items_sold;
    default:
      return d.gross_sales;
  }
}

function formatMetric(metric: MetricKey, n: number, locale: string): string {
  switch (metric) {
    case 'revenue':
      return fmtMoney(n, locale);
    case 'avgTicket':
      return fmtMoney(n, locale, 1);
    default:
      return String(Math.round(n));
  }
}

function relTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function paymentColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'var(--success-500)';
    case 'pending':
      return 'var(--warning-500)';
    case 'refunded':
      return 'var(--info-500)';
    default:
      return 'var(--danger-500)';
  }
}


export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t, locale } = useI18n();
  const dateLocale = DATE_LOCALES[locale];

  const [period, setPeriod] = useState<PeriodComparison | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [series, setSeries] = useState<DaySummary[]>([]);
  const [previousSeries, setPreviousSeries] = useState<DaySummary[]>([]);
  const [channelRows, setChannelRows] = useState<BreakdownRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // First day of week + workdays drive the picker (same config as the orders list).
  const [wsd, setWsd] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  // The selected window. `ready` gates the first fetch until the restaurant's
  // week config is loaded and the persisted selection is hydrated (rolling
  // presets re-resolved against today), so we load once with the right window.
  const [dateRange, setDateRange] = useState<DateRange>(() => resolvePreset('today', 1));
  // Order date vs série date. basis is hydrated from storage on mount; serieDate
  // holds the série selected in série mode (set by the SeriePicker).
  const [basis, setBasis] = useState<DateBasis>('created');
  const [serieSel, setSerieSel] = useState<SerieRange | null>(null);
  const [ready, setReady] = useState(false);
  const serieMode = basis === 'serie';
  // The restaurant's séries (newest first). Drives the SeriePicker + the
  // per-série comparison and chart.
  const serieList = useOrderSeries(rid);

  // Default the série selection to the latest série once the list arrives.
  useEffect(() => {
    if (serieList.length && !serieSel) {
      setSerieSel({ from: serieList[0].date, to: serieList[0].date });
    }
  }, [serieList, serieSel]);
  // The main chart tracks gross revenue; KPI cards are presentational.
  const metric: MetricKey = 'revenue';

  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid)
      .then((r) => {
        const w = clampWeekStartDay(r.week_start_day);
        setWsd(w);
        setWorkdays(getEffectiveWorkdays(r));
        const stored = readStoredSel();
        if (stored) setDateRange(resolveStored(stored, w));
        setBasis(readStoredBasis());
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [rid]);

  const load = useCallback(() => {
    // In série mode, wait until a série selection has resolved.
    if (serieMode && !serieSel) return;
    setLoading(true);
    // Série mode scopes to the selected série(s) by exact scheduled_for and
    // compares against the preceding equal-count block of séries; the per-série
    // chart is drawn from serieList, so no daily series is fetched. Created mode
    // uses the calendar window + last-N-days chart.
    const scope = serieMode
      ? { from: serieSel!.from, to: serieSel!.to }
      : { from: isoDate(dateRange.from), to: isoDate(dateRange.to) };
    const prev = serieMode ? previousBlock(serieList, serieSel!) ?? undefined : undefined;
    const days = daysInclusive(dateRange);
    const previousEnd = isoDate(addDays(dateRange.from, -1));
    Promise.allSettled([
      getPeriodSummary(rid, scope, basis, prev),
      getTopSellers(rid, scope, basis),
      serieMode
        ? Promise.resolve([] as DaySummary[])
        : getDailySeries(rid, days, scope.to, basis),
      serieMode
        ? Promise.resolve([] as DaySummary[])
        : getDailySeries(rid, days, previousEnd, basis),
      getBreakdown(rid, { dimension: 'order_type', scope, basis }),
      listOrders(rid, { limit: 6, sort_by: 'created_at', sort_dir: 'desc' }),
      listOrders(rid, { status: LIVE_ORDER_STATUSES, limit: 1, sort_by: 'created_at', sort_dir: 'asc' }),
      listOrders(rid, { status: 'pending_review', limit: 1 }),
      listOrders(rid, { status: 'ready,ready_for_pickup,ready_for_delivery', limit: 1 }),
      listOrders(rid, { status: LIVE_ORDER_STATUSES, payment_status: 'unpaid', limit: 1 }),
      listOrders(rid, { status: LIVE_ORDER_STATUSES, payment_status: 'pending', limit: 1 }),
    ])
      .then(([per, top, daily, previousDaily, breakdown, orders, active, review, readyOrders, unpaid, pending]) => {
        if (per.status === 'fulfilled') setPeriod(per.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
        if (daily.status === 'fulfilled') setSeries(daily.value ?? []);
        if (previousDaily.status === 'fulfilled') setPreviousSeries(previousDaily.value ?? []);
        setChannelRows(breakdown.status === 'fulfilled' ? breakdown.value.rows : []);
        if (orders.status === 'fulfilled') setRecentOrders(orders.value.orders ?? []);
        if (active.status === 'fulfilled' && review.status === 'fulfilled' && readyOrders.status === 'fulfilled') {
          const payments = unpaid.status === 'fulfilled' && pending.status === 'fulfilled'
            ? unpaid.value.total + pending.value.total
            : undefined;
          setLiveSummary({
            active: active.value.total,
            payments,
            pendingReview: review.value.total,
            ready: readyOrders.value.total,
            oldestCreatedAt: active.value.orders[0]?.created_at,
          });
        } else {
          setLiveSummary(null);
        }
      })
      .finally(() => setLoading(false));
  }, [rid, dateRange, basis, serieMode, serieSel, serieList]);

  // Switch the date basis and persist it; the load effect refetches on change.
  const onChangeBasis = useCallback((b: DateBasis) => {
    setBasis(b);
    try { localStorage.setItem(BASIS_STORAGE_KEY, b); } catch { /* quota / private mode */ }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [load, ready]);

  // Persist the picked window; rolling presets store a re-resolving key.
  const onPickRange = useCallback((range: DateRange) => {
    setDateRange(range);
    writeStoredSel(classifySelection(range, wsd));
  }, [wsd]);

  const current = period?.current;
  const previous = period?.previous;

  const singleDay = sameYMD(dateRange.from, dateRange.to);
  const chartCapped = daysInclusive(dateRange) > 90;

  // Série-aware comparison: a single série compares to the previous série, a
  // range to the preceding equal-count block. The delta is hidden when there's
  // no earlier série to compare against.
  const serieCount = serieMode && serieSel ? seriesInRange(serieList, serieSel).length : 0;
  const serieHasPrev = serieMode && serieSel ? previousBlock(serieList, serieSel) !== null : false;
  const showDelta = serieMode ? serieHasPrev : true;
  const vsLabel = serieMode
    ? serieCount <= 1
      ? t('vsPreviousSerie')
      : t('vsPreviousSeries').replace('{n}', String(serieCount))
    : singleDay
      ? t('vsYesterday')
      : t('vsPreviousPeriod');

  // Human label for the active window. `end` is exclusive (next midnight), so the
  // multi-day form shows the inclusive last day.
  const periodRangeLabel = useMemo(() => {
    if (!current) return '';
    const fmtLong = (iso: string, weekday = false) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale, {
      ...(weekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const startD = new Date(`${current.start}T00:00:00`);
    const lastDay = new Date(`${current.end}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    if (sameYMD(startD, lastDay)) return fmtLong(current.start, true);
    return `${fmtLong(current.start)} – ${fmtLong(isoDate(lastDay))}`;
  }, [current, dateLocale]);

  // KPI definitions, driven by the period totals. Presentational only.
  const metrics: { key: MetricKey; label: string; value: string; delta: number; hint?: string; accent: string }[] = [
    {
      key: 'revenue',
      label: t('grossRevenue'),
      value: fmtMoney(current?.total_revenue ?? 0, dateLocale),
      delta: pct(current?.total_revenue ?? 0, previous?.total_revenue ?? 0),
      accent: 'var(--brand-500)',
    },
    {
      key: 'orders',
      label: t('orders'),
      value: String(current?.total_orders ?? 0),
      delta: pct(current?.total_orders ?? 0, previous?.total_orders ?? 0),
      accent: 'var(--cat-4)',
      // These KPIs reflect realized (paid) activity — the count deliberately
      // excludes unpaid/scheduled orders, so it can trail the Orders list.
      hint: t('paidOrdersOnly'),
    },
    {
      key: 'avgTicket',
      label: t('avgTicket'),
      value: fmtMoney(current?.avg_ticket ?? 0, dateLocale, 1),
      delta: pct(current?.avg_ticket ?? 0, previous?.avg_ticket ?? 0),
      accent: 'var(--cat-5)',
    },
    {
      key: 'itemsSold',
      label: t('itemsSold'),
      value: String(current?.items_sold ?? 0),
      delta: pct(current?.items_sold ?? 0, previous?.items_sold ?? 0),
      accent: 'var(--success-500)',
    },
  ];

  // Bars for the selected metric over the active window.
  const chartData = useMemo(() => {
    const n = series.length;
    const everyN = n > 10 ? Math.ceil(n / 7) : 1;
    return series.map((d, i) => {
      const date = new Date(`${d.date}T00:00:00`);
      const showLabel = i === n - 1 || i % everyN === 0;
      const label =
        n > 10
          ? showLabel
            ? date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })
            : ''
          : date.toLocaleDateString(dateLocale, { weekday: 'short' });
      return {
        day: label,
        label: date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' }),
        value: seriesValue(metric, d),
        isLast: i === n - 1,
      };
    });
  }, [series, metric, dateLocale]);

  // One bar per série (oldest → newest) for a série range — a daily chart is a
  // calendar concept that doesn't fit série cadence.
  const serieChartData = useMemo(() => {
    if (!serieMode || !serieSel) return [] as { day: string; label: string; value: number; isLast: boolean }[];
    const inRange = seriesInRange(serieList, serieSel).slice().reverse();
    return inRange.map((s, i) => {
      const date = new Date(`${s.date}T00:00:00`);
      return {
        day: date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }),
        label: date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' }),
        value: s.revenue,
        isLast: i === inRange.length - 1,
      };
    });
  }, [serieMode, serieSel, serieList, dateLocale]);

  const previousSerieChartData = useMemo(() => {
    if (!serieMode || !serieSel) return [] as { day: string; value: number; isLast: boolean }[];
    const previousRange = previousBlock(serieList, serieSel);
    if (!previousRange) return [];
    const inRange = seriesInRange(serieList, previousRange).slice().reverse();
    return inRange.map((s, i) => ({
      day: new Date(`${s.date}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }),
      value: s.revenue,
      isLast: i === inRange.length - 1,
    }));
  }, [serieMode, serieSel, serieList, dateLocale]);

  const activeChartData = serieMode ? serieChartData : chartData;
  const previousChartData = serieMode
    ? previousSerieChartData
    : previousSeries.map((day, index) => ({
        day: '',
        value: seriesValue(metric, day),
        isLast: index === previousSeries.length - 1,
      }));

  const channelData = useMemo<ChannelDatum[]>(() => {
    const labels: Record<string, string> = {
      delivery: t('delivery'),
      pickup: t('pickup'),
      dine_in: t('dineIn'),
      unknown: t('breakdownUnknown'),
    };
    const colors: Record<string, string> = {
      delivery: 'var(--brand-500)',
      pickup: 'var(--info-500)',
      dine_in: 'var(--success-500)',
      unknown: 'var(--fg-subtle)',
    };
    return channelRows
      .filter((row) => row.revenue > 0 || row.orders > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({
        key: row.key,
        label: labels[row.key] ?? row.label ?? row.key,
        orders: row.orders,
        revenue: row.revenue,
        color: colors[row.key] ?? 'var(--fg-subtle)',
      }));
  }, [channelRows, t]);

  const periodContext = (serieMode ? t('dashboardSerieContext') : t('dashboardOrderContext'))
    .replace('{range}', periodRangeLabel);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={t('dashboardHome') || 'Dashboard'}
        desc={periodContext}
        actions={
          <>
            <CreateActionsMenu restaurantId={rid} onNavigate={router.push} t={t} />
            <DashboardPeriodControl
              basis={basis}
              onChange={onChangeBasis}
              t={t}
              picker={serieMode ? (
                <SeriePicker
                  series={serieList}
                  value={serieSel}
                  onChange={setSerieSel}
                  align="end"
                />
              ) : (
                <DateRangePicker
                  value={dateRange}
                  onChange={onPickRange}
                  weekStartDay={wsd}
                  workdays={workdays}
                  restaurantId={rid}
                  align="right"
                />
              )}
            />
            <Button variant="ghost" size="md" icon aria-label={t('refresh')} onClick={load}>
              <RefreshCw />
            </Button>
          </>
        }
      />

      <OperationsBar
        summary={liveSummary}
        onOpenOrders={() => router.push(`/${rid}/orders/all`)}
        t={t}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-[var(--s-5)] items-start">
        <div className="flex flex-col gap-[var(--s-5)] min-w-0">
          <PerformanceOverview
            title={t('performance')}
            chartNote={chartCapped && !serieMode ? t('dashChartLast90') : undefined}
            metrics={metrics}
            showDelta={showDelta}
            comparisonLabel={vsLabel}
            chart={(
              <MetricChart
                data={activeChartData}
                previousData={previousChartData}
                currentLabel={t('dashboardCurrentPeriod')}
                previousLabel={t('dashboardPreviousPeriod')}
                averageLabel={t('dashboardAverage')}
                peakLabel={t('dashboardPeak')}
                fmt={(n) => formatMetric(metric, n, dateLocale)}
                emptyLabel={t('noSalesIn7Days')}
              />
            )}
            channels={(
              <ChannelMix
                data={channelData}
                locale={dateLocale}
                title={t('salesChannels')}
                emptyLabel={t('noData')}
                ordersLabel={t('orders')}
              />
            )}
          />

          <TopSellersPanel
            sellers={topSellers}
            locale={dateLocale}
            title={t('bestSellingItems')}
            salesLabel={t('sales')}
            emptyLabel={t('noSalesYet')}
            seeAllLabel={t('seeAll')}
            onSeeAll={() => router.push(`/${rid}/analytics/items`)}
          />
        </div>

        <Section
          title={t('recentOrders')}
          className="mb-0 overflow-hidden"
          aside={
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${rid}/orders/all`)}>
              {t('seeAll')}
            </Button>
          }
        >
          {recentOrders.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-8 text-center">{t('noOrdersYet')}</p>
          ) : (
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {recentOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => router.push(`/${rid}/orders/all`)}
                  className="group w-full px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center gap-[var(--s-3)] first:border-t-0 text-left hover:bg-[var(--surface-2)] transition-colors"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: paymentColor(o.payment_status) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-fs-sm text-[var(--fg)] font-medium truncate">
                      {o.customer_name?.trim() || `#${o.id}`}
                    </div>
                    <div className="text-fs-xs text-[var(--fg-muted)] truncate">
                      {t(ORDER_TYPE_KEY[o.order_type] ?? 'dineIn')} · {fmtMoney(o.total_amount, dateLocale)}
                    </div>
                  </div>
                  <span className="text-fs-xs text-[var(--fg-subtle)] shrink-0">
                    {relTime(o.created_at)}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--fg-subtle)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

interface DashboardMetric {
  key: MetricKey;
  label: string;
  value: string;
  delta: number;
  hint?: string;
  accent: string;
}

// Label with an optional ⓘ tooltip — shared by the compact (mobile) and full
// (desktop) KPI renders so the caveat markup lives in one place.
function kpiLabel(label: string, hint?: string) {
  if (!hint) return label;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoTip text={hint} />
    </span>
  );
}

function DashboardPeriodControl({
  basis,
  onChange,
  picker,
  t,
}: {
  basis: DateBasis;
  onChange: (basis: DateBasis) => void;
  picker: React.ReactNode;
  t: (key: string) => string;
}) {
  const serieMode = basis === 'serie';
  const BasisIcon = serieMode ? CalendarClock : CalendarDays;
  const label = serieMode ? t('dashboardServicesScheduled') : t('dashboardOrdersPlaced');
  return (
    <div
      role="group"
      aria-label={t('dashboardAnalyzedPeriod')}
      className="inline-flex items-stretch min-h-11 rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-1 p-1"
    >
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="group flex items-center gap-[var(--s-2)] rounded-[var(--r-md)] px-[var(--s-3)] text-left hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-ring transition-colors"
          >
            <span className="w-7 h-7 rounded-[var(--r-sm)] grid place-items-center bg-[var(--brand-50)] text-[var(--brand-600)]">
              <BasisIcon className="w-4 h-4" />
            </span>
            <span className="hidden sm:block leading-tight">
              <span className="block text-[10px] text-[var(--fg-subtle)]">{t('dashboardAnalyzedPeriod')}</span>
              <span className="block text-fs-sm font-semibold text-[var(--fg)]">{label}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[280px]">
          <MenuItem className="h-auto py-[var(--s-2)] items-start" onSelect={() => onChange('created')}>
            <CalendarDays className="mt-0.5" />
            <span>
              <span className="block font-medium">{t('dashboardOrdersPlaced')}</span>
              <span className="block text-[11px] text-[var(--fg-muted)] mt-0.5">{t('dashboardOrdersPlacedHint')}</span>
            </span>
            {!serieMode && <CheckCircle className="ml-auto mt-0.5 text-[var(--brand-500)]" />}
          </MenuItem>
          <MenuItem className="h-auto py-[var(--s-2)] items-start" onSelect={() => onChange('serie')}>
            <CalendarClock className="mt-0.5" />
            <span>
              <span className="block font-medium">{t('dashboardServicesScheduled')}</span>
              <span className="block text-[11px] text-[var(--fg-muted)] mt-0.5">{t('dashboardServicesScheduledHint')}</span>
            </span>
            {serieMode && <CheckCircle className="ml-auto mt-0.5 text-[var(--brand-500)]" />}
          </MenuItem>
        </MenuContent>
      </Menu>
      <div className="my-1 w-px bg-[var(--line)]" />
      <div className="flex items-stretch [&>div]:flex [&>div]:items-stretch [&>div>button]:!border-0 [&>div>button]:!rounded-[var(--r-md)] [&>div>button]:!px-[var(--s-3)] [&>div>button]:font-semibold [&>div>button]:text-[var(--fg)]">
        {picker}
      </div>
    </div>
  );
}

function CreateActionsMenu({
  restaurantId,
  onNavigate,
  t,
}: {
  restaurantId: number;
  onNavigate: (href: string) => void;
  t: (key: string) => string;
}) {
  const actions = [
    { icon: DollarSign, label: t('acceptPayment'), href: `/${restaurantId}/orders/all` },
    { icon: Edit, label: t('editMenuAction'), href: `/${restaurantId}/menu/menus` },
    { icon: Plus, label: t('addItemAction'), href: `/${restaurantId}/menu/items/new` },
    { icon: Package, label: t('receiveDelivery'), href: `/${restaurantId}/kitchen/stock` },
  ];
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" size="md">
          <Plus className="w-4 h-4" />
          {t('create')}
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[220px]">
        {actions.map(({ icon: Icon, label, href }) => (
          <MenuItem key={href} onSelect={() => onNavigate(href)}>
            <Icon className="w-4 h-4" />
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function OperationsBar({
  summary,
  onOpenOrders,
  t,
}: {
  summary: LiveSummary | null;
  onOpenOrders: () => void;
  t: (key: string) => string;
}) {
  const unavailable = summary === null;
  const hasUrgency = !unavailable && (summary.pendingReview > 0 || (summary.payments ?? 0) > 0 || summary.ready > 0);
  let message = t('dashboardNoUrgent');
  let action = t('viewOrders');
  if (unavailable) message = t('dashboardNowUnavailable');
  else if (summary.pendingReview > 0) {
    message = t('dashboardUrgentReview').replace('{count}', String(summary.pendingReview));
    action = t('dashboardActionReview');
  } else if ((summary.payments ?? 0) > 0) {
    message = t('dashboardUrgentPayments').replace('{count}', String(summary.payments));
    action = t('dashboardActionCollect');
  } else if (summary.ready > 0) {
    message = t('dashboardUrgentReady').replace('{count}', String(summary.ready));
    action = t('dashboardActionReady');
  } else if (summary.active > 0) {
    message = t('dashboardNowActive').replace('{count}', String(summary.active));
  }

  const stats = [
    { value: unavailable ? '—' : summary.active, label: t('dashboardActiveOrders') },
    { value: unavailable ? '—' : summary.pendingReview, label: t('dashboardNeedsReview'), attention: !unavailable && summary.pendingReview > 0 },
    { value: unavailable ? '—' : summary.ready, label: t('dashboardReadyOrders') },
    { value: unavailable || summary.payments == null ? '—' : summary.payments, label: t('dashboardPendingPayments'), attention: !unavailable && (summary.payments ?? 0) > 0 },
  ];

  return (
    <section className="mb-[var(--s-5)] border-y border-[var(--line)] bg-[color:color-mix(in_oklab,var(--surface-2)_65%,var(--surface))] px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-4)]">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(250px,1fr)_auto_auto] gap-[var(--s-4)] xl:gap-[var(--s-5)] items-center">
        <div className="flex items-center gap-[var(--s-3)] min-w-0">
          <div
            className="w-9 h-9 rounded-full grid place-items-center shrink-0"
            style={{
              color: unavailable ? 'var(--fg-muted)' : hasUrgency ? 'var(--warning-500)' : 'var(--success-500)',
              background: unavailable ? 'var(--surface-3)' : hasUrgency ? 'var(--warning-50)' : 'var(--success-50)',
            }}
          >
            {unavailable || hasUrgency ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[var(--fg-subtle)]">{t('dashboardNow')}</div>
            <p className="text-fs-sm font-medium text-[var(--fg)] mt-0.5 truncate">{message}</p>
            {!unavailable && summary.oldestCreatedAt && summary.active > 0 && (
              <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                {t('dashboardOldestOrder').replace('{age}', relTime(summary.oldestCreatedAt))}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-[var(--line)] min-w-0">
          {stats.map((stat) => (
            <div key={stat.label} className="px-[var(--s-3)] first:pl-0 xl:first:pl-[var(--s-3)] min-w-[72px]">
              <div className={`text-fs-lg font-semibold tabular-nums ${stat.attention ? 'text-[var(--warning-500)]' : 'text-[var(--fg)]'}`}>{stat.value}</div>
              <div className="text-[10px] text-[var(--fg-muted)] truncate">{stat.label}</div>
            </div>
          ))}
        </div>

        <Button variant={hasUrgency ? 'primary' : 'secondary'} size="md" onClick={onOpenOrders} className="justify-center whitespace-nowrap">
          {action}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </section>
  );
}

function PerformanceOverview({
  title,
  chartNote,
  metrics,
  showDelta,
  comparisonLabel,
  chart,
  channels,
}: {
  title: string;
  chartNote?: string;
  metrics: DashboardMetric[];
  showDelta: boolean;
  comparisonLabel: string;
  chart?: React.ReactNode;
  channels: React.ReactNode;
}) {
  const primary = metrics[0];
  const primaryUp = primary.delta >= 0;
  return (
    <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r-xl)] overflow-hidden shadow-2">
      <div
        className="h-1.5"
        style={{ background: 'linear-gradient(90deg, var(--brand-500) 0 62%, var(--cat-5) 62% 80%, var(--cat-4) 80% 91%, var(--success-500) 91%)' }}
      />
      <div style={{ background: 'linear-gradient(125deg, color-mix(in oklab, var(--brand-500) 9%, var(--surface)) 0%, var(--surface) 58%, color-mix(in oklab, var(--cat-5) 5%, var(--surface)) 100%)' }}>
        <header className="px-[var(--s-5)] md:px-[var(--s-8)] pt-[var(--s-5)] md:pt-[var(--s-8)] flex items-start justify-between gap-[var(--s-4)] flex-wrap">
          <h2 className="text-fs-xl font-semibold text-[var(--fg)]">{title}</h2>
          {chartNote && <span className="text-fs-xs text-[var(--fg-subtle)]">{chartNote}</span>}
        </header>

        <div className="px-[var(--s-5)] md:px-[var(--s-8)] py-[var(--s-6)] md:pb-[var(--s-8)] grid grid-cols-1 md:grid-cols-[minmax(230px,1fr)_minmax(0,1.35fr)] gap-[var(--s-6)] md:gap-[var(--s-8)] items-end">
          <div>
            <div className="text-fs-sm font-medium text-[var(--fg-muted)]">{primary.label}</div>
            <div className="text-[clamp(3rem,6vw,4.75rem)] font-semibold tracking-[-0.055em] leading-[.92] tabular-nums text-[var(--fg)] mt-[var(--s-3)]">
              {primary.value}
            </div>
            {showDelta && (
              <div className="flex items-center gap-[var(--s-2)] mt-[var(--s-4)] text-fs-xs flex-wrap">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold tabular-nums ${primaryUp ? 'text-[var(--success-500)] bg-[var(--success-50)]' : 'text-[var(--danger-500)] bg-[var(--danger-50)]'}`}
                >
                  {primaryUp ? '↑' : '↓'} {primary.delta >= 0 ? '+' : ''}{primary.delta.toFixed(1)}%
                </span>
                <span className="text-[var(--fg-muted)]">{comparisonLabel}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-[var(--s-3)] md:border-l border-[var(--line-strong)] md:pl-[var(--s-6)]">
            {metrics.slice(1).map((metric) => {
              const up = metric.delta >= 0;
              return (
                <div key={metric.key} className="border-t-2 pt-[var(--s-3)] min-w-0" style={{ borderTopColor: metric.accent }}>
                  <div className="text-[11px] text-[var(--fg-muted)] truncate">{kpiLabel(metric.label, metric.hint)}</div>
                  <div className="text-[clamp(1.15rem,2vw,1.55rem)] font-semibold tabular-nums text-[var(--fg)] mt-1 truncate">{metric.value}</div>
                  {showDelta && (
                    <div className={`text-[11px] font-semibold tabular-nums mt-1 ${up ? 'text-[var(--success-500)]' : 'text-[var(--danger-500)]'}`}>
                      {up ? '↑' : '↓'} {metric.delta >= 0 ? '+' : ''}{metric.delta.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {chart && (
        <div className="border-t border-[var(--line)] px-[var(--s-5)] md:px-[var(--s-8)] py-[var(--s-6)] bg-[color:color-mix(in_oklab,var(--surface-2)_48%,var(--surface))]">
          {chart}
        </div>
      )}
      <div className="border-t border-[var(--line)] px-[var(--s-5)] md:px-[var(--s-8)] py-[var(--s-6)]">
        {channels}
      </div>
    </section>
  );
}

function MetricChart({
  data,
  previousData,
  currentLabel,
  previousLabel,
  averageLabel,
  peakLabel,
  fmt,
  emptyLabel,
}: {
  data: { day: string; label: string; value: number; isLast: boolean }[];
  previousData: { day: string; value: number; isLast: boolean }[];
  currentLabel: string;
  previousLabel: string;
  averageLabel: string;
  peakLabel: string;
  fmt: (n: number) => string;
  emptyLabel: string;
}) {
  const anyData = data.some((d) => d.value > 0);
  if (!anyData) {
    return (
      <div
        className="flex items-center justify-center text-fs-sm text-[var(--fg-subtle)]"
        style={{ height: 180 }}
      >
        {emptyLabel}
      </div>
    );
  }
  const hasPrevious = previousData.some((d) => d.value > 0);
  const max = Math.max(1, ...data.map((d) => d.value), ...previousData.map((d) => d.value));
  const compact = data.length === 1;
  const average = data.reduce((sum, d) => sum + d.value, 0) / data.length;
  const peak = data.reduce((highest, datum) => datum.value > highest.value ? datum : highest, data[0]);

  if (compact) {
    const current = data[0];
    const prior = previousData[0]?.value ?? 0;
    return (
      <div className="h-[230px] flex items-end justify-center gap-[var(--s-8)] md:gap-[var(--s-12)]">
        {hasPrevious && (
          <div className="h-full w-24 flex flex-col items-center justify-end gap-[var(--s-2)]">
            <span className="text-fs-sm font-semibold tabular-nums text-[var(--fg-muted)]">{fmt(prior)}</span>
            <div className="h-[150px] w-full flex items-end justify-center">
              <div className="w-14 rounded-t-[var(--r-sm)] bg-[var(--line-strong)]" style={{ height: `${Math.max(4, (prior / max) * 100)}%` }} />
            </div>
            <span className="text-fs-xs font-medium text-[var(--fg-muted)] text-center">{previousLabel}</span>
          </div>
        )}
        <div className="h-full w-28 flex flex-col items-center justify-end gap-[var(--s-2)]">
          <span className="text-fs-md font-semibold tabular-nums text-[var(--fg)]">{fmt(current.value)}</span>
          <div className="h-[150px] w-full flex items-end justify-center">
            <div
              className="w-16 rounded-t-[var(--r-md)] shadow-2"
              style={{
                height: `${Math.max(4, (current.value / max) * 100)}%`,
                background: 'linear-gradient(180deg, var(--brand-400), var(--brand-600))',
              }}
            />
          </div>
          <span className="text-fs-xs font-semibold text-[var(--fg)] text-center">{currentLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-[var(--s-4)] text-[11px] text-[var(--fg-muted)] mb-[var(--s-4)] flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px] bg-[var(--brand-500)]" />{currentLabel}</span>
        {hasPrevious && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px] bg-[var(--line-strong)]" />{previousLabel}</span>}
        <span className="ml-auto tabular-nums">{averageLabel} · {fmt(average)}</span>
        <span className="tabular-nums">{peakLabel} · {peak.label} · {fmt(peak.value)}</span>
      </div>
      <div className="relative h-[190px]">
        <div className="absolute inset-x-0 border-t border-dashed border-[var(--line-strong)] z-[1]" style={{ bottom: `${(average / max) * 100}%` }} />
        <div className="absolute inset-0 flex items-end justify-between gap-[var(--s-2)]">
          {data.map((d, i) => {
            const prior = previousData[i]?.value ?? 0;
            return (
              <div
                key={`${d.day}-${i}`}
                className="group relative flex-1 flex flex-col items-center gap-[var(--s-2)] h-full min-w-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]"
                tabIndex={0}
                aria-label={`${d.label}: ${fmt(d.value)}`}
              >
                <div className="pointer-events-none absolute z-10 top-1 left-1/2 -translate-x-1/2 rounded-r-sm bg-[var(--fg)] text-[var(--surface)] px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-2">
                  <span>{d.label}</span> · <strong>{fmt(d.value)}</strong>{hasPrevious ? ` · ${fmt(prior)}` : ''}
                </div>
                <div className="flex items-end h-full w-full justify-center gap-[2px]">
                  {hasPrevious && (
                    <div className="w-full max-w-[11px] rounded-t-[2px] bg-[var(--line-strong)]" style={{ height: `${Math.max(1, (prior / max) * 100)}%` }} />
                  )}
                  <div
                    className="w-full max-w-[16px] rounded-t-[3px] bg-[var(--brand-500)]"
                    style={{ height: `${Math.max(1, (d.value / max) * 100)}%`, opacity: d.isLast ? 1 : 0.62 }}
                    title={fmt(d.value)}
                  />
                </div>
                <span className="text-[10px] text-[var(--fg-muted)] whitespace-nowrap min-h-[14px]">{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChannelMix({
  data,
  locale,
  title,
  emptyLabel,
  ordersLabel,
}: {
  data: ChannelDatum[];
  locale: string;
  title: string;
  emptyLabel: string;
  ordersLabel: string;
}) {
  const total = data.reduce((sum, row) => sum + row.revenue, 0);
  return (
    <div>
      <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-3)]">
        <h3 className="text-fs-sm font-semibold text-[var(--fg)]">{title}</h3>
        {total > 0 && <span className="text-fs-xs tabular-nums text-[var(--fg-muted)]">{fmtMoney(total, locale)}</span>}
      </div>
      {data.length === 0 || total <= 0 ? (
        <p className="text-fs-sm text-[var(--fg-subtle)] py-3">{emptyLabel}</p>
      ) : (
        <>
          <div className="h-2 rounded-full overflow-hidden flex bg-[var(--surface-3)]" aria-hidden="true">
            {data.map((row) => (
              <span key={row.key} style={{ width: `${(row.revenue / total) * 100}%`, background: row.color }} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--s-3)] mt-[var(--s-4)]">
            {data.map((row) => (
              <div key={row.key} className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
                  <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: row.color }} />
                  <span className="truncate">{row.label}</span>
                  <span className="ml-auto tabular-nums">{Math.round((row.revenue / total) * 100)}%</span>
                </div>
                <div className="text-fs-sm font-medium tabular-nums text-[var(--fg)] mt-1">{fmtMoney(row.revenue, locale)}</div>
                <div className="text-[10px] text-[var(--fg-subtle)]">{row.orders} {ordersLabel.toLocaleLowerCase(locale)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopSellersPanel({
  sellers,
  locale,
  title,
  salesLabel,
  emptyLabel,
  seeAllLabel,
  onSeeAll,
}: {
  sellers: TopSeller[];
  locale: string;
  title: string;
  salesLabel: string;
  emptyLabel: string;
  seeAllLabel: string;
  onSeeAll: () => void;
}) {
  const visible = sellers.slice(0, 5);
  const maxRevenue = Math.max(0, ...visible.map((seller) => seller.revenue));
  return (
    <Section
      title={title}
      className="mb-0 overflow-hidden"
      aside={<Button variant="ghost" size="sm" onClick={onSeeAll}>{seeAllLabel}</Button>}
    >
      {visible.length === 0 ? (
        <p className="text-fs-sm text-[var(--fg-subtle)] py-6 text-center">{emptyLabel}</p>
      ) : (
        <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
          {visible.map((seller, index) => (
            <div key={seller.name} className="px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center gap-[var(--s-3)] first:border-t-0">
              <div className="w-8 h-8 rounded-r-sm bg-[var(--surface-3)] grid place-items-center text-[var(--fg-muted)] text-[10px] font-bold shrink-0">{index + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-fs-sm text-[var(--fg)] font-medium truncate">{seller.name}</div>
                <div className="text-fs-xs text-[var(--fg-muted)]">{seller.quantity} {salesLabel}</div>
              </div>
              <div className="hidden sm:block w-20 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden shrink-0">
                <div className="h-full bg-[var(--brand-500)]" style={{ width: `${maxRevenue > 0 ? (seller.revenue / maxRevenue) * 100 : 0}%` }} />
              </div>
              <div className="tabular-nums text-fs-sm font-medium text-[var(--fg)] min-w-[82px] text-right">{fmtMoney(seller.revenue, locale, 2)}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
