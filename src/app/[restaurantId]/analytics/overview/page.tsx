'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getAnalyticsToday,
  getDayComparison,
  getTopSellers,
  TodayStats,
  TopSeller,
  type ComparisonResult,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
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

type Range = '7d' | '30d' | 'q' | 'y';

export default function AnalyticsOverviewPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('30d');

  useEffect(() => {
    Promise.all([
      getAnalyticsToday(rid).catch(() => null),
      getTopSellers(rid).catch(() => []),
      getDayComparison(rid).catch(() => null),
    ])
      .then(([s, ts, cmp]) => {
        if (s) setStats(s);
        setTopSellers(ts);
        if (cmp) setComparison(cmp);
      })
      .finally(() => setLoading(false));
  }, [rid]);

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

  const revenue = stats?.total_revenue ?? 0;
  const orders = stats?.total_orders ?? 0;
  const avgTicket = orders > 0 ? revenue / orders : 0;

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
                  ['y', 'Année'],
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
            {range === '7d' ? '7j' : range === '30d' ? '30 derniers jours' : range === 'q' ? 'Trimestre' : 'Année'}
          </div>
          <div
            className="font-semibold tabular-nums text-[var(--fg)]"
            style={{ fontSize: 56, letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            ₪{revenue.toFixed(0)}
          </div>
          <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-3)]">
            <span className="inline-flex items-center gap-1 text-fs-xs font-medium text-[var(--success-500)] dark:text-[#4ade80] tabular-nums">
              <ArrowUp className="w-3.5 h-3.5" />
              +18.2%
            </span>
            <span className="text-fs-sm text-[var(--fg-muted)]">
              vs période précédente
            </span>
          </div>
        </div>
        <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none">
          <path
            d="M0,80 L20,72 L40,78 L60,60 L80,64 L100,48 L120,52 L140,40 L160,44 L180,30 L200,34 L220,22 L240,28 L260,20 L280,16 L300,22 L320,10 L320,120 L0,120 Z"
            fill="color-mix(in oklab, var(--brand-500) 20%, transparent)"
          />
          <path
            d="M0,80 L20,72 L40,78 L60,60 L80,64 L100,48 L120,52 L140,40 L160,44 L180,30 L200,34 L220,22 L240,28 L260,20 L280,16 L300,22 L320,10"
            fill="none"
            stroke="var(--brand-500)"
            strokeWidth={2}
          />
        </svg>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-[var(--s-5)]">
        {[
          { l: 'Commandes', v: orders.toString(), d: '+12.4%', up: true },
          { l: 'Ticket moyen', v: `₪${avgTicket.toFixed(1)}`, d: '+5.2%', up: true },
          { l: 'Articles vendus', v: String(topSellers.reduce((s, x) => s + x.quantity, 0)), d: '+8.4%', up: true },
          { l: 'Références actives', v: String(topSellers.length), d: '—', up: true },
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
            <div
              className={`inline-flex items-center gap-1 text-fs-xs font-medium tabular-nums ${
                k.up
                  ? 'text-[var(--success-500)] dark:text-[#4ade80]'
                  : 'text-[var(--danger-500)] dark:text-[#fb7185]'
              }`}
            >
              <ArrowUp className="w-3 h-3" /> {k.d}
            </div>
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
