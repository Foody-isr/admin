'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { getAnalyticsCustomers, CustomerInsight, CustomerListResult } from '@/lib/api';
import CustomerDetailPanel from './CustomerDetailPanel';

type SortField = 'total_spent' | 'total_orders' | 'avg_order_value' | 'last_order_date' | 'customer_name';

function StatusBadge({ days }: { days: number }) {
  if (days <= 30) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">Active</span>;
  if (days <= 60) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600">At Risk</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">Churned</span>;
}

function daysAgoLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function SortHeader({ label, field, current, dir, onSort }: {
  label: string; field: SortField; current: SortField; dir: string;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="text-right py-2 text-fg-secondary font-medium cursor-pointer select-none hover:text-fg-primary"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === 'desc' ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUpIcon className="w-3 h-3" />)}
      </span>
    </th>
  );
}

export default function CustomersInsightsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

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
            <div className="text-sm text-fg-secondary mt-1">Total Customers</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{data.total_active}</div>
            <div className="text-sm text-fg-secondary mt-1">Active (30d)</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.total_at_risk}</div>
            <div className="text-sm text-fg-secondary mt-1">At Risk (31-60d)</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-600">{data.total_churned}</div>
            <div className="text-sm text-fg-secondary mt-1">Churned (60d+)</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-secondary" />
        <input
          type="text"
          placeholder="Search by name or phone..."
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
            No customer data yet. Customer insights will appear once orders with phone numbers are placed.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    <th className="text-left py-2 text-fg-secondary font-medium">Customer</th>
                    <SortHeader label="Orders" field="total_orders" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Total Spent" field="total_spent" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Avg Order" field="avg_order_value" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Last Order" field="last_order_date" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <th className="text-left py-2 text-fg-secondary font-medium">Top Items</th>
                    <th className="text-center py-2 text-fg-secondary font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((c: CustomerInsight) => (
                    <tr
                      key={c.customer_phone}
                      className="border-b border-divider hover:bg-surface-subtle cursor-pointer transition-colors"
                      onClick={() => setSelectedPhone(c.customer_phone)}
                    >
                      <td className="py-2.5">
                        <div className="text-fg-primary font-medium">{c.customer_name || '—'}</div>
                        <div className="text-xs text-fg-secondary">{c.customer_phone}</div>
                      </td>
                      <td className="py-2.5 text-right text-fg-primary">{c.total_orders}</td>
                      <td className="py-2.5 text-right font-medium text-fg-primary">₪{c.total_spent.toFixed(0)}</td>
                      <td className="py-2.5 text-right text-fg-secondary">₪{c.avg_order_value.toFixed(0)}</td>
                      <td className="py-2.5 text-right text-fg-secondary">{daysAgoLabel(c.days_since_last_order)}</td>
                      <td className="py-2.5 text-left">
                        <div className="text-xs text-fg-secondary truncate max-w-[160px]">
                          {c.favorite_items.length > 0
                            ? c.favorite_items.map(f => f.name).join(', ')
                            : '—'}
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <StatusBadge days={c.days_since_last_order} />
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
                  Page {page} of {totalPages} ({data.total} customers)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded text-sm border border-divider disabled:opacity-40 hover:bg-surface-subtle"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded text-sm border border-divider disabled:opacity-40 hover:bg-surface-subtle"
                  >
                    Next
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
