'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SearchIcon } from 'lucide-react';
import { getAnalyticsCustomers, CustomerInsight, CustomerListResult } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import CustomerDetailPanel from './CustomerDetailPanel';
import { PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  SortableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

type SortField = 'total_spent' | 'total_orders' | 'avg_order_value' | 'last_order_date' | 'customer_name';

function StatusBadge({ days, t }: { days: number; t: (k: string) => string }) {
  if (days <= 30) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">{t('active')}</span>;
  if (days <= 60) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600">{t('atRisk')}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">{t('churned')}</span>;
}

function daysAgoLabel(days: number, t: (k: string) => string): string {
  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return t('daysAgo').replace('{n}', String(days));
  if (days < 30) return t('weeksAgo').replace('{n}', String(Math.floor(days / 7)));
  if (days < 365) return t('monthsAgo').replace('{n}', String(Math.floor(days / 30)));
  return t('yearsAgo').replace('{n}', String(Math.floor(days / 365)));
}

export default function CustomersInsightsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [data, setData] = useState<CustomerListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('total_spent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const perPage = 50;

  const fetchData = useCallback(async (s: string, sb: SortField, sd: string, p: number) => {
    setLoading(true);
    try {
      const result = await getAnalyticsCustomers(rid, {
        search: s || undefined,
        sort_by: sb,
        sort_dir: sd,
        page: p,
        per_page: perPage,
      });
      setData(result);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    fetchData(search, sortBy, sortDir, page);
  }, [fetchData, sortBy, sortDir, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData(val, sortBy, sortDir, 1);
    }, 400);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / perPage) : 0;

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('salesByCustomer') || 'Sales by Customer'}
        desc={t('customerInsightsDesc') || 'Analyse du comportement et de la fidélité client'}
      />

      {/* KPI strip */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)]">
          {[
            { v: data.total, l: t('totalCustomers'), c: 'var(--fg)' },
            { v: data.total_active, l: t('activeCustomers'), c: 'var(--success-500)' },
            { v: data.total_at_risk, l: t('atRiskCustomers'), c: 'var(--warning-500)' },
            { v: data.total_churned, l: t('churnedCustomers'), c: 'var(--danger-500)' },
          ].map((k, i) => (
            <div
              key={i}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-4)] flex flex-col gap-[var(--s-2)]"
            >
              <div className="text-fs-3xl font-semibold tabular-nums" style={{ color: k.c }}>
                {k.v}
              </div>
              <div className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[.06em] font-medium">
                {k.l}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-secondary" />
        <input
          type="text"
          placeholder={t('searchByNameOrPhone')}
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-divider bg-surface-subtle text-fg-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !data || data.customers.length === 0 ? (
          <p className="text-sm text-fg-secondary py-8 text-center">
            {t('noCustomerData')}
          </p>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <DataTableHeadCell>{t('customer')}</DataTableHeadCell>
                <SortableHeadCell
                  sortKey="total_orders"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('orders')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="total_spent"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('totalSpent')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="avg_order_value"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('avgOrder')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="last_order_date"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('lastOrder')}
                </SortableHeadCell>
                <DataTableHeadCell>{t('topItems')}</DataTableHeadCell>
                <DataTableHeadCell align="center">{t('status')}</DataTableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {data.customers.map((c: CustomerInsight, index: number) => (
                  <DataTableRow
                    key={c.customer_phone}
                    index={index}
                    className="cursor-pointer"
                    onClick={() => setSelectedPhone(c.customer_phone)}
                  >
                    <DataTableCell className="whitespace-nowrap">
                      <div className="text-fg-primary font-medium">{c.customer_name || '—'}</div>
                      <div className="text-xs text-fg-secondary">{c.customer_phone}</div>
                    </DataTableCell>
                    <DataTableCell align="right" className="text-fg-primary whitespace-nowrap">{c.total_orders}</DataTableCell>
                    <DataTableCell align="right" className="font-medium text-fg-primary whitespace-nowrap">₪{c.total_spent.toFixed(0)}</DataTableCell>
                    <DataTableCell align="right" className="text-fg-secondary whitespace-nowrap">₪{c.avg_order_value.toFixed(0)}</DataTableCell>
                    <DataTableCell align="right" className="text-fg-secondary whitespace-nowrap">{daysAgoLabel(c.days_since_last_order, t)}</DataTableCell>
                    <DataTableCell>
                      <div className="text-xs text-fg-secondary truncate max-w-[200px]">
                        {c.favorite_items.length > 0
                          ? c.favorite_items.map(f => f.name).join(', ')
                          : '—'}
                      </div>
                    </DataTableCell>
                    <DataTableCell align="center" className="whitespace-nowrap">
                      <StatusBadge days={c.days_since_last_order} t={t} />
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-divider">
                <div className="text-sm text-fg-secondary">
                  {t('pageXofY').replace('{page}', String(page)).replace('{total}', String(totalPages)).replace('{count}', String(data.total))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded text-sm border border-divider disabled:opacity-40 hover:bg-surface-subtle"
                  >
                    {t('previous')}
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded text-sm border border-divider disabled:opacity-40 hover:bg-surface-subtle"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selectedPhone && (
        <CustomerDetailPanel
          restaurantId={rid}
          phone={selectedPhone}
          onClose={() => setSelectedPhone(null)}
        />
      )}
    </div>
  );
}
