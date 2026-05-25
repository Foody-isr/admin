'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
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

type Filter = 'all' | 'delivery' | 'pickup';

export default function ProductionPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = Number(params.restaurantId);
  const { t } = useI18n();

  const [days, setDays] = useState<ProductionDay[]>([]);
  const [date, setDate] = useState<string>('');
  const [sheet, setSheet] = useState<ProductionSheetResponse | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
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

  // Apply filters/search to the orders; both sections share the filtered set.
  const filteredSheet = useMemo<ProductionSheetResponse | null>(() => {
    if (!sheet) return null;
    let orders = sheet.orders;
    if (filter !== 'all') orders = orders.filter((o) => o.order_type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter((o) => o.customer_name.toLowerCase().includes(q));
    }
    return recomputeTotals(sheet, orders);
  }, [sheet, filter, search]);

  const counts = useMemo(() => {
    const o = sheet?.orders ?? [];
    return {
      all: o.length,
      delivery: o.filter((x) => x.order_type === 'delivery').length,
      pickup: o.filter((x) => x.order_type === 'pickup').length,
    };
  }, [sheet]);

  return (
    <div className="p-[var(--s-5)]">
      {/* PageHead */}
      <div className="flex items-end justify-between gap-[var(--s-4)] flex-wrap mb-[var(--s-5)]">
        <div>
          <h1 className="text-fs-3xl font-semibold leading-none -tracking-[0.02em]">{t('productionTitle')}</h1>
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">{t('productionLiveSub')}</p>
        </div>
        <div className="flex items-center gap-[var(--s-2)]">
          {date && <DateStepper date={date} days={days} onChange={setDate} />}
          <button
            onClick={() => setView((v) => (v === 'production' ? 'courses' : 'production'))}
            className="text-fs-sm font-semibold px-3 py-2 rounded-r-md border border-[var(--line)] bg-[var(--surface)]"
          >
            {view === 'production' ? t('productionShoppingList') : t('productionTitle')}
          </button>
          <button onClick={() => window.print()} className="text-fs-sm font-semibold px-3 py-2 rounded-r-md bg-[var(--brand-500)] text-white">
            {t('productionPrintKitchen')}
          </button>
        </div>
      </div>

      {/* Filters (production view only) */}
      {view === 'production' && (
        <div className="flex items-center gap-[var(--s-2)] mb-[var(--s-4)]">
          {(['all', 'delivery', 'pickup'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-fs-sm px-3 py-1.5 rounded-r-xl border ${
                filter === f
                  ? 'bg-[var(--brand-500)] text-white border-[var(--brand-500)]'
                  : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)]'
              }`}
            >
              {f === 'all'
                ? t('productionFilterAll')
                : f === 'delivery'
                ? t('productionFilterDeliveries')
                : t('productionFilterPickups')}{' '}
              ({f === 'all' ? counts.all : f === 'delivery' ? counts.delivery : counts.pickup})
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('productionSearchClient')}
            className="ms-auto text-fs-sm px-3 py-1.5 rounded-r-md border border-[var(--line)] bg-[var(--surface)]"
          />
        </div>
      )}

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
