'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SearchIcon } from 'lucide-react';
import {
  getAnalyticsItems,
  getRestaurant,
  ItemSalesInsight,
  ItemSalesListResult,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { clampWeekStartDay, getEffectiveWorkdays, isoDate, type WeekStartDay } from '@/lib/weeks';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import DateBasisToggle, { type DateBasis } from '@/components/DateBasisToggle';
import ItemDetailPanel from './ItemDetailPanel';
import { PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  SortableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

type SortField = 'quantity' | 'revenue' | 'avg_price' | 'order_count' | 'name' | 'category_name' | 'pct_of_revenue';

// The report window + date basis are remembered across navigation. Stored as
// literal dates (not a rolling key) — a sales report is usually pinned to a
// concrete period the owner is analysing, not a rolling "today".
const RANGE_STORAGE_KEY = 'foody.salesByItem.range.v1';
const BASIS_STORAGE_KEY = 'foody.salesByItem.basis.v1';

/** First-of-current-month → today, the default window for a sales report. */
function currentMonthRange(): DateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from, to };
}

function readStoredRange(): DateRange | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const { from, to } = JSON.parse(raw) as { from: string; to: string };
    return { from: new Date(`${from}T00:00:00`), to: new Date(`${to}T00:00:00`) };
  } catch {
    return null;
  }
}

function readStoredBasis(): DateBasis {
  if (typeof window === 'undefined') return 'created';
  return localStorage.getItem(BASIS_STORAGE_KEY) === 'serie' ? 'serie' : 'created';
}

export default function SalesByItemPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [data, setData] = useState<ItemSalesListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('quantity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const [wsd, setWsd] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange);
  const [basis, setBasis] = useState<DateBasis>('created');
  // Gate the first fetch until the week config + persisted selection hydrate, so
  // we load once with the right window instead of flashing the default.
  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const perPage = 50;

  // Hydrate week config (drives the picker presets) + persisted selection.
  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid)
      .then((r) => {
        setWsd(clampWeekStartDay(r.week_start_day));
        setWorkdays(getEffectiveWorkdays(r));
      })
      .catch(() => {})
      .finally(() => {
        const storedRange = readStoredRange();
        if (storedRange) setDateRange(storedRange);
        setBasis(readStoredBasis());
        setReady(true);
      });
  }, [rid]);

  const scope = { from: isoDate(dateRange.from), to: isoDate(dateRange.to) };

  const fetchData = useCallback(async (s: string, sb: SortField, sd: string, p: number, from: string, to: string, b: DateBasis) => {
    setLoading(true);
    try {
      const result = await getAnalyticsItems(rid, { from, to }, b, {
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

  // Refetch on sort / page / window / basis changes (once hydrated).
  useEffect(() => {
    if (ready) fetchData(search, sortBy, sortDir, page, scope.from, scope.to, basis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sortBy, sortDir, page, scope.from, scope.to, basis]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData(val, sortBy, sortDir, 1, scope.from, scope.to, basis);
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

  const onPickRange = (range: DateRange) => {
    setDateRange(range);
    setPage(1);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ from: isoDate(range.from), to: isoDate(range.to) }));
    } catch { /* quota / private mode */ }
  };

  const onChangeBasis = (b: DateBasis) => {
    setBasis(b);
    setPage(1);
    try { localStorage.setItem(BASIS_STORAGE_KEY, b); } catch { /* quota / private mode */ }
  };

  const totalPages = data ? Math.ceil(data.total / perPage) : 0;

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('salesByItem')}
        desc={t('salesByItemDesc')}
      />

      {/* Filter bar: period + date basis */}
      <div className="flex flex-wrap items-center gap-[var(--s-3)]">
        <DateRangePicker
          value={dateRange}
          onChange={onPickRange}
          weekStartDay={wsd}
          workdays={workdays}
          restaurantId={rid}
        />
        <DateBasisToggle value={basis} onChange={onChangeBasis} />
      </div>

      {/* KPI strip */}
      {data && (
        <div className="grid grid-cols-3 gap-[var(--s-4)]">
          {[
            { v: `₪${Math.round(data.total_revenue).toLocaleString()}`, l: t('totalRevenue'), c: 'var(--fg)' },
            { v: data.total_quantity.toLocaleString(), l: t('unitsSold'), c: 'var(--fg)' },
            { v: data.items_sold.toLocaleString(), l: t('itemsSoldLabel'), c: 'var(--fg)' },
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
          placeholder={t('searchByItemName')}
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-divider bg-surface-subtle text-fg-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      <div className="space-y-[var(--s-4)]">
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-fg-secondary py-8 text-center">
            {t('noItemSalesData')}
          </p>
        ) : (
          <>
            <DataTable className="overflow-x-auto">
              <DataTableHead>
                <SortableHeadCell
                  sortKey="name"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                >
                  {t('item')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="category_name"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                >
                  {t('category')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="quantity"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('quantitySold')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="revenue"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('revenue')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="avg_price"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('avgPrice')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="pct_of_revenue"
                  currentSortKey={sortBy}
                  sortDir={sortDir}
                  onSort={(k) => handleSort(k as SortField)}
                  align="right"
                >
                  {t('pctOfRevenue')}
                </SortableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {data.items.map((it: ItemSalesInsight, index: number) => (
                  <DataTableRow
                    key={it.menu_item_id}
                    index={index}
                    className="cursor-pointer"
                    onClick={() => setSelectedItemId(it.menu_item_id)}
                  >
                    <DataTableCell mobilePrimary className="whitespace-nowrap">
                      <div className="text-fg-primary font-medium">{it.name}</div>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('category')} className="text-fg-secondary whitespace-nowrap">{it.category_name || '—'}</DataTableCell>
                    <DataTableCell align="right" mobileLabel={t('quantitySold')} className="text-fg-primary whitespace-nowrap">{it.quantity}</DataTableCell>
                    <DataTableCell align="right" mobileLabel={t('revenue')} className="font-medium text-fg-primary whitespace-nowrap">₪{it.revenue.toFixed(0)}</DataTableCell>
                    <DataTableCell align="right" mobileLabel={t('avgPrice')} className="text-fg-secondary whitespace-nowrap">₪{it.avg_price.toFixed(0)}</DataTableCell>
                    <DataTableCell align="right" mobileLabel={t('pctOfRevenue')} className="text-fg-secondary whitespace-nowrap">{it.pct_of_revenue.toFixed(1)}%</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
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
      {selectedItemId !== null && (
        <ItemDetailPanel
          restaurantId={rid}
          itemId={selectedItemId}
          scope={scope}
          basis={basis}
          onClose={() => setSelectedItemId(null)}
        />
      )}
    </div>
  );
}
