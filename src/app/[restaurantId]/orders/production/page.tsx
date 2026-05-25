'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  SearchIcon,
  PrinterIcon,
  ShoppingCartIcon,
  ClipboardListIcon,
  Maximize2Icon,
  Minimize2Icon,
  LayoutListIcon,
} from 'lucide-react';
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
  const [fullscreen, setFullscreen] = useState(false);
  const [splitByCategory, setSplitByCategory] = useState(false);
  const fsRef = useRef<HTMLDivElement>(null);

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

  // Keep state in sync when the user leaves native full-screen via Esc.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  // Day-level production KPIs (reflect the whole day, independent of search).
  const kpi = useMemo(() => {
    const orders = sheet?.orders ?? [];
    const items = sheet?.items ?? [];
    let dishes = 0; // total unit-measured portions to plate
    let weightG = 0; // total grams of weight-measured items to prepare
    for (const it of items) {
      if (it.measure === 'unit') dishes += it.total;
      else weightG += it.total;
    }
    const weight =
      weightG >= 1000
        ? `${(weightG / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
        : `${weightG.toLocaleString()} g`;
    return { orders: orders.length, dishes, weight, items: items.length };
  }, [sheet]);

  // One sub-sheet per category (for the split view), keeping only clients who
  // ordered something in that category. Reuses ProductionMatrix per table.
  const categorySheets = useMemo(() => {
    if (!filteredSheet) return [];
    return filteredSheet.categories
      .map((cat) => ({
        cat,
        sheet: {
          date: filteredSheet.date,
          categories: [cat],
          items: filteredSheet.items.filter((it) => cat.item_ids.includes(it.menu_item_id)),
          orders: filteredSheet.orders.filter((o) =>
            cat.item_ids.some((id) => (o.cells[String(id)] ?? 0) > 0),
          ),
        } as ProductionSheetResponse,
      }))
      .filter((c) => c.sheet.orders.length > 0);
  }, [filteredSheet]);

  const handleRowClick = fullscreen ? () => undefined : (id: number) => setSelectedOrderId(id);

  // Enter full screen: maximize layout (state) + request native full-screen
  // (falls back to the in-app overlay if the browser blocks the API).
  const enterFullscreen = () => {
    setFullscreen(true);
    const el = fsRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  };
  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    setFullscreen(false);
  };

  return (
    <div
      ref={fsRef}
      className={
        fullscreen
          ? 'fixed inset-0 z-[60] flex flex-col gap-[var(--s-3)] overflow-auto bg-[var(--bg)] p-[var(--s-4)]'
          : 'flex flex-col'
      }
    >
      {fullscreen ? (
        /* Maximized, table-only header */
        <div className="flex items-center justify-between gap-[var(--s-3)] flex-wrap">
          <div className="flex items-center gap-[var(--s-3)]">
            <h1 className="text-fs-xl font-semibold leading-none">{t('productionTitle')}</h1>
            {date && <DateStepper date={date} days={days} onChange={setDate} />}
          </div>
          <button
            onClick={exitFullscreen}
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-10 rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface)] text-fs-sm font-medium hover:bg-[var(--surface-2)] transition-colors"
          >
            <Minimize2Icon className="w-4 h-4" />
            {t('productionExitFullscreen')}
          </button>
        </div>
      ) : (
        <>
          <PageHead
            title={t('productionTitle')}
            desc={t('productionLiveSub')}
            actions={
              <>
                {date && <DateStepper date={date} days={days} onChange={setDate} />}
                <ActionsDropdown
                  actions={[
                    {
                      label: t('productionFullscreen'),
                      onClick: enterFullscreen,
                      icon: <Maximize2Icon className="w-4 h-4" />,
                    },
                    {
                      label: splitByCategory ? t('productionSingleTable') : t('productionSplitByCategory'),
                      onClick: () => setSplitByCategory((v) => !v),
                      icon: <LayoutListIcon className="w-4 h-4" />,
                    },
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
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
              <Kpi label={t('productionKpiOrders')} value={kpi.orders} />
              <Kpi label={t('productionKpiDishes')} value={kpi.dishes} />
              <Kpi label={t('productionKpiWeight')} value={kpi.weight} />
              <Kpi label={t('productionKpiItems')} value={kpi.items} />
            </div>

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
        </>
      )}

      {loading && <p className="text-fs-sm text-[var(--fg-muted)]">…</p>}

      {!loading && view === 'courses' && date && (
        <ProductionShoppingList restaurantId={restaurantId} date={date} />
      )}

      {!loading && view === 'production' && filteredSheet && filteredSheet.orders.length === 0 && (
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('productionNoOrders')}</p>
      )}
      {!loading &&
        view === 'production' &&
        filteredSheet &&
        filteredSheet.orders.length > 0 &&
        (splitByCategory ? (
          <div className="flex flex-col gap-[var(--s-4)]">
            {categorySheets.map(({ cat, sheet: cs }) => (
              <ProductionMatrix key={cat.id} sheet={cs} onRowClick={handleRowClick} />
            ))}
          </div>
        ) : (
          <ProductionMatrix sheet={filteredSheet} onRowClick={handleRowClick} />
        ))}

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
