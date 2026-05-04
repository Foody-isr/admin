'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  Loader2Icon,
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
  listOrders,
  fetchKitchenPlan,
  type Order,
  type KitchenPlanDay,
} from '@/lib/api';

// ─── Constants ─────────────────────────────────────────────────────────────

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const HOUR_HEIGHT = 64; // px per hour
const TIME_GUTTER = 64; // px width of left time column
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

type CalendarMode = 'week' | 'day';

// ─── Date helpers ──────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday of the given date's ISO week (Mon=0..Sun=6 offset). */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = (dow + 6) % 7;
  return addDays(x, -offsetToMonday);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Parse "HH:MM" → minutes since midnight (or null). */
function parseHm(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Block packing (overlap → lanes) ───────────────────────────────────────

interface OrderBlock {
  order: Order;
  startMin: number; // minutes from midnight
  endMin: number;
}

interface PackedBlock {
  block: OrderBlock;
  laneIdx: number;
  laneCount: number;
}

function packLanes(blocks: OrderBlock[]): PackedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const result: PackedBlock[] = [];
  let cluster: OrderBlock[] = [];
  let clusterEnd = -1;

  function flush(): void {
    if (cluster.length === 0) return;
    const lanes: number[] = []; // lane → endMin of last block placed
    const assigned: number[] = [];
    for (const b of cluster) {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= b.startMin) {
          lanes[i] = b.endMin;
          assigned.push(i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push(b.endMin);
        assigned.push(lanes.length - 1);
      }
    }
    const laneCount = lanes.length;
    cluster.forEach((b, i) => {
      result.push({ block: b, laneIdx: assigned[i], laneCount });
    });
  }

  for (const b of sorted) {
    if (b.startMin >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  flush();
  return result;
}

/**
 * Build calendar blocks for one day from the scheduled orders.
 * Skips orders without a usable pickup window or outside the visible hour range.
 */
function blocksForDay(orders: Order[], day: Date): OrderBlock[] {
  const dayIso = isoDate(day);
  const out: OrderBlock[] = [];
  for (const o of orders) {
    if (!o.scheduled_for) continue;
    const sched = new Date(o.scheduled_for);
    if (isoDate(sched) !== dayIso) continue;
    const start = parseHm(o.scheduled_pickup_window_start);
    const end = parseHm(o.scheduled_pickup_window_end);
    if (start == null || end == null) continue;
    const clampedStart = Math.max(start, DAY_START_HOUR * 60);
    const clampedEnd = Math.min(end, DAY_END_HOUR * 60);
    if (clampedEnd <= clampedStart) continue;
    out.push({ order: o, startMin: clampedStart, endMin: clampedEnd });
  }
  return out;
}

// ─── Status → tone ─────────────────────────────────────────────────────────

type Tone = 'warning' | 'info' | 'success' | 'neutral';

function statusTone(status: string): Tone {
  switch (status) {
    case 'pending_review':
    case 'in_kitchen':
      return 'warning';
    case 'accepted':
    case 'ready':
    case 'ready_for_pickup':
    case 'ready_for_delivery':
    case 'out_for_delivery':
      return 'info';
    case 'served':
    case 'received':
    case 'picked_up':
    case 'delivered':
      return 'success';
    case 'scheduled':
    default:
      return 'neutral';
  }
}

const TONE_CLASSES: Record<Tone, { fill: string; bar: string; text: string }> = {
  warning: {
    fill: 'bg-[var(--warning-50)]',
    bar: 'bg-[var(--warning-500)]',
    text: 'text-[var(--warning-500)]',
  },
  info: {
    fill: 'bg-[var(--info-50)]',
    bar: 'bg-[var(--info-500)]',
    text: 'text-[var(--info-500)]',
  },
  success: {
    fill: 'bg-[var(--success-50)]',
    bar: 'bg-[var(--success-500)]',
    text: 'text-[var(--success-500)]',
  },
  neutral: {
    fill: 'bg-[var(--surface-2)]',
    bar: 'bg-[var(--fg-subtle)]',
    text: 'text-[var(--fg-muted)]',
  },
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t, locale, direction } = useI18n();
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const isRtl = direction === 'rtl';

  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [orders, setOrders] = useState<Order[]>([]);
  const [plan, setPlan] = useState<KitchenPlanDay[]>([]);
  const [loading, setLoading] = useState(true);

  // Visible range — week view spans Mon→Sun, day view is just the anchor day.
  const range = useMemo(() => {
    if (mode === 'day') return { from: anchor, to: anchor };
    const monday = startOfWeek(anchor);
    return { from: monday, to: addDays(monday, 6) };
  }, [mode, anchor]);

  const days = useMemo<Date[]>(() => {
    const span = mode === 'day' ? 1 : 7;
    const out: Date[] = [];
    for (let i = 0; i < span; i++) out.push(addDays(range.from, i));
    return out;
  }, [mode, range.from]);

  // Fetch active scheduled orders + kitchen-plan aggregation in parallel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fromIso = isoDate(range.from);
    const toIso = isoDate(addDays(range.to, 1)); // server "to" is exclusive at midnight
    Promise.all([
      listOrders(rid, {
        status: 'scheduled,accepted,in_kitchen,ready',
        limit: 500,
        sort_by: 'created_at',
        sort_dir: 'desc',
      }),
      fetchKitchenPlan(rid, fromIso, toIso),
    ])
      .then(([orderRes, planRes]) => {
        if (cancelled) return;
        setOrders(orderRes.orders);
        setPlan(planRes);
      })
      .catch(() => {
        if (cancelled) return;
        setOrders([]);
        setPlan([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, range.from, range.to]);

  // Map ISO date → kitchen-plan day
  const planByDate = useMemo(() => {
    const m = new Map<string, KitchenPlanDay>();
    for (const d of plan) m.set(d.date, d);
    return m;
  }, [plan]);

  // ── Toolbar handlers ──
  const isWeek = mode === 'week';
  const today = useMemo(() => startOfDay(new Date()), []);
  function shift(direction: -1 | 1): void {
    setAnchor((prev) => addDays(prev, isWeek ? 7 * direction : direction));
  }
  function goToday(): void {
    setAnchor(today);
  }

  // ── Header label (e.g. "May 4 – May 10, 2026" or "Wednesday, May 4") ──
  const headerLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (!isWeek) {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(range.from);
    }
    const sameYear = range.from.getFullYear() === range.to.getFullYear();
    const sameMonth = sameYear && range.from.getMonth() === range.to.getMonth();
    if (sameMonth) {
      const monthYear = new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(range.from);
      return `${range.from.getDate()} – ${range.to.getDate()} ${monthYear}`;
    }
    return `${fmt.format(range.from)} – ${fmt.format(range.to)}`;
  }, [isWeek, range.from, range.to, locale]);

  // ── Prep-plan CTA target date (day view → that day; week view → today if in range, else first day) ──
  const prepDate = useMemo(() => {
    if (!isWeek) return isoDate(range.from);
    const inRange = today >= range.from && today <= range.to;
    return isoDate(inRange ? today : range.from);
  }, [isWeek, range.from, range.to, today]);

  return (
    <div className="px-[var(--s-6)] py-[var(--s-6)]">
      <PageHead
        title={t('calendarTitle')}
        desc={t('calendarSubtitle')}
        actions={
          <Button asChild variant="primary">
            <Link href={`/${rid}/orders/preparation/${prepDate}`}>
              <ClipboardListIcon />
              {t('calendarOpenPrepPlan')}
            </Link>
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-[var(--s-4)] flex-wrap mb-[var(--s-5)]">
        <div className="flex items-center gap-[var(--s-2)]">
          <Button
            variant="secondary"
            size="sm"
            icon
            onClick={() => shift(-1)}
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
            onClick={() => shift(1)}
            aria-label={t('calendarNext')}
          >
            {isRtl ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </Button>
          <span className="ms-[var(--s-3)] text-fs-md font-semibold text-[var(--fg)] tabular">
            {headerLabel}
          </span>
          {loading && (
            <Loader2Icon className="w-4 h-4 ms-[var(--s-2)] text-[var(--fg-subtle)] animate-spin" />
          )}
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as CalendarMode)}
          variant="segmented"
          className="!flex-row !gap-0"
        >
          <TabsList>
            <Tab value="week">{t('calendarWeek')}</Tab>
            <Tab value="day">{t('calendarDay')}</Tab>
          </TabsList>
          <TabsContent value="week" className="hidden" />
          <TabsContent value="day" className="hidden" />
        </Tabs>
      </div>

      {/* Body */}
      {isWeek ? (
        <WeekGrid
          days={days}
          orders={orders}
          planByDate={planByDate}
          locale={locale}
          rid={rid}
          loading={loading}
        />
      ) : (
        <DayGrid
          day={days[0]}
          orders={orders}
          planDay={planByDate.get(isoDate(days[0]))}
          locale={locale}
          rid={rid}
          loading={loading}
        />
      )}
    </div>
  );
}

// ─── Week Grid ─────────────────────────────────────────────────────────────

function WeekGrid({
  days,
  orders,
  planByDate,
  locale,
  rid,
  loading,
}: {
  days: Date[];
  orders: Order[];
  planByDate: Map<string, KitchenPlanDay>;
  locale: string;
  rid: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  const today = startOfDay(new Date());
  const totalOrders = days.reduce(
    (sum, d) => sum + (planByDate.get(isoDate(d))?.total_orders ?? 0),
    0,
  );

  if (!loading && totalOrders === 0) {
    return <EmptyState message={t('calendarNoOrdersWeek')} />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER}px repeat(7, minmax(140px, 1fr))`,
            minWidth: TIME_GUTTER + 7 * 140,
          }}
        >
          {/* Header row */}
          <div className="border-b border-[var(--line)] bg-[var(--surface)] sticky top-0 z-20" />
          {days.map((d) => {
            const isToday = sameDay(d, today);
            const dayPlan = planByDate.get(isoDate(d));
            const count = dayPlan?.total_orders ?? 0;
            return (
              <Link
                key={d.toISOString()}
                href={`/${rid}/orders/preparation/${isoDate(d)}`}
                className={`border-b border-s border-[var(--line)] bg-[var(--surface)] sticky top-0 z-20 px-[var(--s-3)] py-[var(--s-3)] text-start hover:bg-[var(--surface-2)] transition-colors duration-fast ease-out group`}
              >
                <div className="flex items-baseline gap-[var(--s-2)]">
                  <span
                    className={`text-fs-xs font-semibold uppercase tracking-[0.06em] ${
                      isToday ? 'text-[var(--brand-500)]' : 'text-[var(--fg-muted)]'
                    }`}
                  >
                    {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)}
                  </span>
                  <span
                    className={`text-fs-lg font-semibold tabular ${
                      isToday ? 'text-[var(--brand-500)]' : 'text-[var(--fg)]'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {count > 0 && (
                    <span
                      className="ms-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-r-full bg-[var(--surface-2)] text-[var(--fg-muted)] group-hover:bg-[var(--surface-3)]"
                      aria-label={count === 1 ? t('calendarOrdersOne') : t('calendarOrdersMany').replace('{count}', String(count))}
                    >
                      {count}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          {/* Body */}
          <TimeGutter />
          {days.map((d) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              orders={orders}
              isToday={sameDay(d, today)}
              compact
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// ─── Day Grid (split: calendar + items panel) ─────────────────────────────

function DayGrid({
  day,
  orders,
  planDay,
  locale,
  rid,
  loading,
}: {
  day: Date;
  orders: Order[];
  planDay: KitchenPlanDay | undefined;
  locale: string;
  rid: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  const isToday = sameDay(day, startOfDay(new Date()));
  const hasOrders = (planDay?.total_orders ?? 0) > 0;

  return (
    <div className="grid gap-[var(--s-5)] grid-cols-1 lg:grid-cols-[1fr_320px]">
      {/* Calendar column */}
      <Card className="overflow-hidden p-0">
        {!loading && !hasOrders ? (
          <EmptyState message={t('calendarNoOrdersDay')} />
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: `${TIME_GUTTER}px 1fr` }}
          >
            <TimeGutter />
            <DayColumn day={day} orders={orders} isToday={isToday} compact={false} />
          </div>
        )}
      </Card>

      {/* Right rail */}
      <div className="space-y-[var(--s-4)]">
        <ItemsToPreparePanel planDay={planDay} />
        <PickupWindowsPanel planDay={planDay} />
        {hasOrders && (
          <Button asChild variant="secondary" className="w-full">
            <Link href={`/${rid}/orders/preparation/${isoDate(day)}`}>
              <ClipboardListIcon />
              {t('calendarOpenPrepPlan')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ItemsToPreparePanel({ planDay }: { planDay: KitchenPlanDay | undefined }) {
  const { t } = useI18n();
  const items = planDay?.items ?? [];
  return (
    <Card className="p-0">
      <div className="px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)] flex items-center justify-between">
        <h3 className="text-fs-sm font-semibold uppercase tracking-[0.06em] text-[var(--fg-muted)]">
          {t('calendarItemsToPrepare')}
        </h3>
        {items.length > 0 && (
          <span className="text-fs-xs font-medium text-[var(--fg-subtle)] tabular">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="p-[var(--s-4)] text-fs-sm text-[var(--fg-subtle)]">—</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {items.slice(0, 12).map((it) => (
            <li
              key={it.menu_item_id}
              className="px-[var(--s-4)] py-[var(--s-3)] flex items-center gap-[var(--s-3)]"
            >
              <span className="text-fs-lg font-semibold text-[var(--fg)] tabular w-8 text-end">
                {it.total_quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fs-sm font-medium text-[var(--fg)] truncate">{it.name || '—'}</p>
                {it.modifiers && it.modifiers.length > 0 && (
                  <p className="text-fs-xs text-[var(--fg-subtle)] truncate">
                    {it.modifiers.map((m) => `${m.quantity}× ${m.modifier_label}`).join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PickupWindowsPanel({ planDay }: { planDay: KitchenPlanDay | undefined }) {
  const { t } = useI18n();
  const slots = planDay?.slots ?? [];
  return (
    <Card className="p-0">
      <div className="px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
        <h3 className="text-fs-sm font-semibold uppercase tracking-[0.06em] text-[var(--fg-muted)]">
          {t('calendarPickupWindows')}
        </h3>
      </div>
      {slots.length === 0 ? (
        <p className="p-[var(--s-4)] text-fs-sm text-[var(--fg-subtle)]">—</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {slots.map((s) => (
            <li
              key={`${s.start}-${s.end}`}
              className="px-[var(--s-4)] py-[var(--s-3)] flex items-center justify-between"
            >
              <span className="text-fs-sm text-[var(--fg)] tabular">
                {s.start} – {s.end}
              </span>
              <span className="text-fs-xs font-semibold tabular text-[var(--fg-muted)]">
                ×{s.order_count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Time gutter + day column ─────────────────────────────────────────────

function TimeGutter() {
  const hours: number[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  return (
    <div
      className="relative bg-[var(--surface)]"
      style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
    >
      {hours.map((h, i) => (
        <div
          key={h}
          className="absolute end-[var(--s-2)] -translate-y-1/2 text-fs-xs text-[var(--fg-subtle)] tabular"
          style={{ top: i * HOUR_HEIGHT }}
        >
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  orders,
  isToday,
  compact,
}: {
  day: Date;
  orders: Order[];
  isToday: boolean;
  compact: boolean;
}) {
  const blocks = useMemo(() => packLanes(blocksForDay(orders, day)), [orders, day]);
  const height = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

  // Now-line offset (only render on today)
  const nowOffset = useMemo<number | null>(() => {
    if (!isToday) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < DAY_START_HOUR * 60 || nowMin > DAY_END_HOUR * 60) return null;
    return ((nowMin - DAY_START_HOUR * 60) / TOTAL_MINUTES) * height;
  }, [isToday, height]);

  return (
    <div
      className="relative border-s border-[var(--line)]"
      style={{ height }}
    >
      {/* Hour separator lines */}
      {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-x-0 border-t border-[var(--line)]"
          style={{ top: i * HOUR_HEIGHT }}
        />
      ))}
      {/* Subtle today tint */}
      {isToday && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--brand-500) 4%, transparent), transparent 30%)',
          }}
        />
      )}

      {/* Order blocks */}
      {blocks.map(({ block, laneIdx, laneCount }) => {
        const top = ((block.startMin - DAY_START_HOUR * 60) / TOTAL_MINUTES) * height;
        const blockHeight =
          ((block.endMin - block.startMin) / TOTAL_MINUTES) * height - 2;
        const widthPct = 100 / laneCount;
        const leftPct = widthPct * laneIdx;
        const tone = TONE_CLASSES[statusTone(block.order.status)];
        return (
          <OrderCard
            key={block.order.id}
            order={block.order}
            top={top}
            height={blockHeight}
            leftPct={leftPct}
            widthPct={widthPct}
            tone={tone}
            compact={compact}
          />
        );
      })}

      {/* Now line */}
      {nowOffset != null && (
        <div
          className="absolute inset-x-0 z-10 pointer-events-none"
          style={{ top: nowOffset }}
        >
          <div className="relative h-px bg-[var(--brand-500)]">
            <span className="absolute -start-1 -top-[3px] w-1.5 h-1.5 rounded-full bg-[var(--brand-500)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-500)_25%,transparent)]" />
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  top,
  height,
  leftPct,
  widthPct,
  tone,
  compact,
}: {
  order: Order;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  tone: { fill: string; bar: string; text: string };
  compact: boolean;
}) {
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const start = order.scheduled_pickup_window_start;
  const end = order.scheduled_pickup_window_end;
  const customer = order.customer_name?.trim() || `#${order.id}`;
  return (
    <div
      className={`absolute z-[5] ${tone.fill} rounded-r-sm overflow-hidden`}
      style={{
        top,
        height,
        insetInlineStart: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      title={`${customer} · ${start ?? ''}–${end ?? ''} · ${itemCount} items`}
    >
      <div className={`absolute inset-y-0 start-0 w-[3px] ${tone.bar}`} />
      <div className={`h-full ${compact ? 'p-[var(--s-2)]' : 'p-[var(--s-3)]'} flex flex-col gap-0.5 min-w-0`}>
        <div className="flex items-center gap-[var(--s-2)] min-w-0">
          <span className="text-fs-xs font-semibold text-[var(--fg)] truncate flex-1">
            {customer}
          </span>
          {!compact && itemCount > 0 && (
            <span className={`text-[10px] font-semibold tabular ${tone.text}`}>
              ×{itemCount}
            </span>
          )}
        </div>
        {start && end && height > 28 && (
          <span className="text-[10px] tabular text-[var(--fg-muted)]">
            {start} – {end}
          </span>
        )}
      </div>
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
