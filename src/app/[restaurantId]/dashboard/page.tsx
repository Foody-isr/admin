'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPeriodSummary,
  getTopSellers,
  getDailySeries,
  listOrders,
  type AnalyticsRange,
  type PeriodComparison,
  type DaySummary,
  type TopSeller,
  type Order,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Calendar, RefreshCw, DollarSign, Edit, Plus, Package } from 'lucide-react';
import { Badge, Button, Kpi, PageHead, Section } from '@/components/ds';

type Range = AnalyticsRange;
type MetricKey = 'revenue' | 'orders' | 'avgTicket' | 'itemsSold';

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

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t, locale } = useI18n();
  const dateLocale = DATE_LOCALES[locale];

  const RANGE_LABELS: Record<Range, string> = {
    yesterday: t('yesterday'),
    today: t('today'),
    week: t('days7'),
    month: t('days30'),
  };

  const [period, setPeriod] = useState<PeriodComparison | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [series, setSeries] = useState<DaySummary[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('today');
  // The main chart tracks gross revenue; KPI cards are presentational.
  const metric: MetricKey = 'revenue';

  const load = useCallback(() => {
    setLoading(true);
    // Chart window follows the period: 30 daily points for the month, 7 otherwise.
    const seriesDays = range === 'month' ? 30 : 7;
    const endISO = range === 'yesterday' ? isoDaysAgo(1) : undefined;
    Promise.allSettled([
      getPeriodSummary(rid, range),
      getTopSellers(rid, range),
      getDailySeries(rid, seriesDays, endISO),
      listOrders(rid, { limit: 6, sort_by: 'created_at', sort_dir: 'desc' }),
    ])
      .then(([per, top, daily, orders]) => {
        if (per.status === 'fulfilled') setPeriod(per.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
        if (daily.status === 'fulfilled') setSeries(daily.value ?? []);
        if (orders.status === 'fulfilled') setRecentOrders(orders.value.orders ?? []);
      })
      .finally(() => setLoading(false));
  }, [rid, range]);

  useEffect(() => {
    load();
  }, [load]);

  const current = period?.current;
  const previous = period?.previous;

  const rangeWord = RANGE_LABELS[range].toLowerCase();
  const vsLabel = range === 'today' ? t('vsYesterday') : t('vsPreviousPeriod');

  // Human label for the active window. `end` is exclusive (next midnight), so the
  // multi-day form shows the inclusive last day.
  const periodRangeLabel = useMemo(() => {
    if (!current) return '';
    const fmtShort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale);
    if (range === 'today' || range === 'yesterday') return fmtShort(current.start);
    const lastDay = new Date(`${current.end}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    return `${fmtShort(current.start)} → ${lastDay.toLocaleDateString(dateLocale)}`;
  }, [current, range, dateLocale]);

  // KPI definitions, driven by the period totals. Presentational only.
  const metrics: { key: MetricKey; label: string; value: string; delta: number }[] = [
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
            <div className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md">
              {(['yesterday', 'today', 'week', 'month'] as const).map((r) => {
                const active = range === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRange(r)}
                    className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ${
                      active
                        ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                        : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="md" icon aria-label={t('refresh')} onClick={load}>
              <RefreshCw />
            </Button>
          </>
        }
      />

      {/* KPI strip — 4 equal. Hidden on mobile per the responsive policy. */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-[var(--s-5)]">
        {metrics.map((m) => (
          <KpiCard
            key={m.key}
            label={m.label}
            value={m.value}
            delta={m.delta}
            sub={vsLabel}
            spark={series.map((d) => seriesValue(m.key, d))}
          />
        ))}
      </div>

      {/* Main row: chart + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[var(--s-5)] mb-[var(--s-5)]">
        <Section title={selectedMetricLabel} desc={periodRangeLabel}>
          <MetricChart
            data={chartData}
            fmt={(n) => formatMetric(metric, n)}
            emptyLabel={t('noSalesIn7Days')}
          />
        </Section>

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
  delta: number;
  sub: string;
  spark: number[];
}

function KpiCard({ label, value, delta, sub, spark }: KpiCardProps) {
  const up = delta >= 0;
  return (
    <Kpi
      label={label}
      value={
        <div className="flex items-baseline justify-between gap-[var(--s-3)] w-full">
          <span>{value}</span>
          <Sparkline values={spark} up={up} />
        </div>
      }
      sub={sub}
      delta={{ value: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, direction: up ? 'up' : 'down' }}
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
