"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DeliveryImportModal from "../stock/DeliveryImportModal";
import {
  DailyProductionModal,
  DailyReceiptModal,
} from "@/components/kitchen/DailyActionModals";
import NextServicePanel from "@/components/kitchen/NextServicePanel";
import KitchenDayReview from "@/components/kitchen/KitchenDayReview";
import ProductionObjectives from "@/components/kitchen/ProductionObjectives";
import ProductionBoard from "@/components/kitchen/ProductionBoard";
import SalesWorkspace from "@/components/kitchen/SalesWorkspace";
import QuantityEntryDrawer from "@/components/kitchen/QuantityEntryDrawer";
import {
  KitchenDrawer,
  KitchenPagination,
  KitchenSearch,
} from "@/components/kitchen/KitchenDrawer";
import {
  getTodayFoodCostReport,
  getFoodCostReport,
  computeFoodCostReport,
  upsertSalesEntries,
  updateClosingStock,
  updateRetrospective,
  previewAvivSalesImport,
  importAvivSales,
  syncFoodyPOSSales,
  closeFoodCostReport,
  reopenFoodCostReport,
  listFoodCostReports,
  getKitchenSummary,
  type KitchenSummary,
  deleteSalesEntries,
  listStockTransactions,
  getAllCategories,
  listStockItems,
  getRestaurant,
  confirmDelivery,
  deleteStockTransaction,
  getDailyPrepPlan,
  getDemandForecast,
  listPrepItems,
  type PrepItem,
  generateEstimatedSupplies,
  sendOrderEmail,
  listPurchaseOrders,
  EstimatedSuppliesResult,
  DailyFoodCostReport,
  StockTransaction,
  MenuCategory,
  StockItem,
  ConfirmDeliveryItemInput,
  PurchaseOrder,
  DailyPlanItem,
  OpeningHoursConfig,
  AvivSalesImportPreview,
  type DemandForecast,
} from "@/lib/api";
import {
  RefreshCwIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  InfoIcon,
  MailIcon,
  SunriseIcon,
  UtensilsIcon,
  MoonIcon,
  ArrowRightIcon,
  ClipboardCheckIcon,
  NotebookPenIcon,
  TrendingUpIcon,
  ChefHatIcon,
  PackageIcon,
  UploadIcon,
  FileTextIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useI18n, useCurrency } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import styles from "@/components/kitchen/companion.module.css";

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function timeToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getServiceWindow(
  config: OpeningHoursConfig | null,
  date: Date,
): { open: number; close: number } | null {
  if (!config) return null;
  const weekday = WEEKDAY_KEYS[date.getDay()];
  const windows = [config.dine_in, config.pickup, config.delivery]
    .map((schedule) => schedule?.[weekday])
    .filter((hours) => hours && !hours.closed && hours.open && hours.close)
    .flatMap((hours) => {
      const open = timeToMinutes(hours!.open);
      const close = timeToMinutes(hours!.close);
      return open == null || close == null
        ? []
        : [{ open, close: close < open ? close + 24 * 60 : close }];
    });
  if (windows.length === 0) return null;
  return {
    open: Math.min(...windows.map((window) => window.open)),
    close: Math.max(...windows.map((window) => window.close)),
  };
}

function statusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case "open":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-500">
          {t("open")}
        </span>
      );
    case "closed":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-600">
          {t("closed")}
        </span>
      );
    case "reviewed":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400">
          Reviewed
        </span>
      );
    default:
      return null;
  }
}

export default function DailyOperationsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission("kitchen.manage");

  const [report, setReport] = useState<DailyFoodCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [workspace, setWorkspace] = useState<
    "sales" | "receipts" | "tomorrow" | "forecast" | "estimated" | null
  >(null);
  const [detailPage, setDetailPage] = useState(0);
  const [detailError, setDetailError] = useState("");
  const [deletingReceipt, setDeletingReceipt] = useState<number | null>(null);
  const openWorkspace = (value: typeof workspace) => {
    setDetailPage(0);
    setDetailError("");
    setWorkspace(value);
  };

  // Supplies received today
  const [todayReceives, setTodayReceives] = useState<StockTransaction[]>([]);

  // Sales entry
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [salesEntries, setSalesEntries] = useState<Record<number, number>>({});

  const [closingCountError, setClosingCountError] = useState("");
  const [phaseSelection, setPhaseSelection] = useState<
    "opening" | "service" | "closing" | null
  >(null);
  const [kitchenSummary, setKitchenSummary] = useState<KitchenSummary | null>(
    null,
  );
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Retrospective
  const [wentWell, setWentWell] = useState("");
  const [wentWrong, setWentWrong] = useState("");
  const [toImprove, setToImprove] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  // Selection for deletion

  // Quick receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [productionItem, setProductionItem] = useState<DailyPlanItem | null>(
    null,
  );
  const [pendingDeliveries, setPendingDeliveries] = useState<PurchaseOrder[]>(
    [],
  );
  const [supplementaryError, setSupplementaryError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [supplementaryLoading, setSupplementaryLoading] = useState(true);
  const reportRequest = useRef(0);
  const supplementaryRequest = useRef(0);
  const [tomorrowPrepPlan, setTomorrowPrepPlan] = useState<DailyPlanItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);

  // Sales entry modal
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showSalesImportModal, setShowSalesImportModal] = useState(false);

  // Stock items for reference
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // Prep coverage for the selected weekday. This powers both the opening
  // production brief and the before-service risk summary.
  const [dailyPrepPlan, setDailyPrepPlan] = useState<DailyPlanItem[]>([]);
  const [salesForecast, setSalesForecast] = useState<DemandForecast | null>(
    null,
  );
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastLoadFailed, setForecastLoadFailed] = useState(false);
  const forecastRequest = useRef(0);
  const [openingHours, setOpeningHours] = useState<OpeningHoursConfig | null>(
    null,
  );

  // Estimated supplies
  const [estimatedPOs, setEstimatedPOs] = useState<PurchaseOrder[]>([]);
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [generationAttempted, setGenerationAttempted] = useState(false);
  const [generationDiag, setGenerationDiag] =
    useState<EstimatedSuppliesResult | null>(null);
  const [sendingEmailPO, setSendingEmailPO] = useState<number | null>(null);
  const [emailModalPO, setEmailModalPO] = useState<PurchaseOrder | null>(null);
  const [emailTo, setEmailTo] = useState("");

  const loadReport = useCallback(
    async (preserveHandover = false) => {
      const request = ++reportRequest.current;
      setLoading(true);
      setActionError("");
      try {
        const dateStr = formatDate(selectedDate);
        const today = formatDate(new Date());

        let rpt: DailyFoodCostReport;
        if (dateStr === today) {
          rpt = await getTodayFoodCostReport(rid);
          if (rpt.status === "open" && canManage)
            rpt = await computeFoodCostReport(rid, rpt.id);
        } else {
          // Try to find existing report for that date
          const reports = await listFoodCostReports(rid, dateStr, dateStr);
          if (reports.length > 0) {
            rpt = await getFoodCostReport(rid, reports[0].id);
          } else {
            if (request === reportRequest.current) {
              setReport(null);
              setSalesEntries({});
              setWentWell("");
              setWentWrong("");
              setToImprove("");
              setEstimatedPOs([]);
            }
            return;
          }
        }
        if (request !== reportRequest.current) return;
        setReport(rpt);

        // Populate form state from report
        if (rpt.sales) {
          const entries: Record<number, number> = {};
          rpt.sales.forEach((s) => {
            if (s.source === "manual" && s.menu_item_id != null)
              entries[s.menu_item_id] = s.quantity;
          });
          setSalesEntries(entries);
        }
        setClosingCountError("");
        setWentWell(rpt.went_well || "");
        setWentWrong(rpt.went_wrong || "");
        if (!preserveHandover) setToImprove(rpt.to_improve || "");

        // Auto-load estimated supply POs when report is closed
        if (rpt.status === "closed") {
          try {
            const pos = await listPurchaseOrders(rid, {
              source_report_id: rpt.id,
            });
            setEstimatedPOs(pos);
          } catch {
            setEstimatedPOs([]);
          }
        } else {
          setEstimatedPOs([]);
        }
        setGenerationAttempted(false);
        setGenerationDiag(null);
      } catch (error) {
        if (request !== reportRequest.current) return;
        setReport(null);
        setActionError(
          error instanceof Error ? error.message : t("dailyLoadError"),
        );
      } finally {
        if (request === reportRequest.current) setLoading(false);
      }
    },
    [rid, selectedDate, canManage, t],
  );

  const loadForecast = useCallback(async () => {
    const request = ++forecastRequest.current;
    setForecastLoading(true);
    setForecastLoadFailed(false);
    try {
      const forecast = await getDemandForecast(rid, {
        day_of_week: selectedDate.getDay(),
      });
      if (request === forecastRequest.current) setSalesForecast(forecast);
    } catch {
      if (request === forecastRequest.current) {
        setSalesForecast(null);
        setForecastLoadFailed(true);
      }
    } finally {
      if (request === forecastRequest.current) setForecastLoading(false);
    }
  }, [rid, selectedDate]);

  const loadSupplementary = useCallback(async (propagateError = false) => {
    const request = ++supplementaryRequest.current;
    setSupplementaryLoading(true);
    setSupplementaryError("");
    try {
      const [
        cats,
        stock,
        prepPlan,
        restaurant,
        deliveries,
        nextPlan,
        preparations,
      ] = await Promise.all([
        getAllCategories(rid),
        listStockItems(rid),
        getDailyPrepPlan(rid, { day_of_week: selectedDate.getDay() }),
        getRestaurant(rid),
        listPurchaseOrders(rid, { status: "sent" }),
        getDailyPrepPlan(rid, { day_of_week: (selectedDate.getDay() + 1) % 7 }),
        listPrepItems(rid, { is_active: true }),
      ]);
      if (request !== supplementaryRequest.current) return;
      setCategories(cats);
      setStockItems(stock);
      setDailyPrepPlan(prepPlan);
      setOpeningHours(restaurant?.opening_hours_config ?? null);
      setPendingDeliveries(deliveries);
      setTomorrowPrepPlan(nextPlan);
      setPrepItems(preparations);

      // Load today's receive transactions
      const txns = await listStockTransactions(rid, { type: "receive" });
      const dateStr = formatDate(selectedDate);
      const filtered = txns.filter(
        (tx) =>
          tx.created_at && formatDate(new Date(tx.created_at)) === dateStr,
      );
      if (request === supplementaryRequest.current) setTodayReceives(filtered);
    } catch (error) {
      if (request !== supplementaryRequest.current) return;
      setStockItems([]);
      setTodayReceives([]);
      setDailyPrepPlan([]);
      setTomorrowPrepPlan([]);
      setPendingDeliveries([]);
      setPrepItems([]);
      setSupplementaryError(
        error instanceof Error ? error.message : t("dailyLoadError"),
      );
      if (propagateError) throw error;
    } finally {
      if (request === supplementaryRequest.current)
        setSupplementaryLoading(false);
    }
  }, [rid, selectedDate, t]);

  const loadKitchenSummary = useCallback(async () => {
    if (!report) return;
    setReviewLoading(true);
    setReviewError("");
    try {
      setKitchenSummary(await getKitchenSummary(rid, report.id));
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : t("chefReviewError"),
      );
      throw error;
    } finally {
      setReviewLoading(false);
    }
  }, [rid, report, t]);
  useEffect(() => {
    let cancelled = false;
    if (!report) {
      setKitchenSummary(null);
      return;
    }
    setReviewLoading(true);
    setReviewError("");
    getKitchenSummary(rid, report.id)
      .then((summary) => {
        if (!cancelled) setKitchenSummary(summary);
      })
      .catch((error) => {
        if (!cancelled) {
          setKitchenSummary(null);
          setReviewError(
            error instanceof Error ? error.message : t("chefReviewError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, report, t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);
  useEffect(() => {
    loadSupplementary();
  }, [loadSupplementary]);
  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const confirmDiscard = () =>
    toImprove === (report?.to_improve ?? "") || confirm(t("companionDiscard"));

  const navigateDate = (delta: number) => {
    if (!confirmDiscard()) return;
    setPhaseSelection(null);
    setWorkspace(null);
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  };

  // Recompute report server-side and refresh local state (KPIs, items, closing stocks).
  const recomputeAndReload = useCallback(
    async (reportId: number) => {
      const updated = await computeFoodCostReport(rid, reportId);
      setReport(updated);
    },
    [rid],
  );

  const handlePullFoodySales = async () => {
    if (!report) return;
    await syncFoodyPOSSales(rid, report.id);
    await loadReport(true);
    await Promise.all([loadSupplementary(), loadForecast()]);
  };

  const handleSaveDraft = async () => {
    if (!report) return;
    setSavingDraft(true);
    setClosingCountError("");
    try {
      await Promise.all([
        updateRetrospective(rid, report.id, {
          went_well: wentWell,
          went_wrong: wentWrong,
          to_improve: toImprove,
        }),
      ]);
      await recomputeAndReload(report.id);
    } catch (error) {
      setClosingCountError(
        error instanceof Error ? error.message : t("saveFailed"),
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    setActionError("");
    if (!confirm(t("dailyCloseConfirm"))) return;
    setClosing(true);
    setClosingCountError("");
    try {
      await Promise.all([
        updateRetrospective(rid, report.id, {
          went_well: wentWell,
          went_wrong: wentWrong,
          to_improve: toImprove,
        }),
      ]);
      await closeFoodCostReport(rid, report.id);
      await loadReport();
      await loadSupplementary();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("closeDayError"),
      );
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    if (!report) return;
    if (!confirm(t("reopenDayConfirm"))) return;
    setActionError("");
    setReopening(true);
    try {
      await reopenFoodCostReport(rid, report.id);
      await loadReport();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("reopenDayError"),
      );
    } finally {
      setReopening(false);
    }
  };

  const handleDeleteSales = async (ids: number[]) => {
    if (!report || ids.length === 0) return;
    await deleteSalesEntries(rid, report.id, ids);
    await recomputeAndReload(report.id);
  };

  // ─── Estimated Supplies handlers ────────────────────────────────────
  const handleGenerateOrders = async (
    source: "pos" | "manual" | "both" = "pos",
  ) => {
    if (!report) return;
    setGeneratingOrders(true);
    setGenerationAttempted(false);
    setGenerationDiag(null);
    try {
      const result = await generateEstimatedSupplies(rid, report.id, source);
      setEstimatedPOs(result.purchase_orders);
      setGenerationDiag(result);
      setGenerationAttempted(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setGeneratingOrders(false);
    }
  };

  const handleSendEmail = async (po: PurchaseOrder) => {
    setSendingEmailPO(po.id);
    try {
      const to = emailTo || po.supplier?.email || "";
      await sendOrderEmail(rid, po.id, {
        to,
        language: po.supplier?.preferred_language || "he",
      });
      // Refresh POs to get updated status
      if (report) {
        const pos = await listPurchaseOrders(rid, {
          source_report_id: report.id,
        });
        setEstimatedPOs(pos);
      }
      setEmailModalPO(null);
      setEmailTo("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSendingEmailPO(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCwIcon className="w-8 h-8 animate-spin text-[var(--fg-secondary)]" />
      </div>
    );
  }

  const isOpen = report?.status === "open" && canManage;
  const objectivePlans: DailyPlanItem[] = (kitchenSummary?.preparations ?? [])
    .filter((row) => row.target_qty != null)
    .flatMap((row): DailyPlanItem[] => {
      const item = prepItems.find((prep) => prep.id === row.prep_item_id);
      if (!item) return [];
      const missing = Math.max(0, row.target_qty! - row.produced_qty);
      return [
        {
          prep_item_id: item.id,
          prep_item_name: item.name,
          unit: item.unit,
          current_qty: item.quantity,
          required_qty: row.target_qty!,
          shortfall_qty: missing,
          batches_needed:
            item.yield_per_batch > 0
              ? Math.ceil(missing / item.yield_per_batch)
              : 0,
          yield_per_batch: item.yield_per_batch,
          shelf_life_hours: item.shelf_life_hours,
          category: item.category,
          priority: "high",
        },
      ];
    });
  const prepToLaunch = [
    ...objectivePlans,
    ...dailyPrepPlan.filter(
      (item) =>
        !objectivePlans.some(
          (target) => target.prep_item_id === item.prep_item_id,
        ),
    ),
  ]
    .filter(
      (item) =>
        item.current_qty < 0 ||
        item.batches_needed > 0 ||
        item.shortfall_qty > 0,
    )
    .sort((a, b) => Number(b.current_qty < 0) - Number(a.current_qty < 0));
  const lowStockItems = stockItems.filter(
    (item) =>
      item.is_active !== false &&
      (item.quantity < 0 ||
        (item.reorder_threshold > 0 &&
          item.quantity <= item.reorder_threshold)),
  );
  const selectedIsToday = formatDate(selectedDate) === formatDate(new Date());
  const soldQuantity = (report?.sales ?? []).reduce(
    (sum, sale) => sum + sale.quantity,
    0,
  );
  const externalSalesPending =
    report?.status === "open" &&
    (report.sales ?? []).some((sale) => sale.source !== "pos");
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const serviceWindow = getServiceWindow(openingHours, selectedDate);
  const operationalNowMinutes =
    serviceWindow &&
    serviceWindow.close > 24 * 60 &&
    nowMinutes < serviceWindow.open
      ? nowMinutes + 24 * 60
      : nowMinutes;
  const serviceHasStarted = serviceWindow
    ? operationalNowMinutes >= serviceWindow.open
    : nowMinutes >= 11 * 60;
  const serviceHasEnded = serviceWindow
    ? operationalNowMinutes > serviceWindow.close
    : nowMinutes >= 17 * 60;
  const suggestedPhase: "opening" | "service" | "closing" | null =
    !selectedIsToday || (!serviceWindow && report?.status !== "closed")
      ? null
      : report?.status === "closed" || serviceHasEnded
        ? "closing"
        : serviceHasStarted
          ? "service"
          : "opening";

  const activePhase =
    phaseSelection ??
    (report?.status !== "open" || !selectedIsToday
      ? "closing"
      : (suggestedPhase ?? "opening"));

  const qty = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const forecastRows = salesForecast?.top_items ?? [];
  const maxForecast = Math.max(
    1,
    ...forecastRows.map((item) => item.predicted_qty),
  );
  const forecastList = (all = false) => (
    <>
      {forecastLoading ? (
        <p className={styles.empty}>{t("loading")}</p>
      ) : forecastLoadFailed ? (
        <p role="alert" className={styles.notice}>
          {t("forecastUnavailable")}
        </p>
      ) : !salesForecast?.sample_days ? (
        <div className={styles.quietEmpty}>
          <TrendingUpIcon size={22} />
          <p>{t("noWeekdayHistory")}</p>
        </div>
      ) : (
        <>
          {(all
            ? forecastRows.slice(detailPage * 10, detailPage * 10 + 10)
            : forecastRows.slice(0, 4)
          ).map((item, index) => (
            <div
              key={`${item.menu_item_id}-${index}`}
              className={styles.forecastRow}
            >
              <div>
                <span>{item.menu_item_name}</span>
                <b>{qty(item.predicted_qty)}</b>
              </div>
              <progress
                max={maxForecast}
                value={item.predicted_qty}
                aria-label={item.menu_item_name}
              />
              {item.menu_item_id == null && (
                <small>{t("forecastUnmapped")}</small>
              )}
            </div>
          ))}
          {all && (
            <KitchenPagination
              page={detailPage}
              count={forecastRows.length}
              size={10}
              onChange={setDetailPage}
            />
          )}
          <p className={styles.hint}>{t("forecastRecipeNote")}</p>
        </>
      )}
    </>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            {selectedDate.toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <div className={styles.titleLine}>
            <h1>{t("companionTitle")}</h1>
            {report && statusBadge(report.status, t)}
            {report?.historical_only && <span>{t("kdHistorical")}</span>}
          </div>
          <p>{t("kwWorkspaceSubtitle")}</p>
        </div>
        <div className={styles.headerActions}>
          {hasAnyPermission("kitchen.data_manage") && <Link className={styles.textButton} href={`/${rid}/kitchen/data`}>{t("kdTitle")}</Link>}

          <div className={styles.date}>
            <button
              onClick={() => navigateDate(-1)}
              aria-label={t("previousDay")}
            >
              <ChevronLeftIcon size={17} />
            </button>
            <input
              type="date"
              aria-label={t("date")}
              value={formatDate(selectedDate)}
              onChange={(event) => {
                if (event.target.value && confirmDiscard()) {
                  setPhaseSelection(null);
                  setWorkspace(null);
                  setSelectedDate(new Date(event.target.value + "T12:00:00"));
                }
              }}
            />
            <button onClick={() => navigateDate(1)} aria-label={t("nextDay")}>
              <ChevronRightIcon size={17} />
            </button>
          </div>
          {!selectedIsToday && (
            <button
              className={styles.textButton}
              onClick={() => {
                if (confirmDiscard()) {
                  setPhaseSelection(null);
                  setWorkspace(null);
                  setSelectedDate(new Date());
                }
              }}
            >
              {t("today")}
            </button>
          )}
          <button
            className={styles.iconButton}
            aria-label={t("refresh")}
            disabled={refreshing || supplementaryLoading}
            onClick={() => {
              if (confirmDiscard()) {
                setRefreshing(true);
                void Promise.all([
                  loadReport(),
                  loadSupplementary(),
                  loadForecast(),
                ]).finally(() => setRefreshing(false));
              }
            }}
          >
            <RefreshCwIcon
              size={17}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </header>
      {actionError && (
        <div role="alert" className={styles.error}>
          {actionError}
        </div>
      )}
      {supplementaryError && (
        <p role="alert" className={styles.error}>
          {t("companionLoadError")} {supplementaryError}
        </p>
      )}
      {!report && !actionError && (
        <p className={styles.notice}>{t("companionNoReport")}</p>
      )}
      {!selectedIsToday && (
        <p className={styles.context}>
          <InfoIcon size={15} />
          {t("companionDateContext")}
        </p>
      )}
      <div className={styles.statusRail} aria-label={t("companionBrief")}>
        <button onClick={() => setPhaseSelection("opening")}>
          <ChefHatIcon size={18} />
          <span>{t("prepToLaunch")}</span>
          <b>
            {supplementaryLoading || supplementaryError
              ? "—"
              : prepToLaunch.length}
          </b>
          <ArrowRightIcon size={14} />
        </button>
        <Link href={`/${rid}/kitchen/stock`}>
          <PackageIcon size={18} />
          <span>{t("lowStockItems")}</span>
          <b>
            {supplementaryLoading || supplementaryError
              ? "—"
              : lowStockItems.length}
          </b>
          <ArrowRightIcon size={14} />
        </Link>
        <button onClick={() => setPhaseSelection("opening")}>
          <FileTextIcon size={18} />
          <span>{t("companionDeliveries")}</span>
          <b>
            {supplementaryLoading || supplementaryError
              ? "—"
              : pendingDeliveries.length}
          </b>
          <ArrowRightIcon size={14} />
        </button>
      </div>
      <nav role="tablist" aria-label={t("todayPhases")} className={styles.tabs}>
        {(
          [
            [
              "opening",
              "companionOpening",
              "companionOpeningHint",
              SunriseIcon,
            ],
            [
              "service",
              "companionService",
              "companionServiceHint",
              UtensilsIcon,
            ],
            ["closing", "companionClosing", "companionClosingHint", MoonIcon],
          ] as const
        ).map(([phase, label, hint, Icon], index) => (
          <button
            key={phase}
            role="tab"
            aria-label={t(label)}
            id={`tab-${phase}`}
            aria-selected={activePhase === phase}
            aria-controls={`phase-${phase}`}
            tabIndex={activePhase === phase ? 0 : -1}
            className={styles.tab}
            onClick={() => setPhaseSelection(phase)}
            onKeyDown={(event) => {
              const phases = ["opening", "service", "closing"] as const;
              const step =
                event.key === "ArrowRight"
                  ? locale === "he"
                    ? -1
                    : 1
                  : event.key === "ArrowLeft"
                    ? locale === "he"
                      ? 1
                      : -1
                    : 0;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (index + step + 3) % 3;
              if (!step && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              setPhaseSelection(phases[next]);
              document.getElementById(`tab-${phases[next]}`)?.focus();
            }}
          >
            <span className={styles.phaseNumber}>0{index + 1}</span>
            <span>
              <strong>{t(label)}</strong>
              <small>{t(hint)}</small>
            </span>
            <Icon size={18} />
          </button>
        ))}
      </nav>
      <div
        role="tabpanel"
        id="phase-opening"
        aria-labelledby="tab-opening"
        hidden={activePhase !== "opening"}
        className={styles.content}
      >
        <div className={styles.columns}>
          <ProductionBoard
            rid={rid}
            plans={prepToLaunch}
            items={prepItems}
            summary={kitchenSummary}
            unavailable={!!supplementaryError}
            canProduce={canManage && selectedIsToday && !supplementaryError}
            onProduce={setProductionItem}
            objectives={
              isOpen && selectedIsToday && report && !supplementaryError ? (
                <ProductionObjectives
                  key={report.id}
                  rid={rid}
                  reportId={report.id}
                  items={prepItems}
                  summary={kitchenSummary}
                  onSaved={loadKitchenSummary}
                />
              ) : undefined
            }
          />
          <aside className={styles.sideColumn}>
            <section className={styles.sidePanel}>
              <header>
                <span className={styles.eyebrow}>{t("kwAnticipate")}</span>
                <h2>{t("salesForecast")}</h2>
                <p>
                  {salesForecast?.sample_days
                    ? t("salesForecastBasis").replace(
                        "{count}",
                        String(salesForecast.sample_days),
                      )
                    : t("salesForecastDesc")}
                </p>
              </header>
              {forecastList()}
              {forecastRows.length > 4 && (
                <button
                  className={styles.panelLink}
                  onClick={() => openWorkspace("forecast")}
                >
                  {t("kwAllForecasts")}
                  <ArrowRightIcon size={15} />
                </button>
              )}
            </section>
            <section className={styles.sidePanel}>
              <header className={styles.inlineHeading}>
                <div>
                  <span className={styles.eyebrow}>{t("kwReceiving")}</span>
                  <h2>{t("dailyDeliveriesToCheck")}</h2>
                </div>
                <span className={styles.countBadge}>
                  {pendingDeliveries.length}
                </span>
              </header>
              {pendingDeliveries.length ? (
                pendingDeliveries.slice(0, 3).map((order) => (
                  <div key={order.id} className={styles.deliveryRow}>
                    <div>
                      <strong>
                        {order.supplier?.name || t("unknownSupplier")}
                      </strong>
                      <small>
                        PO-{order.id} · {order.items.length} {t("items")}
                        {order.expected_delivery_at
                          ? ` · ${new Date(order.expected_delivery_at).toLocaleDateString(locale)}`
                          : ""}
                      </small>
                    </div>
                    {canManage && selectedIsToday && (
                      <button
                        className={styles.actionButton}
                        onClick={() => setReceiptOrder(order)}
                      >
                        {t("dailyReviewDelivery")}
                        <ArrowRightIcon size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className={styles.smallEmpty}>
                  {t(
                    supplementaryError ? "dailyLoadError" : "dailyNoDeliveries",
                  )}
                </p>
              )}
              {canManage && selectedIsToday && (
                <div className={styles.receivingActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setShowScanModal(true)}
                  >
                    <UploadIcon size={16} />
                    {t("kwScan")}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setShowReceiveModal(true)}
                  >
                    <PlusIcon size={16} />
                    {t("kwReceive")}
                  </button>
                </div>
              )}
              <button
                className={styles.panelLink}
                onClick={() => openWorkspace("receipts")}
              >
                {t("suppliesReceived")}
                <span>
                  {todayReceives.length}
                  <ArrowRightIcon size={15} />
                </span>
              </button>
              <Link
                className={styles.panelLink}
                href={`/${rid}/kitchen/suppliers?tab=orders`}
              >
                {t("dailyManageOrders")}
                <ArrowRightIcon size={15} />
              </Link>
            </section>
          </aside>
        </div>
      </div>
      <div
        role="tabpanel"
        id="phase-service"
        aria-labelledby="tab-service"
        hidden={activePhase !== "service"}
        className={styles.content}
      >
        <div className={styles.columns}>
          <div className={styles.mainColumn}>
            {!supplementaryError && (
              <NextServicePanel
                key={`${rid}-${formatDate(selectedDate)}`}
                items={prepItems}
                canProduce={canManage && selectedIsToday}
                onProduce={setProductionItem}
              />
            )}
          </div>
          <aside className={styles.sideColumn}>
            <section className={styles.servicePulse}>
              <span className={styles.eyebrow}>{t("kwRecordedActivity")}</span>
              <strong>{qty(soldQuantity)}</strong>
              <span>{t("kwUnitsSold")}</span>
              <button
                className={styles.panelLink}
                onClick={() => openWorkspace("sales")}
              >
                {t("kwSalesJournal")}
                <ArrowRightIcon size={15} />
              </button>
              {externalSalesPending && (
                <p className={styles.hint}>{t("dailyExternalSalesPending")}</p>
              )}
            </section>
            <section className={styles.sidePanel}>
              <header>
                <span className={styles.eyebrow}>{t("kwAttention")}</span>
                <h2>{t("dailyStockToOrder")}</h2>
              </header>
              {lowStockItems.slice(0, 4).map((item) => (
                <div className={styles.lowStockRow} key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {t("reorderThreshold")}: {qty(item.reorder_threshold)}{" "}
                      {item.unit}
                    </small>
                  </div>
                  <b className={item.quantity < 0 ? styles.warning : ""}>
                    {qty(item.quantity)} <small>{item.unit}</small>
                  </b>
                </div>
              ))}
              {!lowStockItems.length && (
                <p className={styles.smallEmpty}>
                  {t(supplementaryError ? "dailyLoadError" : "kwNoLowStock")}
                </p>
              )}
              <Link
                className={styles.panelLink}
                href={`/${rid}/settings/stock/availability`}
              >
                {t("manageAvailability")}
                <ArrowRightIcon size={15} />
              </Link>
              <Link className={styles.panelLink} href={`/${rid}/kitchen/stock`}>
                {t("kwOpenStock")}
                <ArrowRightIcon size={15} />
              </Link>
            </section>
            {prepToLaunch.length > 0 && (
              <button
                className={styles.attentionAction}
                onClick={() => setPhaseSelection("opening")}
              >
                <ChefHatIcon size={20} />
                <span>
                  <strong>
                    {t("servicePrepRisk").replace(
                      "{count}",
                      String(prepToLaunch.length),
                    )}
                  </strong>
                  <small>{t("chefReviewProduction")}</small>
                </span>
                <ArrowRightIcon size={17} />
              </button>
            )}
          </aside>
        </div>
      </div>
      <div
        role="tabpanel"
        id="phase-closing"
        aria-labelledby="tab-closing"
        hidden={activePhase !== "closing"}
        className={styles.content}
      >
        {report && (
          <div className={styles.columns}>
            <KitchenDayReview
              key={`${rid}-${report.id}`}
              report={report}
              summary={kitchenSummary}
              loading={reviewLoading}
              error={reviewError}
              canCount={isOpen}
              onRetry={() => {
                void loadKitchenSummary().catch(() => {});
              }}
              onSales={() => openWorkspace("sales")}
              onCount={async (stockItemId, quantity) => {
                await updateClosingStock(rid, report.id, [
                  { stock_item_id: stockItemId, quantity },
                ]);
                await recomputeAndReload(report.id);
              }}
            />
            <aside className={styles.sideColumn}>
              <section className={styles.sidePanel}>
                <header>
                  <span className={styles.eyebrow}>{t("kwDayActivity")}</span>
                  <div className={styles.inlineHeading}>
                    <h2>{t("salesEntry")}</h2>
                    <b className={styles.largeNumber}>
                      {qty(soldQuantity)}
                      <small>{t("kwUnits")}</small>
                    </b>
                  </div>
                </header>
                <button
                  className={styles.panelLink}
                  onClick={() => openWorkspace("sales")}
                >
                  {t("kwSalesJournal")}
                  <span>
                    {report.sales?.length ?? 0} {t("kwLines")}
                    <ArrowRightIcon size={15} />
                  </span>
                </button>
                {isOpen && (
                  <div className={styles.receivingActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => setShowSalesImportModal(true)}
                    >
                      <UploadIcon size={15} />
                      {t("chefImportSales")}
                    </button>
                    <button
                      className={styles.textButton}
                      onClick={() => setShowSalesModal(true)}
                    >
                      {t("manualSalesEntry")}
                    </button>
                  </div>
                )}
              </section>
              <section className={styles.handover}>
                <header className={styles.inlineHeading}>
                  <div>
                    <span className={styles.eyebrow}>{t("kwPassItOn")}</span>
                    <h2>{t("chefHandoverNote")}</h2>
                  </div>
                  <NotebookPenIcon size={21} />
                </header>
                <label>
                  <span>{t("chefHandoverHint")}</span>
                  <textarea
                    value={toImprove}
                    onChange={(event) => setToImprove(event.target.value)}
                    disabled={!isOpen}
                    rows={3}
                    placeholder={t("kwHandoverPlaceholder")}
                  />
                </label>
                {(wentWell || wentWrong) && (
                  <p className={styles.hint}>
                    {[wentWell, wentWrong].filter(Boolean).join("\n")}
                  </p>
                )}
                {isOpen && (
                  <button
                    className={styles.textButton}
                    disabled={
                      savingDraft || toImprove === (report.to_improve ?? "")
                    }
                    onClick={handleSaveDraft}
                  >
                    {savingDraft ? t("saving") : t("saveDraft")}
                    <CheckCircleIcon size={14} />
                  </button>
                )}
                {closingCountError && (
                  <p role="alert" className={styles.error}>
                    {closingCountError}
                  </p>
                )}
              </section>
              <button
                className={styles.tomorrowButton}
                onClick={() => openWorkspace("tomorrow")}
              >
                <SunriseIcon size={22} />
                <span>
                  <strong>{t("dailyTomorrowTitle")}</strong>
                  <small>{t("kwTomorrowHint")}</small>
                </span>
                <ArrowRightIcon size={17} />
              </button>
              {report.status === "closed" && (
                <button
                  className={styles.tomorrowButton}
                  onClick={() => openWorkspace("estimated")}
                >
                  <PackageIcon size={22} />
                  <span>
                    <strong>{t("estimatedSupplies")}</strong>
                    <small>
                      {estimatedPOs.length} {t("ordersBySupplier")}
                    </small>
                  </span>
                  <ArrowRightIcon size={17} />
                </button>
              )}
            </aside>
          </div>
        )}
        {isOpen && (
          <section className={styles.closeBar}>
            <ClipboardCheckIcon size={24} />
            <div>
              <h2>{t("closeDay")}</h2>
              <p>{t("kwCloseHint")}</p>
              {externalSalesPending && (
                <small>{t("dailyExternalSalesPending")}</small>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={closing || savingDraft}
              className={styles.primaryButton}
            >
              {closing ? t("closing") : t("closeDay")}
              <ArrowRightIcon size={16} />
            </button>
          </section>
        )}
        {report?.status === "closed" && (
          <div className={styles.closeBar}>
            <CheckCircleIcon size={23} />
            <div>
              <h2>{t("companionClosed")}</h2>
              <p>{t("kwClosedHint")}</p>
            </div>
            {canManage && !report?.historical_only && (
              <button
                className={styles.secondaryButton}
                disabled={reopening}
                onClick={handleReopen}
              >
                <RotateCcwIcon size={15} />
                {reopening ? t("reopeningDay") : t("reopenDay")}
              </button>
            )}
          </div>
        )}
      </div>
      <p className={styles.bottomNote}>
        <InfoIcon size={14} />
        {t("companionStockAuto")}
      </p>
      {workspace === "sales" && (
        <SalesWorkspace
          key={report?.id}
          sales={report?.sales ?? []}
          canEdit={isOpen}
          restaurantId={rid} reportId={report?.id} canLink={canManage}
          onLinked={async () => {
            if (report) setReport(await getFoodCostReport(rid, report.id));
            await Promise.all([loadKitchenSummary(), loadForecast(), loadSupplementary()]);
          }}
          onClose={() => setWorkspace(null)}
          onDelete={handleDeleteSales}
          onImport={() => {
            setWorkspace(null);
            setShowSalesImportModal(true);
          }}
          onManual={() => {
            setWorkspace(null);
            setShowSalesModal(true);
          }}
        />
      )}
      {workspace === "forecast" && (
        <KitchenDrawer
          title={t("salesForecast")}
          description={t("salesForecastDesc")}
          onClose={() => setWorkspace(null)}
        >
          {forecastList(true)}
        </KitchenDrawer>
      )}
      {workspace === "tomorrow" && (
        <KitchenDrawer
          title={t("dailyTomorrowTitle")}
          description={t("dailyTomorrowHint")}
          onClose={() => setWorkspace(null)}
        >
          {!tomorrowPrepPlan.length && (
            <p className={styles.empty}>
              {t(supplementaryError ? "dailyLoadError" : "dailyNoForecast")}
            </p>
          )}
          {tomorrowPrepPlan
            .slice(detailPage * 8, detailPage * 8 + 8)
            .map((item) => (
              <div className={styles.tomorrowRow} key={item.prep_item_id}>
                <strong>{item.prep_item_name}</strong>
                <dl>
                  <div>
                    <dt>{t("current")}</dt>
                    <dd>
                      {qty(item.current_qty)} {item.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("demand")}</dt>
                    <dd>
                      {qty(item.required_qty)} {item.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("companionToProduce")}</dt>
                    <dd>
                      {qty(item.shortfall_qty)} {item.unit}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          <KitchenPagination
            page={detailPage}
            count={tomorrowPrepPlan.length}
            size={8}
            onChange={setDetailPage}
          />
          <Link className={styles.panelLink} href={`/${rid}/kitchen/prep`}>
            {t("viewPreparations")}
            <ArrowRightIcon size={15} />
          </Link>
          <Link
            className={styles.panelLink}
            href={`/${rid}/kitchen/suppliers?tab=orders`}
          >
            {t("dailyManageOrders")}
            <ArrowRightIcon size={15} />
          </Link>
        </KitchenDrawer>
      )}
      {workspace === "receipts" && (
        <KitchenDrawer
          title={t("suppliesReceived")}
          description={t("suppliesReceivedDesc")}
          onClose={() => setWorkspace(null)}
          busy={deletingReceipt != null}
        >
          {detailError && (
            <p role="alert" className={styles.error}>
              {detailError}
            </p>
          )}
          {!todayReceives.length && (
            <p className={styles.empty}>{t("noSuppliesReceived")}</p>
          )}
          {todayReceives
            .slice(detailPage * 10, detailPage * 10 + 10)
            .map((tx) => {
              const item = stockItems.find(
                (row) => row.id === tx.stock_item_id,
              );
              return (
                <div key={tx.id} className={styles.receiptHistoryRow}>
                  <div>
                    <strong>{item?.name || `#${tx.stock_item_id}`}</strong>
                    <small>
                      {tx.created_at
                        ? new Date(tx.created_at).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </small>
                  </div>
                  <b>
                    +{qty(tx.quantity_delta)} {item?.unit}
                  </b>
                  {isOpen && (
                    <button
                      disabled={deletingReceipt != null}
                      className={styles.iconButton}
                      aria-label={`${t("delete")} ${item?.name}`}
                      onClick={async () => {
                        if (!confirm(t("kwDeleteReceiptConfirm"))) return;
                        setDeletingReceipt(tx.id);
                        setDetailError("");
                        try {
                          await deleteStockTransaction(rid, tx.id);
                          await loadSupplementary();
                          await loadKitchenSummary();
                          setDetailPage(0);
                        } catch (error) {
                          setDetailError(
                            error instanceof Error
                              ? error.message
                              : t("saveFailed"),
                          );
                        } finally {
                          setDeletingReceipt(null);
                        }
                      }}
                    >
                      <TrashIcon size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          <KitchenPagination
            page={detailPage}
            count={todayReceives.length}
            size={10}
            onChange={setDetailPage}
          />
        </KitchenDrawer>
      )}
      {workspace === "estimated" && report?.status === "closed" && (
        <KitchenDrawer
          title={t("estimatedSupplies")}
          description={t("generateOrderFor")}
          onClose={() => setWorkspace(null)}
          busy={generatingOrders}
        >
          {generationAttempted && generationDiag && (
            <p className={styles.notice}>
              {t(
                generationDiag.forecasted_items === 0
                  ? "noForecastData"
                  : generationDiag.items_with_recipe === 0
                    ? "kwNoLinkedRecipes"
                    : generationDiag.total_shortages === 0
                      ? "noShortages"
                      : "kwOrderEstimateHint",
              )}
            </p>
          )}
          {canManage && (
            <div className={styles.receivingActions}>
              {(["both", "manual", "pos"] as const).map((source) => (
                <button
                  key={source}
                  disabled={generatingOrders}
                  className={
                    source === "both"
                      ? styles.primaryButton
                      : styles.secondaryButton
                  }
                  onClick={() => handleGenerateOrders(source)}
                >
                  {t(
                    source === "both"
                      ? "fromBoth"
                      : source === "manual"
                        ? "fromManual"
                        : "fromPOS",
                  )}
                </button>
              ))}
            </div>
          )}
          <div className={styles.orderList}>
            {estimatedPOs.map((po) => (
              <SupplierOrderCard
                key={po.id}
                po={po}
                canManage={canManage}
                onSendEmail={() => {
                  setWorkspace(null);
                  setEmailModalPO(po);
                  setEmailTo(po.supplier?.email || "");
                }}
                sendingEmail={sendingEmailPO === po.id}
                t={t}
              />
            ))}
          </div>
        </KitchenDrawer>
      )}

      {/* Email modal for sending PO to supplier */}
      {emailModalPO && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setEmailModalPO(null)}
        >
          <div
            className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-fg-primary mb-4">
              {t("sendOrder") || "Send order"}:{" "}
              {emailModalPO.supplier?.name || t("unknownSupplier")}
            </h3>
            <label className="text-sm text-[var(--fg-secondary)]">
              {t("emailRecipient") || "Recipient email"}
            </label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="supplier@example.com"
              className="w-full mt-1 mb-4 px-3 py-2 rounded-lg border border-[var(--divider)] bg-[var(--bg)] text-fg-primary"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEmailModalPO(null)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--divider)] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                onClick={() => handleSendEmail(emailModalPO)}
                disabled={sendingEmailPO !== null || !emailTo}
                className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {sendingEmailPO
                  ? t("sendingEmail") || "Sending..."
                  : t("send") || "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Receive Modal */}
      {showScanModal && (
        <DeliveryImportModal
          rid={rid}
          stockItems={stockItems}
          onClose={() => setShowScanModal(false)}
          onImported={async () => {
            await Promise.all([loadSupplementary(true), loadKitchenSummary()]);
          }}
        />
      )}
      {receiptOrder && (
        <DailyReceiptModal
          rid={rid}
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
          onSaved={async () => {
            await loadSupplementary();
            await loadKitchenSummary();
          }}
        />
      )}
      {productionItem && (
        <DailyProductionModal
          rid={rid}
          item={productionItem}
          onClose={() => setProductionItem(null)}
          onSaved={async () => {
            await loadSupplementary();
            await loadKitchenSummary();
          }}
        />
      )}
      {showReceiveModal && (
        <QuickReceiveModal
          stockItems={stockItems}
          onConfirm={async (items, supplierName) => {
            await confirmDelivery(rid, { supplier_name: supplierName, items });
            setShowReceiveModal(false);
            await loadSupplementary();
            await loadKitchenSummary();
          }}
          onClose={() => setShowReceiveModal(false)}
          t={t}
        />
      )}

      {/* Quick Sales Modal */}
      {showSalesImportModal && report && (
        <SalesImportModal
          restaurantId={rid}
          report={report}
          categories={categories}
          onPullFoody={async () => {
            await handlePullFoodySales();
            setShowSalesImportModal(false);
          }}
          onImported={async () => {
            setShowSalesImportModal(false);
            await loadReport(true);
            await Promise.all([loadSupplementary(), loadForecast()]);
          }}
          onClose={() => setShowSalesImportModal(false)}
          t={t}
        />
      )}

      {showSalesModal && (
        <QuickSalesModal
          categories={categories}
          initialEntries={salesEntries}
          onConfirm={async (entries: Record<number, number>) => {
            if (!report) return;
            setSalesEntries(entries);
            const items = Object.entries(entries)
              .filter(([, qty]) => qty > 0)
              .map(([menuItemId, quantity]) => ({
                menu_item_id: Number(menuItemId),
                quantity: Number(quantity),
              }));
            await upsertSalesEntries(rid, report.id, items);
            setShowSalesModal(false);
            await recomputeAndReload(report.id);
          }}
          onClose={() => setShowSalesModal(false)}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// ─── Supplier Order Card ─────────────────────────────────────────────────────

function SupplierOrderCard({
  po,
  canManage,
  onSendEmail,
  sendingEmail,
  t,
}: {
  po: PurchaseOrder;
  canManage: boolean;
  onSendEmail: () => void;
  sendingEmail: boolean;
  t: (k: string) => string;
}) {
  const statusColor: Record<string, string> = {
    draft: "bg-gray-500/15 text-gray-400",
    sent: "bg-green-500/15 text-green-400",
    received: "bg-blue-500/15 text-blue-400",
    cancelled: "bg-red-500/15 text-red-400",
  };

  return (
    <div className="border border-[var(--divider)] rounded-xl overflow-hidden bg-[var(--surface)]">
      {/* Header: supplier name + status badge + send button */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--divider)]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-fg-primary">
            {po.supplier?.name || t("unknownSupplier") || "Unknown Supplier"}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[po.status] || statusColor.draft}`}
          >
            {po.status}
          </span>
        </div>
        {canManage && po.status === "draft" && (
          <button
            onClick={onSendEmail}
            disabled={sendingEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
          >
            <MailIcon className="w-4 h-4" />
            {sendingEmail
              ? t("sendingEmail") || "Sending..."
              : t("sendOrder") || "Send order"}
          </button>
        )}
        {po.status === "sent" && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400">
            <CheckCircleIcon className="w-4 h-4" />
            {t("orderSent") || "Order sent"}
          </span>
        )}
      </div>
      {/* Items table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--divider)]">
              <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">
                Item
              </th>
              <th className="text-right py-2 px-4 font-medium text-[var(--fg-secondary)]">
                {t("qty") || "Qty"}
              </th>
              <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {(po.items ?? []).map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--divider)] border-opacity-50"
              >
                <td className="py-2 px-4 text-fg-primary">{item.name}</td>
                <td className="py-2 px-4 text-right text-fg-primary font-mono">
                  {item.quantity.toFixed(1)}
                </td>
                <td className="py-2 px-4 text-[var(--fg-secondary)]">
                  {item.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Quick Receive Modal ─────────────────────────────────────────────────────

function QuickReceiveModal({
  stockItems,
  onConfirm,
  onClose,
  t,
}: {
  stockItems: StockItem[];
  onConfirm: (
    items: ConfirmDeliveryItemInput[],
    supplierName: string,
  ) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [supplierName, setSupplierName] = useState("");
  const { money } = useCurrency();
  return (
    <QuantityEntryDrawer
      title={t("addSupply")}
      description={t("kwReceiveHint")}
      items={stockItems
        .filter((item) => item.is_active !== false)
        .map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category || "",
          unit: item.unit,
          detail: money(item.cost_per_unit || 0),
        }))}
      onClose={onClose}
      confirmLabel={t("confirmReceive")}
      onConfirm={async (quantities) => {
        const items = stockItems
          .filter((item) => quantities[item.id] > 0)
          .map((item) => ({
            stock_item_id: item.id,
            name: item.name,
            original_name: item.name,
            quantity: quantities[item.id],
            unit: item.unit,
            category: item.category || "",
            cost_per_unit: item.cost_per_unit || 0,
          }));
        await onConfirm(items, supplierName.trim());
      }}
    >
      <label className={styles.supplierField}>
        {t("supplierName")}
        <input
          value={supplierName}
          onChange={(event) => setSupplierName(event.target.value)}
          list="daily-supplier-names"
        />
      </label>
      <datalist id="daily-supplier-names">
        {Array.from(
          new Set(stockItems.map((item) => item.supplier).filter(Boolean)),
        ).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </QuantityEntryDrawer>
  );
}

function SalesImportModal({
  restaurantId,
  report,
  categories,
  onPullFoody,
  onImported,
  onClose,
  t,
}: {
  restaurantId: number;
  report: DailyFoodCostReport;
  categories: MenuCategory[];
  onPullFoody: () => Promise<void>;
  onImported: () => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const { money } = useCurrency();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AvivSalesImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, number | null>>({});
  const [allowDateMismatch, setAllowDateMismatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pullingFoody, setPullingFoody] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [mappingPage, setMappingPage] = useState(0);

  const allItems = useMemo(
    () =>
      categories
        .flatMap((category) => category.items || [])
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const matchedRows =
    preview?.rows.filter((row) => mappings[row.source_name_key] != null)
      .length ?? 0;

  const readFile = async (selected: File) => {
    const isPDF =
      selected.type === "application/pdf" ||
      selected.name.toLowerCase().endsWith(".pdf");
    if (!isPDF) {
      setError(t("avivPDFOnly"));
      return;
    }
    setSearch("");
    setMappingPage(0);
    setFile(selected);
    setPreview(null);
    setMappings({});
    setAllowDateMismatch(false);
    setError("");
    setLoading(true);
    try {
      const result = await previewAvivSalesImport(
        restaurantId,
        report.id,
        selected,
      );
      setPreview(result);
      const initialMappings: Record<string, number | null> = {};
      result.rows.forEach((row) => {
        initialMappings[row.source_name_key] =
          row.suggested_menu_item_id ?? null;
      });
      setMappings(initialMappings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("avivImportReadError"));
    } finally {
      setLoading(false);
    }
  };

  const pullFoody = async () => {
    setError("");
    setPullingFoody(true);
    try {
      await onPullFoody();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("avivImportSaveError"));
      setPullingFoody(false);
    }
  };

  const confirmAviv = async () => {
    if (!file || !preview) return;
    setError("");
    setSubmitting(true);
    try {
      await importAvivSales(
        restaurantId,
        report.id,
        file,
        Object.entries(mappings).map(([sourceNameKey, menuItemId]) => ({
          source_name_key: sourceNameKey,
          menu_item_id: menuItemId,
        })),
        allowDateMismatch,
      );
      await onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("avivImportSaveError"));
      setSubmitting(false);
    }
  };

  const formatPeriod = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));

  const visibleRows = (preview?.rows ?? []).filter((row) =>
    row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <KitchenDrawer
      title={t("salesImportTitle")}
      description={t("salesImportDesc")}
      onClose={onClose}
      busy={loading || pullingFoody || submitting}
      wide
      footer={
        preview && (
          <button
            className={styles.primaryButton}
            onClick={confirmAviv}
            disabled={
              submitting || (preview.date_mismatch && !allowDateMismatch)
            }
          >
            {submitting ? t("importing") : t("confirmAvivImport")}
            <CheckCircleIcon size={16} />
          </button>
        )
      }
    >
      {!preview ? (
        <div className={styles.importChoices}>
          <section>
            <RefreshCwIcon size={24} />
            <h3>{t("foodyPOS")}</h3>
            <p>{t("foodyPOSImportDesc")}</p>
            <button
              onClick={pullFoody}
              disabled={pullingFoody || loading}
              className={styles.secondaryButton}
            >
              {pullingFoody ? t("importing") : t("syncFoodyPOS")}
            </button>
          </section>
          <section>
            <FileTextIcon size={24} />
            <h3>{t("avivPOS")}</h3>
            <p>{t("avivPOSImportDesc")}</p>
            <label className={styles.uploadButton}>
              {loading ? t("analyzing") : t("chooseAvivPDF")}
              <UploadIcon size={16} />
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={loading || pullingFoody}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void readFile(selected);
                }}
              />
            </label>
            {file && loading && <small>{file.name}</small>}
          </section>
        </div>
      ) : (
        <>
          <div className={styles.importFile}>
            <FileTextIcon size={20} />
            <div>
              <strong>{file?.name}</strong>
              <small>
                {formatPeriod(preview.report_from)} –{" "}
                {formatPeriod(preview.report_to)}
              </small>
            </div>
            <button
              className={styles.textButton}
              disabled={submitting}
              onClick={() => {
                setPreview(null);
                setFile(null);
                setMappings({});
                setError("");
              }}
            >
              {t("chooseAnotherFile")}
            </button>
          </div>
          <div className={styles.reviewMetrics}>
            <div>
              <strong>{preview.rows.length}</strong>
              <span>{t("salesRows")}</span>
            </div>
            <div>
              <strong>{preview.total_quantity}</strong>
              <span>{t("qtySold")}</span>
            </div>
            <div>
              <strong>{money(preview.total_revenue)}</strong>
              <span>{t("revenue")}</span>
            </div>
          </div>
          {preview.date_mismatch && (
            <div className={styles.importWarning}>
              <AlertTriangleIcon size={20} />
              <div>
                <strong>{t("avivPeriodMismatchTitle")}</strong>
                <p>
                  {t("avivPeriodMismatchDesc").replace(
                    "{date}",
                    preview.report_date,
                  )}
                </p>
                <label className="selection-row">
                  <input
                    type="checkbox"
                    checked={allowDateMismatch}
                    onChange={(event) =>
                      setAllowDateMismatch(event.target.checked)
                    }
                  />
                  {t("avivPeriodMismatchConfirm")}
                </label>
              </div>
            </div>
          )}
          <div className={styles.mappingSummary}>
            <strong>
              {t("avivMappingSummary")
                .replace("{matched}", String(matchedRows))
                .replace("{total}", String(preview.rows.length))}
            </strong>
            <p>{t("avivNamesGrouped")}</p>
          </div>
          <KitchenSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              setMappingPage(0);
            }}
            label={t("kwSearchSales")}
          />
          {visibleRows
            .slice(mappingPage * 6, mappingPage * 6 + 6)
            .map((row) => (
              <div key={row.source_name_key} className={styles.mappingRow}>
                <div>
                  <strong dir="auto">{row.name}</strong>
                  <small>
                    {row.quantity} {t("kwUnits")} · {money(row.line_total)}
                  </small>
                </div>
                <label>
                  {t("foodyRecipeMapping")}
                  <select
                    value={mappings[row.source_name_key] ?? ""}
                    onChange={(event) =>
                      setMappings((current) => ({
                        ...current,
                        [row.source_name_key]: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value="">{t("revenueOnlyNoRecipe")}</option>
                    {allItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          <KitchenPagination
            page={mappingPage}
            count={visibleRows.length}
            size={6}
            onChange={setMappingPage}
          />
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </KitchenDrawer>
  );
}

// ─── Quick Sales Modal ───────────────────────────────────────────────────────

function QuickSalesModal({
  categories,
  initialEntries,
  onConfirm,
  onClose,
  t,
}: {
  categories: MenuCategory[];
  initialEntries: Record<number, number>;
  onConfirm: (entries: Record<number, number>) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const { money } = useCurrency();
  const items = categories.flatMap((category) =>
    (category.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: category.name,
      unit: "unit",
      detail: money(item.price),
    })),
  );
  return (
    <QuantityEntryDrawer
      title={t("manualSalesEntry")}
      description={t("kwSalesManualHint")}
      items={items}
      initial={initialEntries}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel={t("saveSales")}
    />
  );
}
