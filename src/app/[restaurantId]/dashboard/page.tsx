'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPeriodSummary,
  getTopSellers,
  getDailySeries,
  type AnalyticsRange,
  type PeriodComparison,
  type DaySummary,
  type TopSeller,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  Calendar,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Edit,
  Plus,
  Package,
} from 'lucide-react';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
import { Badge, Button, Kpi, PageHead, Section } from '@/components/ds';

type Range = AnalyticsRange;

const DATE_LOCALES: Record<'en' | 'he' | 'fr', string> = {
  en: 'en-US',
  he: 'he-IL',
  fr: 'fr-FR',
};

function fmtDate(d = new Date(), locale = 'fr-FR') {
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function fmtMoney(n: number) {
  return `₪${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(now: number, before: number) {
  if (!before) return now > 0 ? 100 : 0;
  return ((now - before) / before) * 100;
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
  const [dailySeries, setDailySeries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('today');
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      getPeriodSummary(rid, range),
      getTopSellers(rid),
      getDailySeries(rid, 7),
    ])
      .then(([per, top, daily]) => {
        if (per.status === 'fulfilled') setPeriod(per.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
        if (daily.status === 'fulfilled') setDailySeries(daily.value ?? []);
      })
      .finally(() => setLoading(false));
  }, [rid, range]);

  useEffect(() => {
    load();
  }, [load]);

  const current = period?.current;
  const previous = period?.previous;
  const revenue = current?.total_revenue ?? 0;
  const orders = current?.total_orders ?? 0;
  const avgTicket = current?.avg_ticket ?? 0;
  // No labor data source yet — kept at 0 so the KPI card stays in the grid.
  const laborPct = 0;

  const revChange = pct(current?.total_revenue ?? 0, previous?.total_revenue ?? 0);
  const orderChange = pct(current?.total_orders ?? 0, previous?.total_orders ?? 0);
  const ticketChange = pct(current?.avg_ticket ?? 0, previous?.avg_ticket ?? 0);
  const laborChange = 0;

  // Sub-labels reflect the selected period.
  const rangeWord = RANGE_LABELS[range].toLowerCase();
  const vsLabel = range === 'today' ? t('vsYesterday') : t('vsPreviousPeriod');

  // Human label for the active window. `end` is exclusive (next midnight), so
  // the multi-day form shows the inclusive last day.
  const periodRangeLabel = useMemo(() => {
    if (!current) return '';
    const fmtShort = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale);
    if (range === 'today' || range === 'yesterday') return fmtShort(current.start);
    const lastDay = new Date(`${current.end}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    return `${fmtShort(current.start)} → ${lastDay.toLocaleDateString(dateLocale)}`;
  }, [current, range, dateLocale]);

  // Last 7 days vs the 7 days before, day-by-day.
  const weekBars = useMemo(() => {
    if (dailySeries.length === 0) {
      return Array.from({ length: 7 }, () => ({ day: '', cur: 0, prev: 0, hasData: false }));
    }
    const max = Math.max(1, ...dailySeries.map((d) => d.net_sales));
    return dailySeries.map((d) => {
      const date = new Date(`${d.date}T00:00:00`);
      return {
        day: date.toLocaleDateString(dateLocale, { weekday: 'short' }),
        cur: (d.net_sales / max) * 100,
        prev: 0,
        hasData: true,
      };
    });
  }, [dailySeries, dateLocale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const greeting = t('dashboardHome') || 'Dashboard';
  const dateSub = fmtDate(new Date(), dateLocale);

  return (
    <>
      <PageHead
        title={greeting}
        desc={dateSub}
        actions={
          <>
            <div className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md">
              {(['yesterday', 'today', 'week', 'month'] as const).map((r) => {
                const active = range === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-selected={active}
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
            <Button variant="secondary" size="md">
              <Calendar /> {new Date().toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })}
            </Button>
            <Button variant="ghost" size="md" icon aria-label={t('refresh')} onClick={load}>
              <RefreshCw />
            </Button>
          </>
        }
      />

      {/* KPI strip — 4 equal. Hidden on mobile per the responsive policy:
          the dashboard's chart + activity sections cover the mobile use case. */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-[var(--s-5)]">
        <KpiWithSpark
          label={t('grossRevenue')}
          value={fmtMoney(revenue)}
          delta={revChange}
          sub={vsLabel}
          trend={revChange >= 0 ? 'up' : 'down'}
          onClick={() => setSelectedKpi('revenue')}
        />
        <KpiWithSpark
          label={t('orders')}
          value={String(orders)}
          delta={orderChange}
          sub={`${orders} ${rangeWord}`}
          trend={orderChange >= 0 ? 'up' : 'down'}
          onClick={() => setSelectedKpi('orders')}
        />
        <KpiWithSpark
          label={t('avgTicket')}
          value={`₪${avgTicket.toFixed(1)}`}
          delta={ticketChange}
          sub={vsLabel}
          trend={ticketChange >= 0 ? 'up' : 'down'}
          onClick={() => setSelectedKpi('average-ticket')}
        />
        <KpiWithSpark
          label={t('labor')}
          value={`${laborPct.toFixed(1)}%`}
          delta={laborChange}
          sub={t('targetThirty')}
          trend={laborChange <= 0 ? 'up' : 'down'}
          onClick={() => setSelectedKpi('labor')}
        />
      </div>

      <KPIInfoModal
        kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
        onClose={() => setSelectedKpi(null)}
      />

      {/* Main row: chart + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[var(--s-5)] mb-[var(--s-5)]">
        <Section
          title={t('performanceLast7Days')}
          desc={t('netSalesExcludingVat')}
        >
          <BarChart data={weekBars} emptyLabel={t('noSalesIn7Days')} />
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

      {/* Lower row: Top items + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s-5)]">
        <Section
          title={t('bestSellingItems')}
          aside={
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${rid}/menu/items`)}>
              {t('seeAll')}
            </Button>
          }
        >
          {topSellers.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)] py-6 text-center">
              {t('noSalesYet')}
            </p>
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
                      <div
                        className="h-full bg-[var(--brand-500)]"
                        style={{ width: `${pctBar}%` }}
                      />
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
          title={t('liveActivity')}
          aside={
            <Badge tone="success" dot>
              {t('online')}
            </Badge>
          }
        >
          <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
            <ActivityRow
              color="var(--success-500)"
              who={`${orders} ${t('orders').toLowerCase()}`}
              what={range === 'today' ? t('recordedToday') : rangeWord}
              amt={fmtMoney(revenue)}
              when={range === 'today' ? t('liveLabel') : ''}
            />
            {current && (
              <ActivityRow
                color="var(--info-500)"
                who={t('comparison')}
                what={periodRangeLabel}
                when=""
              />
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

interface KpiSparkProps {
  label: string;
  value: string;
  delta: number;
  sub: string;
  trend: 'up' | 'down';
  onClick?: () => void;
}

function KpiWithSpark({ label, value, delta, sub, trend, onClick }: KpiSparkProps) {
  const deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left cursor-pointer transition-colors hover:border-[var(--line-strong)]"
    >
      <Kpi
        label={label}
        value={
          <div className="flex items-baseline justify-between gap-[var(--s-3)] w-full">
            <span>{value}</span>
            <Sparkline trend={trend} />
          </div>
        }
        sub={sub}
        delta={{
          value: (
            <span className="inline-flex items-center gap-0.5">
              {trend === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {deltaStr}
            </span>
          ),
          direction: trend,
        }}
      />
    </button>
  );
}

function Sparkline({ trend }: { trend: 'up' | 'down' }) {
  const pts = trend === 'up' ? [20, 18, 16, 14, 12, 8, 4] : [4, 8, 10, 12, 14, 16, 18];
  const d = pts.map((y, i) => `${i === 0 ? 'M' : 'L'} ${i * 12} ${y}`).join(' ');
  const color = trend === 'up' ? 'var(--success-500)' : 'var(--danger-500)';
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" className="overflow-visible">
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

function BarChart({
  data,
  emptyLabel,
}: {
  data: { day: string; cur: number; prev: number; hasData: boolean }[];
  emptyLabel: string;
}) {
  const anyData = data.some((d) => d.hasData && d.cur > 0);
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
  return (
    <div
      className="flex items-end justify-between gap-[var(--s-3)]"
      style={{ height: 180 }}
    >
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-[var(--s-2)] h-full"
        >
          <div className="flex items-end h-full w-full justify-center">
            <div
              className="w-6 rounded-t-[3px] bg-[var(--brand-500)]"
              style={{ height: `${Math.max(2, d.cur)}%` }}
            />
          </div>
          <span className="text-fs-xs text-[var(--fg-muted)]">{d.day}</span>
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

function ActivityRow({
  color,
  who,
  what,
  amt,
  when,
}: {
  color: string;
  who: string;
  what: string;
  amt?: string;
  when: string;
}) {
  return (
    <div className="px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] flex items-center gap-[var(--s-3)] first:border-t-0">
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 text-fs-sm min-w-0">
        <span className="text-[var(--fg)] font-medium">{who}</span>{' '}
        <span className="text-[var(--fg-muted)]">{what}</span>
      </div>
      {amt && (
        <span className="font-mono tabular-nums text-fs-xs text-[var(--fg-muted)] shrink-0">
          {amt}
        </span>
      )}
      {when && (
        <span className="text-fs-xs text-[var(--fg-subtle)] min-w-[64px] text-right shrink-0">
          {when}
        </span>
      )}
    </div>
  );
}
