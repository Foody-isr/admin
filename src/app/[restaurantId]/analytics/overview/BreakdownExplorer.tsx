'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import {
  getBreakdown,
  type BreakdownDimension,
  type BreakdownResult,
  type BreakdownRow,
  type DateBasis,
} from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { downloadCsv } from '@/lib/csv/export';
import { Button, NumTd, Section, Table, TableShell, Tbody, Thead } from '@/components/ds';

type SortKey = 'revenue' | 'orders' | 'label';

// Dimensions offered in the pivot, in display order. Time dimensions sort
// chronologically by default; attribute dimensions sort by revenue.
const DIMENSIONS: { key: BreakdownDimension; labelKey: string; chronological?: boolean }[] = [
  { key: 'month', labelKey: 'breakdownMonth', chronological: true },
  { key: 'serie', labelKey: 'breakdownSerie', chronological: true },
  { key: 'order_type', labelKey: 'breakdownOrderType' },
  { key: 'payment_method', labelKey: 'breakdownPayment' },
  { key: 'customer', labelKey: 'breakdownCustomer' },
  { key: 'day_of_week', labelKey: 'breakdownWeekday', chronological: true },
];

const DIM_STORAGE_KEY = 'foody.analytics.breakdownDim';

export default function BreakdownExplorer({
  rid,
  scope,
  basis,
  locale,
}: {
  rid: number;
  scope: { from: string; to: string };
  basis: DateBasis;
  locale: 'en' | 'he' | 'fr';
}) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const [dimension, setDimension] = useState<BreakdownDimension>('month');
  const [data, setData] = useState<BreakdownResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');

  // Restore the last-used dimension once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(DIM_STORAGE_KEY) as BreakdownDimension | null;
    if (saved && DIMENSIONS.some((d) => d.key === saved)) setDimension(saved);
  }, []);

  const chronological = DIMENSIONS.find((d) => d.key === dimension)?.chronological ?? false;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getBreakdown(rid, { dimension, scope, basis, limit: dimension === 'customer' ? 50 : undefined })
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // scope is memoized by the parent, so it's stable unless the window changes.
  }, [rid, dimension, scope, basis]);

  const locStr = locale === 'he' ? 'he-IL' : locale === 'en' ? 'en-US' : 'fr-FR';
  const fmtMoney = useCallback(
    (n: number) => money(n, { decimals: 0, grouped: true }),
    [],
  );

  // Human label for a row, per dimension.
  const labelFor = useCallback(
    (row: BreakdownRow): string => {
      switch (dimension) {
        case 'month': {
          const [y, m] = row.key.split('-').map(Number);
          if (!y || !m) return row.key;
          return new Date(y, m - 1, 1).toLocaleDateString(locStr, { month: 'short', year: 'numeric' });
        }
        case 'serie':
        case 'day': {
          const d = new Date(`${row.key}T00:00:00`);
          if (isNaN(d.getTime())) return row.key;
          return d.toLocaleDateString(locStr, { weekday: 'short', day: 'numeric', month: 'short' });
        }
        case 'day_of_week': {
          const d = new Date(2024, 0, 7 + Number(row.key)); // 2024-01-07 is a Sunday (DOW 0)
          return d.toLocaleDateString(locStr, { weekday: 'long' });
        }
        case 'order_type': {
          const map: Record<string, string> = {
            delivery: t('delivery'),
            pickup: t('pickup'),
            dine_in: t('dineIn'),
            unknown: t('breakdownUnknown'),
          };
          return map[row.key] ?? row.key;
        }
        case 'payment_method': {
          const map: Record<string, string> = {
            cash: t('paymentCash'),
            card: t('paymentCard'),
            bit: t('paymentBit'),
            unknown: t('breakdownUnknown'),
          };
          return map[row.key] ?? row.label ?? row.key;
        }
        default:
          return row.label || row.key;
      }
    },
    [dimension, locStr, t],
  );

  const total = data?.total.revenue ?? 0;

  // Rows enriched with display label + share, then filtered by search and sorted.
  const rows = useMemo(() => {
    const enriched = (data?.rows ?? []).map((r) => ({
      ...r,
      display: labelFor(r),
      share: total > 0 ? (r.revenue / total) * 100 : 0,
    }));
    const q = search.trim().toLowerCase();
    const filtered = q ? enriched.filter((r) => r.display.toLowerCase().includes(q)) : enriched;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'label') return chronological ? a.key.localeCompare(b.key) : a.display.localeCompare(b.display);
      if (sortKey === 'orders') return b.orders - a.orders;
      return b.revenue - a.revenue;
    });
    // For time dimensions default to chronological unless the user sorts by a metric.
    if (chronological && sortKey === 'revenue') return [...filtered].sort((a, b) => a.key.localeCompare(b.key));
    return sorted;
  }, [data, labelFor, total, search, sortKey, chronological]);

  const maxRev = useMemo(() => Math.max(1, ...rows.map((r) => r.revenue)), [rows]);

  const onExport = useCallback(() => {
    const dimLabel = t(DIMENSIONS.find((d) => d.key === dimension)!.labelKey);
    const header = [dimLabel, t('orders'), t('revenue'), '% ' + t('revenue')];
    const body = rows.map((r) => [r.display, r.orders, Math.round(r.revenue), r.share.toFixed(1) + '%']);
    downloadCsv(`mamie-${dimension}-${scope.from}_${scope.to}`, [header, ...body]);
  }, [rows, dimension, scope, t]);

  return (
    <Section
      title={t('breakdownTitle')}
      desc={t('breakdownDesc')}
      aside={
        <Button variant="secondary" size="sm" onClick={onExport} disabled={!rows.length}>
          <Download /> {t('export')}
        </Button>
      }
    >
      {/* Dimension selector */}
      <div className="inline-flex flex-wrap items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md mb-[var(--s-4)]">
        {DIMENSIONS.map((d) => {
          const active = d.key === dimension;
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDimension(d.key);
                setSearch('');
                try {
                  localStorage.setItem(DIM_STORAGE_KEY, d.key);
                } catch {
                  /* ignore */
                }
              }}
              className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {t(d.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-[var(--s-4)] max-w-xs">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('breakdownSearch')}
          className="w-full h-9 ps-9 pe-3 rounded-r-sm bg-[var(--surface-2)] border border-[var(--line)] text-fs-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-fs-sm text-[var(--fg-muted)] py-6">{t('noSalesDataYet')}</p>
      ) : (
        <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
          <TableShell className="rounded-none border-0 border-t border-[var(--line)]">
            <Table>
              <Thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <SortHead label={t('label')} k="label" cur={sortKey} onSort={setSortKey} />
                  <th className="w-2/5 hidden md:table-cell" />
                  <SortHead label={t('orders')} k="orders" cur={sortKey} onSort={setSortKey} right />
                  <SortHead label={t('revenue')} k="revenue" cur={sortKey} onSort={setSortKey} right />
                  <th style={{ textAlign: 'right', width: 64 }}>%</th>
                </tr>
              </Thead>
              <Tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td className="text-[var(--fg-subtle)] tabular-nums">{i + 1}</td>
                    <td className="text-[var(--fg)] font-medium">{r.display}</td>
                    <td className="hidden md:table-cell">
                      <div dir="ltr" className="h-2 rounded-full overflow-hidden bg-[var(--surface-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(r.revenue / maxRev) * 100}%`, background: 'var(--brand-500)' }}
                        />
                      </div>
                    </td>
                    <NumTd style={{ textAlign: 'right' }}>{r.orders}</NumTd>
                    <NumTd style={{ textAlign: 'right' }}>{fmtMoney(r.revenue)}</NumTd>
                    <NumTd style={{ textAlign: 'right' }} className="text-[var(--fg-muted)]">
                      {r.share.toFixed(1)}%
                    </NumTd>
                  </tr>
                ))}
              </Tbody>
            </Table>
          </TableShell>
        </div>
      )}
    </Section>
  );
}

function SortHead({
  label,
  k,
  cur,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  return (
    <th style={{ textAlign: right ? 'right' : 'left' }}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[var(--fg)] ${
          cur === k ? 'text-[var(--fg)]' : ''
        }`}
      >
        {label}
        {cur === k && <span aria-hidden>↓</span>}
      </button>
    </th>
  );
}
