"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  createPurchaseOrder,
  createSupplier,
  createSupplierProduct,
  deletePurchaseOrder,
  deleteSupplier,
  deleteSupplierProduct,
  getRestaurant,
  listPurchaseOrders,
  listStockItems,
  listSupplierOrderUnitPreferences,
  listSupplierProducts,
  listSuppliers,
  receivePurchaseOrder,
  refreshPurchaseOrderTranslations,
  sendOrderEmail,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  updateSupplier,
  updateSupplierProduct,
  type PurchaseOrder,
  type PurchaseOrderItemInput,
  type StockItem,
  type StockUnit,
  type Supplier,
  type SupplierDeliverySchedule,
  type SupplierDeliveryScheduleInput,
  type SupplierOrderChannel,
  type SupplierOrderLanguage,
  type SupplierProduct,
  type SupplierProductInput,
  type TranslationMap,
} from "@/lib/api";
import Modal from "@/components/Modal";
import { RestaurantRequestGuard } from "@/lib/restaurant-request-state";
import { useKitchenMutation } from "@/components/kitchen/useKitchenMutation";
import SupplierHubTabs, {
  type SupplierHubTab,
} from "@/components/suppliers/SupplierHubTabs";
import { Button, ConfirmDialog, EmptyState, FullScreenEditor, PageHead } from "@/components/ds";
import { NumberInput } from "@/components/ui/NumberInput";
import { labelForRaw } from "@/components/stock/StockQuantityForm";
import { useI18n, useCurrency } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import LocalizedOrderNameField, {
  supportedOrderLocale,
} from "@/components/i18n/LocalizedOrderNameField";
import type { Locale } from "@/components/i18n/LocaleTabs";
import {
  buildPurchaseOrderMessage,
  buildWhatsAppUrl,
} from "@/lib/suppliers/order-message";
import {
  buildOrderUnitOptions,
  orderQuantityInBase as selectedOrderQuantityInBase,
  preferredOrderUnit,
  type OrderUnitOption,
} from "@/lib/suppliers/order-units";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  MessageCircle,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";

const UNITS: StockUnit[] = [
  "kg",
  "g",
  "l",
  "ml",
  "unit",
  "pack",
  "box",
  "bag",
  "dose",
  "other",
];
const ORDER_TABS: SupplierHubTab[] = ["needs", "orders", "suppliers"];
type OrderSeed = { supplierId?: number; stockItemIds?: number[] };
type PackagingDraft = {
  packagingSet: boolean;
  unitsPerPack: number;
  unitSize: number;
  unitSizeUnit: string;
  containerType: string;
  unitType: string;
};

function packagingFromStock(item?: StockItem): PackagingDraft {
  const packagingSet = Boolean(
    item &&
      (item.pack_size > 0 ||
        (item.unit_content ?? 0) > 0 ||
        item.container_type ||
        item.unit_type),
  );
  return {
    packagingSet,
    unitsPerPack: item?.pack_size ?? 0,
    unitSize: item?.unit_content ?? 0,
    unitSizeUnit: item?.unit_content_unit || item?.unit || "unit",
    containerType: item?.container_type ?? "",
    unitType: item?.unit_type ?? "",
  };
}

function packagingLabel(
  packaging: PackagingDraft,
  t: (key: string) => string,
): string {
  const parts: string[] = [];
  if (packaging.containerType)
    parts.push(labelForRaw(packaging.containerType, t));
  if (packaging.unitsPerPack > 0) {
    parts.push(
      `× ${packaging.unitsPerPack}${packaging.unitType ? ` ${labelForRaw(packaging.unitType, t)}` : ""}`,
    );
  }
  if (packaging.unitSize > 0) {
    parts.push(
      `× ${packaging.unitSize} ${labelForRaw(packaging.unitSizeUnit, t)}`,
    );
  }
  return parts.join(" ");
}

function convertOrderUnit(quantity: number, from: string, to: string): number {
  if (!from || !to || from === to) return quantity;
  const factors: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 };
  if (!(from in factors) || !(to in factors)) return quantity;
  return (quantity * factors[from]) / factors[to];
}

function isLow(item: StockItem) {
  return (
    item.is_active &&
    (item.quantity <= 0 ||
      (item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold))
  );
}

function dateTimeLabel(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function localizedSupplierName(
  supplier: Supplier,
  language: SupplierOrderLanguage,
) {
  return supplier.translations?.name?.[language]?.trim() || supplier.name;
}

function nextSchedule(supplier: Supplier): {
  schedule: SupplierDeliverySchedule;
  delivery: Date;
  deliveryEnd: Date;
  cutoff: Date;
} | null {
  const now = new Date();
  const candidates = (supplier.schedules ?? []).flatMap((schedule) => {
    const values: {
      schedule: SupplierDeliverySchedule;
      delivery: Date;
      deliveryEnd: Date;
      cutoff: Date;
    }[] = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const delivery = new Date(now);
      delivery.setDate(now.getDate() + offset);
      if (delivery.getDay() !== schedule.weekday) continue;
      const [hours, minutes] = schedule.window_start.split(":").map(Number);
      delivery.setHours(hours, minutes, 0, 0);
      if (delivery <= now) continue;
      const cutoff = new Date(delivery);
      cutoff.setDate(cutoff.getDate() - schedule.order_cutoff_days_before);
      const [cutoffHours, cutoffMinutes] = schedule.order_cutoff_time
        .split(":")
        .map(Number);
      cutoff.setHours(cutoffHours, cutoffMinutes, 0, 0);
      const deliveryEnd = new Date(delivery);
      const [endHours, endMinutes] = schedule.window_end.split(":").map(Number);
      deliveryEnd.setHours(endHours, endMinutes, 0, 0);
      values.push({ schedule, delivery, deliveryEnd, cutoff });
      break;
    }
    return values;
  });
  return (
    candidates.sort((a, b) => a.delivery.getTime() - b.delivery.getTime())[0] ??
    null
  );
}

/** Restaurant-scoped supplier purchasing workspace. */
export default function SuppliersPage() {
  const { restaurantId } = useParams();
  return <SuppliersWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}

function SuppliersWorkspace({rid}:{rid:number}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission("kitchen.manage");
  const activeParam = searchParams.get("tab") as SupplierHubTab | null;
  const activeTab = ORDER_TABS.includes(activeParam as SupplierHubTab)
    ? activeParam!
    : "needs";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [restaurantName, setRestaurantName] = useState("Foody");
  const [sourceLocale, setSourceLocale] = useState<Locale>("en");
  const [loading, setLoading] = useState(true);
  const [loaded,setLoaded]=useState(false);
  const guard=useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const [error, setError] = useState("");
  const [supplierModal, setSupplierModal] = useState<{
    open: boolean;
    editing?: Supplier;
  }>({ open: false });
  const [productsSupplier, setProductsSupplier] = useState<Supplier | null>(
    null,
  );
  const [orderSeed, setOrderSeed] = useState<OrderSeed | null>(null);
  const [sendOrder, setSendOrder] = useState<PurchaseOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  const [removal,setRemoval]=useState<{title:string;description:string;confirmLabel?:string;execute:()=>Promise<unknown>}|null>(null);
  const reload = useCallback(async () => {
    const request=guard.current.begin(rid);
    setLoading(true);setError("");
    try {
      const [supplierData, orderData, stockData, restaurant] =
        await Promise.all([
          listSuppliers(rid),
          listPurchaseOrders(rid),
          listStockItems(rid),
          getRestaurant(rid),
        ]);
      if(!guard.current.isCurrent(request))return;
      setLoaded(true);
      setSuppliers(supplierData);
      setOrders(orderData);
      setStockItems(stockData);
      setRestaurantName(restaurant.name);
      setSourceLocale(supportedOrderLocale(restaurant.default_locale));
    } catch (err) {
      if(guard.current.isCurrent(request))setError(err instanceof Error ? err.message : t("supplierLoadFailed"));
      throw err;
    } finally {
      if(guard.current.isCurrent(request))setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => {
    void reload().catch(()=>{});
    const requests=guard.current;return()=>requests.invalidate();
  }, [reload]);
  const lowItems = useMemo(() => stockItems.filter(isLow), [stockItems]);
  const setTab = (tab: SupplierHubTab) => {
    const query=new URLSearchParams(searchParams.toString());query.set('tab',tab);
    router.replace(`/${rid}/kitchen/suppliers?${query}`);
  };


  return (
    <div className="min-w-0">
      <PageHead
        className="max-sm:[&>div:last-child]:w-full"
        title={t("supplierHubTitle")}
        desc={t("supplierHubDesc")}
        actions={
          canManage ? (
            <div className="w-full sm:w-auto">
              <Button
                size="lg"
                className="h-11 w-full px-5 sm:w-auto"
                onClick={() => setOrderSeed({})}
                disabled={!loaded||loading||suppliers.length === 0}
              >
                <Plus /> {t("newPurchaseOrder")}
              </Button>
            </div>
          ) : undefined
        }
      />
      <SupplierHubTabs
        restaurantId={rid}
        active={activeTab}
        lowCount={lowItems.length}
      />
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-r-md border border-[var(--danger-500)]/30 bg-[var(--danger-50)] px-4 py-3 text-fs-sm text-[var(--danger-500)]"
        >
          <p>{error}</p><Button variant="secondary" size="lg" disabled={loading} onClick={()=>void reload().catch(()=>{})}>{t("retry")}</Button>
        </div>
      )}

      {!loaded&&loading&&<p role="status" className="py-16 text-center text-fg-secondary">{t("loading")}</p>}
      {loaded&&activeTab === "needs" && (
        <NeedsTab
          suppliers={suppliers}
          stockItems={stockItems}
          locale={locale}
          canManage={canManage}
          onOrder={setOrderSeed}
          onOpenSuppliers={() => setTab("suppliers")}
        />
      )}
      {loaded&&activeTab === "orders" && (
        <OrdersTab
          orders={orders}
          locale={locale}
          canManage={canManage}
          onSend={setSendOrder}
          onReceive={setReceiveOrder}
          onCancel={order=>setRemoval({title:t('cancelPurchaseOrderTitle'),description:`PO-${order.id} · ${order.supplier?.name??''}`,execute:()=>updatePurchaseOrderStatus(rid,order.id,'cancelled')})}
          onDelete={order=>setRemoval({title:t('deletePurchaseOrderConfirm'),confirmLabel:t('delete'),description:`PO-${order.id} · ${order.supplier?.name??''}`,execute:()=>deletePurchaseOrder(rid,order.id)})}
        />
      )}
      {loaded&&activeTab === "suppliers" && (
        <SuppliersTab
          suppliers={suppliers}
          locale={locale}
          canManage={canManage}
          onAdd={() => setSupplierModal({ open: true })}
          onEdit={(supplier) =>
            setSupplierModal({ open: true, editing: supplier })
          }
          onProducts={setProductsSupplier}
          onOrder={(supplier) => setOrderSeed({ supplierId: supplier.id })}
          onDelete={supplier=>setRemoval({title:t('deleteSupplierConfirm'),confirmLabel:t('delete'),description:`${supplier.name}. ${t('supplierDeleteImpact')}`,execute:()=>deleteSupplier(rid,supplier.id)})}
        />
      )}

      {supplierModal.open && (
        <SupplierFormModal
          editing={supplierModal.editing}
          sourceLocale={sourceLocale}
          onClose={() => setSupplierModal({ open: false })}
          onSave={input=>supplierModal.editing?updateSupplier(rid,supplierModal.editing.id,input):createSupplier(rid,input)}
          onSaved={reload}
        />
      )}
      {productsSupplier && (
        <SupplierProductsModal
          supplier={productsSupplier}
          rid={rid}
          stockItems={stockItems}
          sourceLocale={sourceLocale}
          onClose={() => {
            setProductsSupplier(null);
            void reload().catch(()=>{});
          }}
        />
      )}
      {orderSeed && (
        <OrderComposer
          rid={rid}
          suppliers={suppliers}
          stockItems={stockItems}
          seed={orderSeed}
          onClose={() => setOrderSeed(null)}
          onCreated={async (order, continueToSend) => {
            await reload();
            if (continueToSend) setSendOrder(order);
            else setTab("orders");
          }}
        />
      )}
      {sendOrder && (
        <SendOrderModal
          rid={rid}
          order={sendOrder}
          restaurantName={restaurantName}
          onClose={() => setSendOrder(null)}
          onSent={async () => {
            await reload();
            setTab("orders");
          }}
        />
      )}
      {receiveOrder && (
        <ReceiveOrderModal
          rid={rid}
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onReceived={async () => {
            await reload();
          }}
        />
      )}
      {removal&&<SupplierActionDialog title={removal.title} description={removal.description} confirmLabel={removal.confirmLabel} execute={removal.execute} onSaved={reload} onClose={()=>setRemoval(null)}/>}
    </div>
  );
}

function SupplierActionDialog({title,description,confirmLabel,execute,onSaved,onClose}:{title:string;description:string;confirmLabel?:string;execute:()=>Promise<unknown>;onSaved:()=>Promise<void>;onClose:()=>void}) {
  const {t}=useI18n();
  const session=useKitchenMutation<unknown>('',onClose);
  return <Modal title={title} onClose={session.close} closeDisabled={session.busy}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={session.busy||!session.canManage} onClick={()=>void session.run(execute,onSaved)}>{session.busy?t('saving'):session.saved?t('retry'):(confirmLabel??t('confirm'))}</Button></div>}>
    <div className="space-y-4"><p className="text-sm text-fg-secondary">{description}</p>{session.feedback}</div>
  </Modal>;
}

function NeedsTab({
  suppliers,
  stockItems,
  locale,
  canManage,
  onOrder,
  onOpenSuppliers,
}: {
  suppliers: Supplier[];
  stockItems: StockItem[];
  locale: string;
  canManage: boolean;
  onOrder: (seed: OrderSeed) => void;
  onOpenSuppliers: () => void;
}) {
  const { t } = useI18n();
  const lowItems = stockItems.filter(isLow);
  const grouped = suppliers
    .map((supplier) => ({
      supplier,
      items: lowItems.filter((item) => item.supplier_id === supplier.id),
    }))
    .filter((group) => group.items.length > 0);
  const unassigned = lowItems.filter(
    (item) =>
      !item.supplier_id ||
      !suppliers.some((supplier) => supplier.id === item.supplier_id),
  );
  return (
    <div className="space-y-[var(--s-8)]">
      <WeeklyDeliveryRail suppliers={suppliers} locale={locale} />
      <section>
        <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div>
            <h2 className="text-fs-xl font-semibold text-[var(--fg)]">
              {t("orderToday")}
            </h2>
            <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
              {t("orderTodayDesc")}
            </p>
          </div>
          {lowItems.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-[var(--danger-50)] px-2.5 py-1 text-fs-xs font-semibold text-[var(--danger-500)]">
              {`${lowItems.length} ${t("items")}`}
            </span>
          )}
        </div>
        {lowItems.length === 0 ? (
          <EmptyState
            icon={<PackageCheck />}
            title={t("stockNeedsClear")}
            desc={t("stockNeedsClearDesc")}
          />
        ) : (
          <div className="space-y-3">
            {grouped.map(({ supplier, items }) => {
              const upcoming = nextSchedule(supplier);
              const cutoffPassed = !!upcoming && upcoming.cutoff < new Date();
              return (
                <article
                  key={supplier.id}
                  className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1"
                >
                  <div className="flex flex-col items-stretch justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:flex-row sm:items-center sm:gap-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-r-md bg-[var(--brand-500)]/10 text-fs-sm font-semibold text-[var(--brand-ink)]">
                        {supplier.name
                          .trim()
                          .charAt(0)
                          .toLocaleUpperCase(locale)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words font-semibold text-[var(--fg)]">
                            {supplier.name}
                          </h3>
                          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fg-muted)]">
                            {items.length} {t("items")}
                          </span>
                        </div>
                        {upcoming ? (
                          <p
                            className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fs-xs ${cutoffPassed ? "text-[var(--danger-500)]" : "text-[var(--fg-muted)]"}`}
                          >
                            <Clock3 className="size-3.5 shrink-0" />
                            <span>
                              {t("nextDelivery")}:{" "}
                              {dateTimeLabel(
                                upcoming.delivery.toISOString(),
                                locale,
                              )}{" "}
                              · {t("orderBefore")}:{" "}
                              {dateTimeLabel(
                                upcoming.cutoff.toISOString(),
                                locale,
                              )}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1.5 flex items-center gap-1.5 text-fs-xs text-[var(--warning-500)]">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            {t("scheduleMissing")}
                          </p>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        variant="secondary"
                        size="lg"
                        className="min-h-11 w-full px-4 sm:w-auto"
                        onClick={() =>
                          onOrder({
                            supplierId: supplier.id,
                            stockItemIds: items.map((item) => item.id),
                          })
                        }
                      >
                        {t("orderFromSupplier")} <ArrowUpRight />
                      </Button>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 px-4 py-3.5 text-fs-sm md:grid-cols-[44px_minmax(0,1fr)_auto_auto] md:gap-5"
                      >
                        <div className="flex size-11 items-center justify-center overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image_url}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Package className="size-4 text-[var(--fg-subtle)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="break-words font-medium text-[var(--fg)]">
                            {item.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-fs-xs text-[var(--fg-muted)] md:hidden">
                            <span>
                              {t("currentStock")}:{" "}
                              <b className="text-[var(--danger-500)]">
                                {item.quantity} {item.unit}
                              </b>
                            </span>
                            <span>
                              {t("reorderThreshold")}: {item.reorder_threshold}{" "}
                              {item.unit}
                            </span>
                          </div>
                        </div>
                        <span className="hidden text-[var(--fg-muted)] md:inline">
                          {t("currentStock")}:{" "}
                          <b className="text-[var(--danger-500)]">
                            {item.quantity} {item.unit}
                          </b>
                        </span>
                        <span className="hidden text-[var(--fg-muted)] md:inline">
                          {t("reorderThreshold")}: {item.reorder_threshold}{" "}
                          {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
            {unassigned.length > 0 && (
              <article className="rounded-r-lg border border-dashed border-[var(--warning-500)] bg-[var(--warning-50)]/40 p-4">
                <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-[var(--fg)]">
                      <AlertTriangle className="size-4 text-[var(--warning-500)]" />
                      {t("supplierToDefine")}
                    </h3>
                    <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
                      {unassigned.map((item) => item.name).join(", ")}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="lg"
                      className="min-h-11 w-full sm:w-auto"
                      onClick={onOpenSuppliers}
                    >
                      {t("manageSuppliers")}
                    </Button>
                  )}
                </div>
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function WeeklyDeliveryRail({
  suppliers,
  locale,
}: {
  suppliers: Supplier[];
  locale: string;
}) {
  const { t } = useI18n();
  const [selectedDay, setSelectedDay] = useState(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const slots = suppliers.flatMap((supplier) =>
      (supplier.schedules ?? [])
        .filter((schedule) => schedule.weekday === date.getDay())
        .map((schedule) => ({ supplier, schedule })),
    );
    return { date, slots };
  });
  const deliveryCount = days.reduce(
    (total, day) => total + day.slots.length,
    0,
  );
  return (
    <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-r-md bg-[var(--brand-500)]/10 text-[var(--brand-ink)] dark:text-[var(--brand-500)]">
            <CalendarDays className="size-4" />
          </div>
          <h2 className="break-words font-semibold text-[var(--fg)]">
            {t("upcomingDeliveries")}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-fs-xs font-semibold text-[var(--fg-muted)]">
          {deliveryCount}
          <span className="hidden sm:inline"> {t("deliveries")}</span>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 p-2 md:hidden">
        {days.map(({ date, slots }, index) => (
          <button
            key={date.toISOString()}
            type="button"
            aria-pressed={selectedDay === index}
            aria-label={`${new Intl.DateTimeFormat(locale, {
              dateStyle: "full",
            }).format(date)}, ${slots.length} ${t("deliveries")}`}
            onClick={() => setSelectedDay(index)}
            className={`relative flex min-w-0 flex-col items-center rounded-r-md px-0.5 py-2 outline-none focus-visible:shadow-ring ${
              selectedDay === index
                ? "bg-[var(--surface-2)] text-[var(--fg)] shadow-1"
                : "text-[var(--fg-muted)]"
            }`}
          >
            <span
              className={`w-full break-words text-center text-[10px] font-medium ${index === 0 ? "text-[var(--brand-500)]" : ""}`}
            >
              {new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
                date,
              )}
            </span>
            <span className="mt-1 text-fs-md font-semibold">
              {date.getDate()}
            </span>
            <span
              aria-hidden="true"
              className={`mt-1 h-1.5 min-w-1.5 rounded-full ${
                slots.length > 0
                  ? "bg-[var(--brand-500)]"
                  : "bg-[var(--line-strong)]"
              }`}
            />
          </button>
        ))}
      </div>
      {days[selectedDay].slots.length > 0 && (
        <div className="space-y-2 border-t border-[var(--line)] px-3 py-3 md:hidden">
          {days[selectedDay].slots.map(({ supplier, schedule }) => (
            <div
              key={`${supplier.id}-${schedule.id}`}
              className="flex items-center justify-between gap-3 rounded-r-md bg-[var(--brand-500)]/10 px-3 py-2 text-fs-xs"
            >
              <span className="break-words font-semibold text-[var(--fg)]">
                {supplier.name}
              </span>
              <span className="shrink-0 text-[var(--fg-muted)]">
                {schedule.window_start}–{schedule.window_end}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="hidden grid-cols-7 md:grid">
        {days.map(({ date, slots }, index) => (
          <div
            key={date.toISOString()}
            className={`min-h-28 p-3 ${index > 0 ? "border-s border-[var(--line)]" : ""} ${index === 0 ? "bg-[var(--brand-500)]/5" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-fs-xs font-medium text-[var(--fg-muted)]">
                {new Intl.DateTimeFormat(locale, {
                  weekday: "short",
                }).format(date)}
              </div>
              {index === 0 && (
                <span className="rounded-full bg-[var(--brand-500)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-ink)]">
                  {t("today")}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-fs-lg font-semibold text-[var(--fg)]">
              {date.getDate()}
            </div>
            <div className="mt-2 space-y-1.5">
              {slots.length === 0 ? (
                <span className="text-fs-xs text-[var(--fg-subtle)]">—</span>
              ) : (
                slots.map(({ supplier, schedule }) => (
                  <div
                    key={`${supplier.id}-${schedule.id}`}
                    className="rounded-r-sm border border-[var(--brand-500)]/25 bg-[var(--brand-500)]/10 px-2 py-1.5 text-fs-xs text-[var(--brand-800)] dark:text-[var(--brand-400)]"
                  >
                    <div className="break-words font-semibold">
                      {supplier.name}
                    </div>
                    <div>
                      {schedule.window_start}–{schedule.window_end}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SuppliersTab({
  suppliers,
  locale,
  canManage,
  onAdd,
  onEdit,
  onProducts,
  onOrder,
  onDelete,
}: {
  suppliers: Supplier[];
  locale: string;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (supplier: Supplier) => void;
  onProducts: (supplier: Supplier) => void;
  onOrder: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const filtered = suppliers.filter((supplier) =>
    `${supplier.name} ${supplier.contact_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-full sm:min-w-60 sm:basis-auto">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchSuppliers")}
            aria-label={t("searchSuppliers")}
            className="h-11 w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] ps-10 pe-3 text-base outline-none focus:shadow-ring sm:text-fs-sm"
          />
        </label>
        {canManage && (
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onAdd}
          >
            <Plus />
            {t("addSupplier")}
          </Button>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Truck />}
          title={t(search ? "noResults" : "noSuppliers")}
          desc={t(search ? "tryAdjustingFilters" : "noSuppliersHint")}
          action={
            canManage ? (
              <Button onClick={onAdd}>{t("addSupplier")}</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="hidden grid-cols-[1.2fr_1.2fr_1.4fr_.8fr_auto] gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-fs-xs font-semibold text-[var(--fg-muted)] md:grid">
            <span>{t("supplier")}</span>
            <span>{t("nextDelivery")}</span>
            <span>{t("contact")}</span>
            <span>{t("supplierProducts")}</span>
            <span />
          </div>
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((supplier) => {
              const upcoming = nextSchedule(supplier);
              return (
                <article
                  key={supplier.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_1.2fr_1.4fr_.8fr_auto] md:items-center md:gap-4"
                >
                  <div>
                    <div className="font-semibold text-[var(--fg)]">
                      {supplier.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-fs-xs text-[var(--fg-muted)]">
                      {supplier.preferred_channel === "email" ? (
                        <Mail className="size-3.5" />
                      ) : (
                        <MessageCircle className="size-3.5" />
                      )}
                      {t(`language_${supplier.preferred_language || "he"}`)}
                    </div>
                  </div>
                  <div className="text-fs-sm text-[var(--fg-muted)]">
                    {upcoming ? (
                      <>
                        <div>
                          {dateTimeLabel(
                            upcoming.delivery.toISOString(),
                            locale,
                          )}
                        </div>
                        <div className="text-fs-xs">
                          {upcoming.schedule.window_start}–
                          {upcoming.schedule.window_end}
                        </div>
                      </>
                    ) : (
                      <span className="text-[var(--warning-500)]">
                        {t("scheduleMissing")}
                      </span>
                    )}
                  </div>
                  <div className="text-fs-sm text-[var(--fg-muted)]">
                    <div>{supplier.contact_name || "—"}</div>
                    <div className="text-fs-xs">
                      {supplier.phone || supplier.email || "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => onProducts(supplier)}
                    aria-label={`${t("supplierProducts")} — ${supplier.name}`}
                    className="w-fit px-2 text-[var(--brand-ink)]"
                  >
                    {supplier.products?.length ?? 0} {t("products")}
                  </Button>
                  {canManage && (
                    <div className="flex items-center gap-1 border-t border-[var(--line)] pt-3 md:justify-end md:border-0 md:pt-0">
                      <Button
                        variant="ghost"
                        size="lg"
                        icon
                        onClick={() => onOrder(supplier)}
                        title={t("newPurchaseOrder")}
                        aria-label={`${t("newPurchaseOrder")} — ${supplier.name}`}
                        className="text-[var(--brand-ink)] hover:bg-[var(--brand-500)]/10"
                      >
                        <Send className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        icon
                        onClick={() => onEdit(supplier)}
                        title={t("edit")}
                        aria-label={`${t("edit")} — ${supplier.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        icon
                        onClick={() => onDelete(supplier)}
                        title={t("delete")}
                        aria-label={`${t("delete")} — ${supplier.name}`}
                        className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function OrdersTab({
  orders,
  locale,
  canManage,
  onSend,
  onReceive,
  onCancel,
  onDelete,
}: {
  orders: PurchaseOrder[];
  locale: string;
  canManage: boolean;
  onSend: (order: PurchaseOrder) => void;
  onReceive: (order: PurchaseOrder) => void;
  onCancel: (order: PurchaseOrder) => void;
  onDelete: (order: PurchaseOrder) => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  if (orders.length === 0)
    return (
      <EmptyState
        icon={<Send />}
        title={t("noOrders")}
        desc={t("noPurchaseOrdersHint")}
      />
    );
  return (
    <div className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="hidden grid-cols-[.7fr_1.2fr_1.1fr_1fr_.8fr_auto] gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-fs-xs font-semibold text-[var(--fg-muted)] md:grid">
        <span>#</span>
        <span>{t("supplier")}</span>
        <span>{t("expectedDelivery")}</span>
        <span>{t("status")}</span>
        <span>{t("total")}</span>
        <span />
      </div>
      <div className="divide-y divide-[var(--line)]">
        {orders.map((order) => (
          <article
            key={order.id}
            className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-[.7fr_1.2fr_1.1fr_1fr_.8fr_auto] md:items-center md:gap-4"
          >
            <span className="order-1 font-semibold text-[var(--fg)] md:order-none">
              PO-{order.id}
            </span>
            <div className="order-3 col-span-2 md:order-none md:col-span-1">
              <div className="text-fs-sm font-medium text-[var(--fg)]">
                {order.supplier?.name || "—"}
              </div>
              <div className="text-fs-xs text-[var(--fg-muted)]">
                {order.items?.length ?? 0} {t("items")}
              </div>
            </div>
            <div className="order-4 text-fs-sm text-[var(--fg-muted)] md:order-none">
              <span className="mb-0.5 block text-[11px] font-medium text-[var(--fg-subtle)] md:hidden">
                {t("expectedDelivery")}
              </span>
              {dateTimeLabel(order.expected_delivery_at, locale)}
            </div>
            <span
              className={`order-2 w-fit justify-self-end rounded-full px-2.5 py-1 text-fs-xs font-semibold md:order-none md:justify-self-auto ${order.status === "received" ? "bg-[var(--success-50)] text-[var(--success-500)]" : order.status === "cancelled" ? "bg-[var(--danger-50)] text-[var(--danger-500)]" : order.status === "sent" ? "bg-[var(--info-50)] text-[var(--info-500)]" : "bg-[var(--surface-2)] text-[var(--fg-muted)]"}`}
            >
              {t(`purchaseOrderStatus_${order.status}`)}
            </span>
            <div className="order-5 text-end text-fs-sm font-medium text-[var(--fg)] md:order-none md:text-start">
              <span className="mb-0.5 block text-[11px] font-medium text-[var(--fg-subtle)] md:hidden">
                {t("total")}
              </span>
              {money(order.total_amount)}
            </div>
            {canManage && (
              <div className="order-6 col-span-2 flex items-center gap-1 border-t border-[var(--line)] pt-3 md:order-none md:col-span-1 md:justify-end md:border-0 md:pt-0">
                {order.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="lg"
                    icon
                    onClick={() => onSend(order)}
                    className="text-[var(--brand-ink)] hover:bg-[var(--brand-500)]/10"
                    title={t("sendOrder")}
                    aria-label={`${t("sendOrder")} — PO-${order.id}`}
                  >
                    <Send className="size-4" />
                  </Button>
                )}
                {order.status === "sent" && (
                  <Button
                    variant="ghost"
                    size="lg"
                    icon
                    onClick={() => onReceive(order)}
                    className="text-[var(--success-500)] hover:bg-[var(--success-50)]"
                    title={t("receiveOrder")}
                    aria-label={`${t("receiveOrder")} — PO-${order.id}`}
                  >
                    <CheckCircle2 className="size-4" />
                  </Button>
                )}
                {(order.status === "draft" || order.status === "sent") && (
                  <Button
                    variant="ghost"
                    size="lg"
                    icon
                    onClick={() => onCancel(order)}
                    className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                    title={t("cancel")}
                    aria-label={`${t("cancel")} — PO-${order.id}`}
                  >
                    <XCircle className="size-4" />
                  </Button>
                )}
                {order.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="lg"
                    icon
                    onClick={() => onDelete(order)}
                    title={t("delete")}
                    aria-label={`${t("delete")} — PO-${order.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function SupplierFormModal({
  editing,
  sourceLocale,
  onClose,
  onSave,
  onSaved,
}: {
  editing?: Supplier;
  sourceLocale: Locale;
  onClose: () => void;
  onSave: (input: Parameters<typeof createSupplier>[1]) => Promise<Supplier>;
  onSaved:()=>Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? "");
  const [translations, setTranslations] = useState<TranslationMap>(
    editing?.translations ?? {},
  );
  const [contactName, setContactName] = useState(editing?.contact_name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [channel, setChannel] = useState<SupplierOrderChannel>(
    editing?.preferred_channel || "whatsapp",
  );
  const [language, setLanguage] = useState<SupplierOrderLanguage>(
    editing?.preferred_language || "he",
  );
  const [schedules, setSchedules] = useState<SupplierDeliveryScheduleInput[]>(
    (editing?.schedules ?? []).map(
      ({
        weekday,
        window_start,
        window_end,
        order_cutoff_days_before,
        order_cutoff_time,
      }) => ({
        weekday,
        window_start,
        window_end,
        order_cutoff_days_before,
        order_cutoff_time,
      }),
    ),
  );
  const formId=useId();
  const session=useKitchenMutation<Supplier>(JSON.stringify({name,translations,contactName,phone,email,address,notes,channel,language,schedules}),onClose);
  const updateSchedule = (
    index: number,
    patch: Partial<SupplierDeliveryScheduleInput>,
  ) =>
    setSchedules((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const save = () => {
    if(!name.trim())return;
    void session.run(()=>onSave({name:name.trim(),translations,contact_name:contactName,phone,email,address,notes,preferred_channel:channel,preferred_language:language,schedules}),onSaved);
  };
  return (<>
    <Modal
      title={editing ? t("editSupplier") : t("addSupplier")}
      onClose={session.close}
      closeDisabled={session.busy}
      size="3xl"
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={session.busy||!session.canManage||!name.trim()}>{t(session.busy?'saving':session.saved?'retry':'save')}</Button></div></div>}
    >
      <form id={formId} onSubmit={event=>{event.preventDefault();save();}}><fieldset disabled={session.frozen} className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <LocalizedOrderNameField
              sourceLocale={sourceLocale}
              name={name}
              translations={translations}
              onNameChange={setName}
              onTranslationsChange={setTranslations}
            />
          </div>
          <Field
            label={t("contactName")}
            value={contactName}
            onChange={setContactName}
          />
          <Field
            label={t("phoneWhatsApp")}
            value={phone}
            onChange={setPhone}
            type="tel"
          />
          <Field
            label={t("email")}
            value={email}
            onChange={setEmail}
            type="email"
          />
          <div className="sm:col-span-2">
            <Field label={t("address")} value={address} onChange={setAddress} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t("preferredChannel")}
            value={channel}
            onChange={(value) => setChannel(value as SupplierOrderChannel)}
            options={[
              ["whatsapp", "WhatsApp"],
              ["email", t("email")],
            ]}
          />
          <SelectField
            label={t("preferredLanguage")}
            value={language}
            onChange={(value) => setLanguage(value as SupplierOrderLanguage)}
            options={[
              ["he", t("language_he")],
              ["fr", t("language_fr")],
              ["en", t("language_en")],
            ]}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
                {t("deliverySchedule")}
              </h4>
              <p className="text-fs-xs text-[var(--fg-muted)]">
                {t("deliveryScheduleHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() =>
                setSchedules((current) => [
                  ...current,
                  {
                    weekday: 1,
                    window_start: "06:00",
                    window_end: "09:00",
                    order_cutoff_days_before: 1,
                    order_cutoff_time: "14:00",
                  },
                ])
              }
            >
              <Plus />
              {t("addSlot")}
            </Button>
          </div>
          <div className="space-y-2">
            {schedules.map((schedule, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_.8fr_.8fr_.8fr_.8fr_auto] sm:items-end"
              >
                <SelectField
                  label={t("day")}
                  value={String(schedule.weekday)}
                  onChange={(value) =>
                    updateSchedule(index, { weekday: Number(value) })
                  }
                  options={Array.from({ length: 7 }, (_, day) => [
                    String(day),
                    t(`weekday_${day}`),
                  ])}
                />
                <Field
                  label={t("from")}
                  value={schedule.window_start}
                  onChange={(value) =>
                    updateSchedule(index, { window_start: value })
                  }
                  type="time"
                />
                <Field
                  label={t("to")}
                  value={schedule.window_end}
                  onChange={(value) =>
                    updateSchedule(index, { window_end: value })
                  }
                  type="time"
                />
                <Field
                  label={t("daysBefore")}
                  value={String(schedule.order_cutoff_days_before)}
                  onChange={(value) =>
                    updateSchedule(index, {
                      order_cutoff_days_before: Math.max(0, Number(value)),
                    })
                  }
                  type="number"
                />
                <Field
                  label={t("cutoffTime")}
                  value={schedule.order_cutoff_time}
                  onChange={(value) =>
                    updateSchedule(index, { order_cutoff_time: value })
                  }
                  type="time"
                />
                <button
                  type="button"
                  aria-label={`${t("delete")} — ${t("weekday_"+schedule.weekday)}`}
                  onClick={() =>
                    setSchedules((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  className="mb-0.5 min-h-11 min-w-11 rounded-r-sm p-2 text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {schedules.length === 0 && (
              <p className="rounded-r-md border border-dashed border-[var(--line-strong)] px-4 py-5 text-center text-fs-sm text-[var(--fg-muted)]">
                {t("noDeliverySlots")}
              </p>
            )}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
            {t("notes")}
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-fs-sm outline-none focus:shadow-ring"
          />
        </label>
      </fieldset></form>
    </Modal>{session.confirmation}</>
  );
}

function OrderComposer({
  rid,
  suppliers,
  stockItems,
  seed,
  onClose,
  onCreated,
}: {
  rid: number;
  suppliers: Supplier[];
  stockItems: StockItem[];
  seed: OrderSeed;
  onClose: () => void;
  onCreated: (order: PurchaseOrder, continueToSend: boolean) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [supplierId, setSupplierId] = useState(
    seed.supplierId ?? suppliers[0]?.id ?? 0,
  );
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string>>(
    {},
  );
  const [packagings, setPackagings] = useState<Record<string, PackagingDraft>>(
    {},
  );
  const [editingPackagingKey, setEditingPackagingKey] = useState<string | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [expectedDeliveryEnd, setExpectedDeliveryEnd] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productLoading,setProductLoading]=useState(true);
  const [productLoaded,setProductLoaded]=useState(false);
  const [productError,setProductError]=useState('');
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [switchSupplier,setSwitchSupplier]=useState<number|null>(null);
  const cleanInitialized=useRef(false);
  const session=useKitchenMutation<{order:PurchaseOrder;continueToSend:boolean}>(JSON.stringify({supplierId,quantities,selectedUnits,packagings,notes,expectedDelivery,expectedDeliveryEnd}),onClose);
  useEffect(()=>{if(productLoaded&&!cleanInitialized.current){cleanInitialized.current=true;session.acceptBaseline();}},[productLoaded,session]);
  const changeSupplier=(next:number)=>{if(next===supplierId)return;if(session.dirty)setSwitchSupplier(next);else setSupplierId(next);};
  const supplier = suppliers.find((item) => item.id === supplierId);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;setProductLoading(true);setProductLoaded(false);setProductError('');cleanInitialized.current=false;
    void Promise.all([
      listSupplierProducts(rid, supplierId),
      listSupplierOrderUnitPreferences(rid, supplierId),
    ]).then(([data, preferences]) => {
      if (!active) return;
      setProducts(data);setProductLoaded(true);
      const nextQuantities: Record<string, number> = {};
      const nextPackagings: Record<string, PackagingDraft> = {};
      const nextSelectedUnits: Record<string, string> = {};
      const preferenceByStockItem = new Map(
        preferences.map((preference) => [
          preference.stock_item_id,
          preference.unit,
        ]),
      );
      const productStockIds = new Set(
        data.flatMap((product) =>
          product.stock_item_id ? [product.stock_item_id] : [],
        ),
      );
      data.forEach((product) => {
        const key = `p-${product.id}`;
        const stockItem = stockItems.find(
          (item) => item.id === product.stock_item_id,
        );
        const packaging = packagingFromStock(stockItem);
        nextPackagings[key] = packaging;
        if (stockItem) {
          nextSelectedUnits[key] = preferredOrderUnit(
            preferenceByStockItem.get(stockItem.id),
            buildOrderUnitOptions(stockItem, packaging),
          );
        } else {
          nextSelectedUnits[key] = product.unit;
        }
        if (
          product.stock_item_id &&
          seed.stockItemIds?.includes(product.stock_item_id)
        )
          nextQuantities[key] = 1;
      });
      stockItems.forEach((item) => {
        if (item.supplier_id !== supplierId || productStockIds.has(item.id))
          return;
        const key = `s-${item.id}`;
        const packaging = packagingFromStock(item);
        nextPackagings[key] = packaging;
        nextSelectedUnits[key] = preferredOrderUnit(
          preferenceByStockItem.get(item.id),
          buildOrderUnitOptions(item, packaging),
        );
        if (seed.stockItemIds?.includes(item.id)) nextQuantities[key] = 1;
      });
      setQuantities(nextQuantities);
      setPackagings(nextPackagings);
      setSelectedUnits(nextSelectedUnits);
      setProductSearch("");
      setEditingPackagingKey(null);
    }).catch(cause=>{if(active)setProductError(cause instanceof Error?cause.message:t('supplierLoadFailed'));}).finally(()=>{if(active)setProductLoading(false);});
    return () => {
      active = false;
    };
  }, [rid, seed.stockItemIds, stockItems, supplierId,loadAttempt,t]);
  useEffect(() => {
    if (!supplier) return;
    const upcoming = nextSchedule(supplier);
    if (upcoming) {
      setExpectedDelivery(dateTimeLocalValue(upcoming.delivery.toISOString()));
      setExpectedDeliveryEnd(
        dateTimeLocalValue(upcoming.deliveryEnd.toISOString()),
      );
    } else {
      setExpectedDelivery("");
      setExpectedDeliveryEnd("");
    }
    setDeliveryError("");
  }, [supplier]);
  const linkedStockIds = new Set(
    products.flatMap((product) =>
      product.stock_item_id ? [product.stock_item_id] : [],
    ),
  );
  const supplierStock = stockItems.filter(
    (item) => item.supplier_id === supplierId && !linkedStockIds.has(item.id),
  );
  const rows = [
    ...products.map((product) => {
      const stockItem = stockItems.find(
        (item) => item.id === product.stock_item_id,
      );
      return {
        key: `p-${product.id}`,
        name: product.name,
        unit: (stockItem?.unit ?? product.unit) as StockUnit,
        price: product.price_per_unit,
        supplierProductId: product.id,
        stockItem,
      };
    }),
    ...supplierStock.map((item) => ({
      key: `s-${item.id}`,
      name: item.name,
      unit: item.unit,
      price: item.cost_per_unit,
      supplierProductId: undefined,
      stockItem: item,
    })),
  ];
  const selectedRows = rows.filter((row) => (quantities[row.key] ?? 0) > 0);
  const normalizedSearch = productSearch.trim().toLocaleLowerCase(locale);
  const visibleRows = normalizedSearch
    ? rows.filter((row) =>
        row.name.toLocaleLowerCase(locale).includes(normalizedSearch),
      )
    : rows;
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  });
  const updatePackaging = (key: string, update: Partial<PackagingDraft>) =>
    setPackagings((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  const create = async (continueToSend: boolean) => {
    if (!supplier || !productLoaded || productLoading || selectedRows.length === 0) return;
    setDeliveryError("");
    if (continueToSend && !expectedDelivery) {
      setDeliveryError(t("deliveryDateRequired"));
      return;
    }
    if (
      expectedDeliveryEnd &&
      (!expectedDelivery ||
        new Date(expectedDeliveryEnd) <= new Date(expectedDelivery))
    ) {
      setDeliveryError(t("deliveryWindowInvalid"));
      return;
    }
    await session.run(async()=>{
      const items: PurchaseOrderItemInput[] = selectedRows.map((row) => {
        const packaging =
          packagings[row.key] ?? packagingFromStock(row.stockItem);
        const amount = quantities[row.key];
        const unitOptions: OrderUnitOption[] = row.stockItem
          ? buildOrderUnitOptions(row.stockItem, packaging)
          : [
              {
                value: row.unit,
                kind: "stock",
                baseQuantityPerUnit: 1,
              },
            ];
        const selectedUnit = preferredOrderUnit(
          selectedUnits[row.key],
          unitOptions,
        );
        const baseQuantity = row.stockItem
          ? (selectedOrderQuantityInBase(
              amount,
              selectedUnit,
              unitOptions,
            ) ?? 0)
          : convertOrderUnit(amount, selectedUnit, row.unit);
        const packagingSelected =
          unitOptions.find((option) => option.value === selectedUnit)?.kind ===
          "packaging";
        return {
          supplier_product_id: row.supplierProductId,
          stock_item_id: row.stockItem?.id,
          name: row.name,
          unit: row.unit,
          quantity: baseQuantity,
          order_quantity: amount,
          order_unit: selectedUnit,
          packaging_set: packagingSelected,
          package_count: packagingSelected ? amount : 0,
          units_per_pack: packaging.unitsPerPack,
          unit_size: packaging.unitSize,
          unit_size_unit: packaging.unitSizeUnit,
          container_type: packaging.containerType,
          unit_type: packaging.unitType,
          price_per_unit: row.price,
        };
      });
      const order = await createPurchaseOrder(rid, {
        supplier_id: supplier.id,
        expected_delivery_at: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : null,
        expected_delivery_end_at: expectedDeliveryEnd
          ? new Date(expectedDeliveryEnd).toISOString()
          : null,
        notes,
        items,
      });
      return {order,continueToSend};
    },value=>onCreated(value.order,value.continueToSend));
  };
  return <>
    <FullScreenEditor open title={t('newPurchaseOrder')} subtitle={t('newPurchaseOrderDesc')} showCancel={false} onOpenChange={open=>{if(!open)session.close();}} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap items-center justify-end gap-2"><span className="me-auto text-sm text-fg-secondary">{t('itemsSelectedCount').replace('{count}',String(selectedRows.length))}</span><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button>{session.saved?<Button size="lg" disabled={session.busy} onClick={()=>void create(false)}>{t('retry')}</Button>:<><Button size="lg" variant="secondary" disabled={session.frozen||!productLoaded||productLoading||selectedRows.length===0} onClick={()=>void create(false)}>{t('saveDraft')}</Button><Button size="lg" disabled={session.frozen||!productLoaded||productLoading||selectedRows.length===0} onClick={()=>void create(true)}>{t('continueToSend')}<ChevronRight className="rtl:rotate-180"/></Button></>}</div></div>}>
      <div className="mx-auto max-w-5xl space-y-4">
        {productLoading&&<p role="status" className="text-sm text-fg-secondary">{t('loading')}</p>}
        {productError&&<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{productError}</p><Button variant="secondary" size="lg" onClick={()=>setLoadAttempt(value=>value+1)}>{t('retry')}</Button></div>}
        <fieldset disabled={session.frozen||productLoading||!productLoaded} className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label={t("supplier")}
              value={String(supplierId)}
              onChange={(value) => changeSupplier(Number(value))}
              options={suppliers.map((item) => [String(item.id), item.name])}
            />
            <Field
              label={t("deliveryWindowStart")}
              value={expectedDelivery}
              onChange={(value) => {
                setExpectedDelivery(value);
                setDeliveryError("");
              }}
              type="datetime-local"
            />
            <Field
              label={t("deliveryWindowEnd")}
              value={expectedDeliveryEnd}
              onChange={(value) => {
                setExpectedDeliveryEnd(value);
                setDeliveryError("");
              }}
              type="datetime-local"
            />
          </div>
          <p className="-mt-2 text-fs-xs text-[var(--fg-muted)]">
            {t("deliveryTimingHint")}
          </p>
          {deliveryError && (
            <p role="alert" className="text-fs-sm text-[var(--danger-500)]">
              {deliveryError}
            </p>
          )}
          <div>
            <label className="relative mb-3 block">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder={t("searchItems")}
                aria-label={t("searchItems")}
                className="h-11 w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] ps-10 pe-3 text-base text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:shadow-ring sm:text-fs-sm"
              />
            </label>
            <div className="mb-2 hidden grid-cols-[52px_minmax(0,1fr)_220px] gap-3 px-3 text-fs-xs font-semibold text-[var(--fg-muted)] sm:grid">
              <span aria-hidden="true" />
              <span>{t("productAndStock")}</span>
              <span>{t("quantity")}</span>
            </div>
            <div className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-[var(--line)] sm:overflow-hidden sm:rounded-r-lg sm:border sm:border-[var(--line)]">
              {productLoaded&&visibleRows.map((row) => {
                const packaging =
                  packagings[row.key] ?? packagingFromStock(row.stockItem);
                const amount = quantities[row.key] ?? 0;
                const unitOptions: OrderUnitOption[] = row.stockItem
                  ? buildOrderUnitOptions(row.stockItem, packaging)
                  : [
                      {
                        value: row.unit,
                        kind: "stock",
                        baseQuantityPerUnit: 1,
                      },
                    ];
                const selectedUnit = preferredOrderUnit(
                  selectedUnits[row.key],
                  unitOptions,
                );
                const baseQuantity = row.stockItem
                  ? (selectedOrderQuantityInBase(
                      amount,
                      selectedUnit,
                      unitOptions,
                    ) ?? 0)
                  : convertOrderUnit(amount, selectedUnit, row.unit);
                const showEquivalent =
                  amount > 0 &&
                  (selectedUnit !== row.unit ||
                    unitOptions.find(
                      (option) => option.value === selectedUnit,
                    )?.kind === "packaging");
                const editing = editingPackagingKey === row.key;
                return (
                  <div
                    key={row.key}
                    className={`overflow-hidden rounded-r-lg border sm:rounded-none sm:border-0 ${
                      amount > 0
                        ? "border-[var(--brand-500)]/35 bg-[var(--brand-soft)]"
                        : "border-[var(--line)] bg-[var(--surface)]"
                    }`}
                  >
                    <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-start gap-3 p-3 sm:grid-cols-[52px_minmax(0,1fr)_220px] sm:items-center">
                      <div className="flex size-12 items-center justify-center overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] sm:size-[52px]">
                        {row.stockItem?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.stockItem.image_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-5 text-[var(--fg-subtle)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="break-words text-fs-sm font-semibold text-[var(--fg)]">
                          {row.name}
                        </div>
                        <div className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
                          {row.stockItem
                            ? `${t("currentStock")}: ${numberFormatter.format(row.stockItem.quantity)} ${row.stockItem.unit}`
                            : t("notLinkedToStock")}
                        </div>
                        {row.stockItem && (
                          <button
                            type="button"
                            aria-expanded={editing}
                            onClick={() =>
                              setEditingPackagingKey(editing ? null : row.key)
                            }
                            className="mt-1.5 flex min-h-11 max-w-full items-center gap-1 text-start text-fs-xs font-medium leading-snug text-[var(--brand-ink)] hover:text-[var(--brand-ink)]"
                          >
                            <span className="min-w-0">
                              {packaging.packagingSet
                                ? `${t("lastDeliveryPackaging")}: ${packagingLabel(packaging, t)}`
                                : t("noPackagingSaved")}
                            </span>
                            <Pencil className="size-3 shrink-0" />
                          </button>
                        )}
                      </div>
                      <label className="col-span-2 min-w-0 sm:col-span-1">
                        <span className="mb-1.5 flex items-center justify-between gap-2 text-fs-xs font-medium text-[var(--fg-muted)] sm:hidden">
                          <span>{t("quantity")}</span>
                          {showEquivalent && (
                            <span>
                              = {numberFormatter.format(baseQuantity)}{" "}
                              {labelForRaw(row.unit, t)}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            min={0}
                            value={amount}
                            onChange={(value) =>
                              setQuantities((current) => ({
                                ...current,
                                [row.key]: value,
                              }))
                            }
                            aria-label={`${t("quantity")} · ${row.name}`}
                            className="h-11 min-w-0 flex-1 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-center text-base font-semibold text-[var(--fg)] outline-none focus:shadow-ring sm:h-11 sm:rounded-r-sm sm:px-2 sm:text-fs-sm sm:font-normal"
                          />
                          <select
                            value={selectedUnit}
                            onChange={(event) =>
                              setSelectedUnits((current) => ({
                                ...current,
                                [row.key]: event.target.value,
                              }))
                            }
                            aria-label={`${t("orderUnit")} · ${row.name}`}
                            className="h-11 min-w-[7rem] max-w-[10rem] rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-base font-semibold text-[var(--fg)] outline-none focus:shadow-ring sm:h-11 sm:min-w-[5.5rem] sm:max-w-[8rem] sm:rounded-r-sm sm:text-fs-sm sm:font-normal"
                          >
                            {unitOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {labelForRaw(option.value, t)}
                              </option>
                            ))}
                          </select>
                        </div>
                        {showEquivalent && (
                          <div className="mt-1 hidden text-fs-xs font-medium text-[var(--fg-muted)] sm:block">
                            {numberFormatter.format(amount)}{" "}
                            {labelForRaw(selectedUnit, t)} ={" "}
                            {numberFormatter.format(baseQuantity)}{" "}
                            {labelForRaw(row.unit, t)}
                          </div>
                        )}
                      </label>
                    </div>
                    {editing && row.stockItem && (
                      <PackagingEditor
                        packaging={packaging}
                        stockUnit={row.unit}
                        amount={amount}
                        baseQuantity={baseQuantity}
                        numberFormatter={numberFormatter}
                        onChange={(update) => updatePackaging(row.key, update)}
                      />
                    )}
                  </div>
                );
              })}
              {productLoaded&&visibleRows.length === 0 && (
                <div className="p-8 text-center text-fs-sm text-[var(--fg-muted)]">
                  {rows.length === 0
                    ? t("noSupplierProductsHint")
                    : t("noResults")}
                </div>
              )}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
              {t("notes")}
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:shadow-ring sm:text-fs-sm"
            />
          </label>
        </fieldset>
      </div>
    </FullScreenEditor>{session.confirmation}
    <ConfirmDialog open={switchSupplier!==null} onOpenChange={open=>{if(!open)setSwitchSupplier(null);}} title={t('supplierSwitchTitle')} description={t('supplierSwitchHint')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={()=>{setSupplierId(switchSupplier!);setSwitchSupplier(null);}}/>
  </>;
}

function PackagingEditor({
  packaging,
  stockUnit,
  amount,
  baseQuantity,
  numberFormatter,
  onChange,
}: {
  packaging: PackagingDraft;
  stockUnit: StockUnit;
  amount: number;
  baseQuantity: number;
  numberFormatter: Intl.NumberFormat;
  onChange: (update: Partial<PackagingDraft>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-[var(--line)] bg-[var(--surface)] px-3 py-4 sm:px-4">
      <div className="mb-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="text-fs-sm font-semibold text-[var(--fg)]">
            {t("editPackaging")}
          </div>
          <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
            {t("packagingHelper")}
          </p>
        </div>
        {!packaging.packagingSet && (
          <Button
            size="lg"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() =>
              onChange({
                packagingSet: true,
                containerType: packaging.containerType || "pack",
                unitSizeUnit: stockUnit,
              })
            }
          >
            {t("usePackaging")}
          </Button>
        )}
      </div>
      {packaging.packagingSet && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
                {t("supplierOrderOuterContainer")}
              </span>
              <input
                value={packaging.containerType}
                maxLength={20}
                placeholder={t("containerPlaceholder")}
                onChange={(event) =>
                  onChange({ containerType: event.target.value })
                }
                className="h-11 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
                {t("supplierOrderUnitsPerPackage")}
              </span>
              <NumberInput
                min={0}
                value={packaging.unitsPerPack}
                onChange={(value) => onChange({ unitsPerPack: value })}
                className="h-11 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
                {t("supplierOrderInnerUnit")}
              </span>
              <input
                value={packaging.unitType}
                maxLength={20}
                placeholder={t("innerUnitPlaceholder")}
                onChange={(event) => onChange({ unitType: event.target.value })}
                className="h-11 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
                {t("supplierOrderContentPerUnit")}
              </span>
              <span className="flex gap-2">
                <NumberInput
                  min={0}
                  value={packaging.unitSize}
                  onChange={(value) => onChange({ unitSize: value })}
                  className="h-11 min-w-0 flex-1 rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
                />
                <select
                  aria-label={t("stockContentUnit")}
                  value={packaging.unitSizeUnit}
                  onChange={(event) =>
                    onChange({ unitSizeUnit: event.target.value })
                  }
                  className="h-11 max-w-24 rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-base outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onChange({ packagingSet: false })}
              className="text-fs-xs font-medium text-[var(--fg-muted)] underline-offset-2 hover:text-[var(--fg)] hover:underline"
            >
              {t("supplierOrderRemovePackaging")}
            </button>
            {amount > 0 && (
              <span className="rounded-r-sm bg-[var(--surface-2)] px-3 py-1.5 text-fs-xs font-medium text-[var(--fg-muted)]">
                {t("stockEquivalent")}: {numberFormatter.format(baseQuantity)}{" "}
                {stockUnit}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SendOrderModal({rid,order,restaurantName,onClose,onSent}:{rid:number;order:PurchaseOrder;restaurantName:string;onClose:()=>void;onSent:()=>Promise<void>}) {
  const {t}=useI18n();
  const [preparedOrder,setPreparedOrder]=useState(order);
  const [language,setLanguage]=useState<SupplierOrderLanguage>(order.supplier.preferred_language||'he');
  const [channel,setChannel]=useState<SupplierOrderChannel>(order.supplier.preferred_channel||'whatsapp');
  const [expectedDelivery,setExpectedDelivery]=useState(dateTimeLocalValue(order.expected_delivery_at));
  const [expectedDeliveryEnd,setExpectedDeliveryEnd]=useState(dateTimeLocalValue(order.expected_delivery_end_at));
  const [override,setOverride]=useState<string|null>(null);
  const [awaitingConfirmation,setAwaitingConfirmation]=useState(false);
  const [preparing,setPreparing]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [deliveryError,setDeliveryError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [rebuild,setRebuild]=useState(false);
  const pendingChange=useRef<(()=>void)|null>(null);
  const deliveryReceipt=useRef('');
  const baselineReady=useRef(false);
  const supplier=preparedOrder.supplier;
  const iso=(value:string)=>value&&!Number.isNaN(new Date(value).getTime())?new Date(value).toISOString():null;
  const generated=buildPurchaseOrderMessage({restaurantName,supplierName:localizedSupplierName(supplier,language),expectedDeliveryAt:iso(expectedDelivery),expectedDeliveryEndAt:iso(expectedDeliveryEnd),items:preparedOrder.items,notes:preparedOrder.notes},language);
  const message=channel==='whatsapp'?(override??generated):generated;
  const session=useKitchenMutation<void>(JSON.stringify({language,channel,expectedDelivery,expectedDeliveryEnd,message}),onClose);
  useEffect(()=>{
    if(!session.canManage){setPreparing(false);return;}
    let active=true;setPreparing(true);setLoadError('');
    refreshPurchaseOrderTranslations(rid,order.id).then(next=>{if(active)setPreparedOrder(next);})
      .catch(cause=>{if(active)setLoadError(cause instanceof Error?cause.message:t('translationPreparationFailed'));})
      .finally(()=>{if(active)setPreparing(false);});
    return()=>{active=false;};
  },[rid,order.id,attempt,session.canManage,t]);
  useEffect(()=>{if(!preparing&&!loadError&&!baselineReady.current){baselineReady.current=true;session.acceptBaseline();}},[preparing,loadError,session]);
  const changeMessageSource=(action:()=>void)=>{
    const apply=()=>{action();setOverride(null);setAwaitingConfirmation(false);setDeliveryError('');};
    if(override!==null&&override!==generated){pendingChange.current=apply;setRebuild(true);}else apply();
  };
  const validDelivery=()=>{
    if(!iso(expectedDelivery)){setDeliveryError(t('deliveryDateRequired'));return false;}
    if(expectedDeliveryEnd&&(!iso(expectedDeliveryEnd)||new Date(expectedDeliveryEnd)<=new Date(expectedDelivery))){setDeliveryError(t('deliveryWindowInvalid'));return false;}
    return true;
  };
  const persistDelivery=async()=>{
    const payload={
      supplier_id:preparedOrder.supplier_id,expected_delivery_at:iso(expectedDelivery),expected_delivery_end_at:iso(expectedDeliveryEnd),notes:preparedOrder.notes,
      items:preparedOrder.items.map(item=>({supplier_product_id:item.supplier_product_id,stock_item_id:item.stock_item_id,name:item.name,unit:item.unit,quantity:item.quantity,order_quantity:item.order_quantity,order_unit:item.order_unit,packaging_set:item.packaging_set,package_count:item.package_count,units_per_pack:item.units_per_pack,unit_size:item.unit_size,unit_size_unit:item.unit_size_unit,container_type:item.container_type,unit_type:item.unit_type,translations:item.translations,price_per_unit:item.price_per_unit})),
    };
    const key=JSON.stringify(payload);
    if(deliveryReceipt.current===key)return;
    await updatePurchaseOrder(rid,preparedOrder.id,payload);
    deliveryReceipt.current=key;
  };
  const confirmSend=()=>{
    setDeliveryError('');
    if(!session.saved&&!validDelivery())return;
    if(!session.saved&&channel==='email'&&!supplier.email){setDeliveryError(t('supplierEmailMissing'));return;}
    void session.run(async()=>{
      await persistDelivery();
      if(channel==='email'){const result=await sendOrderEmail(rid,preparedOrder.id,{language});if(!result.sent)throw new Error(t('sendOrderFailed'));}
      else await updatePurchaseOrderStatus(rid,preparedOrder.id,'sent',{channel:'whatsapp',language});
    },onSent);
  };
  const send=()=>{
    if(session.frozen||preparing||loadError)return;
    setDeliveryError('');
    if(!validDelivery())return;
    if(channel==='email'){confirmSend();return;}
    const url=buildWhatsAppUrl(supplier.phone,message);
    if(!url){setDeliveryError(t('invalidWhatsAppPhone'));return;}
    window.open(url,'_blank','noopener,noreferrer');
    setAwaitingConfirmation(true);
  };
  return <>
    <Modal title={t('sendPurchaseOrder')} subtitle={`PO-${order.id} · ${supplier.name}`} size="3xl" onClose={session.close} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}{deliveryError&&<p role="alert" className="text-sm text-[var(--danger-500)]">{deliveryError}</p>}
        {session.saved?<div className="flex justify-end"><Button size="lg" disabled={session.busy} onClick={confirmSend}>{t('retry')}</Button></div>:awaitingConfirmation?<div className="space-y-3"><p className="text-sm">{t('whatsAppConfirmHint')}</p><div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={()=>setAwaitingConfirmation(false)}>{t('notYet')}</Button><Button size="lg" disabled={session.busy||!session.canManage} onClick={confirmSend}><Check/>{t('markSent')}</Button></div></div>:<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t('cancel')}</Button><Button size="lg" disabled={session.frozen||preparing||!!loadError} onClick={send}>{channel==='whatsapp'?<MessageCircle/>:<Mail/>}{t(channel==='whatsapp'?'openWhatsApp':'sendEmail')}</Button></div>}
      </div>}>
      <div className="space-y-4">
        {preparing&&<p role="status" className="text-sm text-fg-secondary">{t('preparingTranslatedNames')}</p>}
        {loadError&&<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>}
        <fieldset disabled={session.frozen||preparing||!!loadError||awaitingConfirmation} className="min-w-0 space-y-4">
          <div role="group" aria-label={t('preferredChannel')} className="grid gap-3 sm:grid-cols-2">{(['whatsapp','email']as const).map(value=><button key={value} type="button" aria-pressed={channel===value} onClick={()=>{setChannel(value);setDeliveryError('');}} className={`min-w-0 rounded-r-md border p-4 text-start ${channel===value?'border-[var(--brand-ink)] bg-[var(--brand-soft)]':'border-[var(--line-strong)]'}`}>
            <span className="flex items-center gap-2 font-semibold">{value==='whatsapp'?<MessageCircle className="size-5"/>:<Mail className="size-5"/>}{value==='whatsapp'?'WhatsApp':t('email')}</span><bdi className="mt-2 block break-all text-sm text-fg-secondary">{value==='whatsapp'?(supplier.phone||t('phoneMissing')):(supplier.email||t('emailMissing'))}</bdi>
          </button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={t('deliveryWindowStart')} value={expectedDelivery} type="datetime-local" onChange={value=>changeMessageSource(()=>setExpectedDelivery(value))}/><Field label={t('deliveryWindowEnd')} value={expectedDeliveryEnd} type="datetime-local" onChange={value=>changeMessageSource(()=>setExpectedDeliveryEnd(value))}/></div>
          <p className="text-sm text-fg-secondary">{t('deliveryTimingHint')}</p>
          <SelectField label={t('messageLanguage')} value={language} onChange={value=>changeMessageSource(()=>setLanguage(value as SupplierOrderLanguage))} options={['he','fr','en'].map(value=>[value,t(`language_${value}`)])}/>
          {channel==='email'&&<p className="text-sm text-fg-secondary">{t('supplierEmailPreviewHint')}</p>}
          <label className="block space-y-2 text-sm"><span>{t('messagePreview')}</span><textarea dir={language==='he'?'rtl':'ltr'} lang={language} value={message} readOnly={channel==='email'} onChange={event=>setOverride(event.target.value)} rows={9} className="input w-full resize-y px-3 py-3 text-base leading-relaxed [unicode-bidi:plaintext]"/></label>
        </fieldset>
      </div>
    </Modal>{session.confirmation}
    <ConfirmDialog open={rebuild} onOpenChange={setRebuild} title={t('supplierRebuildMessageTitle')} description={t('supplierRebuildMessageHint')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={()=>{setRebuild(false);pendingChange.current?.();pendingChange.current=null;}}/>
  </>;
}

function ReceiveOrderModal({rid,order,onClose,onReceived}:{rid:number;order:PurchaseOrder;onClose:()=>void;onReceived:()=>Promise<void>}) {
  const {t}=useI18n();
  const formId=useId();
  const [items,setItems]=useState(order.items.map(item=>({item_id:item.id,received_qty:item.quantity})));
  const session=useKitchenMutation<PurchaseOrder>(JSON.stringify(items),onClose);
  return <>
    <Modal title={t('receiveOrder')} subtitle={`PO-${order.id} · ${order.supplier?.name??''}`} size="3xl" onClose={session.close} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={session.busy||!session.canManage}><PackageCheck/>{t(session.busy?'saving':session.saved?'retry':'markAsReceived')}</Button></div></div>}>
      <p className="mb-5 text-sm text-fg-secondary">{t('receivePurchaseImpact')}</p>
      <form id={formId} onSubmit={event=>{event.preventDefault();void session.run(()=>receivePurchaseOrder(rid,order.id,items),onReceived);}}><fieldset disabled={session.frozen} className="min-w-0 divide-y divide-[var(--line)]">{order.items.map((item,index)=><div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
        <div className="min-w-0"><h3 className="break-words text-base font-semibold"><bdi>{item.name}</bdi></h3><p className="mt-1 text-sm text-fg-secondary">{t('ordered')} : <bdi>{item.quantity} {labelForRaw(item.unit,t)}</bdi></p>{!item.stock_item_id&&<p className="mt-1 text-sm text-fg-secondary">{t('notLinkedToStock')}</p>}</div>
        <label className="space-y-2 text-sm"><span>{t('receivedQty')} · <bdi>{labelForRaw(item.unit,t)}</bdi></span><NumberInput min={0} className="input min-h-11 w-full" aria-label={`${t('receivedQty')} — ${item.name} (${item.unit})`} value={items[index].received_qty} onChange={value=>setItems(previous=>previous.map((entry,i)=>i===index?{...entry,received_qty:value}:entry))}/></label>
      </div>)}</fieldset></form>
    </Modal>{session.confirmation}
  </>;
}

function SupplierProductsModal({supplier,rid,stockItems,sourceLocale,onClose}: {
  supplier:Supplier;rid:number;stockItems:StockItem[];sourceLocale:Locale;onClose:()=>void;
}) {
  const {t}=useI18n();
  const {money}=useCurrency();
  const {hasAnyPermission}=usePermissions();
  const canManage=hasAnyPermission('kitchen.manage');
  const [products,setProducts]=useState<SupplierProduct[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState<SupplierProduct|null|undefined>();
  const [removing,setRemoving]=useState<SupplierProduct|null>(null);
  const guard=useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const load=useCallback(async()=>{
    const request=guard.current.begin(rid);setLoading(true);setError('');
    try{const next=await listSupplierProducts(rid,supplier.id);if(guard.current.isCurrent(request)){setProducts(next);setLoaded(true);}}
    catch(cause){if(guard.current.isCurrent(request))setError(cause instanceof Error?cause.message:t('supplierLoadFailed'));throw cause;}
    finally{if(guard.current.isCurrent(request))setLoading(false);}
  },[rid,supplier.id,t]);
  useEffect(()=>{void load().catch(()=>{});const requests=guard.current;return()=>requests.invalidate();},[load]);
  return <>
    <Modal title={t('supplierProducts')} subtitle={supplier.name} size="3xl" onClose={onClose} closeDisabled={editing!==undefined||!!removing}>
      <div className="space-y-4">
        {error&&<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button variant="secondary" size="lg" disabled={loading} onClick={()=>void load().catch(()=>{})}>{t('retry')}</Button></div>}
        {canManage&&<div className="flex justify-end"><Button size="lg" disabled={!loaded||loading} onClick={()=>setEditing(null)}><Plus/>{t('addProduct')}</Button></div>}
        {!loaded&&loading?<p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>:loaded&&products.length===0?<p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('noSupplierProductsHint')}</p>:<ul className="divide-y divide-[var(--line)]">{products.map(product=><li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0 flex-1"><h3 className="break-words font-semibold"><bdi>{product.name}</bdi></h3><p className="mt-1 text-sm text-fg-secondary"><bdi>{product.sku||'—'}</bdi> · <bdi>{money(product.price_per_unit)} / {labelForRaw(product.unit,t)}</bdi></p><p className="mt-1 text-xs text-fg-secondary">{product.stock_item_id?<bdi>{stockItems.find(item=>item.id===product.stock_item_id)?.name||product.stock_item?.name||`#${product.stock_item_id}`}</bdi>:t('notLinkedToStock')}</p></div>
          {canManage&&<div className="flex gap-2"><Button variant="ghost" size="lg" icon aria-label={`${t('edit')} — ${product.name}`} onClick={()=>setEditing(product)}><Pencil/></Button><Button variant="ghost" size="lg" icon aria-label={`${t('delete')} — ${product.name}`} onClick={()=>setRemoving(product)}><Trash2/></Button></div>}
        </li>)}</ul>}
      </div>
    </Modal>
    {editing!==undefined&&<ProductEditor key={editing?.id??'new'} editing={editing??undefined} stockItems={stockItems} sourceLocale={sourceLocale} onClose={()=>setEditing(undefined)} onSave={input=>editing?updateSupplierProduct(rid,supplier.id,editing.id,input):createSupplierProduct(rid,supplier.id,input)} onSaved={load}/>}
    {removing&&<SupplierActionDialog title={t('deleteProductConfirm')} confirmLabel={t('delete')} description={removing.name} execute={()=>deleteSupplierProduct(rid,supplier.id,removing.id)} onSaved={load} onClose={()=>setRemoving(null)}/>}
  </>;
}

function ProductEditor({editing,stockItems,sourceLocale,onClose,onSave,onSaved}: {
  editing?:SupplierProduct;stockItems:StockItem[];sourceLocale:Locale;onClose:()=>void;onSave:(input:SupplierProductInput)=>Promise<SupplierProduct>;onSaved:()=>Promise<void>;
}) {
  const {t}=useI18n();
  const formId=useId();
  const [name,setName]=useState(editing?.name??'');
  const [translations,setTranslations]=useState<TranslationMap>(editing?.translations??{});
  const [sku,setSku]=useState(editing?.sku??'');
  const [unit,setUnit]=useState(editing?.unit??'unit');
  const [price,setPrice]=useState(editing?.price_per_unit??0);
  const [stockItemId,setStockItemId]=useState(editing?.stock_item_id?String(editing.stock_item_id):'');
  const session=useKitchenMutation<SupplierProduct>(JSON.stringify({name,translations,sku,unit,price,stockItemId}),onClose);
  const save=()=>{if(!name.trim())return;void session.run(()=>onSave({name:name.trim(),translations,sku,unit,price_per_unit:price,stock_item_id:stockItemId?Number(stockItemId):null}),onSaved);};
  return <>
    <Modal title={t(editing?'editProduct':'addProduct')} size="xl" onClose={session.close} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={session.busy||!session.canManage||!name.trim()}>{t(session.busy?'saving':session.saved?'retry':'save')}</Button></div></div>}>
      <form id={formId} onSubmit={event=>{event.preventDefault();save();}}><fieldset disabled={session.frozen} className="min-w-0 space-y-4">
        <LocalizedOrderNameField sourceLocale={sourceLocale} name={name} translations={translations} onNameChange={setName} onTranslationsChange={setTranslations}/>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={t('sku')} value={sku} onChange={setSku}/><SelectField label={t('unit')} value={unit} onChange={setUnit} options={Array.from(new Set([...UNITS,unit])).map(value=>[value,labelForRaw(value,t)])}/>
          <label className="min-w-0 space-y-2 text-sm"><span>{t('pricePerUnit')}</span><NumberInput className="input min-h-11 w-full" min={0} value={price} onChange={setPrice}/></label>
        </div>
        <SelectField label={t('linkedStockItem')} value={stockItemId} onChange={setStockItemId} options={[
          ['', '—'],...stockItems.map(item=>[String(item.id),`${item.name} (${item.unit})`]),
          ...(stockItemId&&!stockItems.some(item=>String(item.id)===stockItemId)?[[stockItemId,editing?.stock_item?.name||`#${stockItemId}`]]:[]),
        ]}/>
      </fieldset></form>
    </Modal>{session.confirmation}
  </>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-11 min-w-0 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] outline-none focus:shadow-ring sm:h-11 sm:text-fs-sm"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
