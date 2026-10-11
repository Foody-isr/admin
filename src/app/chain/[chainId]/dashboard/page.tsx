'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Building2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/currency';
import { chainReportCurrency, isChainReportOverview, isChainReportSummary } from '@/lib/chain-report';
import FoodyLogo from '@/components/brand/FoodyLogo';
import { Button, EmptyState, Kpi } from '@/components/ds';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table/DataTable';
import { getChainOverview, getChainPeriodSummary, getPeriodSummary, getRestaurant, type ChainOverview, type RangeSummary, type AnalyticsRange } from '@/lib/api';

const RANGES: AnalyticsRange[] = ['today', 'week', 'month'];
interface BranchRow { id: number; name: string; summary: RangeSummary | null; currency: string | null; loading: boolean }
interface Report { range: AnalyticsRange; overview: ChainOverview; current: RangeSummary; rows: BranchRow[] }

/** Chain reports wait for authentication and remount when the chain or user changes. */
export default function ChainDashboardPage() {
  const { chainId } = useParams();
  const id = Number(chainId);
  const { isLoggedIn, loading, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => { if (!loading && !isLoggedIn) router.replace('/login'); }, [loading, isLoggedIn, router]);
  if (loading || !isLoggedIn) return <div role="status" className="p-8 text-[var(--fg-muted)]">{t('loading')}</div>;
  if (!Number.isSafeInteger(id) || id <= 0) return <main className="p-6"><EmptyState title={t('chain_report_error')} action={<Button asChild variant="secondary"><Link href="/select-restaurant">{t('chooseRestaurant')}</Link></Button>} /></main>;
  return <ChainReport key={`${id}:${user?.id}`} chainId={id} />;
}

function ChainReport({ chainId }: { chainId: number }) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<AnalyticsRange>('month');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setReport(null); setError(false);
    try {
      const [overview, period] = await Promise.all([getChainOverview(chainId), getChainPeriodSummary(chainId, range)]);
      if (request !== sequence.current) return;
      if (!isChainReportOverview(overview, chainId) || !isChainReportSummary(period?.current)) throw new Error('Invalid chain report');
      setReport({ range, overview, current: period.current, rows: overview.branches.map(branch => ({ id: branch.id, name: branch.name, summary: null, currency: null, loading: true })) });
      // Branch reads resolve independently without recalculating the server's aggregate.
      await Promise.all(overview.branches.map(async branch => {
        const [summary, restaurant] = await Promise.allSettled([getPeriodSummary(branch.id, range), getRestaurant(branch.id)]);
        if (request !== sequence.current) return;
        const row: BranchRow = {
          id: branch.id, name: branch.name, loading: false,
          summary: summary.status === 'fulfilled' && isChainReportSummary(summary.value?.current) ? summary.value.current : null,
          currency: restaurant.status === 'fulfilled' ? chainReportCurrency(restaurant.value, branch.id) : null,
        };
        setReport(previous => previous ? { ...previous, rows: previous.rows.map(existing => existing.id === row.id ? row : existing) } : null);
      }));
    } catch { if (request === sequence.current) setError(true); }
  }, [chainId, range]);
  const invalidateRequests = useCallback(() => { sequence.current++; }, []);
  useEffect(() => { void load(); return invalidateRequests; }, [load, invalidateRequests]);

  const current = report?.range === range ? report : null;
  const rows = current?.rows ?? [];
  const pending = rows.some(row => row.loading);
  const failed = rows.some(row => !row.loading && (!row.summary || !row.currency));
  const currencies = new Set(rows.map(row => row.currency));
  const currency = rows.length && !currencies.has(null) && currencies.size === 1 ? rows[0].currency : null;
  const mixedCurrencies = !pending && currencies.size > 1 && !currencies.has(null);
  const backBranch = current?.overview.branches[0]?.id;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const money = (value: number, code: string | null) => code ? formatMoney(value, code, { decimals: 0, grouped: true }) : '—';
  const pickRange = (next: AnalyticsRange) => { if (next !== range) { sequence.current++; setError(false); setRange(next); } };

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] pt-safe-t">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <FoodyLogo variant="lockup" width={112} />
          <Link href={backBranch ? `/${backBranch}/dashboard` : '/select-restaurant'} className="inline-flex min-h-11 items-center gap-2 rounded-r-md px-2 text-fs-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t(backBranch ? 'chain_back_to_branch' : 'chooseRestaurant')}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-10 pb-[max(var(--s-8),var(--safe-bottom))]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 flex-1 basis-72">
            <p className="mb-2 text-fs-sm font-medium text-[var(--brand-ink)]">{t('chain_global_reports')}</p>
            <h1 className="break-words text-fs-3xl font-semibold tracking-tight"><bdi>{current?.overview.chain_name || t('chain_branches')}</bdi></h1>
            <p className="mt-2 max-w-prose text-fs-sm text-[var(--fg-muted)]">{t('chain_report_desc')}</p>
          </div>
          <div role="group" aria-label={t('period')} className="inline-flex max-w-full rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-1">
            {RANGES.map(option => <button key={option} type="button" aria-pressed={range === option} onClick={() => pickRange(option)} className={`min-h-11 rounded-r-md px-4 text-fs-sm font-medium transition-colors ${range === option ? 'bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'}`}>{t(option)}</button>)}
          </div>
        </div>
        {error ? <div className="card px-5" role="alert"><EmptyState icon={<Building2 />} title={t('chain_report_error')} action={<Button variant="secondary" onClick={() => void load()}><RefreshCw />{t('retry')}</Button>} /></div>
          : !current ? <div role="status" className="flex items-center justify-center gap-3 py-20 text-fs-sm text-[var(--fg-muted)]"><FoodyLogo variant="symbol" width={26} decorative />{t('loading')}</div>
          : rows.length === 0 ? <div className="card px-5"><EmptyState icon={<Building2 />} title={t('chain_report_empty')} /></div>
          : <>
            <section aria-label={t('chain_global_reports')} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
                <Kpi label={t('total_revenue')} value={<bdi className="break-words text-[clamp(1.15rem,3.5vw,1.875rem)]">{money(current.current.total_revenue, currency)}</bdi>} className="!bg-[var(--summary-bg)] [&>div:first-child]:text-[var(--summary-fg)] [&>div:nth-child(2)]:text-[var(--summary-fg)]" />
                <Kpi label={t('orders')} value={<bdi className="break-words text-[clamp(1.15rem,3.5vw,1.875rem)]">{number(current.current.total_orders)}</bdi>} />
                <Kpi label={t('avg_ticket')} value={<bdi className="break-words text-[clamp(1.15rem,3.5vw,1.875rem)]">{money(current.current.avg_ticket, currency)}</bdi>} />
                <Kpi label={t('items_sold')} value={<bdi className="break-words text-[clamp(1.15rem,3.5vw,1.875rem)]">{number(current.current.items_sold)}</bdi>} />
              </div>
              {!currency && <p role="status" className="text-fs-sm text-[var(--fg-muted)]">{t(pending ? 'chain_report_currency_loading' : mixedCurrencies ? 'chain_report_currency_mixed' : 'chain_report_currency_error')}</p>}
            </section>
            <section aria-labelledby="chain-branches-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="chain-branches-heading" className="flex items-center gap-3 text-fs-lg font-semibold">{t('chain_branches')}<span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-fs-xs tabular-nums text-[var(--fg-muted)]">{number(rows.length)}</span></h2>
                <Button variant="secondary" disabled={pending} onClick={() => void load()}><RefreshCw />{t(failed ? 'retry' : 'refresh')}</Button>
              </div>
              {failed && <p role="alert" className="text-fs-sm text-[var(--fg-muted)]">{t('chain_report_partial')}</p>}
              <DataTable>
                <DataTableHead>
                  <DataTableHeadCell scope="col">{t('chain_col_name')}</DataTableHeadCell>
                  <DataTableHeadCell scope="col">{t('total_revenue')}</DataTableHeadCell>
                  <DataTableHeadCell scope="col">{t('orders')}</DataTableHeadCell>
                  <DataTableHeadCell scope="col">{t('avg_ticket')}</DataTableHeadCell>
                </DataTableHead>
                <DataTableBody>
                  {rows.map((row, index) => <DataTableRow key={row.id} index={index}>
                    <DataTableCell mobilePrimary className="max-w-[28rem]">
                      <Link href={`/${row.id}/dashboard`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-r-md font-medium text-[var(--brand-ink)] hover:underline"><bdi className="min-w-0 break-words">{row.name}</bdi><ArrowUpRight className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden /></Link>
                      {(row.loading || !row.summary || !row.currency) && <p role="status" className="pb-1 text-fs-xs text-[var(--fg-muted)]">{t(row.loading ? 'loading' : !row.summary ? 'chain_report_branch_error' : 'chain_report_currency_error')}</p>}
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('total_revenue')} className="tabular-nums"><bdi>{row.summary ? money(row.summary.total_revenue, row.currency) : '—'}</bdi></DataTableCell>
                    <DataTableCell mobileLabel={t('orders')} className="tabular-nums"><bdi>{row.summary ? number(row.summary.total_orders) : '—'}</bdi></DataTableCell>
                    <DataTableCell mobileLabel={t('avg_ticket')} className="tabular-nums"><bdi>{row.summary ? money(row.summary.avg_ticket, row.currency) : '—'}</bdi></DataTableCell>
                  </DataTableRow>)}
                </DataTableBody>
              </DataTable>
            </section>
          </>}
      </main>
    </div>
  );
}
