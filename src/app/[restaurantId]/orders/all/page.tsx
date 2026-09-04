'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  listOrders, acceptOrder, rejectOrder, deleteOrder, updateOrderStatus, overrideOrderStatus,
  updateOrderPaymentStatus, overrideOrderPaymentStatus, correctOrderPaymentMethod,
  updateOrderCustomerDetails,
  markOrderServed, markOrderDelivered, markOrderOutForDelivery, markOrderReadyForDelivery,
  setOrderForceProduction,
  getRestaurant, getRestaurantSettings, updateRestaurantSettings, getWebsiteConfig,
  getDisplayPreferences, updateDisplayPreferences,
  Order, OrderStatus, PaymentStatus, ListOrdersParams, type DateBasis,
  type ManualPaymentMethod,
  type OrderCustomerDetailsInput,
  type OrdersTableConfig,
  type CheckoutConfig,
  type AcceptOrderResult,
} from '@/lib/api';
import { clampWeekStartDay, getEffectiveWorkdays, isoDate, type WeekStartDay } from '@/lib/weeks';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import { useI18n, useCurrency } from '@/lib/i18n';
import { type PrintTicketRestaurant } from '@/lib/print-ticket';
import { EditOrderDrawer } from '@/components/orders/EditOrderDrawer';
import { OrderDetailModal } from '@/components/orders/detail/OrderDetailModal';
import { localizeOrderType } from '@/lib/orders/status-presentation';
import { buildCustomFieldLabels } from '@/lib/orders/checkout-fields';
import { usePermissions } from '@/lib/permissions-context';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import { useOrderSeries } from '@/lib/series';
import {
  SearchIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon,
  BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, PlusIcon, XIcon, Rows3Icon, AlignJustifyIcon,
  PauseIcon, PlayIcon, WifiIcon, WifiOffIcon, SlidersHorizontalIcon,
  ListFilterIcon, ClipboardListIcon,
} from 'lucide-react';
import { Button, ConfirmDialog, PageHead } from '@/components/ds';
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';
import { TakePaymentDialog, PaymentMethod } from '@/components/orders/TakePaymentDialog';
import { ConfirmWeightsModal } from '@/components/orders/ConfirmWeightsModal';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { OverrideStatusDialog } from '@/components/orders/OverrideStatusDialog';
import { OverridePaymentDialog } from '@/components/orders/OverridePaymentDialog';
import { CorrectPaymentMethodDialog } from '@/components/orders/CorrectPaymentMethodDialog';
import { paymentReference, settledPaymentMethod } from '@/lib/orders/payment';
import { EditCustomerDialog } from '@/components/orders/EditCustomerDialog';
import { OrderColumnPicker } from '@/components/orders/OrderColumnPicker';
import { useOrdersTableConfig } from '@/lib/orders/useOrdersTableConfig';
import { useIsMobile } from '@/components/ui/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrdersOperationsRail } from '@/components/orders/OrdersOperationsRail';
import { OrderQuickView } from '@/components/orders/OrderQuickView';
import { deriveOrderCapabilities, type PrimaryAction } from '@/lib/orders/order-actions';
import {
  getOrderTiming,
  OPERATIONS_QUEUES,
  type OperationsQueueKey,
} from '@/lib/orders/operations-board';
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
  isScheduled?: boolean;
}

// The "active" tab sends an explicit status set instead of `active=true`
// because the server's `active=true` shortcut still includes `served` for
// backward compatibility with older POS clients — which would otherwise
// inflate the badge count while the table filters them out.
//
// The "scheduled" tab filters on the durable `is_scheduled` flag (not the
// transient `scheduled` status) so a scheduled order stays listed after it is
// promoted to in_kitchen etc. on its fulfillment day. It is scoped to
// still-in-progress statuses so completed/cancelled scheduled orders live in
// the Terminées / Annulées tabs, not here.
const TABS: Tab[] = [
  { key: 'active', labelKey: 'active', statuses: 'pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery', active: true },
  { key: 'review', labelKey: 'ordersQueueReview', statuses: 'pending_review', active: true },
  { key: 'kitchen', labelKey: 'ordersQueueKitchen', statuses: 'accepted,in_kitchen', active: true },
  { key: 'ready', labelKey: 'ordersQueueReady', statuses: 'ready,ready_for_pickup,ready_for_delivery', active: true },
  { key: 'delivery', labelKey: 'ordersQueueDelivery', statuses: 'out_for_delivery', active: true },
  { key: 'scheduled', labelKey: 'scheduled', isScheduled: true, statuses: 'scheduled,pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery' },
  { key: 'completed', labelKey: 'completed', statuses: 'served,received,picked_up,delivered' },
  { key: 'canceled', labelKey: 'canceled', statuses: 'rejected,cancelled' },
  { key: 'all', labelKey: 'all', active: undefined },
];

const ARCHIVE_TABS = TABS.filter((tab) => ['scheduled', 'completed', 'canceled', 'all'].includes(tab.key));

const PAGE_SIZE = 25;

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function primaryActionLabel(action: PrimaryAction, order: Order, t: (key: string) => string): string {
  if (action === 'markReady' && order.order_type === 'delivery') return t('markReadyForDelivery');
  const keys: Record<PrimaryAction, string> = {
    accept: 'accept',
    sendToKitchen: 'sendToKitchen',
    markReady: 'markReady',
    markServed: 'markServed',
    markOutForDelivery: 'markOutForDelivery',
    markDelivered: 'markDelivered',
  };
  return t(keys[action]);
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { money } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission, isOwner, roleName } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  // Manual status correction is a management action — owner or manager only,
  // matching the server route (RequireRestaurantRoles owner, manager).
  const canOverride = isOwner || roleName === 'Manager';
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const isMobile = useIsMobile();
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
  const [activeTab, setActiveTab] = useState('active');
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  // The shared picker owns both calendar ranges and série ranges. `dateField`
  // only tells the API which order date the selected window applies to.
  const [dateField, setDateField] = useState<DateBasis>('created');
  const [defaultDateField, setDefaultDateField] = useState<DateBasis>('created');
  const [filtersReady, setFiltersReady] = useState(false);
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const serieList = useOrderSeries(rid);
  const [page, setPage] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Partial<Record<OperationsQueueKey, number>>>({});
  const [queueCountsLoading, setQueueCountsLoading] = useState(true);
  const [density, setDensityState] = useState<'comfortable' | 'compact'>('comfortable');
  const [, setClockTick] = useState(0);

  const orders = rawOrders;
  const setOrders = setRawOrders;

  // Irreversible actions ask first. Native confirm() was unstyleable, took
  // its direction from the OS rather than the app (wrong in Hebrew), and gave
  // the destructive and the harmless button identical weight.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [pendingClose, setPendingClose] = useState<{ id: number; type: string } | null>(null);

  // Desktop first opens a lightweight inspection panel; the canonical detail
  // takeover remains available for editing and is used directly on mobile.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;
  const detailOrder = orders.find((o) => o.id === detailId) ?? null;

  // First day of the week + workdays for the date picker. Loaded with the
  // restaurant; both default to "everything on" until then so the picker
  // never renders muted cells based on a stale guess.
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  // Minimal restaurant identity for printed tickets (name/address/phone header).
  const [restaurantInfo, setRestaurantInfo] = useState<PrintTicketRestaurant>({});
  // The restaurant's own language — fallback for the customer-facing WhatsApp
  // recap when an order carries no customer_locale.
  const [restaurantLocale, setRestaurantLocale] = useState<string>('');
  // The restaurant-wide orders-table column layout rides along on the record
  // this page already loads, so choosing columns costs no extra request.
  const [tableConfig, setTableConfig] = useState<OrdersTableConfig | null>(null);
  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid)
      .then((r) => {
        setWeekStartDay(clampWeekStartDay(r.week_start_day));
        setWorkdays(getEffectiveWorkdays(r));
        setRestaurantInfo({ name: r.name, address: r.address, phone: r.phone });
        setRestaurantLocale(r.default_locale || '');
        setTableConfig(r.orders_table_config ?? null);
      })
      .catch(() => {});
  }, [rid]);

  // Resolve the user's personal basis over the restaurant default before the
  // first list request, avoiding a misleading flash of creation-date orders.
  useEffect(() => {
    if (!rid) return;
    let active = true;
    setFiltersReady(false);
    getDisplayPreferences(rid)
      .then((preferences) => {
        if (!active) return;
        setDateField(preferences.orders_date_basis);
        setDefaultDateField(preferences.orders_date_basis);
        setPreferenceSaveFailed(false);
      })
      .catch(() => {
        if (active) setPreferenceSaveFailed(true);
      })
      .finally(() => {
        if (active) setFiltersReady(true);
      });
    return () => { active = false; };
  }, [rid]);

  // Which columns the table shows, and in what order. Shared by every staff
  // account of this restaurant; editing it is a settings change.
  const columns = useOrdersTableConfig(rid, tableConfig, hasAnyPermission('settings.edit'));

  // Maps custom checkout-field ids → their human label so order custom_fields
  // (e.g. { code_immeuble: "A12" }) render as "Code Immeuble", not the raw id.
  const [customFieldLabels, setCustomFieldLabels] = useState<Record<string, string>>({});
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);
  useEffect(() => {
    if (!rid) return;
    getWebsiteConfig(rid)
      .then((cfg) => {
        setCustomFieldLabels(buildCustomFieldLabels(cfg.checkout_config));
        setCheckoutConfig(cfg.checkout_config ?? null);
      })
      .catch(() => {});
  }, [rid]);

  // Online-ordering pause — same kill switch as Settings → Commandes &
  // disponibilité, surfaced here so staff can pause mid-service without leaving
  // the order board.
  const [paused, setPaused] = useState(false);
  // Cash is not offered at all on an online-payment-only restaurant, in the
  // staff dialogs as much as on the guest checkout.
  const [allowCash, setAllowCash] = useState(true);
  const [pauseSaving, setPauseSaving] = useState(false);
  useEffect(() => {
    if (!rid) return;
    getRestaurantSettings(rid)
      .then((s) => {
        setPaused(s.orders_paused ?? false);
        setAllowCash(!(s.online_payment_only ?? false));
      })
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

  useEffect(() => {
    const saved = localStorage.getItem(`foody.orders.density.${rid}`);
    if (saved === 'compact' || saved === 'comfortable') setDensityState(saved);
  }, [rid]);

  const setDensity = (next: 'comfortable' | 'compact') => {
    setDensityState(next);
    try {
      localStorage.setItem(`foody.orders.density.${rid}`, next);
    } catch {
      // The preference is optional; private browsing must not block the board.
    }
  };

  // Stage-age labels update even when the restaurant is quiet and no websocket
  // event causes a render.
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Search as staff type, with enough delay to avoid sending a request per
  // keystroke. Enter still submits immediately below.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (searchSubmitted !== next) {
        setPage(0);
        setSearchSubmitted(next);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchSubmitted]);

  // ─── Fetch ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (!filtersReady) return;
    if (showLoading) setLoading(true);
    const tab = TABS.find((t) => t.key === activeTab)!;
    const params: ListOrdersParams = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_by: 'created_at',
      sort_dir: 'desc',
    };
    if (dateField === 'serie') {
      params.from = isoDate(dateRange.from);
      params.to = isoDate(dateRange.to);
      params.date_field = 'serie';
    } else {
      params.from = isoDate(dateRange.from);
      params.to = isoDate(dateRange.to);
    }
    if (tab.statuses) params.status = tab.statuses;
    else if (tab.active) params.active = true;
    if (tab.isScheduled) params.is_scheduled = true;
    if (searchSubmitted) params.q = searchSubmitted;
    if (typeFilter) params.type = typeFilter;
    if (paymentFilter) params.payment_status = paymentFilter;

    try {
      const result = await listOrders(rid, params);
      setOrders(result.orders);
      setTotal(result.total);
      setLastUpdated(new Date());
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [rid, activeTab, searchSubmitted, typeFilter, paymentFilter, dateRange, dateField, page, setOrders, filtersReady]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const fetchQueueCounts = useCallback(async () => {
    if (!filtersReady) return;
    setQueueCountsLoading(true);
    const base: ListOrdersParams = {
      from: isoDate(dateRange.from),
      to: isoDate(dateRange.to),
      limit: 1,
      offset: 0,
    };
    if (dateField === 'serie') base.date_field = 'serie';
    if (typeFilter) base.type = typeFilter;
    if (paymentFilter) base.payment_status = paymentFilter;

    try {
      const stageQueues = OPERATIONS_QUEUES.filter((queue) => queue.key !== 'active');
      const results = await Promise.all(
        stageQueues.map((queue) => listOrders(rid, { ...base, status: queue.statuses })),
      );
      const next: Partial<Record<OperationsQueueKey, number>> = {};
      let active = 0;
      stageQueues.forEach((queue, index) => {
        next[queue.key] = results[index].total;
        active += results[index].total;
      });
      next.active = active;
      setQueueCounts(next);
    } catch {
      // Keep the last trustworthy counts. The live connection indicator above
      // already communicates connectivity without replacing counts with false 0s.
    } finally {
      setQueueCountsLoading(false);
    }
  }, [rid, dateRange, dateField, typeFilter, paymentFilter, filtersReady]);

  useEffect(() => { void fetchQueueCounts(); }, [fetchQueueCounts]);

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
      setDetailId((prev) => (prev === wsOrder.id ? null : prev));
      void fetchQueueCounts();
      return;
    }

    if (type === 'order.created') {
      playSound();
      notify(t('newOrder'), {
        body: `${t('orderNumber').replace('{id}', String(wsOrder.id))} · ${localizeOrderType(wsOrder.order_type, t)}`,
        tag: `order-${wsOrder.id}`,
      });
    }

    // In série mode a newly created order may belong to another fulfillment
    // day, and an update may have moved an existing row out of this série.
    // Re-read the filtered page instead of blindly upserting the websocket row.
    if (dateField === 'serie') {
      void Promise.allSettled([fetchOrders(false), fetchQueueCounts()]);
      return;
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
    void fetchQueueCounts();
  }, [lastEvent, isProcessing, playSound, notify, t, dateField, fetchOrders, fetchQueueCounts, setOrders]);

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
      // The authoritative refresh below restores the row after a failed
      // optimistic transition.
    } finally {
      removeProcessingGuard(orderId);
      await Promise.allSettled([fetchOrders(false), fetchQueueCounts()]);
      setActionLoading(null);
    }
  };

  const handleAccept = async (orderId: number): Promise<AcceptOrderResult | undefined> => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'accepted' } : o)));
    try {
      const result = await acceptOrder(rid, orderId);
      // The configured one-click flow may have skipped straight to in_kitchen
      // and pinned production. Apply the authoritative response immediately;
      // the WebSocket broadcast remains the cross-screen sync mechanism.
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...result.order } : o)));
      return result;
    } catch {
      return undefined;
    } finally {
      removeProcessingGuard(orderId);
      await Promise.allSettled([fetchOrders(false), fetchQueueCounts()]);
      setActionLoading(null);
    }
  };
  // Cancellation now requires a reason, collected in CancelOrderDialog.
  const handleReject = (orderId: number) => setCancelOrderId(orderId);
  const handleCancelConfirm = (reasonCode: string, note: string) => {
    if (cancelOrderId == null) return;
    return runAction(cancelOrderId, () => rejectOrder(rid, cancelOrderId, reasonCode, note));
  };
  // Manual status correction (owner/manager) — target status chosen in
  // OverrideStatusDialog. Silent for the customer; server audit-logs it.
  const handleOverride = (orderId: number) => setOverrideOrderId(orderId);
  const handleOverrideConfirm = (status: OrderStatus, note: string) => {
    if (overrideOrderId == null) return;
    return runAction(overrideOrderId, () => overrideOrderStatus(rid, overrideOrderId, status, note), status);
  };
  // Manual payment correction (owner/manager, cash/manual orders only) — target
  // payment status chosen in OverridePaymentDialog. Silent for the customer;
  // server audit-logs it and rejects provider-settled orders. Applies the
  // returned order directly (runAction's optimistic path only tracks `status`).
  const handleCorrectPayment = (orderId: number) => setPaymentOverrideId(orderId);
  const handleCorrectPaymentConfirm = async (paymentStatus: PaymentStatus, note: string) => {
    if (paymentOverrideId == null) return;
    const id = paymentOverrideId;
    setActionLoading(id);
    addProcessingGuard(id);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status: paymentStatus } : o)));
    try {
      const updated = await overrideOrderPaymentStatus(rid, id, paymentStatus, note);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch {
      await fetchOrders();
    } finally {
      setActionLoading(null);
      removeProcessingGuard(id);
    }
  };
  // Correct HOW a settled order was paid (owner/manager, manual settlements
  // only). Distinct from the status correction above: nothing about whether the
  // order is paid changes, only the record of the method, plus an optional
  // reference for a card charged outside Foody. Server audit-logs it.
  const handleCorrectPaymentMethod = (orderId: number) => setPaymentMethodOrderId(orderId);
  const handleCorrectPaymentMethodConfirm = async (
    method: ManualPaymentMethod,
    reference: string,
    note: string,
  ) => {
    if (paymentMethodOrderId == null) return;
    const id = paymentMethodOrderId;
    setActionLoading(id);
    addProcessingGuard(id);
    try {
      const updated = await correctOrderPaymentMethod(rid, id, method, reference, note);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } catch {
      await fetchOrders();
    } finally {
      setActionLoading(null);
      removeProcessingGuard(id);
    }
  };
  // "Ajouter au plan de production" toggle from the order overflow menu. Pins
  // (force=true) or unpins the order onto the production sheet, overriding the
  // scheduled/paid gates. Optimistic; refetches on failure to resync.
  // Pinning a CANCELLED order restores it server-side, so the optimistic patch
  // (force_production only) is not the whole change: merge the order the server
  // sends back, which carries the new status and the cleared cancellation
  // reason. Without it the drawer keeps showing "Annulée" until a refetch.
  const handleToggleForceProduction = async (orderId: number, force: boolean) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, force_production: force } : o)));
    try {
      const updated = await setOrderForceProduction(rid, orderId, force);
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
      }
    } catch {
      await fetchOrders();
    }
  };
  // Correct a misspelled customer name / delivery address from the order screen.
  // The name is canonical (keyed by phone), so refetch afterwards to pick up the
  // correction on the customer's other orders in the list too, not just this one.
  const handleEditCustomerConfirm = async (input: OrderCustomerDetailsInput) => {
    if (editCustomerId == null) return;
    const id = editCustomerId;
    const updated = await updateOrderCustomerDetails(rid, id, input);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    await fetchOrders();
  };
  // Hard delete — permanently removes the order. Owner/admin only (also enforced
  // server-side). Guarded by an explicit, irreversible-action warning.
  const handleDelete = async (orderId: number) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    try {
      await deleteOrder(rid, orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setSelectedId((prev) => (prev === orderId ? null : prev));
      setDetailId((prev) => (prev === orderId ? null : prev));
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
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [overrideOrderId, setOverrideOrderId] = useState<number | null>(null);
  const [paymentOverrideId, setPaymentOverrideId] = useState<number | null>(null);
  const [paymentMethodOrderId, setPaymentMethodOrderId] = useState<number | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const handleTakePayment = (method: PaymentMethod, reference?: string) => {
    if (!detailOrder) return Promise.resolve();
    const orderId = detailOrder.id;
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    // Optimistic
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, payment_status: 'paid' } : o,
    ));
    return updateOrderPaymentStatus(rid, orderId, 'paid', method, reference)
      .then((updated) => {
        setOrders((prev) => prev.map((o) =>
          o.id === orderId ? { ...o, ...updated } : o,
        ));
      })
      .catch(async () => { await fetchOrders(); })
      .finally(async () => {
        removeProcessingGuard(orderId);
        await Promise.allSettled([fetchOrders(false), fetchQueueCounts()]);
        setActionLoading(null);
      });
  };

  const handleCloseOrder = (orderId: number, orderType: string) => {
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
    setDetailId(null);
  };

  // ─── Tab / search ─────────────────────────────────────────────────

  const switchTab = (key: string) => {
    setActiveTab(key);
    setPage(0);
    setSelectedId(null);
    setDetailId(null);
  };

  const handleSearch = () => {
    setSearchSubmitted(search.trim());
    setPage(0);
  };

  const openOrder = (orderId: number) => {
    if (isMobile) {
      setSelectedId(null);
      setDetailId(orderId);
    } else {
      setSelectedId((current) => current === orderId ? null : orderId);
    }
  };

  const runPrimaryAction = (order: Order, action: PrimaryAction) => {
    switch (action) {
      case 'accept':
        void handleAccept(order.id);
        break;
      case 'sendToKitchen':
        void handleSendToKitchen(order.id);
        break;
      case 'markReady':
        void handleMarkReady(order.id);
        break;
      case 'markServed':
        void handleMarkServed(order.id);
        break;
      case 'markOutForDelivery':
        void handleOutForDelivery(order.id);
        break;
      case 'markDelivered':
        void handleMarkDelivered(order.id);
        break;
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const today = isoDate(new Date());
  const hasDateFilter =
    dateField !== defaultDateField || isoDate(dateRange.from) !== today || isoDate(dateRange.to) !== today;
  const activeFilterCount = [!!typeFilter, !!paymentFilter, hasDateFilter].filter(Boolean).length;
  const activeQueueKey = OPERATIONS_QUEUES.some((queue) => queue.key === activeTab)
    ? activeTab as OperationsQueueKey
    : null;
  const visibleStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const visibleEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const resetFilters = () => {
    setSearch('');
    setSearchSubmitted('');
    setTypeFilter('');
    setPaymentFilter('');
    setDateRange(defaultDateRange());
    setDateField(defaultDateField);
    setPage(0);
  };

  const changeDateField = useCallback((nextBasis: DateBasis) => {
    setDateField(nextBasis);
    setDefaultDateField(nextBasis);
    setPage(0);
    setPreferenceSaveFailed(false);
    void updateDisplayPreferences(rid, { orders_date_basis: nextBasis })
      .catch(() => setPreferenceSaveFailed(true));
  }, [rid]);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-var(--topbar-h)-64px)]">
      <div className="min-w-0 space-y-[var(--s-4)]">
        <PageHead
          title={t('orders')}
          className="mb-0 items-center"
          desc={(
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-[var(--success-500)]'
                    : wsStatus === 'connecting'
                      ? 'bg-[var(--warning-500)]'
                      : 'bg-[var(--danger-500)]'
                }`}
                aria-hidden
              />
              <span>
                {wsStatus === 'connected' ? t('live') : wsStatus === 'connecting' ? t('connecting') : t('offline')}
              </span>
              {lastUpdated && (
                <>
                  <span className="opacity-40">·</span>
                  <span>
                    {t('ordersUpdatedAt').replace(
                      '{time}',
                      lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    )}
                  </span>
                </>
              )}
            </span>
          )}
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
              <div className="flex items-center overflow-hidden rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)]">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="md"
                      className="rounded-none border-e border-[var(--line)]"
                      disabled={pauseSaving}
                    >
                      {paused ? <WifiOffIcon /> : <WifiIcon />}
                      <span className="hidden sm:inline">{t('ordersOnline')}</span>
                      <span className={paused ? 'text-[var(--danger-500)]' : 'text-[var(--success-600)]'}>
                        {paused ? t('ordersPausedShort') : t('ordersAccepting')}
                      </span>
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>{t('ordersOnline')}</DropdownMenuLabel>
                    <DropdownMenuItem disabled={!canManage || !paused} onSelect={() => void togglePause(false)}>
                      <PlayIcon />
                      <span>
                        <span className="block">{t('ordersAccepting')}</span>
                        <span className="block text-fs-xs text-[var(--fg-muted)]">{t('ordersAcceptingDesc')}</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canManage || paused} onSelect={() => void togglePause(true)}>
                      <PauseIcon />
                      <span>
                        <span className="block">{t('pauseOrders')}</span>
                        <span className="block text-fs-xs text-[var(--fg-muted)]">{t('pauseOnlineOrdersDesc')}</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={soundOn}
                      onCheckedChange={() => {
                        const next = toggleSound();
                        setSoundOn(next);
                      }}
                    >
                      <Volume2Icon /> {t('ordersSound')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuItem onSelect={requestPermission}>
                      <BellIcon />
                      {permission === 'granted' ? t('notificationsEnabled') : t('enableNotifications')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="md"
                  icon
                  className="rounded-none"
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
                  className="rounded-none border-s border-[var(--line)]"
                  onClick={requestPermission}
                  aria-label={permission === 'granted' ? t('notificationsEnabled') : t('enableNotifications')}
                  title={permission === 'granted' ? t('notificationsEnabled') : t('enableNotifications')}
                >
                  {permission === 'granted' ? <BellIcon /> : <BellOffIcon />}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  icon
                  className="rounded-none border-s border-[var(--line)]"
                  onClick={() => void Promise.allSettled([fetchOrders(), fetchQueueCounts()])}
                  aria-label={t('refresh')}
                  title={t('refresh')}
                >
                  <RefreshCwIcon />
                </Button>
              </div>
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

        <section aria-label={t('ordersLiveQueues')}>
          <OrdersOperationsRail
            activeKey={activeQueueKey}
            counts={queueCounts}
            loading={queueCountsLoading}
            onSelect={switchTab}
          />
        </section>

        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[var(--line)]">
          <HorizontalScrollRail activeKey={activeTab} edgeFlush>
            <div className="inline-flex items-center gap-5 pe-4">
              <span className="py-2.5 text-fs-xs font-medium text-[var(--fg-subtle)]">
                {t('ordersHistory')}
              </span>
              {ARCHIVE_TABS.map((tab) => {
                const selected = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => switchTab(tab.key)}
                    aria-pressed={selected}
                    data-rail-active={selected ? '' : undefined}
                    className={`relative py-2.5 text-fs-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:shadow-ring ${
                      selected
                        ? 'text-[var(--fg)] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[var(--brand-500)]'
                        : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {tab.key === 'all' ? t('allOrders') : t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </HorizontalScrollRail>
          <span className="hidden shrink-0 text-fs-xs text-[var(--fg-muted)] md:block">
            {t('ordersShowingCompact')
              .replace('{start}', String(visibleStart))
              .replace('{end}', String(visibleEnd))
              .replace('{total}', String(total))}
          </span>
        </div>

        {/* The controls stick below the global top bar; the order rows scroll
            independently on desktop so queue state never disappears. */}
        <div className="sticky top-[var(--topbar-h)] z-10 -mx-1 flex flex-wrap items-center gap-2 bg-[var(--bg)] px-1 py-2">
          <div className="relative w-full md:w-[300px]">
            <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <input
              type="search"
              placeholder={t('ordersSearchPlaceholder')}
              aria-label={t('ordersSearchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
                if (e.key === 'Escape') setSearch('');
              }}
              className="input h-11 w-full ps-10 pe-10 text-fs-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-ring"
                aria-label={t('ordersClearSearch')}
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>

          <DateRangePicker
            value={dateRange}
            onChange={(range) => { setDateRange(range); setPage(0); }}
            weekStartDay={weekStartDay}
            workdays={workdays}
            restaurantId={rid}
            basis={dateField}
            onBasisChange={changeDateField}
            series={serieList}
          />

          <FilterDropdown
            label={t('type')}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(0); }}
            options={[
              { value: '', label: t('ordersAllTypes') },
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
              { value: '', label: t('ordersAllPayments') },
              { value: 'paid', label: t('paid') },
              { value: 'pending', label: t('pending') },
              { value: 'unpaid', label: t('unpaid') },
              { value: 'refunded', label: t('refunded') },
            ]}
          />

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="md" onClick={resetFilters}>
              <ListFilterIcon />
              {t('ordersResetFiltersWithCount').replace('{n}', String(activeFilterCount))}
            </Button>
          )}

          {preferenceSaveFailed && (
            <span className="text-fs-xs text-[var(--warning-600)]" role="status">
              {t('displayPreferenceSaveFailed')}
            </span>
          )}

          <div className="ms-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md">
                  <SlidersHorizontalIcon />
                  {t('ordersDisplay')}
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('ordersDensity')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={density} onValueChange={(value) => setDensity(value as 'comfortable' | 'compact')}>
                  <DropdownMenuRadioItem value="comfortable">
                    <Rows3Icon /> {t('ordersDensityComfortable')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">
                    <AlignJustifyIcon /> {t('ordersDensityCompact')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {hasAnyPermission('settings.edit') && <OrderColumnPicker columns={columns} />}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <OrdersTableSkeleton
            columns={columns.visible.length + (canManage ? 1 : 0)}
            density={density}
            label={t('loading')}
          />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-r-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 py-16 text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg-muted)]">
              <ClipboardListIcon className="size-5" />
            </span>
            <h2 className="text-fs-lg font-semibold text-fg-primary">
              {activeQueueKey && !searchSubmitted && activeFilterCount === 0
                ? t('ordersNoActiveTitle')
                : t('noMatchFound')}
            </h2>
            <p className="mt-1 max-w-md text-fs-sm text-fg-secondary">
              {activeQueueKey && !searchSubmitted && activeFilterCount === 0
                ? t('ordersNoActiveDesc')
                : t('ordersNoResultsDesc')}
            </p>
            {(searchSubmitted || activeFilterCount > 0) && (
              <Button variant="secondary" size="md" className="mt-5" onClick={resetFilters}>
                {t('ordersResetFilters')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <DataTable
              className="md:max-h-[calc(100vh-var(--topbar-h)-350px)] md:overflow-auto"
              data-density={density}
            >
              <DataTableHead className="sticky top-0 z-[2]">
                {columns.visible.map((col) => (
                  <DataTableHeadCell
                    key={col.key}
                    align={col.align}
                    className={`normal-case tracking-normal bg-neutral-50 dark:bg-[#0a0a0a] ${density === 'compact' ? 'px-4 py-2.5' : ''}`}
                  >
                    {t(col.labelKey)}
                  </DataTableHeadCell>
                ))}
                {canManage && (
                  <DataTableHeadCell
                    align="right"
                    className={`sticky end-0 min-w-[150px] normal-case tracking-normal bg-neutral-50 dark:bg-[#0a0a0a] ${density === 'compact' ? 'px-4 py-2.5' : ''}`}
                  >
                    {t('ordersNextAction')}
                  </DataTableHeadCell>
                )}
              </DataTableHead>
              <DataTableBody>
                {orders.map((order, index) => {
                  const timing = getOrderTiming(order);
                  const capabilities = deriveOrderCapabilities(order, { canManage });
                  const selected = selectedId === order.id;
                  return (
                    <DataTableRow
                      key={order.id}
                      index={index}
                      striped={false}
                      tabIndex={0}
                      aria-label={t('ordersOpenOrder').replace('{id}', String(order.id))}
                      aria-selected={selected}
                      onClick={() => openOrder(order.id)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openOrder(order.id);
                        }
                      }}
                      className={`group cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand-500)] ${
                        selected ? 'bg-[var(--brand-50)]' : ''
                      }`}
                    >
                      {columns.visible.map((col, columnIndex) => (
                        <DataTableCell
                          key={col.key}
                          align={col.align}
                          className={`${col.cellClassName ?? ''} ${density === 'compact' ? 'px-4 py-2.5' : ''} ${
                            columnIndex === 0 && timing.overdue
                              ? 'relative before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-[var(--danger-500)]'
                              : ''
                          }`}
                          mobilePrimary={col.isMobilePrimary}
                          mobileLabel={col.isMobilePrimary ? undefined : t(col.labelKey)}
                        >
                          {col.render(order, t, money)}
                        </DataTableCell>
                      ))}
                      {canManage && (
                        <DataTableCell
                          align="right"
                          mobileLabel={t('ordersNextAction')}
                          className={`md:sticky md:end-0 ${density === 'compact' ? 'px-4 py-2.5' : ''} ${
                            selected ? 'bg-[var(--brand-50)]' : 'bg-[var(--surface)] group-hover:bg-orange-50/50 dark:group-hover:bg-orange-900/20'
                          }`}
                        >
                          {capabilities.primary ? (
                            <Button
                              variant={capabilities.primary === 'accept' ? 'primary' : 'secondary'}
                              size="sm"
                              disabled={actionLoading === order.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (capabilities.primary === 'accept') {
                                  setSelectedId(null);
                                  setDetailId(order.id);
                                } else {
                                  runPrimaryAction(order, capabilities.primary!);
                                }
                              }}
                            >
                              {capabilities.primary === 'accept'
                                ? t('ordersReview')
                                : primaryActionLabel(capabilities.primary, order, t)}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openOrder(order.id);
                              }}
                            >
                              {t('ordersView')}
                            </Button>
                          )}
                        </DataTableCell>
                      )}
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
                <span className="text-xs text-fg-secondary">
                  {t('showing').replace('{start}', String(visibleStart)).replace('{end}', String(visibleEnd)).replace('{total}', String(total))}
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

      <OrderQuickView
        order={selectedOrder}
        canManage={canManage}
        loading={selectedOrder != null && actionLoading === selectedOrder.id}
        onClose={() => setSelectedId(null)}
        onOpenDetails={() => {
          if (!selectedOrder) return;
          setDetailId(selectedOrder.id);
          setSelectedId(null);
        }}
        onPrimary={(action) => {
          if (selectedOrder) runPrimaryAction(selectedOrder, action);
        }}
      />

      {/* Canonical full detail for edits, history and complex actions. */}
      <OrderDetailModal
        order={detailOrder}
        canManage={canManage}
        canDelete={isOwner}
        canOverride={canOverride}
        isLoading={detailOrder != null && actionLoading === detailOrder.id}
        onClose={() => setDetailId(null)}
        onAccept={() => {
          if (!detailOrder) return;
          return handleAccept(detailOrder.id);
        }}
        onReject={() => detailOrder && handleReject(detailOrder.id)}
        onDelete={() => detailOrder && setPendingDelete(detailOrder.id)}
        onOverride={() => detailOrder && handleOverride(detailOrder.id)}
        onCorrectPayment={() => detailOrder && handleCorrectPayment(detailOrder.id)}
        onCorrectPaymentMethod={() => detailOrder && handleCorrectPaymentMethod(detailOrder.id)}
        onSendToKitchen={() => detailOrder && handleSendToKitchen(detailOrder.id)}
        onMarkReady={() => detailOrder && handleMarkReady(detailOrder.id)}
        onMarkServed={() => detailOrder && handleMarkServed(detailOrder.id)}
        onOutForDelivery={() => detailOrder && handleOutForDelivery(detailOrder.id)}
        onMarkDelivered={() => detailOrder && handleMarkDelivered(detailOrder.id)}
        onTakePayment={() => setPaymentOpen(true)}
        onCloseOrder={() =>
          detailOrder && setPendingClose({ id: detailOrder.id, type: detailOrder.order_type })
        }
        onEdit={() => setEditOpen(true)}
        onConfirmWeights={() => setWeightsOpen(true)}
        onEditCustomer={() => detailOrder && setEditCustomerId(detailOrder.id)}
        onToggleForceProduction={() => detailOrder && handleToggleForceProduction(detailOrder.id, !detailOrder.force_production)}
        restaurantInfo={restaurantInfo}
        restaurantDefaultLocale={restaurantLocale}
        customFieldLabels={customFieldLabels}
        checkoutConfig={checkoutConfig}
      />

      {/* Edit order items */}
      <EditOrderDrawer
        open={editOpen}
        order={detailOrder}
        restaurantId={rid}
        onClose={() => setEditOpen(false)}
        onSaved={fetchOrders}
      />

      {/* Take Payment dialog */}
      <TakePaymentDialog
        allowCash={allowCash}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        totalAmount={detailOrder?.total_amount ?? 0}
        onConfirm={handleTakePayment}
        discountAmount={detailOrder?.discount_amount}
        discountLabel={detailOrder?.discount?.code}
      />

      {/* Confirm weights — by-weight orders on a card hold */}
      <ConfirmWeightsModal
        open={weightsOpen}
        onOpenChange={setWeightsOpen}
        order={detailOrder}
        onConfirmed={fetchOrders}
      />

      {/* Cancel order — reason required */}
      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
        title={t('deleteOrder')}
        description={t('deleteOrderWarning')}
        confirmLabel={t('deleteOrder')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => {
          const id = pendingDelete;
          setPendingDelete(null);
          if (id != null) void handleDelete(id);
        }}
      />

      <ConfirmDialog
        open={pendingClose != null}
        onOpenChange={(v) => { if (!v) setPendingClose(null); }}
        title={t('closeOrder')}
        description={t('closeOrderConfirm')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          const p = pendingClose;
          setPendingClose(null);
          if (p) handleCloseOrder(p.id, p.type);
        }}
      />

      <CancelOrderDialog
        open={cancelOrderId !== null}
        onOpenChange={(v) => { if (!v) setCancelOrderId(null); }}
        onConfirm={handleCancelConfirm}
      />

      {/* Correct order status — owner/manager, silent for the customer */}
      <OverrideStatusDialog
        open={overrideOrderId !== null}
        orderType={orders.find((o) => o.id === overrideOrderId)?.order_type}
        currentStatus={orders.find((o) => o.id === overrideOrderId)?.status}
        onOpenChange={(v) => { if (!v) setOverrideOrderId(null); }}
        onConfirm={handleOverrideConfirm}
      />

      {/* Correct payment status — owner/manager, cash/manual orders, silent */}
      <OverridePaymentDialog
        open={paymentOverrideId !== null}
        currentPaymentStatus={orders.find((o) => o.id === paymentOverrideId)?.payment_status}
        onOpenChange={(v) => { if (!v) setPaymentOverrideId(null); }}
        onConfirm={handleCorrectPaymentConfirm}
      />

      {/* Correct HOW a settled order was paid — owner/manager, manual
          settlements, status untouched */}
      {(() => {
        const target = orders.find((o) => o.id === paymentMethodOrderId);
        return (
          <CorrectPaymentMethodDialog
            allowCash={allowCash}
            open={paymentMethodOrderId !== null}
            currentMethod={target ? settledPaymentMethod(target) : undefined}
            currentReference={target ? paymentReference(target) : undefined}
            onOpenChange={(v) => { if (!v) setPaymentMethodOrderId(null); }}
            onConfirm={handleCorrectPaymentMethodConfirm}
          />
        );
      })()}

      {/* Fix a misspelled customer name / delivery address */}
      <EditCustomerDialog
        open={editCustomerId !== null}
        order={orders.find((o) => o.id === editCustomerId) ?? null}
        onOpenChange={(v) => { if (!v) setEditCustomerId(null); }}
        onConfirm={handleEditCustomerConfirm}
      />
    </div>
  );
}

function OrdersTableSkeleton({
  columns,
  density,
  label,
}: {
  columns: number;
  density: 'comfortable' | 'compact';
  label: string;
}) {
  return (
    <DataTable aria-busy="true" aria-label={label}>
      <DataTableHead>
        {Array.from({ length: columns }).map((_, index) => (
          <DataTableHeadCell key={index} className={density === 'compact' ? 'px-4 py-2.5' : ''}>
            <Skeleton className="h-3 w-16" />
          </DataTableHeadCell>
        ))}
      </DataTableHead>
      <DataTableBody>
        {Array.from({ length: 7 }).map((_, row) => (
          <DataTableRow key={row} striped={false}>
            {Array.from({ length: columns }).map((__, column) => (
              <DataTableCell key={column} className={density === 'compact' ? 'px-4 py-2.5' : ''}>
                <Skeleton className={`h-4 ${column === 1 ? 'w-32' : column === columns - 1 ? 'w-24' : 'w-16'}`} />
              </DataTableCell>
            ))}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const displayLabel = options.find((o) => o.value === value)?.label ?? 'All';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="md">
          <ListFilterIcon />
          {value ? (
            <>
              <span className="text-[var(--fg-muted)]">{label}</span>
              <span>{displayLabel}</span>
            </>
          ) : displayLabel}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value || 'all'} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
