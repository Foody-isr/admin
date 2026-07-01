'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getPeriodSummary,
  getDailySeries,
  getDayComparison,
  getTopSellers,
  type AnalyticsRange,
  type DaySummary,
  TopSeller,
  type ComparisonResult,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePersistentEnum } from '@/lib/use-persistent-enum';
import { ArrowUp, Calendar, Download } from 'lucide-react';
import {
  Badge,
  Button,
  NumTd,
  PageHead,
  Section,
  Table,
  TableShell,
  Tbody,
  Thead,
} from '@/components/ds';

type Range = '7d' | '30d' | 'q';

// Remembered across navigation as a single shared preference, like the dashboard.
const RANGES: Range[] = ['7d', '30d', 'q'];
const RANGE_STORAGE_KEY = 'foody.analytics.range';

// 7d/30d reuse the dashboard's period endpoint for an exact match. Trimestre
// (90d, the daily endpoint's max) aggregates the daily series instead.
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, q: 90 };
const RANGE_PERIOD: Partial<Record<Range, AnalyticsRange>> = { '7d': 'week', '30d': 'month' };

type OverviewSummary = {
  revenue: number;
  orders: number;
  avgTicket: number;
  itemsSold: number;
  revenueDelta: number;
  ordersDelta: number;
  avgTicketDelta: number;
  itemsSoldDelta: number;
  series: number[];
};

function pct(now: number, before: number): number {
  if (!before) return now > 0 ? 100 : 0;
  return ((now - before) / before) * 100;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Line + filled-area SVG paths for the hero sparkline, normalized to w×h.
function sparkline(values: number[], w = 320, h = 120): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? w : Math.round((i / (n - 1)) * w);
    const y = Math.round(h - (v / max) * (h - 8) - 4);
    return `${x},${y}`;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}

export default function AnalyticsOverviewPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = usePersistentEnum<Range>(RANGE_STORAGE_KEY, '30d', RANGES);

  const load = useCallback(async () => {
    setLoading(true);
    const days = RANGE_DAYS[range];
    const periodRange = RANGE_PERIOD[range];
    // Weekday comparison chart is a fixed today-vs-yesterday view, independent of range.
    const cmpPromise = getDayComparison(rid).catch(() => null);
    const agg = (rows: DaySummary[]) => {
      const revenue = rows.reduce((s, d) => s + d.net_sales, 0);
      const orders = rows.reduce((s, d) => s + d.transactions, 0);
      const itemsSold = rows.reduce((s, d) => s + d.items_sold, 0);
      return { revenue, orders, itemsSold, avgTicket: orders > 0 ? revenue / orders : 0 };
    };
    try {
      if (periodRange) {
        // 7d / 30d: reuse the dashboard's period endpoint so figures match exactly.
        const [cmp, daily, top] = await Promise.all([
          getPeriodSummary(rid, periodRange),
          getDailySeries(rid, days).catch(() => [] as DaySummary[]),
          getTopSellers(rid, periodRange).catch(() => [] as TopSeller[]),
        ]);
        const c = cmp.current;
        const p = cmp.previous;
        setSummary({
          revenue: c.total_revenue,
          orders: c.total_orders,
          avgTicket: c.avg_ticket,
          itemsSold: c.items_sold,
          revenueDelta: pct(c.total_revenue, p.total_revenue),
          ordersDelta: pct(c.total_orders, p.total_orders),
          avgTicketDelta: pct(c.avg_ticket, p.avg_ticket),
          itemsSoldDelta: pct(c.items_sold, p.items_sold),
          series: daily.map((d) => d.net_sales),
        });
        setTopSellers(top);
      } else {
        // Trimestre: 90-day window (the daily endpoint's max). Fetch the current
        // window plus the preceding one (via end-date) for the vs-previous delta.
        const [curDaily, prevDaily, top] = await Promise.all([
          getDailySeries(rid, days).catch(() => [] as DaySummary[]),
          getDailySeries(rid, days, isoDaysAgo(days)).catch(() => [] as DaySummary[]),
          getTopSellers(rid).catch(() => [] as TopSeller[]),
        ]);
        const c = agg(curDaily);
        const p = agg(prevDaily);
        setSummary({
          revenue: c.revenue,
          orders: c.orders,
          avgTicket: c.avgTicket,
          itemsSold: c.itemsSold,
          revenueDelta: pct(c.revenue, p.revenue),
          ordersDelta: pct(c.orders, p.orders),
          avgTicketDelta: pct(c.avgTicket, p.avgTicket),
          itemsSoldDelta: pct(c.itemsSold, p.itemsSold),
          series: curDaily.map((d) => d.net_sales),
        });
        setTopSellers(top);
      }
      setComparison(await cmpPromise);
    } finally {
      setLoading(false);
    }
  }, [rid, range]);

  useEffect(() => {
    load();
  }, [load]);

  // Build a weekday line-chart dataset by bucketing hourly data.
  const weekDataset = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    if (!comparison?.hourly?.length) {
      return days.map((day) => ({ day, cur: 0, prev: 0 }));
    }
    const max = Math.max(
      1,
      ...comparison.hourly.map((h) => Math.max(h.current_amt, h.previous_amt)),
    );
    return days.map((day, i) => {
      const start = Math.floor((i / 7) * 24);
      const end = Math.floor(((i + 1) / 7) * 24);
      const bucket = comparison.hourly.filter(
        (h) => h.hour >= start && h.hour < end,
      );
      const cur = bucket.reduce((s, h) => s + h.current_amt, 0);
      const prev = bucket.reduce((s, h) => s + h.previous_amt, 0);
      return { day, cur: (cur / max) * 100, prev: (prev / max) * 100 };
    });
  }, [comparison]);

  // Derive category mix from top sellers (best-effort without a dedicated endpoint).
  const categoryMix = useMemo(() => {
    const totalRev = topSellers.reduce((s, x) => s + (x.revenue ?? 0), 0);
    if (totalRev <= 0) return [] as { c: string; v: number; col: string }[];
    const buckets = new Map<string, number>();
    topSellers.forEach((s) => {
      const label = s.name.split(' ')[0].toUpperCase() || 'Autres';
      buckets.set(label, (buckets.get(label) ?? 0) + (s.revenue ?? 0));
    });
    return Array.from(buckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c, v], i) => ({
        c,
        v: Math.round((v / totalRev) * 100),
        col: `cat-${(i % 6) + 1}`,
      }));
  }, [topSellers]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const revenue = summary?.revenue ?? 0;
  const orders = summary?.orders ?? 0;
  const avgTicket = summary?.avgTicket ?? 0;
  const itemsSold = summary?.itemsSold ?? 0;
  const spark = sparkline(summary?.series ?? []);

  return (
    <>
      <PageHead
        title={t('reportsOverview') || "Vue d'ensemble"}
        desc={t('reportsOverviewDesc') || 'Comparez vos performances'}
        actions={
          <>
            <div className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md">
              {(
                [
                  ['7d', '7j'],
                  ['30d', '30j'],
                  ['q', 'Trimestre'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-selected={range === key}
                  onClick={() => setRange(key)}
                  className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors ${
                    range === key
                      ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="md">
              <Calendar /> Aujourd&apos;hui
            </Button>
            <Button variant="secondary" size="md">
              <Download /> Exporter
            </Button>
          </>
        }
      />

      {/* Hero metric */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-8)] mb-[var(--s-5)] grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[var(--s-8)] items-center">
        <div>
          <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-[var(--s-2)]">
            {t('netRevenue') || 'Revenu net'} ·{' '}
            {range === '7d' ? '7j' : range === '30d' ? '30 derniers jours' : 'Trimestre'}
          </div>
          <div
            className="font-semibold tabular-nums text-[var(--fg)]"
            style={{ fontSize: 56, letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            ₪{revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-3)]">
            <Delta value={summary?.revenueDelta ?? 0} />
            <span className="text-fs-sm text-[var(--fg-muted)]">
              vs période précédente
            </span>
          </div>
        </div>
        <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none">
          {spark.area && (
            <path d={spark.area} fill="color-mix(in oklab, var(--brand-500) 20%, transparent)" />
          )}
          {spark.line && (
            <path d={spark.line} fill="none" stroke="var(--brand-500)" strokeWidth={2} />
          )}
        </svg>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-[var(--s-5)]">
        {[
          { l: 'Commandes', v: orders.toString(), delta: summary?.ordersDelta },
          { l: 'Ticket moyen', v: `₪${avgTicket.toFixed(1)}`, delta: summary?.avgTicketDelta },
          { l: 'Articles vendus', v: String(itemsSold), delta: summary?.itemsSoldDelta },
          { l: 'Références actives', v: String(topSellers.length), delta: undefined },
        ].map((k, i) => (
          <div
            key={i}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)]"
          >
            <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {k.l}
            </div>
            <div className="text-fs-3xl font-semibold leading-none text-[var(--fg)] tabular-nums">
              {k.v}
            </div>
            {k.delta != null ? (
              <Delta value={k.delta} />
            ) : (
              <span className="text-fs-xs text-[var(--fg-muted)]">—</span>
            )}
          </div>
        ))}
      </div>

      {/* Lower row: weekday line chart (2fr) + category mix (1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[var(--s-5)] mb-[var(--s-5)]">
        <Section
          title="Revenu par jour · comparaison semaine"
        >
          <div className="-mx-[var(--s-5)] -mb-[var(--s-5)] px-[var(--s-5)] pb-[var(--s-5)]">
            <WeekComparisonChart data={weekDataset} />
          </div>
        </Section>

        <Section title="Mix par catégorie">
          {categoryMix.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-muted)]">
              {t('noSalesDataYet') || 'Aucune donnée sur la période.'}
            </p>
          ) : (
            <div className="space-y-[var(--s-3)]">
              {categoryMix.map((r) => (
                <div key={r.c}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-fs-sm truncate">{r.c}</span>
                    <span className="font-mono tabular-nums text-fs-sm">{r.v}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface-2)]">
                    <div
                      className="h-full"
                      style={{ width: `${r.v}%`, background: `var(--${r.col})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Top sellers */}
      <Section title={t('topSellingItems') || 'Articles les plus vendus'}>
        {topSellers.length === 0 ? (
          <p className="text-fs-sm text-[var(--fg-muted)]">
            {t('noSalesDataYet') || 'Aucune vente enregistrée pour cette période.'}
          </p>
        ) : (
          <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
            <TableShell className="rounded-none border-0 border-t border-[var(--line)]">
              <Table>
                <Thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Article</th>
                    <th style={{ textAlign: 'right' }}>Qté</th>
                    <th style={{ textAlign: 'right' }}>Revenu</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </Thead>
                <Tbody>
                  {topSellers.map((item, i) => (
                    <tr key={item.name}>
                      <td>
                        <span className="inline-grid place-items-center w-7 h-7 rounded-r-sm bg-[var(--surface-3)] text-[var(--fg-muted)] text-[10px] font-bold">
                          {i + 1}
                        </span>
                      </td>
                      <td className="text-[var(--fg)] font-medium">{item.name}</td>
                      <NumTd style={{ textAlign: 'right' }}>{item.quantity}</NumTd>
                      <NumTd style={{ textAlign: 'right' }}>₪{(item.revenue ?? 0).toFixed(0)}</NumTd>
                      <td>
                        {i === 0 && <Badge tone="brand">★ Top</Badge>}
                      </td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            </TableShell>
          </div>
        )}
      </Section>
    </>
  );
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-fs-xs font-medium tabular-nums ${
        up
          ? 'text-[var(--success-500)] dark:text-[#4ade80]'
          : 'text-[var(--danger-500)] dark:text-[#fb7185]'
      }`}
    >
      <ArrowUp className={`w-3 h-3 ${up ? '' : 'rotate-180'}`} />
      {up ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function WeekComparisonChart({
  data,
}: {
  data: { day: string; cur: number; prev: number }[];
}) {
  // viewBox: 600 wide × 240 tall; 30px left/right padding, 40px bottom for labels.
  const xs = data.map((_, i) => 30 + i * 90);
  const yFor = (pct: number) => 200 - (pct / 100) * 160;
  const curPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yFor(d.cur)}`).join(' ');
  const prevPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yFor(d.prev)}`).join(' ');

  return (
    <svg viewBox="0 0 600 240" width="100%" height="240">
      {/* Grid lines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={0}
          y1={40 + i * 40}
          x2={600}
          y2={40 + i * 40}
          stroke="var(--line)"
          strokeDasharray="2 4"
        />
      ))}
      {/* Previous week — dotted, subtle */}
      <path
        d={prevPath}
        stroke="var(--fg-subtle)"
        strokeWidth={2}
        fill="none"
        opacity={0.5}
        strokeDasharray="3 3"
      />
      {/* Current week — brand */}
      <path d={curPath} stroke="var(--brand-500)" strokeWidth={2.5} fill="none" />
      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={d.day}
          cx={xs[i]}
          cy={yFor(d.cur)}
          r={4}
          fill="var(--brand-500)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
      ))}
      {/* Labels */}
      {data.map((d, i) => (
        <text
          key={`${d.day}-label`}
          x={xs[i]}
          y={228}
          fontSize={11}
          fill="var(--fg-muted)"
          textAnchor="middle"
        >
          {d.day}
        </text>
      ))}
    </svg>
  );
}
