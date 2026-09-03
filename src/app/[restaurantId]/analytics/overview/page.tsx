'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download } from 'lucide-react';
import {
  getPeriodSummary,
  getTopSellers,
  getBreakdown,
  getRestaurant,
  type BreakdownDimension,
  type DateBasis,
  type PeriodComparison,
  type TopSeller,
} from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import DateBasisToggle from '@/components/DateBasisToggle';
import { clampWeekStartDay, isoDate, type WeekStartDay } from '@/lib/weeks';
import {
  classifySelection,
  daysInclusive,
  readStoredBasis,
  readStoredSel,
  resolvePreset,
  resolveStored,
  writeStoredBasis,
  writeStoredSel,
} from '@/lib/analytics-range';
import { downloadCsv } from '@/lib/csv/export';
import {
  Badge,
  Button,
  Kpi,
  NumTd,
  PageHead,
  Section,
  Table,
  TableShell,
  Tbody,
  Thead,
} from '@/components/ds';
import TrendChart, { type TrendPoint } from './TrendChart';
import BreakdownExplorer from './BreakdownExplorer';

// v3: default the reports overview to "all time" so imported history is visible
// on open (bumping the key resets anyone parked on the old last-30 default).
const RANGE_STORAGE_KEY = 'foody.analytics.range.v3';
const BASIS_STORAGE_KEY = 'foody.analytics.basis.v1';

function pct(now: number, before: number): number {
  if (!before) return now > 0 ? 100 : 0;
  return ((now - before) / before) * 100;
}

function delta(now: number, before: number): { value: string; direction: 'up' | 'down' } {
  const p = pct(now, before);
  return { value: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, direction: p >= 0 ? 'up' : 'down' };
}

// Auto time granularity for the trend so long ranges stay readable.
function granularityFor(days: number): BreakdownDimension {
  if (days <= 35) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

// Line + filled-area SVG paths for the hero sparkline.
function sparkline(values: number[], w = 320, h = 96): { line: string; area: string } {
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
  const { money } = useCurrency();
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const locStr = locale === 'he' ? 'he-IL' : locale === 'en' ? 'en-US' : 'fr-FR';

  const [wsd, setWsd] = useState<WeekStartDay>(1);
  const [dateRange, setDateRange] = useState<DateRange>(() => resolvePreset('allTime', 1));
  const [basis, setBasis] = useState<DateBasis>('created');
  const [ready, setReady] = useState(false);

  const [period, setPeriod] = useState<PeriodComparison | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendGrain, setTrendGrain] = useState<BreakdownDimension>('day');
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate week config + persisted selection before the first fetch.
  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid)
      .then((r) => {
        const w = clampWeekStartDay(r.week_start_day);
        setWsd(w);
        const stored = readStoredSel(RANGE_STORAGE_KEY);
        if (stored) setDateRange(resolveStored(stored, w));
        setBasis(readStoredBasis(BASIS_STORAGE_KEY));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [rid]);

  const scope = useMemo(
    () => ({ from: isoDate(dateRange.from), to: isoDate(dateRange.to) }),
    [dateRange],
  );

  // Chronological label for a trend bucket key.
  const trendLabel = useCallback(
    (key: string, grain: BreakdownDimension): string => {
      if (grain === 'month') {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, (m || 1) - 1, 1).toLocaleDateString(locStr, { month: 'short' });
      }
      const d = new Date(`${key}T00:00:00`);
      return isNaN(d.getTime())
        ? key
        : d.toLocaleDateString(locStr, { day: '2-digit', month: '2-digit' });
    },
    [locStr],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const days = daysInclusive(dateRange);
    const grain = granularityFor(days);
    setTrendGrain(grain);
    const [per, brk, top] = await Promise.allSettled([
      getPeriodSummary(rid, scope, basis),
      getBreakdown(rid, { dimension: grain, scope, basis }),
      getTopSellers(rid, scope, basis),
    ]);
    if (per.status === 'fulfilled') setPeriod(per.value);
    if (brk.status === 'fulfilled') {
      const points = [...brk.value.rows]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((r) => ({ label: trendLabel(r.key, grain), value: r.revenue }));
      setTrend(points);
    } else {
      setTrend([]);
    }
    setTopSellers(top.status === 'fulfilled' ? top.value : []);
    setLoading(false);
  }, [rid, scope, basis, dateRange, trendLabel]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const onPickRange = useCallback(
    (range: DateRange) => {
      setDateRange(range);
      writeStoredSel(RANGE_STORAGE_KEY, classifySelection(range, wsd));
    },
    [wsd],
  );

  const onChangeBasis = useCallback((b: DateBasis) => {
    setBasis(b);
    writeStoredBasis(BASIS_STORAGE_KEY, b);
  }, []);

  const cur = period?.current;
  const prev = period?.previous;
  const revenue = cur?.total_revenue ?? 0;
  const fmtMoney = (n: number) => money(n, { decimals: 0, grouped: true });
  const spark = sparkline(trend.map((p) => p.value));

  const onExportTrend = useCallback(() => {
    const header = [t('period'), t('revenue')];
    const body = trend.map((p) => [p.label, Math.round(p.value)]);
    downloadCsv(`mamie-revenue-${scope.from}_${scope.to}`, [header, ...body]);
  }, [trend, scope, t]);

  return (
    <>
      <PageHead
        title={t('reportsOverview') || "Vue d'ensemble"}
        desc={t('reportsOverviewDesc') || 'Explorez vos données financières'}
        actions={
          <>
            <DateBasisToggle value={basis} onChange={onChangeBasis} />
            <DateRangePicker value={dateRange} onChange={onPickRange} weekStartDay={wsd} align="right" />
            <Button variant="secondary" size="md" onClick={onExportTrend} disabled={!trend.length}>
              <Download /> {t('export')}
            </Button>
          </>
        }
      />

      {loading && !period ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Hero: revenue + trend */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-6)] mb-[var(--s-5)]">
            <div className="flex flex-wrap items-end justify-between gap-[var(--s-4)] mb-[var(--s-4)]">
              <div>
                <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-[var(--s-2)]">
                  {t('revenue')}
                </div>
                <div
                  className="font-semibold tabular-nums text-[var(--fg)]"
                  style={{ fontSize: 48, letterSpacing: '-0.03em', lineHeight: 1 }}
                >
                  {fmtMoney(revenue)}
                </div>
                <div className="flex items-center gap-[var(--s-2)] mt-[var(--s-2)]">
                  <DeltaPill {...delta(revenue, prev?.total_revenue ?? 0)} />
                  <span className="text-fs-sm text-[var(--fg-muted)]">{t('vsPreviousPeriod')}</span>
                </div>
              </div>
              {spark.line && (
                <svg viewBox="0 0 320 96" width="220" height="72" preserveAspectRatio="none" className="hidden sm:block">
                  <path d={spark.area} fill="color-mix(in oklab, var(--brand-500) 18%, transparent)" />
                  <path d={spark.line} fill="none" stroke="var(--brand-500)" strokeWidth={2} />
                </svg>
              )}
            </div>
            <TrendChart points={trend} formatValue={fmtMoney} />
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-[var(--s-4)] mb-[var(--s-5)]">
            <Kpi
              label={t('orders')}
              value={(cur?.total_orders ?? 0).toLocaleString('en-US')}
              delta={delta(cur?.total_orders ?? 0, prev?.total_orders ?? 0)}
            />
            <Kpi
              label={t('avgTicket')}
              value={money(cur?.avg_ticket ?? 0, { decimals: 1 })}
              delta={delta(cur?.avg_ticket ?? 0, prev?.avg_ticket ?? 0)}
            />
            <Kpi
              label={t('itemsSold')}
              value={cur?.items_sold ? cur.items_sold.toLocaleString('en-US') : '—'}
              sub={cur?.items_sold ? undefined : t('noItemDetailForPeriod')}
            />
          </div>

          {/* Breakdown explorer — the exploration workbench */}
          <div className="mb-[var(--s-5)]">
            <BreakdownExplorer rid={rid} scope={scope} basis={basis} locale={locale} />
          </div>

          {/* Top sellers (line-item data; empty for imported history) */}
          <Section title={t('topSellingItems') || 'Articles les plus vendus'}>
            {topSellers.length === 0 ? (
              <p className="text-fs-sm text-[var(--fg-muted)]">{t('noItemDetailForPeriod')}</p>
            ) : (
              <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
                <TableShell className="rounded-none border-0 border-t border-[var(--line)]">
                  <Table>
                    <Thead>
                      <tr>
                        <th style={{ width: 48 }}>#</th>
                        <th>{t('itemName') || 'Article'}</th>
                        <th style={{ textAlign: 'right' }}>{t('quantity') || 'Qté'}</th>
                        <th style={{ textAlign: 'right' }}>{t('revenue')}</th>
                        <th style={{ width: 80 }} />
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
                          <NumTd style={{ textAlign: 'right' }}>{fmtMoney(item.revenue ?? 0)}</NumTd>
                          <td>{i === 0 && <Badge tone="brand">★ Top</Badge>}</td>
                        </tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableShell>
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}

function DeltaPill({ value, direction }: { value: string; direction: 'up' | 'down' }) {
  const up = direction === 'up';
  return (
    <span
      className={`inline-flex items-center gap-1 text-fs-xs font-medium tabular-nums ${
        up ? 'text-[var(--success-500)] dark:text-[#4ade80]' : 'text-[var(--danger-500)] dark:text-[#fb7185]'
      }`}
    >
      <span aria-hidden>{up ? '↑' : '↓'}</span>
      {value}
    </span>
  );
}
