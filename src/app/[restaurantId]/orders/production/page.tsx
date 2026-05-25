'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SearchIcon, PrinterIcon, ShoppingCartIcon, ClipboardListIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Kpi, PageHead } from '@/components/ds';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import {
  fetchProductionSheet,
  fetchProductionDays,
  ProductionSheetResponse,
  ProductionSheetOrder,
  ProductionDay,
} from '@/lib/api';
import { DateStepper } from '@/components/production/DateStepper';
import { ProductionMatrix } from '@/components/production/ProductionMatrix';
import { ProductionShoppingList } from '@/components/production/ProductionShoppingList';
import { ProductionOrderDrawer } from '@/components/production/ProductionOrderDrawer';

export default function ProductionPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = Number(params.restaurantId);
  const { t } = useI18n();

  const [days, setDays] = useState<ProductionDay[]>([]);
  const [date, setDate] = useState<string>('');
  const [sheet, setSheet] = useState<ProductionSheetResponse | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'production' | 'courses'>('production');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Load available days, default to the next upcoming day (or the last one).
  useEffect(() => {
    fetchProductionDays(restaurantId).then((d) => {
      setDays(d);
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = d.find((x) => x.date >= today) ?? d[d.length - 1];
      setDate(upcoming ? upcoming.date : today);
    });
  }, [restaurantId]);

  // Load the sheet for the active day.
  useEffect(() => {
    if (!date) return;
    setLoading(true);
    fetchProductionSheet(restaurantId, date)
      .then(setSheet)
      .finally(() => setLoading(false));
  }, [restaurantId, date]);

  // Always show all orders; client search just narrows the visible rows.
  const filteredSheet = useMemo<ProductionSheetResponse | null>(() => {
    if (!sheet) return null;
    let orders = sheet.orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter((o) => o.customer_name.toLowerCase().includes(q));
    }
    return recomputeTotals(sheet, orders);
  }, [sheet, search]);

  // Day-level KPIs (reflect the whole day, independent of search).
  const kpi = useMemo(() => {
    const orders = sheet?.orders ?? [];
    const starts = orders.map((o) => o.window_start).filter(Boolean) as string[];
    const ends = orders.map((o) => o.window_end).filter(Boolean) as string[];
    const min = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : '';
    const max = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : '';
    return {
      orders: orders.length,
      deliveries: orders.filter((o) => o.order_type === 'delivery').length,
      pickups: orders.filter((o) => o.order_type === 'pickup').length,
      window: min && max ? `${min}–${max}` : min || max || '—',
    };
  }, [sheet]);

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('productionTitle')}
        desc={t('productionLiveSub')}
        actions={
          <>
            {date && <DateStepper date={date} days={days} onChange={setDate} />}
            <ActionsDropdown
              actions={[
                {
                  label: view === 'production' ? t('productionShoppingList') : t('productionTitle'),
                  onClick: () => setView((v) => (v === 'production' ? 'courses' : 'production')),
                  icon:
                    view === 'production' ? (
                      <ShoppingCartIcon className="w-4 h-4" />
                    ) : (
                      <ClipboardListIcon className="w-4 h-4" />
                    ),
                },
                {
                  label: t('productionPrintKitchen'),
                  onClick: () => window.print(),
                  icon: <PrinterIcon className="w-4 h-4" />,
                },
              ]}
            />
          </>
        }
      />

      <header className="mb-[var(--s-4)]">
        {/* KPI strip */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
          <Kpi label={t('productionKpiOrders')} value={kpi.orders} />
          <Kpi label={t('productionFilterDeliveries')} value={kpi.deliveries} />
          <Kpi label={t('productionFilterPickups')} value={kpi.pickups} />
          <Kpi label={t('productionKpiWindow')} value={kpi.window} />
        </div>

        {/* Search toolbar (production view only) */}
        {view === 'production' && (
          <div className="flex flex-wrap items-center gap-[var(--s-3)]">
            <div className="relative flex-1 min-w-[240px]">
              <SearchIcon className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder={t('productionSearchClient')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full ps-11 pe-3 h-11 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
              />
            </div>
          </div>
        )}
      </header>

      {loading && <p className="text-fs-sm text-[var(--fg-muted)]">…</p>}

      {!loading && view === 'courses' && date && (
        <ProductionShoppingList restaurantId={restaurantId} date={date} />
      )}

      {!loading && view === 'production' && filteredSheet && filteredSheet.orders.length === 0 && (
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('productionNoOrders')}</p>
      )}
      {!loading && view === 'production' && filteredSheet && filteredSheet.orders.length > 0 && (
        <ProductionMatrix sheet={filteredSheet} onRowClick={setSelectedOrderId} />
      )}

      <ProductionOrderDrawer
        restaurantId={restaurantId}
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}

/** Recompute item totals + packaging from a filtered subset of orders. */
function recomputeTotals(
  sheet: ProductionSheetResponse,
  orders: ProductionSheetOrder[],
): ProductionSheetResponse {
  const sameSet = orders.length === sheet.orders.length;
  const items = sheet.items.map((it) => {
    const total = orders.reduce((s, o) => s + (o.cells[String(it.menu_item_id)] ?? 0), 0);
    if (it.measure !== 'weight') {
      return { ...it, total, packaging: undefined };
    }
    // Per-order cells carry summed grams, so the per-portion packaging breakdown
    // can't be recomputed under a filter; keep it only for the unfiltered view.
    return { ...it, total, packaging: sameSet ? it.packaging : undefined };
  });
  return { ...sheet, orders, items };
}
