'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';
import {
  getChainOverview,
  getChainPeriodSummary,
  getPeriodSummary,
  ChainOverview,
  PeriodComparison,
  RangeSummary,
  AnalyticsRange,
} from '@/lib/api';
import { ArrowLeftIcon } from 'lucide-react';

function formatCurrency(val: number): string {
  return `₪${(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const RANGES: AnalyticsRange[] = ['today', 'week', 'month'];

interface BranchRow {
  id: number;
  name: string;
  summary: RangeSummary | null;
}

/**
 * Global (chain-merged) reports. Aggregates dashboard KPIs across every branch
 * of the chain, plus a per-branch breakdown. This is the "Global" destination of
 * the top-bar branch switcher. Reports/dashboard only, by design.
 */
export default function ChainDashboardPage() {
  const { chainId: chainParam } = useParams();
  const chainId = Number(chainParam);
  const router = useRouter();
  const { t } = useI18n();
  const { isLoggedIn, loading: authLoading } = useAuth();

  const [range, setRange] = useState<AnalyticsRange>('month');
  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [merged, setMerged] = useState<PeriodComparison | null>(null);
  const [branchRows, setBranchRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) router.push('/login');
  }, [authLoading, isLoggedIn, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ov, mergedSummary] = await Promise.all([
        getChainOverview(chainId),
        getChainPeriodSummary(chainId, range),
      ]);
      setOverview(ov);
      setMerged(mergedSummary);
      // Per-branch breakdown: one period summary per branch, resilient to a
      // single branch failing (it just shows blank cells).
      const rows = await Promise.all(
        ov.branches.map(async (b): Promise<BranchRow> => {
          try {
            const s = await getPeriodSummary(b.id, range);
            return { id: b.id, name: b.name, summary: s.current };
          } catch {
            return { id: b.id, name: b.name, summary: null };
          }
        }),
      );
      setBranchRows(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [chainId, range]);

  useEffect(() => { load(); }, [load]);

  const cur = merged?.current;
  const backBranch = overview?.branches[0]?.id;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-fs-sm text-[var(--fg-muted)]">
              {backBranch && (
                <button
                  onClick={() => router.push(`/${backBranch}/dashboard`)}
                  className="inline-flex items-center gap-1 hover:text-[var(--fg)] transition-colors"
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  {t('chain_back_to_branch')}
                </button>
              )}
            </div>
            <h1 className="text-fs-3xl font-semibold tracking-[-0.02em] text-[var(--fg)] mt-1">
              {overview?.chain_name || t('chain_global_reports')}
            </h1>
            <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">{t('chain_global_desc')}</p>
          </div>

          {/* Range toggle */}
          <div className="inline-flex rounded-r-md border border-[var(--line)] overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-fs-sm transition-colors ${
                  range === r
                    ? 'bg-[var(--brand-500)] text-white'
                    : 'bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {t(r === 'today' ? 'today' : r === 'week' ? 'week' : 'month')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center text-fg-secondary">{t('chain_create_error')}</div>
        ) : (
          <>
            {/* Merged KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label={t('total_revenue')} value={formatCurrency(cur?.total_revenue ?? 0)} />
              <KpiCard label={t('orders')} value={String(cur?.total_orders ?? 0)} />
              <KpiCard label={t('avg_ticket')} value={formatCurrency(cur?.avg_ticket ?? 0)} />
              <KpiCard label={t('items_sold')} value={String(cur?.items_sold ?? 0)} />
            </div>

            {/* Per-branch breakdown */}
            <div>
              <h2 className="text-fs-lg font-semibold text-[var(--fg)] mb-3">{t('chain_branches')}</h2>
              <DataTable
                style={{ ['--cols' as string]: '1.6fr 1fr 0.8fr 1fr' } as React.CSSProperties}
              >
                <DataTableHead>
                  <DataTableHeadCell>{t('chain_col_name')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('total_revenue')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('orders')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('avg_ticket')}</DataTableHeadCell>
                </DataTableHead>
                <DataTableBody>
                  {branchRows.map((row, index) => (
                    <DataTableRow
                      key={row.id}
                      index={index}
                      onClick={() => router.push(`/${row.id}/dashboard`)}
                      className="cursor-pointer hover:bg-fg-tertiary/5"
                    >
                      <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                        {row.name}
                      </DataTableCell>
                      <DataTableCell mobileLabel={t('total_revenue')} className="text-fg-primary">
                        {row.summary ? formatCurrency(row.summary.total_revenue) : ''}
                      </DataTableCell>
                      <DataTableCell mobileLabel={t('orders')} className="text-fg-secondary">
                        {row.summary ? row.summary.total_orders : ''}
                      </DataTableCell>
                      <DataTableCell mobileLabel={t('avg_ticket')} className="text-fg-secondary">
                        {row.summary ? formatCurrency(row.summary.avg_ticket) : ''}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-fs-xs uppercase tracking-wide text-[var(--fg-subtle)]">{label}</p>
      <p className="text-fs-2xl font-semibold text-[var(--fg)] mt-1 tabular-nums">{value}</p>
    </div>
  );
}
