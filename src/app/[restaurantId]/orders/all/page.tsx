'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  listOrders, acceptOrder, rejectOrder, deleteOrder, updateOrderStatus,
  updateOrderPaymentStatus,
  markOrderServed, markOrderDelivered, markOrderOutForDelivery, markOrderReadyForDelivery,
  getRestaurant, getRestaurantSettings, updateRestaurantSettings, getWebsiteConfig,
  Order, OrderStatus, ListOrdersParams,
} from '@/lib/api';
import { clampWeekStartDay, getEffectiveWorkdays, type WeekStartDay } from '@/lib/weeks';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import { useI18n } from '@/lib/i18n';
import { type PrintTicketRestaurant } from '@/lib/print-ticket';
import { EditOrderDrawer } from '@/components/orders/EditOrderDrawer';
import {
  OrderDetailDrawer,
  STATUS_TONE,
  PAYMENT_TONE,
  localizeStatus,
  localizeOrderType,
  buildCustomFieldLabels,
} from '@/components/orders/OrderDetailDrawer';
import { usePermissions } from '@/lib/permissions-context';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import {
  SearchIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon,
  BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, PlusIcon,
  PauseIcon, PlayIcon,
} from 'lucide-react';
import { Badge, Button, PageHead } from '@/components/ds';
import { FeatureIntro } from '@/components/help/FeatureIntro';
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';
import { TakePaymentDialog, PaymentMethod } from '@/components/orders/TakePaymentDialog';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

// ─── Tab config ────────────────────────────────────────────────────────────

interface Tab {
  key: string;
  labelKey: string;
  statuses?: string;
  active?: boolean;
}

// The "active" tab sends an explicit status set instead of `active=true`
// because the server's `active=true` shortcut still includes `served` for
// backward compatibility with older POS clients — which would otherwise
// inflate the badge count while the table filters them out.
const TABS: Tab[] = [
  { key: 'all', labelKey: 'all', active: undefined },
  { key: 'active', labelKey: 'active', statuses: 'pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery', active: true },
  { key: 'scheduled', labelKey: 'scheduled', statuses: 'scheduled' },
  { key: 'completed', labelKey: 'completed', statuses: 'served,received,picked_up,delivered' },
  { key: 'canceled', labelKey: 'canceled', statuses: 'rejected' },
];

const PAGE_SIZE = 25;

// ─── Helpers ───────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultDateRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { t } = useI18n();
  const { hasAnyPermission, isOwner } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { status: wsStatus, lastEvent, addProcessingGuard, removeProcessingGuard, isProcessing } = useWs();

  const { play: playSound, isEnabled: isSoundEnabled, toggle: toggleSound } = useOrderSound();
  const { permission, requestPermission, notify } = useBrowserNotifications();
  const [soundOn, setSoundOn] = useState(true);

  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevEvent = useRef<WsEvent | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [page, setPage] = useState(0);

  const orders = rawOrders;
  const setOrders = setRawOrders;

  // Selected order for right panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  // First day of the week + workdays for the date picker. Loaded with the
  // restaurant; both default to "everything on" until then so the picker
  // never renders muted cells based on a stale guess.
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  // Minimal restaurant identity for printed tickets (name/address/phone header).
  const [restaurantInfo, setRestaurantInfo] = useState<PrintTicketRestaurant>({});
  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid)
      .then((r) => {
        setWeekStartDay(clampWeekStartDay(r.week_start_day));
        setWorkdays(getEffectiveWorkdays(r));
        setRestaurantInfo({ name: r.name, address: r.address, phone: r.phone });
      })
      .catch(() => {});
  }, [rid]);

  // Maps custom checkout-field ids → their human label so order custom_fields
  // (e.g. { code_immeuble: "A12" }) render as "Code Immeuble", not the raw id.
  const [customFieldLabels, setCustomFieldLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!rid) return;
    getWebsiteConfig(rid)
      .then((cfg) => setCustomFieldLabels(buildCustomFieldLabels(cfg.checkout_config)))
      .catch(() => {});
  }, [rid]);

  // Online-ordering pause — same kill switch as Settings → Commandes &
  // disponibilité, surfaced here so staff can pause mid-service without leaving
  // the order board.
  const [paused, setPaused] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  useEffect(() => {
    if (!rid) return;
    getRestaurantSettings(rid)
      .then((s) => setPaused(s.orders_paused ?? false))
      .catch(() => {});
  }, [rid]);

  const togglePause = async (next: boolean) => {
    setPauseSaving(true);
    setPaused(next); // optimistic
    try {
      await updateRestaurantSettings(rid, {
        orders_paused: next,
        orders_paused_until: '',
        rush_mode: false,
      });
    } catch {
      setPaused(!next); // revert on failure
    } finally {
      setPauseSaving(false);
    }
  };

  useEffect(() => { setSoundOn(isSoundEnabled()); }, [isSoundEnabled]);

  // ─── Fetch ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const tab = TABS.find((t) => t.key === activeTab)!;
    const params: ListOrdersParams = {
      from: toISODate(dateRange.from),
      to: toISODate(dateRange.to),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_by: 'created_at',
      sort_dir: 'desc',
    };
    if (tab.statuses) params.status = tab.statuses;
    else if (tab.active) params.active = true;
    if (searchSubmitted) params.q = searchSubmitted;
    if (typeFilter) params.type = typeFilter;
    if (paymentFilter) params.payment_status = paymentFilter;

    try {
      const result = await listOrders(rid, params);
      setOrders(result.orders);
      setTotal(result.total);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [rid, activeTab, searchSubmitted, typeFilter, paymentFilter, dateRange, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ─── WebSocket ────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;

    const { type, payload } = lastEvent;
    if (!type.startsWith('order.')) return;

    const wsOrder = payload as unknown as Order;
    if (!wsOrder?.id) return;
    if (isProcessing(wsOrder.id)) return;

    // Owner deleted an order elsewhere — drop it from the list and close the
    // drawer if it was open. Handled before the upsert below so it isn't re-added.
    if (type === 'order.deleted') {
      setOrders((prev) => prev.filter((o) => o.id !== wsOrder.id));
      setSelectedId((prev) => (prev === wsOrder.id ? null : prev));
      return;
    }

    if (type === 'order.created') {
      playSound();
      notify(t('newOrder'), {
        body: `${t('orderNumber').replace('{id}', String(wsOrder.id))} · ${localizeOrderType(wsOrder.order_type, t)}`,
        tag: `order-${wsOrder.id}`,
      });
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === wsOrder.id);
      if (type === 'order.created') {
        if (idx >= 0) return prev;
        return [wsOrder, ...prev];
      }
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...wsOrder };
      return next;
    });
  }, [lastEvent, isProcessing, playSound, notify]);

  // ─── Actions ──────────────────────────────────────────────────────

  const runAction = async (orderId: number, action: () => Promise<void | Order>, optimisticStatus?: OrderStatus) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    if (optimisticStatus) {
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: optimisticStatus } : o));
    }
    try {
      await action();
    } catch {
      await fetchOrders();
    } finally {
      setActionLoading(null);
      removeProcessingGuard(orderId);
    }
  };

  const handleAccept = (orderId: number) =>
    runAction(orderId, () => acceptOrder(rid, orderId), 'accepted');
  const handleReject = (orderId: number) => {
    if (!confirm(t('rejectThisOrder'))) return;
    runAction(orderId, () => rejectOrder(rid, orderId));
  };
  // Hard delete — permanently removes the order. Owner/admin only (also enforced
  // server-side). Guarded by an explicit, irreversible-action warning.
  const handleDelete = async (orderId: number) => {
    if (!confirm(t('deleteOrderWarning'))) return;
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    try {
      await deleteOrder(rid, orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setSelectedId((prev) => (prev === orderId ? null : prev));
    } catch {
      alert(t('deleteOrderFailed'));
      await fetchOrders();
    } finally {
      setActionLoading(null);
      removeProcessingGuard(orderId);
    }
  };
  const handleSendToKitchen = (orderId: number) =>
    runAction(orderId, () => updateOrderStatus(rid, orderId, 'in_kitchen').then(() => {}), 'in_kitchen');
  // Delivery orders must land in `ready_for_delivery` so they enter the
  // dispatch pipeline (the Deliveries page filters on that status). Dine-in and
  // pickup use the generic `ready`.
  const handleMarkReady = (orderId: number) => {
    const isDelivery = orders.find((o) => o.id === orderId)?.order_type === 'delivery';
    return isDelivery
      ? runAction(orderId, () => markOrderReadyForDelivery(rid, orderId).then(() => {}), 'ready_for_delivery')
      : runAction(orderId, () => updateOrderStatus(rid, orderId, 'ready').then(() => {}), 'ready');
  };
  const handleMarkServed = (orderId: number) =>
    runAction(orderId, () => updateOrderStatus(rid, orderId, 'served').then(() => {}), 'served');
  const handleOutForDelivery = (orderId: number) =>
    runAction(orderId, () => markOrderOutForDelivery(rid, orderId).then(() => {}), 'out_for_delivery');
  const handleMarkDelivered = (orderId: number) =>
    runAction(orderId, () => markOrderDelivered(rid, orderId).then(() => {}), 'delivered');

  // ─── Payment / Close ─────────────────────────────────────────────
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleTakePayment = (method: PaymentMethod) => {
    if (!selectedOrder) return Promise.resolve();
    const orderId = selectedOrder.id;
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    // Optimistic
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, payment_status: 'paid' } : o,
    ));
    return updateOrderPaymentStatus(rid, orderId, 'paid', method)
      .then((updated) => {
        setOrders((prev) => prev.map((o) =>
          o.id === orderId ? { ...o, ...updated } : o,
        ));
      })
      .catch(async () => { await fetchOrders(); })
      .finally(() => {
        setActionLoading(null);
        removeProcessingGuard(orderId);
      });
  };

  const handleCloseOrder = (orderId: number, orderType: string) => {
    if (!confirm(t('closeOrderConfirm'))) return;
    runAction(orderId, async () => {
      if (orderType === 'delivery') {
        await markOrderDelivered(rid, orderId);
      } else {
        // mark-served works from in_kitchen and ready (server validation).
        // mark-received only works from ready, so prefer mark-served here.
        await markOrderServed(rid, orderId);
      }
    });
    setSelectedId(null);
  };

  // ─── Tab / search ─────────────────────────────────────────────────

  const switchTab = (key: string) => {
    setActiveTab(key);
    setPage(0);
    setSelectedId(null);
  };

  const handleSearch = () => {
    setSearchSubmitted(search);
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Render ───────────────────────────────────────────────────────

  const activeCount = orders.length;

  return (
    <div className="flex gap-0" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Full-width table list — detail is now in a Drawer */}
      <div className="flex-1 min-w-0 space-y-[var(--s-5)]">
        <PageHead
          title={t('orders')}
          desc={`${total} ${t('orders').toLowerCase()} · ${activeCount} ${t('shown') || 'shown'}`}
          actions={
            <>
              {canManage && (
                <Button variant="primary" size="md" asChild>
                  <Link href={`/${rid}/orders/new`}>
                    <PlusIcon />
                    {t('newOrder')}
                  </Link>
                </Button>
              )}
              {canManage && (paused ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => togglePause(false)}
                  disabled={pauseSaving}
                  style={{ background: 'var(--danger-500)', color: '#fff' }}
                  title={t('resumeOrders') || 'Reprendre les commandes'}
                >
                  <PlayIcon /> {t('resumeOrders') || 'Reprendre'}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => togglePause(true)}
                  disabled={pauseSaving}
                  title={t('pauseOnlineOrders') || 'Mettre en pause les commandes en ligne'}
                >
                  <PauseIcon /> {t('pauseOrders') || 'Pause'}
                </Button>
              ))}
              {wsStatus === 'connected' && (
                <Badge tone="success" dot>
                  {t('live')}
                </Badge>
              )}
              {wsStatus === 'connecting' && (
                <Badge tone="warning" dot>
                  {t('connecting')}
                </Badge>
              )}
              {wsStatus === 'disconnected' && (
                <Badge tone="danger" dot>
                  {t('offline')}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="md"
                icon
                onClick={() => {
                  const next = toggleSound();
                  setSoundOn(next);
                }}
                aria-label={soundOn ? t('muteSound') : t('unmuteSound')}
                title={soundOn ? t('muteSound') : t('unmuteSound')}
              >
                {soundOn ? <Volume2Icon /> : <VolumeXIcon />}
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon
                onClick={requestPermission}
                aria-label={
                  permission === 'granted'
                    ? t('notificationsEnabled')
                    : permission === 'denied'
                      ? t('notificationsBlocked')
                      : t('enableNotifications')
                }
                title={
                  permission === 'granted'
                    ? t('notificationsEnabled')
                    : permission === 'denied'
                      ? t('notificationsBlocked')
                      : t('enableNotifications')
                }
              >
                {permission === 'granted' ? <BellIcon /> : <BellOffIcon />}
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon
                onClick={fetchOrders}
                aria-label={t('refresh')}
                title={
                  lastUpdated
                    ? `${t('refresh')} · ${t('lastUpdated') || 'Mise à jour'} ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : t('refresh')
                }
              >
                <RefreshCwIcon />
              </Button>
            </>
          }
        />

        {paused && (
          <div
            className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md"
            style={{
              background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--danger-500) 35%, var(--line))',
            }}
          >
            <div className="flex items-center gap-[var(--s-2)] min-w-0">
              <PauseIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--danger-500)' }} />
              <span className="text-fs-sm font-medium" style={{ color: 'var(--danger-500)' }}>
                {t('ordersPausedBadge') || 'Commandes en pause'}
              </span>
              <span className="text-fs-xs text-[var(--fg-muted)] truncate">
                {t('ordersPausedBannerDesc') ||
                  'Les clients ne peuvent pas commander en ligne. Reprenez quand vous êtes prêt.'}
              </span>
            </div>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => togglePause(false)}
                disabled={pauseSaving}
                className="shrink-0"
              >
                <PlayIcon /> {t('resumeOrders') || 'Reprendre'}
              </Button>
            )}
          </div>
        )}

        <FeatureIntro feature="orders" />

        {/* Status tabs — underline style with inline counts + dot-pulse.
            The rail spans the full row so partial tabs can fade off the end
            without competing with adjacent buttons. Refresh moved to the
            page-head actions above. */}
        <div className="border-b border-[var(--line)]">
          <HorizontalScrollRail activeKey={activeTab} edgeFlush>
            <div className="inline-flex items-center gap-[var(--s-4)] md:gap-[var(--s-5)] pe-[var(--s-4)] md:pe-0">
            {TABS.map((tab) => {
              const selected = activeTab === tab.key;
              const isActive = tab.key === 'active';
              const count = selected ? total : undefined;
              return (
                <button
                  key={tab.key}
                  onClick={() => switchTab(tab.key)}
                  aria-selected={selected}
                  data-rail-active={selected ? '' : undefined}
                  className={`relative py-[var(--s-3)] bg-transparent border-none text-fs-sm font-medium transition-colors inline-flex items-center gap-[var(--s-2)] whitespace-nowrap [scroll-snap-align:start] ${
                    selected
                      ? 'text-[var(--fg)] after:content-[""] after:absolute after:start-0 after:end-0 after:-bottom-px after:h-[2px] after:bg-[var(--brand-500)] after:rounded-[1px]'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {selected && isActive && (
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-[var(--success-500)] relative"
                      aria-hidden
                    >
                      <span className="absolute inset-0 rounded-full bg-[var(--success-500)] opacity-60 animate-ping" />
                    </span>
                  )}
                  <span>{t(tab.labelKey)}</span>
                  {count !== undefined && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${
                        selected
                          ? 'bg-[color-mix(in_oklab,var(--brand-500)_18%,transparent)] text-[var(--brand-500)]'
                          : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            </div>
          </HorizontalScrollRail>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
              <input
                type="text"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9 pr-3 py-2 text-sm w-full md:w-48"
              />
            </div>
            <button onClick={handleSearch} className="btn-secondary text-sm py-2 px-4 ms-2 shrink-0">
              {t('search')}
            </button>
          </div>

          <DateRangePicker
            value={dateRange}
            onChange={(range) => { setDateRange(range); setPage(0); }}
            weekStartDay={weekStartDay}
            workdays={workdays}
          />

          <FilterDropdown
            label={t('type')}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(0); }}
            options={[
              { value: '', label: t('all') },
              { value: 'dine_in', label: t('dineIn') },
              { value: 'pickup', label: t('pickup') },
              { value: 'delivery', label: t('delivery') },
            ]}
          />

          <FilterDropdown
            label={t('paymentStatus')}
            value={paymentFilter}
            onChange={(v) => { setPaymentFilter(v); setPage(0); }}
            options={[
              { value: '', label: t('all') },
              { value: 'paid', label: t('paid') },
              { value: 'pending', label: t('pending') },
              { value: 'unpaid', label: t('unpaid') },
              { value: 'refunded', label: t('refunded') },
            ]}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="text-4xl">📋</div>
            <h2 className="text-lg font-semibold text-fg-primary">{t('noMatchFound')}</h2>
            <p className="text-sm text-fg-secondary">{t('trySearchAllOrders')}</p>
            <button
              onClick={() => { switchTab('all'); setSearch(''); setSearchSubmitted(''); setTypeFilter(''); setPaymentFilter(''); }}
              className="btn-primary"
            >
              {t('searchAllOrders')}
            </button>
          </div>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <DataTableHeadCell>{t('orderNoColumn')}</DataTableHeadCell>
                <DataTableHeadCell>{t('name')}</DataTableHeadCell>
                <DataTableHeadCell>{t('type')}</DataTableHeadCell>
                <DataTableHeadCell>{t('date')}</DataTableHeadCell>
                <DataTableHeadCell>{t('status')}</DataTableHeadCell>
                <DataTableHeadCell>{t('courier')}</DataTableHeadCell>
                <DataTableHeadCell>{t('payment')}</DataTableHeadCell>
                <DataTableHeadCell align="right">{t('total')}</DataTableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {orders.map((order, index) => (
                  <DataTableRow
                    key={order.id}
                    index={index}
                    striped={false}
                    onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}
                    className={`cursor-pointer ${selectedId === order.id ? 'bg-blue-500/10' : ''}`}
                  >
                    <DataTableCell className="text-fg-secondary tabular-nums" mobileLabel={t('orderNoColumn')}>
                      #{order.id}
                    </DataTableCell>
                    <DataTableCell mobilePrimary>
                      <span className="font-semibold text-fg-primary">{order.customer_name || t('guestCustomer')}</span>
                    </DataTableCell>
                    <DataTableCell className="text-fg-secondary" mobileLabel={t('type')}>
                      {localizeOrderType(order.order_type, t)}
                    </DataTableCell>
                    <DataTableCell className="text-fg-secondary" mobileLabel={t('date')}>
                      <div className="flex md:flex-col items-baseline md:items-stretch gap-1.5 md:gap-0">
                        <span className="tabular-nums">
                          {new Date(order.created_at).toLocaleDateString([], {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                        <span className="text-fs-xs text-[var(--fg-subtle)] tabular-nums">
                          {new Date(order.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('status')}>
                      <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
                        {localizeStatus(order.status, t)}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('courier')}>
                      {order.order_type === 'delivery' ? (
                        order.courier_name
                          ? <span className="text-fg-primary">{order.courier_name}</span>
                          : <span className="text-[var(--fg-subtle)]">{t('courierNone')}</span>
                      ) : (
                        <span className="text-[var(--fg-subtle)]">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('payment')}>
                      <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'}>
                        {(() => {
                          const tv = t(order.payment_status);
                          return tv === order.payment_status ? order.payment_status : tv;
                        })()}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell align="right" className="font-medium text-fg-primary" mobileLabel={t('total')}>
                      ₪{(order.total_amount ?? 0).toFixed(0)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
                <span className="text-xs text-fg-secondary">
                  {t('showing').replace('{start}', String(page * PAGE_SIZE + 1)).replace('{end}', String(Math.min((page + 1) * PAGE_SIZE, total))).replace('{total}', String(total))}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-standard text-fg-secondary hover:text-fg-primary disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-fg-secondary px-2">
                    {t('pageOf').replace('{page}', String(page + 1)).replace('{total}', String(totalPages))}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-standard text-fg-secondary hover:text-fg-primary disabled:opacity-30 transition-colors"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: order detail panel */}
      <OrderDetailDrawer
        order={selectedOrder}
        canManage={canManage}
        canDelete={isOwner}
        isLoading={selectedOrder != null && actionLoading === selectedOrder.id}
        onClose={() => setSelectedId(null)}
        onAccept={() => selectedOrder && handleAccept(selectedOrder.id)}
        onReject={() => selectedOrder && handleReject(selectedOrder.id)}
        onDelete={() => selectedOrder && handleDelete(selectedOrder.id)}
        onSendToKitchen={() => selectedOrder && handleSendToKitchen(selectedOrder.id)}
        onMarkReady={() => selectedOrder && handleMarkReady(selectedOrder.id)}
        onMarkServed={() => selectedOrder && handleMarkServed(selectedOrder.id)}
        onOutForDelivery={() => selectedOrder && handleOutForDelivery(selectedOrder.id)}
        onMarkDelivered={() => selectedOrder && handleMarkDelivered(selectedOrder.id)}
        onTakePayment={() => setPaymentOpen(true)}
        onCloseOrder={() => selectedOrder && handleCloseOrder(selectedOrder.id, selectedOrder.order_type)}
        onEdit={() => setEditOpen(true)}
        restaurantInfo={restaurantInfo}
        customFieldLabels={customFieldLabels}
      />

      {/* Edit order items */}
      <EditOrderDrawer
        open={editOpen}
        order={selectedOrder}
        restaurantId={rid}
        onClose={() => setEditOpen(false)}
        onSaved={fetchOrders}
      />

      {/* Take Payment dialog */}
      <TakePaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        totalAmount={selectedOrder?.total_amount ?? 0}
        onConfirm={handleTakePayment}
      />
    </div>
  );
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayLabel = options.find((o) => o.value === value)?.label ?? 'All';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        {label} <span className="font-semibold text-fg-primary">{displayLabel}</span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-standard py-1 min-w-[140px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value
                  ? 'text-brand-500 font-medium'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              style={value === opt.value ? { background: 'var(--surface-subtle)' } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
