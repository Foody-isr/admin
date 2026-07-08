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
import {
  clampWeekStartDay,
  getEffectiveWorkdays,
  getWeekStart,
  addDays,
  isoDate,
  type WeekStartDay,
} from '@/lib/weeks';
import { Calendar, RefreshCw, DollarSign, Edit, Plus, Package } from 'lucide-react';
import { Badge, Button, Kpi, PageHead, Section } from '@/components/ds';
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

function fmtMoney(n: number) {
  return `₪${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function formatMetric(metric: MetricKey, n: number): string {
  switch (metric) {
    case 'revenue':
      return fmtMoney(n);
    case 'avgTicket':
      return `₪${n.toFixed(1)}`;
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
  const [serieDate, setSerieDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const serieMode = basis === 'serie';
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
    // In série mode, wait until the picker has resolved a série.
    if (serieMode && !serieDate) return;
    setLoading(true);
    // Série mode scopes everything to one exact série (scheduled_for) and has no
    // daily chart; created mode uses the calendar window + last-N-days chart.
    const scope = serieMode
      ? { from: serieDate!, to: serieDate! }
      : { from: isoDate(dateRange.from), to: isoDate(dateRange.to) };
    const days = daysInclusive(dateRange);
    Promise.allSettled([
      getPeriodSummary(rid, scope, basis),
      getTopSellers(rid, scope, basis),
      serieMode
        ? Promise.resolve([] as DaySummary[])
        : getDailySeries(rid, days, scope.to, basis),
      listOrders(rid, { limit: 6, sort_by: 'created_at', sort_dir: 'desc' }),
    ])
      .then(([per, top, daily, orders]) => {
        if (per.status === 'fulfilled') setPeriod(per.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
        if (daily.status === 'fulfilled') setSeries(daily.value ?? []);
        if (orders.status === 'fulfilled') setRecentOrders(orders.value.orders ?? []);
      })
      .finally(() => setLoading(false));
  }, [rid, dateRange, basis, serieMode, serieDate]);

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
  const vsLabel = singleDay ? t('vsYesterday') : t('vsPreviousPeriod');
  const chartCapped = daysInclusive(dateRange) > 90;

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
      value: fmtMoney(current?.total_revenue ?? 0),
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
      value: `₪${(current?.avg_ticket ?? 0).toFixed(1)}`,
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

  const selectedMetricLabel = metrics.find((m) => m.key === metric)?.label ?? '';

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
                restaurantId={rid}
                value={serieDate}
                onChange={setSerieDate}
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

      {/* Compact KPI grid — mobile only. 2×2, tighter padding, smaller value,
          no sparkline, so all four numbers fit above the fold on a phone. */}
      <div className="grid grid-cols-2 md:hidden gap-[var(--s-3)] mb-[var(--s-5)]">
        {metrics.map((m) => {
          const up = m.delta >= 0;
          return (
            <Kpi
              key={m.key}
              className="p-[var(--s-4)]"
              label={kpiLabel(m.label, m.hint)}
              value={<span className="text-fs-2xl">{m.value}</span>}
              delta={serieMode ? undefined : { value: `${up ? '+' : ''}${m.delta.toFixed(1)}%`, direction: up ? 'up' : 'down' }}
            />
          );
        })}
      </div>

      {/* KPI strip — 4 equal, with sparklines. Desktop/tablet only. */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-[var(--s-5)]">
        {metrics.map((m) => (
          <KpiCard
            key={m.key}
            label={m.label}
            value={m.value}
            delta={serieMode ? undefined : m.delta}
            sub={serieMode ? undefined : vsLabel}
            hint={m.hint}
            spark={serieMode ? undefined : series.map((d) => seriesValue(m.key, d))}
          />
        ))}
      </div>

      {/* Main row: chart + right rail. The daily chart is a range concept, so in
          série mode (a single série) it is hidden and the rail spans the row. */}
      <div className={`grid grid-cols-1 gap-[var(--s-5)] mb-[var(--s-5)] ${serieMode ? '' : 'lg:grid-cols-[1fr_320px]'}`}>
        {!serieMode && (
          <Section
            title={selectedMetricLabel}
            desc={chartCapped ? `${periodRangeLabel} · ${t('dashChartLast90')}` : periodRangeLabel}
          >
            <MetricChart
              data={chartData}
              fmt={(n) => formatMetric(metric, n)}
              emptyLabel={t('noSalesIn7Days')}
            />
          </Section>
        )}

        <div className="flex flex-col gap-[var(--s-4)]">
          <Section title={t('quickActions')}>
            <div className="-mx-[var(--s-2)]">
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
      </div>

      {/* Lower row: Top items + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s-5)]">
        <Section
          title={t('bestSellingItems')}
          desc={periodRangeLabel}
          aside={
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${rid}/menu/items`)}>
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
                    <div className="w-20 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-[var(--brand-500)]" style={{ width: `${pctBar}%` }} />
                    </div>
                    <div className="font-mono tabular-nums text-fs-sm text-[var(--fg)] min-w-[70px] text-right">
                      ₪{s.revenue.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title={t('recentActivity')}
          aside={
            <Badge tone="success" dot>
              {t('online')}
            </Badge>
          }
        >
          {recentOrders.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-6 text-center">{t('noSalesYet')}</p>
          ) : (
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {recentOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => router.push(`/${rid}/orders/all`)}
                  className="w-full px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center gap-[var(--s-3)] first:border-t-0 text-left hover:bg-[var(--surface-2)] transition-colors"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: paymentColor(o.payment_status) }}
                  />
                  <div className="flex-1 text-fs-sm min-w-0">
                    <span className="text-[var(--fg)] font-medium truncate">
                      {o.customer_name?.trim() || `#${o.id}`}
                    </span>{' '}
                    <span className="text-[var(--fg-muted)]">
                      {t(ORDER_TYPE_KEY[o.order_type] ?? 'dineIn')}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-fs-xs text-[var(--fg-muted)] shrink-0">
                    {fmtMoney(o.total_amount)}
                  </span>
                  <span className="text-fs-xs text-[var(--fg-subtle)] min-w-[40px] text-right shrink-0">
                    {relTime(o.created_at)}
                  </span>
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

interface KpiCardProps {
  label: string;
  value: string;
  /** Omitted in série mode, where a single série has no previous period. */
  delta?: number;
  sub?: string;
  spark?: number[];
  /** Optional ⓘ tooltip appended to the label for a metric that needs a caveat. */
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

function KpiCard({ label, value, delta, sub, spark, hint }: KpiCardProps) {
  const hasDelta = delta !== undefined;
  const up = (delta ?? 0) >= 0;
  return (
    <Kpi
      label={kpiLabel(label, hint)}
      value={
        <div className="flex items-baseline justify-between gap-[var(--s-3)] w-full">
          <span>{value}</span>
          {spark && spark.length > 0 && <Sparkline values={spark} up={up} />}
        </div>
      }
      sub={sub}
      delta={hasDelta ? { value: `${delta! >= 0 ? '+' : ''}${delta!.toFixed(1)}%`, direction: up ? 'up' : 'down' } : undefined}
    />
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const w = 72;
  const h = 24;
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <svg width={w} height={h} aria-hidden />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const color = up ? 'var(--success-500)' : 'var(--danger-500)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
      className="w-full flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-left hover:bg-[var(--surface-2)] transition-colors"
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
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className="text-fs-sm text-[var(--fg)] truncate">{label}</span>
        <span className="text-fs-xs text-[var(--fg-muted)] truncate">{sub}</span>
      </div>
    </button>
  );
}
