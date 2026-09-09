"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  listSupplierProducts,
  listSuppliers,
  receivePurchaseOrder,
  sendOrderEmail,
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
} from "@/lib/api";
import Modal from "@/components/Modal";
import SupplierHubTabs, {
  type SupplierHubTab,
} from "@/components/suppliers/SupplierHubTabs";
import { Button, EmptyState, PageHead } from "@/components/ds";
import { NumberInput } from "@/components/ui/NumberInput";
import { labelForRaw } from "@/components/stock/StockQuantityForm";
import { useI18n, useCurrency } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import {
  buildPurchaseOrderMessage,
  buildWhatsAppUrl,
} from "@/lib/suppliers/order-message";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Mail,
  MessageCircle,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
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
    parts.push(`× ${packaging.unitSize} ${packaging.unitSizeUnit}`);
  }
  return parts.join(" ");
}

function convertOrderUnit(quantity: number, from: string, to: string): number {
  if (!from || !to || from === to) return quantity;
  const factors: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 };
  if (!(from in factors) || !(to in factors)) return quantity;
  return (quantity * factors[from]) / factors[to];
}

function orderBaseQuantity(
  packageCount: number,
  packaging: PackagingDraft,
  stockUnit: StockUnit,
): number {
  if (!packaging.packagingSet) return packageCount;
  let quantity = packageCount;
  if (packaging.unitsPerPack > 0) quantity *= packaging.unitsPerPack;
  if (packaging.unitSize > 0) {
    quantity *= packaging.unitSize;
    quantity = convertOrderUnit(
      quantity,
      packaging.unitSizeUnit || stockUnit,
      stockUnit,
    );
  }
  return quantity;
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

function nextSchedule(
  supplier: Supplier,
): { schedule: SupplierDeliverySchedule; delivery: Date; cutoff: Date } | null {
  const now = new Date();
  const candidates = (supplier.schedules ?? []).flatMap((schedule) => {
    const values: {
      schedule: SupplierDeliverySchedule;
      delivery: Date;
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
      values.push({ schedule, delivery, cutoff });
      break;
    }
    return values;
  });
  return (
    candidates.sort((a, b) => a.delivery.getTime() - b.delivery.getTime())[0] ??
    null
  );
}

export default function SuppliersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
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
  const [loading, setLoading] = useState(true);
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

  const reload = useCallback(async () => {
    setError("");
    try {
      const [supplierData, orderData, stockData, restaurant] =
        await Promise.all([
          listSuppliers(rid),
          listPurchaseOrders(rid),
          listStockItems(rid),
          getRestaurant(rid),
        ]);
      setSuppliers(supplierData);
      setOrders(orderData);
      setStockItems(stockData);
      setRestaurantName(restaurant.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("supplierLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => {
    void reload();
  }, [reload]);
  const lowItems = useMemo(() => stockItems.filter(isLow), [stockItems]);
  const setTab = (tab: SupplierHubTab) =>
    router.replace(`/${rid}/kitchen/suppliers?tab=${tab}`);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-[var(--brand-500)] border-t-transparent" />
      </div>
    );

  return (
    <div className="min-w-0">
      <PageHead
        title={t("supplierHubTitle")}
        desc={t("supplierHubDesc")}
        actions={
          canManage ? (
            <Button
              size="lg"
              onClick={() => setOrderSeed({})}
              disabled={suppliers.length === 0}
            >
              <Plus /> {t("newPurchaseOrder")}
            </Button>
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
          {error}
        </div>
      )}

      {activeTab === "needs" && (
        <NeedsTab
          suppliers={suppliers}
          stockItems={stockItems}
          locale={locale}
          canManage={canManage}
          onOrder={setOrderSeed}
          onOpenSuppliers={() => setTab("suppliers")}
        />
      )}
      {activeTab === "orders" && (
        <OrdersTab
          orders={orders}
          locale={locale}
          canManage={canManage}
          onSend={setSendOrder}
          onReceive={setReceiveOrder}
          onCancel={async (order) => {
            await updatePurchaseOrderStatus(rid, order.id, "cancelled");
            await reload();
          }}
          onDelete={async (order) => {
            if (confirm(t("deletePurchaseOrderConfirm"))) {
              await deletePurchaseOrder(rid, order.id);
              await reload();
            }
          }}
        />
      )}
      {activeTab === "suppliers" && (
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
          onDelete={async (supplier) => {
            if (confirm(t("deleteSupplierConfirm"))) {
              await deleteSupplier(rid, supplier.id);
              await reload();
            }
          }}
        />
      )}

      {supplierModal.open && (
        <SupplierFormModal
          editing={supplierModal.editing}
          onClose={() => setSupplierModal({ open: false })}
          onSave={async (input) => {
            if (supplierModal.editing)
              await updateSupplier(rid, supplierModal.editing.id, input);
            else await createSupplier(rid, input);
            setSupplierModal({ open: false });
            await reload();
          }}
        />
      )}
      {productsSupplier && (
        <SupplierProductsModal
          supplier={productsSupplier}
          rid={rid}
          stockItems={stockItems}
          onClose={() => {
            setProductsSupplier(null);
            void reload();
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
            setOrderSeed(null);
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
            setSendOrder(null);
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
            setReceiveOrder(null);
            await reload();
          }}
        />
      )}
    </div>
  );
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
    <div className="space-y-[var(--s-6)]">
      <WeeklyDeliveryRail suppliers={suppliers} locale={locale} />
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-fs-xl font-semibold text-[var(--fg)]">
              {t("orderToday")}
            </h2>
            <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
              {t("orderTodayDesc")}
            </p>
          </div>
          {lowItems.length > 0 && (
            <span className="text-fs-sm font-medium text-[var(--danger-500)]">
              {lowItems.length} {t("items")}
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
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-[var(--fg)]">
                        {supplier.name}
                      </h3>
                      {upcoming ? (
                        <p
                          className={`mt-1 text-fs-xs ${cutoffPassed ? "text-[var(--danger-500)]" : "text-[var(--fg-muted)]"}`}
                        >
                          {t("nextDelivery")}:{" "}
                          {dateTimeLabel(
                            upcoming.delivery.toISOString(),
                            locale,
                          )}{" "}
                          · {t("orderBefore")}:{" "}
                          {dateTimeLabel(upcoming.cutoff.toISOString(), locale)}
                        </p>
                      ) : (
                        <p className="mt-1 text-fs-xs text-[var(--warning-500)]">
                          {t("scheduleMissing")}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onOrder({
                            supplierId: supplier.id,
                            stockItemIds: items.map((item) => item.id),
                          })
                        }
                      >
                        {t("orderFromSupplier")} <ChevronRight />
                      </Button>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-fs-sm"
                      >
                        <div className="flex size-10 items-center justify-center overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
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
                        <span className="truncate font-medium text-[var(--fg)]">
                          {item.name}
                        </span>
                        <span className="text-[var(--fg-muted)]">
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
                <div className="flex flex-wrap items-center justify-between gap-4">
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
                      size="sm"
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
  return (
    <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <CalendarDays className="size-4 text-[var(--brand-500)]" />
        <h2 className="font-semibold text-[var(--fg)]">
          {t("upcomingDeliveries")}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7">
          {days.map(({ date, slots }, index) => (
            <div
              key={date.toISOString()}
              className={`min-h-28 p-3 ${index > 0 ? "border-s border-[var(--line)]" : ""}`}
            >
              <div className="text-fs-xs font-medium text-[var(--fg-muted)]">
                {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
                  date,
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
                      className="rounded-r-sm bg-[var(--brand-50)] px-2 py-1.5 text-fs-xs text-[var(--brand-800)]"
                    >
                      <div className="truncate font-semibold">
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
        <label className="relative min-w-60 flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchSuppliers")}
            className="h-11 w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] ps-10 pe-3 text-fs-sm outline-none focus:shadow-ring"
          />
        </label>
        {canManage && (
          <Button variant="secondary" onClick={onAdd}>
            <Plus />
            {t("addSupplier")}
          </Button>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Truck />}
          title={t("noSuppliers")}
          desc={t("noSuppliersHint")}
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
                  <button
                    onClick={() => onProducts(supplier)}
                    className="w-fit text-fs-sm font-medium text-[var(--brand-600)] hover:underline"
                  >
                    {supplier.products?.length ?? 0} {t("products")}
                  </button>
                  {canManage && (
                    <div className="flex items-center gap-1 md:justify-end">
                      <button
                        onClick={() => onOrder(supplier)}
                        title={t("newPurchaseOrder")}
                        className="rounded-r-sm p-2 text-[var(--brand-600)] hover:bg-[var(--brand-50)]"
                      >
                        <Send className="size-4" />
                      </button>
                      <button
                        onClick={() => onEdit(supplier)}
                        title={t("edit")}
                        className="rounded-r-sm p-2 text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => onDelete(supplier)}
                        title={t("delete")}
                        className="rounded-r-sm p-2 text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
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
            className="grid gap-2 px-4 py-4 md:grid-cols-[.7fr_1.2fr_1.1fr_1fr_.8fr_auto] md:items-center md:gap-4"
          >
            <span className="font-semibold text-[var(--fg)]">
              PO-{order.id}
            </span>
            <div>
              <div className="text-fs-sm font-medium text-[var(--fg)]">
                {order.supplier?.name || "—"}
              </div>
              <div className="text-fs-xs text-[var(--fg-muted)]">
                {order.items?.length ?? 0} {t("items")}
              </div>
            </div>
            <span className="text-fs-sm text-[var(--fg-muted)]">
              {dateTimeLabel(order.expected_delivery_at, locale)}
            </span>
            <span
              className={`w-fit rounded-full px-2.5 py-1 text-fs-xs font-semibold ${order.status === "received" ? "bg-[var(--success-50)] text-[var(--success-500)]" : order.status === "cancelled" ? "bg-[var(--danger-50)] text-[var(--danger-500)]" : order.status === "sent" ? "bg-[var(--info-50)] text-[var(--info-500)]" : "bg-[var(--surface-2)] text-[var(--fg-muted)]"}`}
            >
              {t(`purchaseOrderStatus_${order.status}`)}
            </span>
            <span className="text-fs-sm font-medium text-[var(--fg)]">
              {money(order.total_amount)}
            </span>
            {canManage && (
              <div className="flex items-center gap-1 md:justify-end">
                {order.status === "draft" && (
                  <button
                    onClick={() => onSend(order)}
                    className="rounded-r-sm p-2 text-[var(--brand-600)] hover:bg-[var(--brand-50)]"
                    title={t("sendOrder")}
                  >
                    <Send className="size-4" />
                  </button>
                )}
                {order.status === "sent" && (
                  <button
                    onClick={() => onReceive(order)}
                    className="rounded-r-sm p-2 text-[var(--success-500)] hover:bg-[var(--success-50)]"
                    title={t("receiveOrder")}
                  >
                    <CheckCircle2 className="size-4" />
                  </button>
                )}
                {(order.status === "draft" || order.status === "sent") && (
                  <button
                    onClick={() => onCancel(order)}
                    className="rounded-r-sm p-2 text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                    title={t("cancel")}
                  >
                    <XCircle className="size-4" />
                  </button>
                )}
                {order.status === "draft" && (
                  <button
                    onClick={() => onDelete(order)}
                    className="rounded-r-sm p-2 text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
                    title={t("delete")}
                  >
                    <Trash2 className="size-4" />
                  </button>
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
  onClose,
  onSave,
}: {
  editing?: Supplier;
  onClose: () => void;
  onSave: (input: Parameters<typeof createSupplier>[1]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? "");
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
  const [saving, setSaving] = useState(false);
  const updateSchedule = (
    index: number,
    patch: Partial<SupplierDeliveryScheduleInput>,
  ) =>
    setSchedules((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        contact_name: contactName,
        phone,
        email,
        address,
        notes,
        preferred_channel: channel,
        preferred_language: language,
        schedules,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={editing ? t("editSupplier") : t("addSupplier")}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("supplierName")}
            value={name}
            onChange={setName}
            required
          />
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
              variant="secondary"
              size="sm"
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
                className="grid gap-2 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 sm:grid-cols-[1.1fr_.8fr_.8fr_.8fr_.8fr_auto] sm:items-end"
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
                  onClick={() =>
                    setSchedules((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  className="mb-0.5 rounded-r-sm p-2 text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
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
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={saving || !name.trim()} onClick={save}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </Modal>
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
  const [packagings, setPackagings] = useState<Record<string, PackagingDraft>>(
    {},
  );
  const [editingPackagingKey, setEditingPackagingKey] = useState<string | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [saving, setSaving] = useState(false);
  const supplier = suppliers.find((item) => item.id === supplierId);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    void listSupplierProducts(rid, supplierId).then((data) => {
      if (!active) return;
      setProducts(data);
      const nextQuantities: Record<string, number> = {};
      const nextPackagings: Record<string, PackagingDraft> = {};
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
        nextPackagings[key] = packagingFromStock(stockItem);
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
        nextPackagings[key] = packagingFromStock(item);
        if (seed.stockItemIds?.includes(item.id)) nextQuantities[key] = 1;
      });
      setQuantities(nextQuantities);
      setPackagings(nextPackagings);
      setEditingPackagingKey(null);
    });
    return () => {
      active = false;
    };
  }, [rid, seed.stockItemIds, stockItems, supplierId]);
  useEffect(() => {
    if (!supplier) return;
    const upcoming = nextSchedule(supplier);
    if (upcoming) {
      const local = new Date(
        upcoming.delivery.getTime() -
          upcoming.delivery.getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 16);
      setExpectedDelivery(local);
    } else setExpectedDelivery("");
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
    ...products.map((product) => ({
      key: `p-${product.id}`,
      name: product.name,
      unit: product.unit as StockUnit,
      price: product.price_per_unit,
      supplierProductId: product.id,
      stockItem: stockItems.find((item) => item.id === product.stock_item_id),
    })),
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
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  });
  const updatePackaging = (key: string, update: Partial<PackagingDraft>) =>
    setPackagings((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  const create = async (continueToSend: boolean) => {
    if (!supplier || selectedRows.length === 0) return;
    setSaving(true);
    try {
      const items: PurchaseOrderItemInput[] = selectedRows.map((row) => {
        const packaging =
          packagings[row.key] ?? packagingFromStock(row.stockItem);
        const packageCount = quantities[row.key];
        return {
          supplier_product_id: row.supplierProductId,
          stock_item_id: row.stockItem?.id,
          name: row.name,
          unit: row.unit,
          quantity: orderBaseQuantity(packageCount, packaging, row.unit),
          packaging_set: packaging.packagingSet,
          package_count: packaging.packagingSet ? packageCount : 0,
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
        notes,
        items,
      });
      await onCreated(order, continueToSend);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full max-w-3xl flex-col bg-[var(--surface)] shadow-3">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-fs-xl font-semibold text-[var(--fg)]">
              {t("newPurchaseOrder")}
            </h2>
            <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
              {t("newPurchaseOrderDesc")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-r-sm p-2 text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t("supplier")}
              value={String(supplierId)}
              onChange={(value) => setSupplierId(Number(value))}
              options={suppliers.map((item) => [String(item.id), item.name])}
            />
            <Field
              label={t("expectedDelivery")}
              value={expectedDelivery}
              onChange={setExpectedDelivery}
              type="datetime-local"
            />
          </div>
          <div>
            <div className="mb-2 grid grid-cols-[52px_minmax(0,1fr)_140px] gap-3 px-3 text-fs-xs font-semibold text-[var(--fg-muted)]">
              <span aria-hidden="true" />
              <span>{t("productAndStock")}</span>
              <span>{t("quantity")}</span>
            </div>
            <div className="divide-y divide-[var(--line)] overflow-hidden rounded-r-lg border border-[var(--line)]">
              {rows.map((row) => {
                const packaging =
                  packagings[row.key] ?? packagingFromStock(row.stockItem);
                const amount = quantities[row.key] ?? 0;
                const baseQuantity = orderBaseQuantity(
                  amount,
                  packaging,
                  row.unit,
                );
                const editing = editingPackagingKey === row.key;
                return (
                  <div
                    key={row.key}
                    className={
                      amount > 0 ? "bg-[var(--brand-50)]/60" : undefined
                    }
                  >
                    <div className="grid grid-cols-[52px_minmax(0,1fr)_140px] items-center gap-3 px-3 py-3">
                      <div className="flex size-[52px] items-center justify-center overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
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
                        <div className="truncate text-fs-sm font-medium text-[var(--fg)]">
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
                            className="mt-1.5 flex max-w-full items-center gap-1 text-start text-fs-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-700)]"
                          >
                            <span className="truncate">
                              {packaging.packagingSet
                                ? `${t("lastDeliveryPackaging")}: ${packagingLabel(packaging, t)}`
                                : t("noPackagingSaved")}
                            </span>
                            <Pencil className="size-3 shrink-0" />
                          </button>
                        )}
                      </div>
                      <div className="min-w-0">
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
                            className="h-9 min-w-0 flex-1 rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-fs-sm"
                          />
                          <span className="max-w-16 truncate text-fs-xs text-[var(--fg-muted)]">
                            {packaging.packagingSet
                              ? labelForRaw(packaging.containerType, t) ||
                                row.unit
                              : row.unit}
                          </span>
                        </div>
                        {packaging.packagingSet && amount > 0 && (
                          <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
                            = {numberFormatter.format(baseQuantity)} {row.unit}
                          </div>
                        )}
                      </div>
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
              {rows.length === 0 && (
                <div className="p-8 text-center text-fs-sm text-[var(--fg-muted)]">
                  {t("noSupplierProductsHint")}
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
              className="w-full rounded-r-md border border-[var(--line-strong)] px-3 py-2 text-fs-sm outline-none focus:shadow-ring"
            />
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-4 sm:px-6">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="secondary"
            disabled={saving || selectedRows.length === 0}
            onClick={() => create(false)}
          >
            {t("saveDraft")}
          </Button>
          <Button
            disabled={saving || selectedRows.length === 0}
            onClick={() => create(true)}
          >
            {t("continueToSend")}
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
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
    <div className="border-t border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-fs-sm font-semibold text-[var(--fg)]">
            {t("editPackaging")}
          </div>
          <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
            {t("packagingHelper")}
          </p>
        </div>
        {!packaging.packagingSet && (
          <Button
            size="sm"
            variant="secondary"
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
                className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm outline-none focus:shadow-ring"
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
                className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm outline-none focus:shadow-ring"
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
                className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm outline-none focus:shadow-ring"
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
                  className="h-10 min-w-0 flex-1 rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm outline-none focus:shadow-ring"
                />
                <select
                  value={packaging.unitSizeUnit}
                  onChange={(event) =>
                    onChange({ unitSizeUnit: event.target.value })
                  }
                  className="h-10 rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-fs-sm outline-none focus:shadow-ring"
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

function SendOrderModal({
  rid,
  order,
  restaurantName,
  onClose,
  onSent,
}: {
  rid: number;
  order: PurchaseOrder;
  restaurantName: string;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const { t } = useI18n();
  const supplier = order.supplier;
  const [language, setLanguage] = useState<SupplierOrderLanguage>(
    supplier.preferred_language || "he",
  );
  const [channel, setChannel] = useState<SupplierOrderChannel>(
    supplier.preferred_channel || "whatsapp",
  );
  const [message, setMessage] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      setMessage(
        buildPurchaseOrderMessage(
          {
            restaurantName,
            supplierName: supplier.name,
            expectedDeliveryAt: order.expected_delivery_at,
            items: order.items,
            notes: order.notes,
          },
          language,
        ),
      ),
    [language, order, restaurantName, supplier.name],
  );
  const send = async () => {
    setError("");
    if (channel === "whatsapp") {
      const url = buildWhatsAppUrl(supplier.phone, message);
      if (!url) {
        setError(t("invalidWhatsAppPhone"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setAwaitingConfirmation(true);
      return;
    }
    if (!supplier.email) {
      setError(t("supplierEmailMissing"));
      return;
    }
    setSending(true);
    try {
      await sendOrderEmail(rid, order.id, { language });
      await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sendOrderFailed"));
    } finally {
      setSending(false);
    }
  };
  const confirmWhatsApp = async () => {
    setSending(true);
    try {
      await updatePurchaseOrderStatus(rid, order.id, "sent", {
        channel: "whatsapp",
        language,
      });
      await onSent();
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal title={t("sendPurchaseOrder")} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setChannel("whatsapp");
              setAwaitingConfirmation(false);
            }}
            className={`rounded-r-md border p-4 text-start ${channel === "whatsapp" ? "border-[var(--brand-500)] bg-[var(--brand-50)] shadow-ring" : "border-[var(--line)]"}`}
          >
            <MessageCircle className="mb-2 size-5 text-[var(--success-500)]" />
            <div className="font-semibold">WhatsApp</div>
            <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
              {supplier.phone || t("phoneMissing")}
            </div>
          </button>
          <button
            onClick={() => {
              setChannel("email");
              setAwaitingConfirmation(false);
            }}
            className={`rounded-r-md border p-4 text-start ${channel === "email" ? "border-[var(--brand-500)] bg-[var(--brand-50)] shadow-ring" : "border-[var(--line)]"}`}
          >
            <Mail className="mb-2 size-5 text-[var(--info-500)]" />
            <div className="font-semibold">{t("email")}</div>
            <div className="mt-1 truncate text-fs-xs text-[var(--fg-muted)]">
              {supplier.email || t("emailMissing")}
            </div>
          </button>
        </div>
        <SelectField
          label={t("messageLanguage")}
          value={language}
          onChange={(value) => {
            setLanguage(value as SupplierOrderLanguage);
            setAwaitingConfirmation(false);
          }}
          options={[
            ["he", t("language_he")],
            ["fr", t("language_fr")],
            ["en", t("language_en")],
          ]}
        />
        <label className="block">
          <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
            {t("messagePreview")}
          </span>
          <textarea
            dir={language === "he" ? "rtl" : "ltr"}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={11}
            className="w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-fs-sm leading-relaxed outline-none focus:bg-[var(--surface)] focus:shadow-ring"
          />
        </label>
        {error && (
          <p role="alert" className="text-fs-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}
        {awaitingConfirmation ? (
          <div className="rounded-r-md border border-[var(--info-500)]/30 bg-[var(--info-50)] p-4">
            <p className="text-fs-sm font-medium text-[var(--fg)]">
              {t("whatsAppOpened")}
            </p>
            <p className="mt-1 text-fs-xs text-[var(--fg-muted)]">
              {t("whatsAppConfirmHint")}
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled={sending} onClick={confirmWhatsApp}>
                <Check />
                {t("markSent")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setAwaitingConfirmation(false)}
              >
                {t("notYet")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button disabled={sending} onClick={send}>
              {channel === "whatsapp" ? <MessageCircle /> : <Mail />}
              {channel === "whatsapp" ? t("openWhatsApp") : t("sendEmail")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReceiveOrderModal({
  rid,
  order,
  onClose,
  onReceived,
}: {
  rid: number;
  order: PurchaseOrder;
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState(
    order.items.map((item) => ({
      item_id: item.id,
      received_qty: item.quantity,
    })),
  );
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={t("receiveOrder")} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-fs-sm text-[var(--fg-muted)]">
          PO-{order.id} · {order.supplier?.name}
        </p>
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-r-md border border-[var(--line)]">
          {order.items.map((item, index) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 px-3 py-3"
            >
              <div>
                <div className="text-fs-sm font-medium">{item.name}</div>
                <div className="text-fs-xs text-[var(--fg-muted)]">
                  {t("ordered")}: {item.quantity} {item.unit}
                </div>
              </div>
              <NumberInput
                min={0}
                value={items[index].received_qty}
                onChange={(value) =>
                  setItems((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, received_qty: value } : entry,
                    ),
                  )
                }
                className="h-9 rounded-r-sm border border-[var(--line-strong)] px-2"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await receivePurchaseOrder(rid, order.id, items);
                await onReceived();
              } finally {
                setSaving(false);
              }
            }}
          >
            <PackageCheck />
            {t("markAsReceived")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SupplierProductsModal({
  supplier,
  rid,
  stockItems,
  onClose,
}: {
  supplier: Supplier;
  rid: number;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [editing, setEditing] = useState<SupplierProduct | null | undefined>(
    undefined,
  );
  const load = useCallback(
    () => listSupplierProducts(rid, supplier.id).then(setProducts),
    [rid, supplier.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Modal
      title={`${supplier.name} · ${t("supplierProducts")}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus />
            {t("addProduct")}
          </Button>
        </div>
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-r-md border border-[var(--line)]">
          {products.map((product) => (
            <div
              key={product.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
            >
              <div>
                <div className="text-fs-sm font-medium">{product.name}</div>
                <div className="text-fs-xs text-[var(--fg-muted)]">
                  {product.sku || "—"} · {product.price_per_unit} /{" "}
                  {product.unit}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(product)}
                  className="rounded-r-sm p-2 hover:bg-[var(--surface-2)]"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={async () => {
                    if (confirm(t("deleteProductConfirm"))) {
                      await deleteSupplierProduct(rid, supplier.id, product.id);
                      await load();
                    }
                  }}
                  className="rounded-r-sm p-2 text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <p className="p-8 text-center text-fs-sm text-[var(--fg-muted)]">
              {t("noSupplierProductsHint")}
            </p>
          )}
        </div>
        {editing !== undefined && (
          <ProductEditor
            editing={editing ?? undefined}
            stockItems={stockItems}
            onClose={() => setEditing(undefined)}
            onSave={async (input) => {
              if (editing)
                await updateSupplierProduct(
                  rid,
                  supplier.id,
                  editing.id,
                  input,
                );
              else await createSupplierProduct(rid, supplier.id, input);
              setEditing(undefined);
              await load();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function ProductEditor({
  editing,
  stockItems,
  onClose,
  onSave,
}: {
  editing?: SupplierProduct;
  stockItems: StockItem[];
  onClose: () => void;
  onSave: (input: SupplierProductInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? "");
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [unit, setUnit] = useState<StockUnit>(
    (editing?.unit as StockUnit) ?? "unit",
  );
  const [price, setPrice] = useState(editing?.price_per_unit ?? 0);
  const [stockItemId, setStockItemId] = useState(
    editing?.stock_item_id ? String(editing.stock_item_id) : "",
  );
  return (
    <div className="rounded-r-md border border-[var(--brand-200)] bg-[var(--brand-50)]/40 p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <Settings2 className="size-4" />
        {editing ? t("editProduct") : t("addProduct")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")} value={name} onChange={setName} required />
        <Field label={t("sku")} value={sku} onChange={setSku} />
        <SelectField
          label={t("unit")}
          value={unit}
          onChange={(value) => setUnit(value as StockUnit)}
          options={UNITS.map((value) => [value, t(value)])}
        />
        <label>
          <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
            {t("pricePerUnit")}
          </span>
          <NumberInput
            min={0}
            value={price}
            onChange={setPrice}
            className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3"
          />
        </label>
        <div className="sm:col-span-2">
          <SelectField
            label={t("linkedStockItem")}
            value={stockItemId}
            onChange={setStockItemId}
            options={[
              ["", "—"],
              ...stockItems.map((item) => [
                String(item.id),
                `${item.name} (${item.unit})`,
              ]),
            ]}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              sku,
              unit,
              price_per_unit: price,
              stock_item_id: stockItemId ? Number(stockItemId) : null,
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
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
    <label className="block">
      <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm text-[var(--fg)] outline-none focus:shadow-ring"
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
    <label className="block">
      <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm text-[var(--fg)] outline-none focus:shadow-ring"
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
