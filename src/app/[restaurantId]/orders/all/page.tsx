'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  listOrders, getOrder, acceptOrder, rejectOrder, deleteOrder, updateOrderStatus, overrideOrderStatus,
  updateOrderPaymentStatus, overrideOrderPaymentStatus, correctOrderPaymentMethod,
  updateOrderCustomerDetails, reactivateOrder,
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
import { EditOrderDrawer } from '@/components/orders/EditOrderDrawer';
import { OrderDetailModal } from '@/components/orders/detail/OrderDetailModal';
import { localizeOrderType } from '@/lib/orders/status-presentation';
import { buildCustomFieldLabels } from '@/lib/orders/checkout-fields';
import { usePermissions } from '@/lib/permissions-context';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import { useOrderSeries } from '@/lib/series';
import {
  PauseIcon, PlayIcon,
  ClipboardListIcon, SearchIcon,
} from 'lucide-react';
import { Button, ConfirmDialog } from '@/components/ds';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListPagination } from '@/components/data-table';
import { ListChoiceFilter } from '@/components/data-table/ListFilters';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  OPERATIONS_QUEUES,
  type OperationsQueueKey,
} from '@/lib/orders/operations-board';
import styles from './orders.module.css';
import { defaultOrdersTabForBasis } from '@/lib/orders/orders-list-preferences';
import {
  PAYMENT_ATTENTION_FILTER,
  orderDetailPath,
  ordersListPath,
  parseOrderIdParam,
  parseOrdersPaymentAttentionQuery,
} from '@/lib/orders/routes';
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
  { key: 'all', labelKey: 'all' },
  { key: 'active', labelKey: 'ordersTabActive', statuses: 'pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery', active: true },
  { key: 'review', labelKey: 'ordersQueueReview', statuses: 'pending_review', active: true },
  { key: 'kitchen', labelKey: 'ordersQueueKitchen', statuses: 'accepted,in_kitchen', active: true },
  { key: 'ready', labelKey: 'ordersQueueReady', statuses: 'ready,ready_for_pickup,ready_for_delivery', active: true },
  { key: 'delivery', labelKey: 'ordersQueueDelivery', statuses: 'out_for_delivery', active: true },
  { key: 'scheduled', labelKey: 'ordersTabScheduled', isScheduled: true, statuses: 'scheduled,pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery' },
  { key: 'completed', labelKey: 'completed', statuses: 'served,received,picked_up,delivered' },
  { key: 'canceled', labelKey: 'canceled', statuses: 'rejected,cancelled' },
];


const PAGE_SIZE = 25;

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { money } = useCurrency();
  const { t, locale, direction } = useI18n();
  const { hasAnyPermission, isOwner, roleName } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  // Manual status correction is a management action — owner or manager only,
  // matching the server route (RequireRestaurantRoles owner, manager).
  const canOverride = isOwner || roleName === 'Manager';
  const params = useParams<{ restaurantId: string; orderId?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rid = Number(params.restaurantId);
  const detailId = parseOrderIdParam(params.orderId);
  const searchQuery = searchParams.toString();
  // Capture the entry preset for this page lifetime. Manual filter changes can
  // then remove or replace the URL query without the preference-loading effect
  // unexpectedly restoring the dashboard preset.
  const paymentAttentionScope = useRef(
    parseOrdersPaymentAttentionQuery(new URLSearchParams(searchQuery)),
  ).current;
  const { status: wsStatus, lastEvent, addProcessingGuard, removeProcessingGuard, isProcessing } = useWs();

  const { play: playSound, isEnabled: isSoundEnabled, toggle: toggleSound } = useOrderSound();
  const { notify } = useBrowserNotifications();
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
  const [paymentFilter, setPaymentFilter] = useState(
    paymentAttentionScope ? PAYMENT_ATTENTION_FILTER : '',
  );
  const [dateRange, setDateRange] = useState<DateRange>(() => paymentAttentionScope
    ? {
      from: new Date(`${paymentAttentionScope.from}T00:00:00`),
      to: new Date(`${paymentAttentionScope.to}T23:59:59.999`),
    }
    : defaultDateRange());
  // The shared picker owns both calendar ranges and série ranges. `dateField`
  // only tells the API which order date the selected window applies to.
  const [dateField, setDateField] = useState<DateBasis>(paymentAttentionScope?.dateField ?? 'created');
  const [defaultDateField, setDefaultDateField] = useState<DateBasis>('created');
  const [filtersReady, setFiltersReady] = useState(false);
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const serieList = useOrderSeries(rid);
  const [page, setPage] = useState(0);

  const orders = rawOrders;
  const setOrders = setRawOrders;

  // Irreversible actions ask first. Native confirm() was unstyleable, took
  // its direction from the OS rather than the app (wrong in Hebrew), and gave
  // the destructive and the harmless button identical weight.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [pendingClose, setPendingClose] = useState<{ id: number; type: string } | null>(null);

  // The URL is the source of truth for the open order. A direct link may point
  // outside today's filtered page, so load that order independently from the
  // table and keep the full API representation for the detail surface.
  const [directOrder, setDirectOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadFailed, setDetailLoadFailed] = useState(false);
  const detailOrder = directOrder?.id === detailId
    ? directOrder
    : orders.find((o) => o.id === detailId) ?? null;

  const closeOrderDetail = useCallback(() => {
    const listPath = ordersListPath(rid);
    router.replace(searchQuery ? `${listPath}?${searchQuery}` : listPath);
  }, [rid, router, searchQuery]);

  const openOrder = useCallback((orderId: number) => {
    const detailPath = orderDetailPath(rid, orderId);
    router.push(searchQuery ? `${detailPath}?${searchQuery}` : detailPath);
  }, [rid, router, searchQuery]);

  useEffect(() => {
    if (!rid || detailId == null) {
      setDirectOrder(null);
      setDetailLoading(false);
      setDetailLoadFailed(false);
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailLoadFailed(false);
    getOrder(rid, detailId)
      .then((order) => {
        if (active) setDirectOrder(order);
      })
      .catch(() => {
        if (!active) return;
        setDirectOrder(null);
        setDetailLoadFailed(true);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => { active = false; };
  }, [rid, detailId]);

  // First day of the week + workdays for the date picker. Loaded with the
  // restaurant; both default to "everything on" until then so the picker
  // never renders muted cells based on a stale guess.
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [workdays, setWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  // Restaurant identity used in customer-facing messages.
  const [restaurantName, setRestaurantName] = useState('');
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
        setRestaurantName(r.name);
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
        setDefaultDateField(preferences.orders_date_basis);
        if (paymentAttentionScope) {
          setDateField(paymentAttentionScope.dateField);
          setDateRange({
            from: new Date(`${paymentAttentionScope.from}T00:00:00`),
            to: new Date(`${paymentAttentionScope.to}T23:59:59.999`),
          });
          setPaymentFilter(PAYMENT_ATTENTION_FILTER);
          setActiveTab('active');
        } else {
          setDateField(preferences.orders_date_basis);
          setActiveTab(defaultOrdersTabForBasis(preferences.orders_date_basis));
        }
        setPage(0);
        setPreferenceSaveFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setDefaultDateField('created');
        if (paymentAttentionScope) {
          setDateField(paymentAttentionScope.dateField);
          setDateRange({
            from: new Date(`${paymentAttentionScope.from}T00:00:00`),
            to: new Date(`${paymentAttentionScope.to}T23:59:59.999`),
          });
          setPaymentFilter(PAYMENT_ATTENTION_FILTER);
          setActiveTab('active');
        } else {
          setDateField('created');
          setActiveTab(defaultOrdersTabForBasis('created'));
        }
        setPage(0);
        setPreferenceSaveFailed(true);
      })
      .finally(() => {
        if (active) setFiltersReady(true);
      });
    return () => { active = false; };
  }, [rid, paymentAttentionScope]);

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
  const [pauseConfirmationOpen, setPauseConfirmationOpen] = useState(false);
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
      sort_dir: paymentFilter === PAYMENT_ATTENTION_FILTER ? 'asc' : 'desc',
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
    // Dashboard payment attention also includes preorders before acceptance.
    if (activeTab === 'active' && paymentFilter === PAYMENT_ATTENTION_FILTER) {
      params.status = `scheduled,${tab.statuses}`;
    }
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

  // ─── WebSocket ────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;

    const { type, payload } = lastEvent;
    if (!type.startsWith('order.')) return;

    const wsOrder = payload as unknown as Order;
    if (!wsOrder?.id) return;
    if (isProcessing(wsOrder.id)) return;

    // balance_due is computed and omitted by the server once it returns to
    // zero. Materialize the missing field so a successful supplement clears a
    // stale "Partially paid" badge instead of preserving it through the merge.
    const liveOrder: Order = { ...wsOrder, balance_due: wsOrder.balance_due };

    if (detailId === wsOrder.id) {
      setDirectOrder((current) => current ? { ...current, ...liveOrder } : liveOrder);
    }

    // Owner deleted an order elsewhere — drop it from the list and close the
    // detail if it was open. Handled before the upsert below so it isn't re-added.
    if (type === 'order.deleted') {
      setOrders((prev) => prev.filter((o) => o.id !== wsOrder.id));
      if (detailId === wsOrder.id) closeOrderDetail();
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
      void fetchOrders(false);
      return;
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === wsOrder.id);
      if (type === 'order.created') {
        if (idx >= 0) return prev;
        return [liveOrder, ...prev];
      }
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...liveOrder };
      return next;
    });
  }, [lastEvent, isProcessing, playSound, notify, t, dateField, fetchOrders, setOrders, detailId, closeOrderDetail]);

  // ─── Actions ──────────────────────────────────────────────────────

  const runAction = async (orderId: number, action: () => Promise<void | Order>, optimisticStatus?: OrderStatus) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    if (optimisticStatus) {
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: optimisticStatus } : o));
      setDirectOrder((prev) => prev?.id === orderId ? { ...prev, status: optimisticStatus } : prev);
    }
    try {
      await action();
    } catch {
      // The authoritative refresh below restores the row after a failed
      // optimistic transition.
    } finally {
      removeProcessingGuard(orderId);
      await fetchOrders(false);
      setActionLoading(null);
    }
  };

  const handleAccept = async (orderId: number): Promise<AcceptOrderResult | undefined> => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'accepted' } : o)));
    setDirectOrder((prev) => prev?.id === orderId ? { ...prev, status: 'accepted' } : prev);
    try {
      const result = await acceptOrder(rid, orderId);
      // The configured one-click flow may have skipped straight to in_kitchen
      // and pinned production. Apply the authoritative response immediately;
      // the WebSocket broadcast remains the cross-screen sync mechanism.
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...result.order } : o)));
      setDirectOrder((prev) => prev?.id === orderId ? { ...prev, ...result.order } : prev);
      return result;
    } catch {
      return undefined;
    } finally {
      removeProcessingGuard(orderId);
      await fetchOrders(false);
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
      setDirectOrder((prev) => prev?.id === id ? { ...prev, ...updated } : prev);
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
      setDirectOrder((prev) => prev?.id === id ? { ...prev, ...updated } : prev);
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
        setDirectOrder((prev) => prev?.id === orderId ? { ...prev, ...updated } : prev);
      }
    } catch {
      await fetchOrders();
    }
  };
  const handleReactivate = async (orderId: number) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    try {
      const result = await reactivateOrder(rid, orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...result.order } : o)));
      setDirectOrder((prev) => prev?.id === orderId ? { ...prev, ...result.order } : prev);
      if (result.payment_url) {
        try {
          await navigator.clipboard.writeText(result.payment_url);
          alert(t('orderReactivatedSumitLinkCopied'));
        } catch {
          window.prompt(t('newPaymentLink'), result.payment_url);
        }
      } else if (result.payment_link_error) {
        alert(t('orderReactivatedLinkError'));
      }
    } catch {
      alert(t('orderReactivationFailed'));
      await fetchOrders();
    } finally {
      removeProcessingGuard(orderId);
      setActionLoading(null);
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
    setDirectOrder((prev) => prev?.id === id ? { ...prev, ...updated } : prev);
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
      if (detailId === orderId) closeOrderDetail();
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
    const selected = orders.find((o) => o.id === orderId)
      ?? (directOrder?.id === orderId ? directOrder : null);
    const isDelivery = selected?.order_type === 'delivery';
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

  const handleTakePayment = (method: PaymentMethod, reference?: string, amount?: number) => {
    if (!detailOrder) return Promise.resolve();
    const orderId = detailOrder.id;
    const due = detailOrder.balance_due ?? detailOrder.total_amount;
    const nextPaymentStatus: PaymentStatus = amount != null && amount < due - 0.01
      ? 'partially_paid'
      : 'paid';
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    // Optimistic
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, payment_status: nextPaymentStatus } : o,
    ));
    setDirectOrder((prev) => prev?.id === orderId
      ? { ...prev, payment_status: nextPaymentStatus }
      : prev);
    return updateOrderPaymentStatus(rid, orderId, 'paid', method, reference, amount)
      .then((updated) => {
        setOrders((prev) => prev.map((o) =>
          o.id === orderId ? { ...o, ...updated } : o,
        ));
        setDirectOrder((prev) => prev?.id === orderId ? { ...prev, ...updated } : prev);
      })
      .catch(async () => { await fetchOrders(); })
      .finally(async () => {
        removeProcessingGuard(orderId);
        await fetchOrders(false);
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
    closeOrderDetail();
  };

  // ─── Tab / search ─────────────────────────────────────────────────

  const switchTab = (key: string) => {
    setActiveTab(key);
    setPage(0);
    closeOrderDetail();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const today = isoDate(new Date());
  const hasDateFilter =
    dateField !== defaultDateField || isoDate(dateRange.from) !== today || isoDate(dateRange.to) !== today;
  const activeFilterCount = [!!typeFilter, !!paymentFilter, hasDateFilter].filter(Boolean).length;
  const activeQueueKey = OPERATIONS_QUEUES.some((queue) => queue.key === activeTab)
    ? activeTab as OperationsQueueKey
    : null;

  const resetFilters = () => {
    setSearch('');
    setSearchSubmitted('');
    setTypeFilter('');
    setPaymentFilter('');
    setDateRange(defaultDateRange());
    setDateField(defaultDateField);
    setPage(0);
    router.replace(ordersListPath(rid));
  };

  const changeDateField = useCallback((nextBasis: DateBasis) => {
    setDateField(nextBasis);
    setDefaultDateField(nextBasis);
    setActiveTab(defaultOrdersTabForBasis(nextBasis));
    setPage(0);
    closeOrderDetail();
    setPreferenceSaveFailed(false);
    void updateDisplayPreferences(rid, { orders_date_basis: nextBasis })
      .catch(() => setPreferenceSaveFailed(true));
  }, [rid, closeOrderDetail]);

  const typeOptions = [{ value: '', label: t('all') }, { value: 'dine_in', label: t('dineIn') }, { value: 'pickup', label: t('pickup') }, { value: 'delivery', label: t('delivery') }];
  const paymentOptions = [{ value: PAYMENT_ATTENTION_FILTER, label: t('ordersPaymentsToProcess') }, { value: 'paid', label: t('paid') }, { value: 'partially_paid', label: t('partiallyPaid') }, { value: 'pending', label: t('pending') }, { value: 'unpaid', label: t('unpaid') }, { value: 'refunded', label: t('refunded') }];
  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className={`${styles.workspace} min-h-[calc(100dvh-var(--topbar-total-h)-64px)]`}>
      <div className="min-w-0">
        <header className={styles.header}>
          <h1>{t('allOrders')}</h1>
          <div className={styles.commands}>
            <ActionsDropdown actions={[
              { label: t('refresh'), onClick: () => void fetchOrders() },
              { label: t(soundOn ? 'muteSound' : 'unmuteSound'), onClick: () => setSoundOn(toggleSound()) },
              ...(canManage ? [{ label: t(paused ? 'resumeOrders' : 'pauseOrders'), disabled: pauseSaving, onClick: () => { if (paused) void togglePause(false); else setPauseConfirmationOpen(true); } }] : []),
              { label: t('ordersResetFilters'), onClick: resetFilters },
            ]} />
            {canManage && <Button asChild><Link href={`/${rid}/orders/new`}>{t('newOrder')}</Link></Button>}
          </div>
        </header>
        <div className={styles.tabs} role="tablist" aria-label={t('listState')}>
          {TABS.filter(tab => ['all', 'active', 'scheduled', 'completed', 'canceled'].includes(tab.key)).map(tab => (
            <button key={tab.key} type="button" role="tab" id={`orders-tab-${tab.key}`}
              aria-controls="orders-results"
              aria-selected={activeTab === tab.key || (tab.key === 'active' && ['review', 'kitchen', 'ready', 'delivery'].includes(activeTab))}
              tabIndex={activeTab === tab.key || (tab.key === 'active' && ['review', 'kitchen', 'ready', 'delivery'].includes(activeTab)) ? 0 : -1}
              onClick={() => switchTab(tab.key)}
              onKeyDown={event => {
                const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                const index = tabs.indexOf(event.currentTarget);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                  : event.key === 'ArrowRight' ? (index + (direction === 'rtl' ? -1 : 1) + tabs.length) % tabs.length
                  : event.key === 'ArrowLeft' ? (index + (direction === 'rtl' ? 1 : -1) + tabs.length) % tabs.length : null;
                if (next !== null) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
              }}>
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <section data-list-toolbar aria-label={t('listTools')} className={styles.filters}>
          <form className={styles.search} onSubmit={event => { event.preventDefault(); setSearchSubmitted(search.trim()); setPage(0); }}>
            <div className="list-search">
              <SearchIcon aria-hidden className="pointer-events-none absolute start-5 top-1/2 size-5 -translate-y-1/2" />
              <input type="search" dir="auto" className="list-search-input" aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <Button type="submit" variant="ghost" className={styles.searchButton}>{t('search')}</Button>
          </form>
          <DateRangePicker value={dateRange} onChange={range => { setDateRange(range); setPage(0); }}
            triggerClassName={`list-filter-button ${styles.dateFilter}`}
            triggerContent={<span dir="ltr" title={t(dateField === 'created' ? 'orderDate' : 'dateBasisSerieOption')}>{[dateRange.from, dateRange.to].map(date => `${date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`).join(' - ')}</span>}
            weekStartDay={weekStartDay} workdays={workdays}
            restaurantId={rid} basis={dateField} onBasisChange={changeDateField} series={serieList} />
          <ListChoiceFilter label={t('type')} options={typeOptions} value={typeFilter} onChange={value => { setTypeFilter(value); setPage(0); }} />
          <div className={styles.secondaryFilters}>
            <ListChoiceFilter label={t('paymentStatus')} options={[{ value: '', label: t('all') }, ...paymentOptions]} value={paymentFilter} onChange={value => { setPaymentFilter(value); setPage(0); }} />
            <button type="button" className={styles.clearFilters} onClick={resetFilters}>{t('clearAll')}</button>
          </div>
        </section>
        <div className={styles.listMeta}>
          <p aria-live="polite">{lastUpdated && t('ordersUpdatedAt').replace('{time}', lastUpdated.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</p>
          <span>{t('total')}: {total}</span>
        </div>
        {wsStatus !== 'connected' && <p role="status" className="text-sm text-[var(--fg-muted)]">{t(wsStatus === 'connecting' ? 'connecting' : 'offline')}</p>}
        {preferenceSaveFailed && <p role="status" className="text-sm text-[var(--warning-600)]">{t('displayPreferenceSaveFailed')}</p>}

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

        <section id="orders-results" role="tabpanel" aria-labelledby={`orders-tab-${['review', 'kitchen', 'ready', 'delivery'].includes(activeTab) ? 'active' : activeTab}`}>
        {/* Table */}
        {loading ? (
          <OrdersTableSkeleton
            columns={columns.visible.length + 1}
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
              className={`list-table operational-table orders-operational-table ${styles.table}`}
              data-density="compact"
            >
              <DataTableHead className="sticky top-0 z-[2]">
                {columns.visible.map((col) => (
                  <DataTableHeadCell
                    key={col.key}
                    data-column={col.key}
                    align={col.align}
                    className="bg-[var(--surface)] px-3 py-3 normal-case tracking-normal"
                  >
                    <span className={col.key === 'payment' ? styles.paymentHeading : undefined}>{t(col.labelKey)}</span>
                  </DataTableHeadCell>
                ))}
                <DataTableHeadCell align="right" className="w-12 px-2 !py-1.5">{hasAnyPermission('settings.edit') && <OrderColumnPicker columns={columns} />}</DataTableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {orders.map((order, index) => {
                  return (
                    <DataTableRow
                      key={order.id}
                      index={index}
                      striped={false}
                      tabIndex={0}
                      aria-label={t('ordersOpenOrder').replace('{id}', String(order.id))}
                      onClick={() => openOrder(order.id)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openOrder(order.id);
                        }
                      }}
                      className="group cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand-500)]"
                    >
                      {columns.visible.map((col) => (
                        <DataTableCell
                          key={col.key}
                          align={col.align}
                          className={`${col.cellClassName ?? ''} px-2 py-3`}
                          mobilePrimary={col.isMobilePrimary}
                          mobileLabel={col.isMobilePrimary ? undefined : t(col.labelKey)}
                          data-mobile-role={col.isMobilePrimary ? 'primary' : 'detail'}
                          data-mobile-column={col.key}
                        >
                          {col.render(order, t, money, locale)}
                        </DataTableCell>
                      ))}
                      <DataTableCell />
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>

            <ListPagination page={page + 1} totalPages={Math.max(1, totalPages)} pageSize={PAGE_SIZE} onPageChange={value => setPage(value - 1)} />
          </>
        )}
        </section>
      </div>
      {/* Clicking a row opens the complete order directly. */}
      {detailId != null && detailLoadFailed && !detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-r-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-3">
            <h2 className="text-fs-lg font-semibold text-[var(--fg)]">
              {t('orderNumber').replace('{id}', String(detailId))}
            </h2>
            <p className="mt-2 text-fs-sm text-[var(--fg-muted)]">{t('noMatchFound')}</p>
            <Button variant="primary" size="md" className="mt-5" onClick={closeOrderDetail}>
              {t('backToOrders')}
            </Button>
          </div>
        </div>
      )}
      <OrderDetailModal
        order={detailOrder}
        canManage={canManage}
        canDelete={isOwner}
        canOverride={canOverride}
        isLoading={detailLoading || (detailOrder != null && actionLoading === detailOrder.id)}
        onClose={closeOrderDetail}
        onAccept={() => {
          if (!detailOrder) return;
          return handleAccept(detailOrder.id);
        }}
        onReject={() => detailOrder && handleReject(detailOrder.id)}
        onDelete={() => detailOrder && setPendingDelete(detailOrder.id)}
        onOverride={() => detailOrder && handleOverride(detailOrder.id)}
        onCorrectPayment={() => detailOrder && handleCorrectPayment(detailOrder.id)}
        onCorrectPaymentMethod={() => detailOrder && handleCorrectPaymentMethod(detailOrder.id)}
        onReactivate={() => detailOrder && handleReactivate(detailOrder.id)}
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
        restaurantName={restaurantName}
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
        totalAmount={detailOrder?.balance_due ?? detailOrder?.total_amount ?? 0}
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

      <ConfirmDialog
        open={pauseConfirmationOpen}
        onOpenChange={setPauseConfirmationOpen}
        title={t('pauseOrders')}
        description={t('pauseOnlineOrdersDesc')}
        confirmLabel={t('pauseOrders')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => {
          setPauseConfirmationOpen(false);
          void togglePause(true);
        }}
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
  label,
}: {
  columns: number;
  label: string;
}) {
  return (
    <DataTable className={`list-table operational-table orders-operational-table ${styles.table}`} aria-busy="true" aria-label={label} data-density="compact">
      <DataTableHead>
        {Array.from({ length: columns }).map((_, index) => (
          <DataTableHeadCell key={index} className="px-3 py-2">
            <Skeleton className="h-3 w-16" />
          </DataTableHeadCell>
        ))}
      </DataTableHead>
      <DataTableBody>
        {Array.from({ length: 7 }).map((_, row) => (
          <DataTableRow key={row} striped={false}>
            {Array.from({ length: columns }).map((__, column) => (
              <DataTableCell key={column} className="px-3 py-2">
                <Skeleton className={`h-4 ${column === 1 ? 'w-32' : column === columns - 1 ? 'w-24' : 'w-16'}`} />
              </DataTableCell>
            ))}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
