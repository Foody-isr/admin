'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SearchIcon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { getAnalyticsCustomers, CustomerInsight, CustomerListResult } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import CustomerDetailPanel from './CustomerDetailPanel';

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

function SortHeader({ label, field, current, dir, onSort }: {
  label: string; field: SortField; current: SortField; dir: string;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="text-right py-2 px-2 text-fg-secondary font-medium cursor-pointer select-none hover:text-fg-primary whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        {active && (dir === 'desc' ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUpIcon className="w-3 h-3" />)}
      </span>
    </th>
  );
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
    <div className="space-y-6">
      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-fg-primary">{data.total}</div>
            <div className="text-sm text-fg-secondary mt-1">{t('totalCustomers')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{data.total_active}</div>
            <div className="text-sm text-fg-secondary mt-1">{t('activeCustomers')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.total_at_risk}</div>
            <div className="text-sm text-fg-secondary mt-1">{t('atRiskCustomers')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-600">{data.total_churned}</div>
            <div className="text-sm text-fg-secondary mt-1">{t('churnedCustomers')}</div>
          </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    <th className="text-left py-2 px-2 text-fg-secondary font-medium whitespace-nowrap">{t('customer')}</th>
                    <SortHeader label={t('orders')} field="total_orders" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label={t('totalSpent')} field="total_spent" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label={t('avgOrder')} field="avg_order_value" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label={t('lastOrder')} field="last_order_date" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <th className="text-left py-2 px-2 text-fg-secondary font-medium whitespace-nowrap">{t('topItems')}</th>
                    <th className="text-center py-2 px-2 text-fg-secondary font-medium whitespace-nowrap">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((c: CustomerInsight) => (
                    <tr
                      key={c.customer_phone}
                      className="border-b border-divider hover:bg-surface-subtle cursor-pointer transition-colors"
                      onClick={() => setSelectedPhone(c.customer_phone)}
                    >
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="text-fg-primary font-medium">{c.customer_name || '—'}</div>
                        <div className="text-xs text-fg-secondary">{c.customer_phone}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-fg-primary whitespace-nowrap">{c.total_orders}</td>
                      <td className="py-2.5 px-2 text-right font-medium text-fg-primary whitespace-nowrap">₪{c.total_spent.toFixed(0)}</td>
                      <td className="py-2.5 px-2 text-right text-fg-secondary whitespace-nowrap">₪{c.avg_order_value.toFixed(0)}</td>
                      <td className="py-2.5 px-2 text-right text-fg-secondary whitespace-nowrap">{daysAgoLabel(c.days_since_last_order, t)}</td>
                      <td className="py-2.5 px-2">
                        <div className="text-xs text-fg-secondary truncate max-w-[200px]">
                          {c.favorite_items.length > 0
                            ? c.favorite_items.map(f => f.name).join(', ')
                            : '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <StatusBadge days={c.days_since_last_order} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
