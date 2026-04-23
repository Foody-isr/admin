'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, TodayStats, TopSeller } from '@/lib/api';
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
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('30d');

  useEffect(() => {
    Promise.all([
      getAnalyticsToday(rid).catch(() => null),
      getTopSellers(rid).catch(() => []),
    ])
      .then(([s, ts]) => {
        if (s) setStats(s);
        setTopSellers(ts);
      })
      .finally(() => setLoading(false));
  }, [rid]);

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
