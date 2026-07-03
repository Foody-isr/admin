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
  UsersIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { useIsMobile } from '@/components/ui/use-mobile';
import { Kpi, PageHead } from '@/components/ds';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import {
  fetchProductionSheet,
  fetchProductionDays,
  listAllItems,
  ProductionSheetResponse,
  ProductionSheetOrder,
  ProductionDay,
} from '@/lib/api';
import { itemPortionGrams, fmtPortionGrams } from '@/lib/production';
import { useProductionColumnOrder } from '@/lib/production-column-order';
import { useProductionDone } from '@/lib/production-done';
import { useProductionDisplay, type ProductionDisplayMode } from '@/lib/production-display';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DateStepper } from '@/components/production/DateStepper';
import { ProductionMatrix } from '@/components/production/ProductionMatrix';
import { ProductionShoppingList } from '@/components/production/ProductionShoppingList';
import { ProductionOrderDetail } from '@/components/production/ProductionOrderDetail';

export default function ProductionPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = Number(params.restaurantId);
  const { t } = useI18n();
  // Phones get a lean single-table view: no split/fullscreen/drag, no internal
  // height cap — the page scrolls vertically and the grid scrolls sideways with
  // the Client column pinned. See ProductionMatrix for the tap-to-focus handling.
  const isMobile = useIsMobile();

  const [days, setDays] = useState<ProductionDay[]>([]);
  const [date, setDate] = useState<string>('');
  const [sheet, setSheet] = useState<ProductionSheetResponse | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'production' | 'courses'>('production');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [splitMode, setSplitMode] = useState<'none' | 'category' | 'customer'>('none');
  // Box-packing control (client-only, filter-like): the available portion sizes
  // per article (from its variants) and a single, page-wide box size the user
  // picked to divide every weighed column by. Nothing is persisted.
  const [portionsByItem, setPortionsByItem] = useState<Record<number, number[]>>({});
  const [boxSize, setBoxSize] = useState<number | null>(null);
  // Portions (grams) vs units (container counts) display for weighed columns:
  // page-wide default + per-article overrides, persisted per restaurant.
  const display = useProductionDisplay(restaurantId);
  const fsRef = useRef<HTMLDivElement>(null);
  // Only managers/owners may rearrange the shared layout (server enforces
  // SettingsEdit); everyone can still tick orders done.
  const { hasPermission } = usePermissions();
  const canEditLayout = hasPermission('settings.edit');
  // Restaurant-wide column layout (category + item order), shared across all
  // staff/devices — seeded from the layout the server returns with the sheet.
  const { applyOrder, setCategoryOrder, setItemOrder, reset: resetColumns, hasCustomOrder } =
    useProductionColumnOrder(restaurantId, sheet?.column_order);

  // Shared "done" set for the active restaurant + day, synced live across
  // tablets — seeded from the sheet's per-order prepared flags.
  const { doneIds, toggle: toggleDone } = useProductionDone(restaurantId, sheet?.orders);

  // Load available days, default to the next upcoming day (or the last one).
  useEffect(() => {
    fetchProductionDays(restaurantId).then((d) => {
      setDays(d);
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = d.find((x) => x.date >= today) ?? d[d.length - 1];
      setDate(upcoming ? upcoming.date : today);
    });
  }, [restaurantId]);

  // Load each article's available portion sizes (from its size variants) so the
  // box-packing dropdowns can offer only the article's existing portions.
  useEffect(() => {
    listAllItems(restaurantId)
      .then((items) => {
        const map: Record<number, number[]> = {};
        for (const it of items) {
          const grams = itemPortionGrams(it);
          if (grams.length) map[it.id] = grams;
        }
        setPortionsByItem(map);
      })
      .catch(() => undefined);
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

  // Apply the saved column order (categories as blocks, items within a category)
  // before render. Split views derive from this, so the layout is consistent
  // everywhere; only the main table lets the user drag to change it.
  const orderedSheet = useMemo<ProductionSheetResponse | null>(
    () => (filteredSheet ? applyOrder(filteredSheet) : null),
    [filteredSheet, applyOrder],
  );

  // Portion sizes offered in each article's box-size dropdown. Union of the
  // article's numeric size variants (from listAllItems) and the portions that
  // actually appear in the day's orders (sheet packaging) — the latter is the
  // robust source, since some articles size by recipe/options rather than named
  // variants, which would otherwise leave the dropdown empty.
  const availablePortions = useMemo<Record<number, number[]>>(() => {
    const map: Record<number, Set<number>> = {};
    const add = (id: number, g: number) => {
      if (!(g > 0)) return;
      (map[id] ??= new Set()).add(g);
    };
    for (const [idStr, gs] of Object.entries(portionsByItem)) {
      for (const g of gs) add(Number(idStr), g);
    }
    for (const it of sheet?.items ?? []) {
      if (it.measure !== 'weight') continue;
      for (const p of it.packaging ?? []) add(it.menu_item_id, p.portion_g);
    }
    const out: Record<number, number[]> = {};
    for (const [idStr, set] of Object.entries(map)) {
      out[Number(idStr)] = Array.from(set).sort((a, b) => a - b);
    }
    return out;
  }, [portionsByItem, sheet]);

  // Portion sizes offered in the single, page-wide box-size control: the union
  // of every weighed column's available portions. One choice repacks all columns.
  const allPortions = useMemo<number[]>(() => {
    const set = new Set<number>();
    for (const gs of Object.values(availablePortions)) for (const g of gs) set.add(g);
    return Array.from(set).sort((a, b) => a - b);
  }, [availablePortions]);

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
    if (!orderedSheet) return [];
    return orderedSheet.categories
      .map((cat) => ({
        cat,
        sheet: {
          date: orderedSheet.date,
          categories: [cat],
          items: orderedSheet.items.filter((it) => cat.item_ids.includes(it.menu_item_id)),
          orders: orderedSheet.orders.filter((o) =>
            cat.item_ids.some((id) => (o.cells[String(id)] ?? 0) > 0),
          ),
        } as ProductionSheetResponse,
      }))
      .filter((c) => c.sheet.orders.length > 0);
  }, [orderedSheet]);

  // One sub-sheet per customer (for the split-by-customer view): a single-row
  // table keeping only the items that customer ordered, with totals scoped to
  // that order. Reuses ProductionMatrix per table.
  const customerSheets = useMemo(() => {
    if (!orderedSheet) return [];
    return orderedSheet.orders
      .map((o) => {
        // recomputeTotals over the single order rescopes item totals to this
        // customer and (since it's a subset of the day) drops the day-level
        // packaging/combo aggregates that wouldn't apply to one order.
        const scoped = recomputeTotals(orderedSheet, [o]);
        const orderedIds = new Set(
          scoped.items.filter((it) => it.total > 0).map((it) => it.menu_item_id),
        );
        const items = scoped.items.filter((it) => orderedIds.has(it.menu_item_id));
        const categories = scoped.categories
          .map((cat) => ({ ...cat, item_ids: cat.item_ids.filter((id) => orderedIds.has(id)) }))
          .filter((cat) => cat.item_ids.length > 0);
        return { order: o, sheet: { ...scoped, items, categories } };
      })
      .filter((c) => c.sheet.items.length > 0);
  }, [orderedSheet]);

  const handleRowClick = fullscreen ? () => undefined : (id: number) => setSelectedOrderId(id);
  // Split views are desktop-only; on a phone we always render the single main
  // table (any split chosen on a wider screen is ignored while narrow).
  const effectiveSplit = isMobile ? 'none' : splitMode;

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

  // Weighed columns currently displayed as container counts instead of grams
  // (page default + per-article overrides). Drives the matrix cells + header.
  const unitDisplayIds = useMemo<Set<number>>(() => {
    const set = new Set<number>();
    for (const it of orderedSheet?.items ?? []) {
      if (it.measure === 'weight' && display.effectiveMode(it.menu_item_id) === 'units') {
        set.add(it.menu_item_id);
      }
    }
    return set;
  }, [orderedSheet, display]);

  // "Affichage" options popover — groups the page-wide display settings: box
  // size (repacks every weighed column) and portions/units values. Per-article
  // overrides live on the column headers themselves.
  const modeButton = (mode: ProductionDisplayMode, label: string) => (
    <button
      onClick={() => display.setMode(mode)}
      className={`flex-1 h-9 rounded-r-md text-fs-sm font-medium transition-colors border ${
        display.mode === mode
          ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-500)]'
          : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {label}
    </button>
  );
  const displayControl = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface)] text-fs-sm font-medium hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
        >
          <SlidersHorizontalIcon className="w-4 h-4" />
          {t('productionDisplay')}
          <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 flex flex-col gap-[var(--s-4)] p-[var(--s-4)]">
        <div className="flex flex-col gap-2">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('productionDisplayValues')}
          </span>
          <div className="flex gap-2">
            {modeButton('portions', t('productionDisplayPortions'))}
            {modeButton('units', t('productionDisplayUnits'))}
          </div>
          <p className="text-fs-xs text-[var(--fg-subtle)]">{t('productionDisplayHint')}</p>
        </div>
        {allPortions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {t('productionBoxSize')}
            </span>
            <select
              aria-label={t('productionBoxSize')}
              value={boxSize ?? ''}
              onChange={(e) => setBoxSize(e.target.value ? Number(e.target.value) : null)}
              className="h-10 w-full rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg)] text-fs-sm px-3 focus:outline-none focus:border-[var(--brand-500)] transition-colors"
            >
              <option value="">{t('productionBoxAuto')}</option>
              {allPortions.map((g) => (
                <option key={g} value={g}>
                  {fmtPortionGrams(g)}
                </option>
              ))}
            </select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

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
            {view === 'production' && displayControl}
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
                    // Fullscreen + split views are desktop-only — they fight the
                    // phone's single-scroll model, so they're dropped on mobile.
                    ...(!isMobile
                      ? [
                          {
                            label: t('productionFullscreen'),
                            onClick: enterFullscreen,
                            icon: <Maximize2Icon className="w-4 h-4" />,
                          },
                          {
                            label:
                              splitMode === 'category'
                                ? t('productionSingleTable')
                                : t('productionSplitByCategory'),
                            onClick: () =>
                              setSplitMode((m) => (m === 'category' ? 'none' : 'category')),
                            icon: <LayoutListIcon className="w-4 h-4" />,
                          },
                          {
                            label:
                              splitMode === 'customer'
                                ? t('productionSingleTable')
                                : t('productionSplitByCustomer'),
                            onClick: () =>
                              setSplitMode((m) => (m === 'customer' ? 'none' : 'customer')),
                            icon: <UsersIcon className="w-4 h-4" />,
                          },
                        ]
                      : []),
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
                    ...(canEditLayout && hasCustomOrder && !isMobile
                      ? [
                          {
                            label: t('productionResetColumns'),
                            onClick: resetColumns,
                            icon: <RotateCcwIcon className="w-4 h-4" />,
                          },
                        ]
                      : []),
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
                {displayControl}
              </div>
            )}
          </header>
        </>
      )}

      {loading && <p className="text-fs-sm text-[var(--fg-muted)]">…</p>}

      {!loading && view === 'courses' && date && (
        <ProductionShoppingList restaurantId={restaurantId} date={date} />
      )}

      {!loading && view === 'production' && orderedSheet && orderedSheet.orders.length === 0 && (
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('productionNoOrders')}</p>
      )}
      {!loading &&
        view === 'production' &&
        orderedSheet &&
        orderedSheet.orders.length > 0 &&
        (effectiveSplit === 'category' ? (
          <div className="flex flex-col gap-[var(--s-4)]">
            {categorySheets.map(({ cat, sheet: cs }) => (
              <ProductionMatrix
                key={cat.id}
                sheet={cs}
                onRowClick={handleRowClick}
                availablePortions={availablePortions}
                boxSize={boxSize}
                unitDisplayIds={unitDisplayIds}
                onToggleItemDisplay={display.toggleItem}
                doneIds={doneIds}
                onToggleDone={toggleDone}
              />
            ))}
          </div>
        ) : effectiveSplit === 'customer' ? (
          <div className="flex flex-col gap-[var(--s-5)]">
            {customerSheets.map(({ order, sheet: cs }) => (
              <div key={order.order_id} className="flex flex-col gap-[var(--s-2)]">
                <h2 className="flex items-center gap-[var(--s-2)] text-fs-base font-semibold">
                  {order.customer_name}
                  <span
                    className={`text-fs-micro px-2 py-0.5 rounded-r-sm font-medium ${
                      order.order_type === 'delivery'
                        ? 'bg-[var(--info-50)] text-[var(--info-500)]'
                        : 'bg-[var(--success-50)] text-[var(--success-500)]'
                    }`}
                  >
                    {order.order_type === 'delivery' ? '🚚' : '🛍'} {order.window_start ?? ''}
                  </span>
                </h2>
                <ProductionMatrix
                  sheet={cs}
                  onRowClick={handleRowClick}
                  availablePortions={availablePortions}
                  boxSize={boxSize}
                  unitDisplayIds={unitDisplayIds}
                  onToggleItemDisplay={display.toggleItem}
                  doneIds={doneIds}
                  onToggleDone={toggleDone}
                  reorderDone={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-2)]">
            {isMobile && (
              <p className="md:hidden text-fs-xs text-[var(--fg-muted)]">
                {t('productionSwipeHint')}
              </p>
            )}
            <ProductionMatrix
              sheet={orderedSheet}
              onRowClick={handleRowClick}
              availablePortions={availablePortions}
              boxSize={boxSize}
              unitDisplayIds={unitDisplayIds}
              onToggleItemDisplay={display.toggleItem}
              // Phones drop the pinned-header / internal height cap so the page
              // scrolls vertically and only the grid scrolls sideways; drag
              // reordering is desktop-only.
              sticky={!isMobile}
              onReorderCategories={!isMobile && canEditLayout ? setCategoryOrder : undefined}
              onReorderItems={!isMobile && canEditLayout ? setItemOrder : undefined}
              doneIds={doneIds}
              onToggleDone={toggleDone}
            />
          </div>
        ))}

      <ProductionOrderDetail
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
    const total_units = orders.reduce((s, o) => s + (o.units?.[String(it.menu_item_id)] ?? 0), 0);
    // Packaging + day-total combo breakdown are full-day aggregates that can't be
    // recomputed from cells under a filter; keep them only for the unfiltered view.
    const comboFields = sameSet
      ? {}
      : { combo_breakdown: undefined, standalone_count: undefined };
    if (it.measure !== 'weight') {
      return { ...it, total, total_units, packaging: undefined, ...comboFields };
    }
    return { ...it, total, total_units, packaging: sameSet ? it.packaging : undefined, ...comboFields };
  });
  return { ...sheet, orders, items };
}
