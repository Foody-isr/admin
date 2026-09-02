'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPeriodSummary,
  getTopSellers,
  getDailySeries,
  getRestaurant,
  listOrders,
  type PeriodComparison,
  type DaySummary,
  type TopSeller,
  type Order,
  type DateBasis,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import DateBasisToggle from '@/components/DateBasisToggle';
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
  Activity,
  ArrowRight,
  Clock,
  DollarSign,
  Edit,
  Package,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Badge, Button, PageHead, Section } from '@/components/ds';
import { InfoTip } from '@/components/help/InfoTip';

type MetricKey = 'revenue' | 'orders' | 'avgTicket' | 'itemsSold';

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

function fmtDate(d = new Date(), locale = 'fr-FR') {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

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
      return d.net_sales;
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
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [liveSummary, setLiveSummary] = useState<{ active: number; payments?: number } | null>(null);
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
    Promise.allSettled([
      getPeriodSummary(rid, scope, basis, prev),
      getTopSellers(rid, scope, basis),
      serieMode
        ? Promise.resolve([] as DaySummary[])
        : getDailySeries(rid, days, scope.to, basis),
      listOrders(rid, { limit: 6, sort_by: 'created_at', sort_dir: 'desc' }),
      listOrders(rid, { active: true, limit: 1 }),
      listOrders(rid, { active: true, payment_status: 'unpaid', limit: 1 }),
      listOrders(rid, { active: true, payment_status: 'pending', limit: 1 }),
    ])
      .then(([per, top, daily, orders, active, unpaid, pending]) => {
        if (per.status === 'fulfilled') setPeriod(per.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
        if (daily.status === 'fulfilled') setSeries(daily.value ?? []);
        if (orders.status === 'fulfilled') setRecentOrders(orders.value.orders ?? []);
        if (active.status === 'fulfilled') {
          const payments = unpaid.status === 'fulfilled' && pending.status === 'fulfilled'
            ? unpaid.value.total + pending.value.total
            : undefined;
          setLiveSummary({ active: active.value.total, payments });
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
    const fmtShort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale);
    const startD = new Date(`${current.start}T00:00:00`);
    const lastDay = new Date(`${current.end}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    if (sameYMD(startD, lastDay)) return fmtShort(current.start);
    return `${fmtShort(current.start)} → ${lastDay.toLocaleDateString(dateLocale)}`;
  }, [current, dateLocale]);

  // KPI definitions, driven by the period totals. Presentational only.
  const metrics: { key: MetricKey; label: string; value: string; delta: number; hint?: string }[] = [
    {
      key: 'revenue',
      label: t('grossRevenue'),
      value: fmtMoney(current?.total_revenue ?? 0, dateLocale),
      delta: pct(current?.total_revenue ?? 0, previous?.total_revenue ?? 0),
    },
    {
      key: 'orders',
      label: t('orders'),
      value: String(current?.total_orders ?? 0),
      delta: pct(current?.total_orders ?? 0, previous?.total_orders ?? 0),
      // These KPIs reflect realized (paid) activity — the count deliberately
      // excludes unpaid/scheduled orders, so it can trail the Orders list.
      hint: t('paidOrdersOnly'),
    },
    {
      key: 'avgTicket',
      label: t('avgTicket'),
      value: fmtMoney(current?.avg_ticket ?? 0, dateLocale, 1),
      delta: pct(current?.avg_ticket ?? 0, previous?.avg_ticket ?? 0),
    },
    {
      key: 'itemsSold',
      label: t('itemsSold'),
      value: String(current?.items_sold ?? 0),
      delta: pct(current?.items_sold ?? 0, previous?.items_sold ?? 0),
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
      return { day: label, value: seriesValue(metric, d), isLast: i === n - 1 };
    });
  }, [series, metric, dateLocale]);

  // One bar per série (oldest → newest) for a série range — a daily chart is a
  // calendar concept that doesn't fit série cadence.
  const serieChartData = useMemo(() => {
    if (!serieMode || !serieSel) return [] as { day: string; value: number; isLast: boolean }[];
    const inRange = seriesInRange(serieList, serieSel).slice().reverse();
    return inRange.map((s, i) => ({
      day: new Date(`${s.date}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }),
      value: s.revenue,
      isLast: i === inRange.length - 1,
    }));
  }, [serieMode, serieSel, serieList, dateLocale]);

  // A single série is one bar (not useful) — only show the chart for ranges.
  const showChart = serieMode ? serieChartData.length > 1 : true;
  const activeChartData = serieMode ? serieChartData : chartData;

  const periodContext = (serieMode ? t('dashboardSerieContext') : t('dashboardOrderContext'))
    .replace('{range}', periodRangeLabel);
  const latestOrderLabel = recentOrders[0] ? relTime(recentOrders[0].created_at) : '—';

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
        desc={fmtDate(new Date(), dateLocale)}
        actions={
          <>
            <DateBasisToggle value={basis} onChange={onChangeBasis} />
            {serieMode ? (
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
            <Button variant="ghost" size="md" icon aria-label={t('refresh')} onClick={load}>
              <RefreshCw />
            </Button>
          </>
        }
      />

      <ServicePulse
        activeOrders={liveSummary?.active}
        pendingPayments={liveSummary?.payments}
        latestOrder={latestOrderLabel}
        onOpenOrders={() => router.push(`/${rid}/orders/all`)}
        t={t}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)] gap-[var(--s-5)] mb-[var(--s-5)] items-start">
        <PerformanceOverview
          title={t('performance')}
          context={periodContext}
          chartNote={chartCapped && !serieMode ? t('dashChartLast90') : undefined}
          metrics={metrics}
          showDelta={showDelta}
          comparisonLabel={vsLabel}
          chart={showChart ? (
            <MetricChart
              data={activeChartData}
              fmt={(n) => formatMetric(metric, n, dateLocale)}
              emptyLabel={t('noSalesIn7Days')}
            />
          ) : undefined}
        />

        <Section
          title={t('recentActivity')}
          className="mb-0 overflow-hidden"
          aside={
            <Badge tone="success" dot>
              {t('online')}
            </Badge>
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-[var(--s-5)] items-start">
        <Section
          title={t('bestSellingItems')}
          desc={periodContext}
          className="mb-0 overflow-hidden"
          aside={
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${rid}/analytics/items`)}>
              {t('seeAll')}
            </Button>
          }
        >
          {topSellers.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-6 text-center">{t('noSalesYet')}</p>
          ) : (
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {topSellers.slice(0, 5).map((s, i) => {
                const maxRev = Math.max(...topSellers.slice(0, 5).map((x) => x.revenue));
                const pctBar = maxRev > 0 ? (s.revenue / maxRev) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center gap-[var(--s-3)] first:border-t-0"
                  >
                    <div className="w-8 h-8 rounded-r-sm bg-[var(--surface-3)] grid place-items-center text-[var(--fg-muted)] text-[10px] font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-fs-sm text-[var(--fg)] font-medium truncate">{s.name}</div>
                      <div className="text-fs-xs text-[var(--fg-muted)]">
                        {s.quantity} {t('sales')}
                      </div>
                    </div>
                    <div className="hidden sm:block w-20 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-[var(--brand-500)]" style={{ width: `${pctBar}%` }} />
                    </div>
                    <div className="tabular-nums text-fs-sm font-medium text-[var(--fg)] min-w-[82px] text-right">
                      {fmtMoney(s.revenue, dateLocale, 2)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title={t('quickActions')} className="mb-0">
          <div className="grid grid-cols-2 gap-[var(--s-2)]">
            <QuickAction
              icon={<DollarSign />}
              label={t('acceptPayment')}
              sub={t('manualTransaction')}
              onClick={() => router.push(`/${rid}/orders/all`)}
            />
            <QuickAction
              icon={<Edit />}
              label={t('editMenuAction')}
              sub={t('updateItemsLabel')}
              onClick={() => router.push(`/${rid}/menu/menus`)}
            />
            <QuickAction
              icon={<Plus />}
              label={t('addItemAction')}
              sub={t('newProduct')}
              onClick={() => router.push(`/${rid}/menu/items/new`)}
            />
            <QuickAction
              icon={<Package />}
              label={t('receiveDelivery')}
              sub={t('updateStock')}
              onClick={() => router.push(`/${rid}/kitchen/stock`)}
            />
          </div>
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

function ServicePulse({
  activeOrders,
  pendingPayments,
  latestOrder,
  onOpenOrders,
  t,
}: {
  activeOrders?: number;
  pendingPayments?: number;
  latestOrder: string;
  onOpenOrders: () => void;
  t: (key: string) => string;
}) {
  const hasLiveData = activeOrders != null;
  const hasActivity = hasLiveData && activeOrders > 0;
  return (
    <section className="relative overflow-hidden rounded-[var(--r-xl)] bg-[#1c1917] text-white ring-1 ring-white/5 mb-[var(--s-5)]">
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--brand-500)]" />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_auto] gap-[var(--s-5)] px-[var(--s-5)] md:px-[var(--s-6)] py-[var(--s-5)] items-center">
        <div className="flex items-start gap-[var(--s-3)] min-w-0">
          <div className="w-10 h-10 rounded-full grid place-items-center shrink-0 bg-[var(--brand-500)] text-white">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-[var(--s-2)] flex-wrap">
              <h2 className="text-fs-lg font-semibold leading-tight">
                {!hasLiveData
                  ? t('liveActivity')
                  : hasActivity
                    ? t('dashboardServiceActive')
                    : t('dashboardServiceQuiet')}
              </h2>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-1 bg-white/10">
                <span className={`w-1.5 h-1.5 rounded-full ${hasActivity ? 'bg-[#4ade80]' : 'bg-stone-500'}`} />
                {hasLiveData ? t('liveLabel') : t('notAvailable')}
              </span>
            </div>
            <p className="text-fs-sm mt-1 max-w-[560px] text-stone-300">
              {!hasLiveData
                ? t('dashboardServiceUnavailableDesc')
                : hasActivity
                  ? t('dashboardServiceActiveDesc')
                  : t('dashboardServiceQuietDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-stretch gap-[var(--s-2)] overflow-x-auto">
          <PulseStat value={activeOrders == null ? '—' : String(activeOrders)} label={t('dashboardActiveOrders')} />
          <PulseStat value={pendingPayments == null ? '—' : String(pendingPayments)} label={t('dashboardPendingPayments')} attention={(pendingPayments ?? 0) > 0} />
          <PulseStat value={latestOrder} label={t('dashboardLatestOrder')} icon={<Clock />} />
          <button
            type="button"
            onClick={onOpenOrders}
            className="min-h-[64px] rounded-r-md px-[var(--s-4)] bg-white text-stone-900 text-fs-sm font-semibold whitespace-nowrap flex items-center gap-[var(--s-2)] hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400)] transition-colors"
          >
            {t('viewOrders')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function PulseStat({
  value,
  label,
  attention = false,
  icon,
}: {
  value: string;
  label: string;
  attention?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-[108px] min-h-[64px] rounded-r-md px-[var(--s-3)] py-[var(--s-2)] bg-white/10 flex flex-col justify-center">
      <div className={`flex items-center gap-1.5 text-fs-lg font-semibold tabular-nums ${attention ? 'text-[#fdba74]' : ''}`}>
        {icon && <span className="[&>svg]:w-3.5 [&>svg]:h-3.5 opacity-70">{icon}</span>}
        {value}
      </div>
      <div className="text-[11px] whitespace-nowrap text-stone-400">{label}</div>
    </div>
  );
}

function PerformanceOverview({
  title,
  context,
  chartNote,
  metrics,
  showDelta,
  comparisonLabel,
  chart,
}: {
  title: string;
  context: string;
  chartNote?: string;
  metrics: DashboardMetric[];
  showDelta: boolean;
  comparisonLabel: string;
  chart?: React.ReactNode;
}) {
  const primary = metrics[0];
  const primaryUp = primary.delta >= 0;
  return (
    <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r-xl)] overflow-hidden shadow-1">
      <header className="px-[var(--s-5)] md:px-[var(--s-6)] pt-[var(--s-5)] md:pt-[var(--s-6)] flex items-start justify-between gap-[var(--s-4)] flex-wrap">
        <div>
          <h2 className="text-fs-lg font-semibold text-[var(--fg)]">{title}</h2>
          <p className="text-fs-xs text-[var(--fg-muted)] mt-1">{context}</p>
        </div>
        {chartNote && <span className="text-fs-xs text-[var(--fg-subtle)]">{chartNote}</span>}
      </header>

      <div className="px-[var(--s-5)] md:px-[var(--s-6)] py-[var(--s-5)] grid grid-cols-1 md:grid-cols-[minmax(190px,.9fr)_minmax(0,1.45fr)] gap-[var(--s-5)] md:gap-[var(--s-6)] items-end">
        <div>
          <div className="text-fs-sm text-[var(--fg-muted)]">{primary.label}</div>
          <div className="text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.045em] leading-none tabular-nums text-[var(--fg)] mt-2">
            {primary.value}
          </div>
          {showDelta && (
            <div className="flex items-center gap-[var(--s-2)] mt-[var(--s-3)] text-fs-xs">
              <span className={`font-semibold tabular-nums ${primaryUp ? 'text-[var(--success-500)]' : 'text-[var(--danger-500)]'}`}>
                {primaryUp ? '↑' : '↓'} {primary.delta >= 0 ? '+' : ''}{primary.delta.toFixed(1)}%
              </span>
              <span className="text-[var(--fg-subtle)]">{comparisonLabel}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 border-y md:border-y-0 md:border-l border-[var(--line)] divide-x divide-[var(--line)] py-[var(--s-4)] md:py-1 md:pl-[var(--s-5)]">
          {metrics.slice(1).map((metric) => {
            const up = metric.delta >= 0;
            return (
              <div key={metric.key} className="px-[var(--s-3)] first:pl-0 md:first:pl-[var(--s-3)] min-w-0">
                <div className="text-[11px] text-[var(--fg-muted)] truncate">{kpiLabel(metric.label, metric.hint)}</div>
                <div className="text-fs-xl font-semibold tabular-nums text-[var(--fg)] mt-1 truncate">{metric.value}</div>
                {showDelta && (
                  <div className={`text-[11px] font-medium tabular-nums mt-1 ${up ? 'text-[var(--success-500)]' : 'text-[var(--danger-500)]'}`}>
                    {up ? '↑' : '↓'} {metric.delta >= 0 ? '+' : ''}{metric.delta.toFixed(1)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {chart && (
        <div className="border-t border-[var(--line)] px-[var(--s-5)] md:px-[var(--s-6)] py-[var(--s-5)] bg-[color:color-mix(in_oklab,var(--surface-2)_45%,var(--surface))]">
          {chart}
        </div>
      )}
    </section>
  );
}

function MetricChart({
  data,
  fmt,
  emptyLabel,
}: {
  data: { day: string; value: number; isLast: boolean }[];
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
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end justify-between gap-[var(--s-2)]" style={{ height: 180 }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-[var(--s-2)] h-full">
          <div className="flex items-end h-full w-full justify-center">
            <div
              className="w-full max-w-[28px] rounded-t-[3px]"
              style={{
                height: `${Math.max(2, (d.value / max) * 100)}%`,
                background: d.isLast
                  ? 'var(--brand-500)'
                  : 'color-mix(in oklab, var(--brand-500) 55%, transparent)',
              }}
              title={fmt(d.value)}
            />
          </div>
          <span className="text-fs-xs text-[var(--fg-muted)] truncate max-w-full">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[92px] flex flex-col items-start justify-between gap-[var(--s-3)] p-[var(--s-3)] rounded-r-md border border-[var(--line)] text-left hover:bg-[var(--surface-2)] hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] transition-colors"
    >
      <div
        className="w-8 h-8 rounded-r-sm grid place-items-center shrink-0 [&>svg]:w-[14px] [&>svg]:h-[14px]"
        style={{
          background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
          color: 'var(--brand-500)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 w-full">
        <span className="block text-fs-sm font-medium text-[var(--fg)] leading-snug">{label}</span>
        <span className="block text-[11px] text-[var(--fg-muted)] truncate mt-0.5">{sub}</span>
      </div>
    </button>
  );
}
