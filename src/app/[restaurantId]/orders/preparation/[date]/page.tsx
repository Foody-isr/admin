'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
  CalendarDaysIcon,
  Loader2Icon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from 'lucide-react';
import {
  Button,
  PageHead,
  Tabs,
  TabsList,
  Tab,
  TabsContent,
  Card,
} from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  fetchKitchenPlanDetails,
  fetchKitchenPlanIngredients,
  type KitchenPlanDetailsResponse,
  type KitchenPlanOrderDetail,
  type KitchenPlanItemBreakdown,
} from '@/lib/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

type Grouping = 'product' | 'customer';

// Format an ingredient quantity in its native unit: g→kg ≥ 1000, ml→L ≥ 1000,
// keep arbitrary units (conserve, unit, …) as-is.
function formatIngredientQty(qty: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`;
  if (u === 'ml' && qty >= 1000) return `${(qty / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;
  // Pretty-trim trailing zeros for decimals.
  const trimmed = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${trimmed} ${unit}` : trimmed;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return dateToIso(new Date());
}

// ─── Aggregation ───────────────────────────────────────────────────────────

interface CustomerGroup {
  windowKey: string; // pickup_window or "" for all-day
  orders: KitchenPlanOrderDetail[];
}

function groupByCustomer(data: KitchenPlanDetailsResponse): CustomerGroup[] {
  const byWindow = new Map<string, KitchenPlanOrderDetail[]>();
  for (const o of data.orders) {
    const k = o.pickup_window || '';
    if (!byWindow.has(k)) byWindow.set(k, []);
    byWindow.get(k)!.push(o);
  }
  const out: CustomerGroup[] = [];
  byWindow.forEach((orders, windowKey) => {
    orders.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));
    out.push({ windowKey, orders });
  });
  out.sort((a, b) => {
    if (a.windowKey === '') return 1;
    if (b.windowKey === '') return -1;
    return a.windowKey.localeCompare(b.windowKey);
  });
  return out;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PreparationPlanPage() {
  const { t, locale, direction } = useI18n();
  const params = useParams();
  const router = useRouter();
  const rid = Number(params.restaurantId);
  const date = String(params.date);
  const isRtl = direction === 'rtl';

  const [grouping, setGrouping] = useState<Grouping>('product');
  const [data, setData] = useState<KitchenPlanDetailsResponse | null>(null);
  const [items, setItems] = useState<KitchenPlanItemBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch the customer-detail (used by KPI strip + "Par client") and the
    // per-item breakdown (used by "Par produit") in parallel so toggling
    // between tabs never re-fetches.
    Promise.all([
      fetchKitchenPlanDetails(rid, date).catch(() => null),
      fetchKitchenPlanIngredients(rid, date).catch(() => null),
    ])
      .then(([details, breakdown]) => {
        if (cancelled) return;
        setData(details);
        setItems(breakdown?.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, date]);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(isoToDate(date));
  }, [locale, date]);

  function shiftDay(direction: -1 | 1): void {
    const next = isoToDate(date);
    next.setDate(next.getDate() + direction);
    router.push(`/${rid}/orders/preparation/${dateToIso(next)}`);
  }

  function goToday(): void {
    router.push(`/${rid}/orders/preparation/${todayIso()}`);
  }

  // Aggregated views
  const walkInLabel = t('prepPlanCustomerNoName');
  const customerGroups = useMemo(
    () => (data ? groupByCustomer(data) : []),
    [data],
  );

  const kpis = useMemo(() => {
    if (!data) return { orders: 0, items: 0, products: 0, windows: 0 };
    const itemsCount = data.orders.reduce(
      (s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0),
      0,
    );
    const windows = new Set(
      data.orders.map((o) => o.pickup_window || '').filter(Boolean),
    ).size;
    return {
      orders: data.orders.length,
      items: itemsCount,
      products: data.products.length,
      windows,
    };
  }, [data]);

  const subtitle =
    grouping === 'product'
      ? t('prepPlanSubtitleProduct')
      : t('prepPlanSubtitleCustomer');

  const isEmpty = !loading && (data?.orders.length ?? 0) === 0;
  const BackIcon = isRtl ? ArrowRightIcon : ArrowLeftIcon;

  return (
    <div className="px-[var(--s-6)] py-[var(--s-6)] print:px-0 print:py-0">
      <div className="print:hidden">
        <PageHead
          title={
            <span className="flex items-baseline gap-[var(--s-3)] flex-wrap">
              <span>{t('prepPlanTitle')}</span>
              <span className="text-fs-md font-medium text-[var(--fg-muted)] tabular">
                {dateLabel}
              </span>
            </span>
          }
          desc={subtitle}
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${rid}/orders/calendar`}>
                  <BackIcon />
                  {t('calendarTitle')}
                </Link>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                disabled={isEmpty}
              >
                <PrinterIcon />
                {t('prepPlanPrint')}
              </Button>
            </>
          }
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-[var(--s-4)] flex-wrap mb-[var(--s-5)]">
          <div className="flex items-center gap-[var(--s-2)]">
            <Button
              variant="secondary"
              size="sm"
              icon
              onClick={() => shiftDay(-1)}
              aria-label={t('calendarPrev')}
            >
              {isRtl ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              {t('calendarToday')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon
              onClick={() => shiftDay(1)}
              aria-label={t('calendarNext')}
            >
              {isRtl ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </Button>
            {loading && (
              <Loader2Icon className="w-4 h-4 ms-[var(--s-2)] text-[var(--fg-subtle)] animate-spin" />
            )}
          </div>

          <Tabs
            value={grouping}
            onValueChange={(v) => setGrouping(v as Grouping)}
            variant="segmented"
            className="!flex-row !gap-0"
          >
            <TabsList>
              <Tab value="product">{t('prepPlanByProduct')}</Tab>
              <Tab value="customer">{t('prepPlanByCustomer')}</Tab>
            </TabsList>
            <TabsContent value="product" className="hidden" />
            <TabsContent value="customer" className="hidden" />
          </Tabs>
        </div>

        {/* KPIs */}
        <KpiStrip kpis={kpis} />
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-[var(--s-5)]">
        <h1 className="text-fs-2xl font-bold">{t('prepPlanTitle')}</h1>
        <p className="text-fs-md tabular">{dateLabel}</p>
      </div>

      {/* Body */}
      {isEmpty ? (
        <EmptyState message={t('prepPlanNoData')} />
      ) : grouping === 'product' ? (
        <ProductList items={items} />
      ) : (
        <CustomerList
          groups={customerGroups}
          allDayLabel={t('prepPlanWindowAllDay')}
          walkInLabel={walkInLabel}
        />
      )}
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────

function KpiStrip({
  kpis,
}: {
  kpis: { orders: number; items: number; products: number; windows: number };
}) {
  const { t } = useI18n();
  const cells: Array<{ label: string; value: number; tone: string }> = [
    { label: t('prepPlanKpiOrders'), value: kpis.orders, tone: 'var(--brand-500)' },
    { label: t('prepPlanKpiItems'), value: kpis.items, tone: 'var(--success-500)' },
    { label: t('prepPlanKpiProducts'), value: kpis.products, tone: 'var(--info-500)' },
    { label: t('prepPlanKpiWindows'), value: kpis.windows, tone: 'var(--warning-500)' },
  ];
  return (
    /* KPIs — desktop only; product/customer breakdown below is the mobile primary view */
    <div className="hidden md:grid md:grid-cols-4 gap-[var(--s-3)] mb-[var(--s-5)]">
      {cells.map((c) => (
        <Card key={c.label} className="p-[var(--s-4)]">
          <p className="text-fs-xs uppercase tracking-[0.06em] font-semibold text-[var(--fg-muted)]">
            {c.label}
          </p>
          <p
            className="mt-1 text-fs-3xl font-bold tabular leading-none"
            style={{ color: c.tone }}
          >
            {c.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

// ─── By Product ───────────────────────────────────────────────────────────

function ProductList({ items }: { items: KitchenPlanItemBreakdown[] }) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <EmptyState message={t('prepPlanNoData')} />;
  }

  return (
    <div className="grid gap-[var(--s-4)] grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => {
        // Header chips: "3 NORMAL · 3 GRAND · 1.25 kg".
        // Variant pills only show when the item has variants at all.
        const variantBits = it.variants
          .filter((v) => v.name)
          .map((v) => `${v.qty} ${v.name}`);
        const hasPrepMass = it.total_prep_mass > 0;

        return (
          <Card key={it.menu_item_id} className="p-0 overflow-hidden">
            {/* Header: big total count + name + variant/mass chips */}
            <div className="flex items-stretch border-b border-[var(--line)]">
              <div
                className="flex items-center justify-center px-[var(--s-4)] min-w-[88px] border-e border-[var(--line)]"
                style={{
                  background:
                    'color-mix(in oklab, var(--brand-500) 6%, transparent)',
                }}
              >
                <span className="text-fs-4xl font-bold text-[var(--brand-500)] tabular leading-none">
                  ×{it.total_count}
                </span>
              </div>
              <div className="flex-1 px-[var(--s-4)] py-[var(--s-3)] min-w-0">
                <p
                  className="text-fs-md font-semibold text-[var(--fg)] truncate"
                  title={it.name}
                >
                  {it.name || '—'}
                </p>
                {(variantBits.length > 0 || hasPrepMass) && (
                  <div className="flex items-center flex-wrap gap-x-[var(--s-2)] gap-y-0.5 text-fs-xs text-[var(--fg-subtle)] mt-0.5 tabular">
                    {variantBits.map((v, i) => (
                      <span key={i} className="whitespace-nowrap">
                        {v}
                      </span>
                    ))}
                    {variantBits.length > 0 && hasPrepMass && <span aria-hidden>·</span>}
                    {hasPrepMass && (
                      <span className="whitespace-nowrap font-semibold text-[var(--brand-500)]">
                        {formatIngredientQty(it.total_prep_mass, 'g')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Direct stock-item lines (packaging, single-stock ingredients) */}
            {(it.stock_lines.length > 0 || it.prep_lines.length > 0) ? (
              <ul className="divide-y divide-[var(--line)]">
                {it.stock_lines.map((s) => (
                  <li
                    key={`stock-${s.stock_item_id}-${s.unit}`}
                    className="px-[var(--s-4)] py-[var(--s-2)] flex items-baseline justify-between gap-[var(--s-3)]"
                  >
                    <span className="text-fs-sm text-[var(--fg-muted)] truncate">
                      {s.name}
                    </span>
                    <span className="text-fs-sm font-semibold text-[var(--fg)] tabular shrink-0">
                      {formatIngredientQty(s.total_qty, s.unit)}
                    </span>
                  </li>
                ))}
                {/* Prep-item lines — each expandable to raw-stock breakdown */}
                {it.prep_lines.map((p) => (
                  <li
                    key={`prep-${p.prep_item_id}-${p.unit}`}
                    className="p-0"
                  >
                    <details className="group">
                      <summary className="flex items-baseline justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-2)] cursor-pointer select-none list-none hover:bg-[var(--surface-2)] transition-colors [&::-webkit-details-marker]:hidden">
                        <span className="flex items-baseline gap-[var(--s-2)] min-w-0">
                          <ChevronRightIcon
                            className="w-3.5 h-3.5 text-[var(--fg-muted)] transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90 shrink-0 self-center"
                            strokeWidth={2.5}
                          />
                          <span className="text-fs-sm text-[var(--fg-muted)] truncate">
                            {p.name}
                          </span>
                        </span>
                        <span className="text-fs-sm font-semibold text-[var(--fg)] tabular shrink-0">
                          {formatIngredientQty(p.total_qty, p.unit)}
                        </span>
                      </summary>
                      {p.breakdown.length > 0 ? (
                        <ul className="bg-[var(--surface-2)] border-t border-[var(--line)] divide-y divide-[var(--line)]">
                          {p.breakdown.map((b, idx) => (
                            <li
                              key={`prep-${p.prep_item_id}-bd-${idx}`}
                              className="ps-[var(--s-8)] pe-[var(--s-4)] py-[var(--s-2)] flex items-baseline justify-between gap-[var(--s-3)]"
                            >
                              <span className="text-fs-sm text-[var(--fg-muted)] truncate">
                                {b.name}
                              </span>
                              <span className="text-fs-sm font-semibold text-[var(--fg)] tabular shrink-0">
                                {formatIngredientQty(b.qty, b.unit)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="bg-[var(--surface-2)] border-t border-[var(--line)] ps-[var(--s-8)] pe-[var(--s-4)] py-[var(--s-2)] text-fs-xs text-[var(--fg-subtle)] italic">
                          {t('prepPlanNoBreakdown')}
                        </p>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-[var(--s-4)] py-[var(--s-3)] text-fs-xs text-[var(--fg-subtle)] italic">
                {t('prepPlanNoRecipe')}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── By Customer ──────────────────────────────────────────────────────────

function CustomerList({
  groups,
  allDayLabel,
  walkInLabel,
}: {
  groups: CustomerGroup[];
  allDayLabel: string;
  walkInLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-[var(--s-6)]">
      {groups.map((group) => (
        <section key={group.windowKey || 'all'}>
          <header className="mb-[var(--s-3)] flex items-center gap-[var(--s-3)]">
            <h2 className="text-fs-md font-semibold text-[var(--fg)] tabular">
              {group.windowKey || allDayLabel}
            </h2>
            <span className="text-fs-xs text-[var(--fg-subtle)]">
              {group.orders.length === 1
                ? t('calendarOrdersOne')
                : t('calendarOrdersMany').replace('{count}', String(group.orders.length))}
            </span>
            <div className="flex-1 h-px bg-[var(--line)]" />
          </header>
          <div className="grid gap-[var(--s-3)] grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {group.orders.map((o) => {
              const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
              const customer = o.customer_name?.trim() || walkInLabel;
              const initial = (customer[0] || '?').toUpperCase();
              return (
                <Card key={o.order_id} className="p-0 overflow-hidden">
                  <div className="flex items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
                    <span
                      className="w-8 h-8 rounded-r-md flex items-center justify-center text-white text-fs-sm font-bold shrink-0"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
                      }}
                    >
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-fs-sm font-semibold text-[var(--fg)] truncate">
                        {customer}
                      </p>
                      {o.customer_phone && (
                        <p className="text-fs-xs text-[var(--fg-subtle)] tabular truncate">
                          {o.customer_phone}
                        </p>
                      )}
                    </div>
                    <span className="text-fs-xs font-semibold text-[var(--fg-muted)] tabular">
                      ×{itemCount}
                    </span>
                  </div>
                  <ul className="divide-y divide-[var(--line)]">
                    {o.items.map((it, idx) => (
                      <li
                        key={`${o.order_id}-${it.menu_item_id}-${idx}`}
                        className="px-[var(--s-4)] py-[var(--s-2)] flex items-baseline gap-[var(--s-3)]"
                      >
                        <span className="text-fs-md font-semibold text-[var(--fg)] tabular w-6 text-end shrink-0">
                          {it.quantity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-fs-sm text-[var(--fg)] truncate">
                            <span>{it.name}</span>
                            {(it.variant_portion || it.selected_variant_name) && (
                              <span
                                className={`ms-1 cursor-help ${it.variant_portion ? 'font-bold text-[var(--brand-500)] tabular' : 'text-[var(--fg-muted)]'}`}
                                title={
                                  it.variant_portion && it.selected_variant_name
                                    ? it.selected_variant_name
                                    : undefined
                                }
                              >
                                · {it.variant_portion || it.selected_variant_name}
                              </span>
                            )}
                          </p>
                          {it.modifier_label && (
                            <p className="text-fs-xs text-[var(--fg-subtle)] truncate">
                              {it.modifier_label}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-[var(--s-16)] gap-[var(--s-3)] text-[var(--fg-subtle)]">
      <CalendarDaysIcon className="w-10 h-10" strokeWidth={1.25} />
      <p className="text-fs-sm">{message}</p>
    </div>
  );
}
