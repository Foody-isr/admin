'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DeliveryImportModal from '../stock/DeliveryImportModal';
import { DailyProductionModal, DailyReceiptModal } from '@/components/kitchen/DailyActionModals';
import NextServicePanel from '@/components/kitchen/NextServicePanel';
import {
  getTodayFoodCostReport, getFoodCostReport, computeFoodCostReport,
  upsertSalesEntries, updateClosingStock, updateRetrospective,
  previewAvivSalesImport, importAvivSales, syncFoodyPOSSales,
  closeFoodCostReport, reopenFoodCostReport, createFoodCostReport, listFoodCostReports,
  getFoodCostBreakdown, getFoodCostSummary, deleteSalesEntries, deleteCostItems,
  listStockTransactions, getAllCategories, listStockItems, getRestaurant,
  confirmDelivery, deleteStockTransaction,
  getDailyPrepPlan, listPrepItems, type PrepItem,
  generateEstimatedSupplies, sendOrderEmail, listPurchaseOrders, EstimatedSuppliesResult,
  DailyFoodCostReport, DailyFoodCostItem, DailySalesEntry,
  IngredientBreakdown, StockTransaction, MenuCategory, MenuItem, StockItem,
  ConfirmDeliveryItemInput, PurchaseOrder, DailyPlanItem, OpeningHoursConfig,
  AvivSalesImportPreview,
} from '@/lib/api';
import {
  ChevronDownIcon, ChevronUpIcon, RefreshCwIcon,
  CheckCircleIcon, AlertTriangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XIcon, PlusIcon, TrashIcon, InfoIcon,
  MailIcon, SunriseIcon, UtensilsIcon, MoonIcon, ArrowRightIcon,
  PackageIcon, ChefHatIcon, type LucideIcon,
  UploadIcon, FileTextIcon, RotateCcwIcon,
} from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { NumberInput } from '@/components/ui/NumberInput';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { MoneyFormatter } from '@/lib/currency';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function timeToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getServiceWindow(config: OpeningHoursConfig | null, date: Date): { open: number; close: number } | null {
  if (!config) return null;
  const weekday = WEEKDAY_KEYS[date.getDay()];
  const windows = [config.dine_in, config.pickup, config.delivery]
    .map((schedule) => schedule?.[weekday])
    .filter((hours) => hours && !hours.closed && hours.open && hours.close)
    .flatMap((hours) => {
      const open = timeToMinutes(hours!.open);
      const close = timeToMinutes(hours!.close);
      return open == null || close == null ? [] : [{ open, close: close < open ? close + 24 * 60 : close }];
    });
  if (windows.length === 0) return null;
  return {
    open: Math.min(...windows.map((window) => window.open)),
    close: Math.max(...windows.map((window) => window.close)),
  };
}

type VarianceLevel = 'ok' | 'attention' | 'problem';

function varianceLevel(pct: number): VarianceLevel {
  const abs = Math.abs(pct);
  if (abs < 5) return 'ok';
  if (abs < 15) return 'attention';
  return 'problem';
}

function varianceColor(pct: number): string {
  switch (varianceLevel(pct)) {
    case 'ok': return 'text-green-500';
    case 'attention': return 'text-yellow-500';
    case 'problem': return 'text-red-500';
  }
}

function varianceBg(pct: number): string {
  switch (varianceLevel(pct)) {
    case 'ok': return '';
    case 'attention': return 'bg-yellow-500/5';
    case 'problem': return 'bg-red-500/5';
  }
}

function VarianceBadge({ pct, t }: { pct: number; t: (k: string) => string }) {
  const level = varianceLevel(pct);
  const configs = {
    ok:        { label: t('badgeOk') || 'OK',              cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
    attention: { label: t('badgeAttention') || 'Attention', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
    problem:   { label: t('badgeProblem') || 'Problem',     cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  };
  const { label, cls } = configs[level];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

function insightMessage(item: DailyFoodCostItem, t: (k: string) => string, money: MoneyFormatter): string | null {
  if (!item.closing_stock_counted) return null;
  if (Math.abs(item.variance) < 0.001) return null;
  const qty = `${Math.abs(item.variance).toFixed(2)}${item.unit}`;
  const cost = item.variance_cost !== 0 ? ` (≈ ${money(Math.abs(item.variance_cost), { decimals: 0 })})` : '';
  if (item.variance > 0) {
    return t('insightOverUse')
      .replace('{qty}', qty)
      .replace('{cost}', cost) ||
      `Vous avez utilisé ${qty} de trop${cost} → probable perte ou surdosage`;
  }
  return t('insightUnderUse')
    .replace('{qty}', qty) ||
    `Vous avez utilisé ${qty} de moins → possible erreur de stock ou de saisie`;
}

function computeRevenueLoss(
  item: DailyFoodCostItem,
  breakdown: IngredientBreakdown
): { dishes: { name: string; servings: number; revenue: number }[]; total: number } | null {
  const contributions = breakdown.contributions ?? [];
  if (item.variance <= 0 || contributions.length === 0) return null;
  const totalExpected = contributions.reduce((sum, c) => sum + c.total_usage_converted, 0);
  if (totalExpected <= 0) return null;

  const dishes: { name: string; servings: number; revenue: number }[] = [];
  let totalRevenue = 0;
  for (const c of contributions) {
    if (c.total_usage_converted <= 0 || c.menu_item_price <= 0) continue;
    const share = c.total_usage_converted / totalExpected;
    const varianceForDish = item.variance * share;
    const usagePerServing = c.total_usage_converted / c.qty_sold;
    const servingsLost = varianceForDish / usagePerServing;
    if (servingsLost >= 0.5) {
      const revenueLost = servingsLost * c.menu_item_price;
      dishes.push({ name: c.menu_item_name, servings: Math.round(servingsLost), revenue: revenueLost });
      totalRevenue += revenueLost;
    }
  }
  if (dishes.length === 0) return null;
  return { dishes, total: totalRevenue };
}

function computeKpis(report: DailyFoodCostReport) {
  const items = report.items || [];
  const actualCost = items.reduce(
    (sum, item) => sum + (item.closing_stock_counted ? item.actual_usage : item.theoretical_usage) * item.cost_per_unit,
    0,
  );
  const wasteCost = items.reduce((sum, i) => sum + i.waste_qty * i.cost_per_unit, 0);
  const varianceCost = items.reduce(
    (sum, item) => sum + (item.closing_stock_counted ? item.variance_cost : 0),
    0,
  );
  const revenue = report.total_sales_revenue;
  const foodCostPct = revenue > 0 ? (actualCost / revenue) * 100 : 0;
  return { foodCostPct, revenue, varianceCost, wasteCost };
}

function statusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case 'open': return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-500">{t('open')}</span>;
    case 'closed': return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-600">{t('closed')}</span>;
    case 'reviewed': return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400">Reviewed</span>;
    default: return null;
  }
}

export default function DailyOperationsPage() {
  const { money } = useCurrency();
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');

  const [report, setReport] = useState<DailyFoodCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Section expansion
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['sales', 'estimated'])
  );

  // Supplies received today
  const [todayReceives, setTodayReceives] = useState<StockTransaction[]>([]);

  // Sales entry
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [salesEntries, setSalesEntries] = useState<Record<number, number>>({});

  // Closing stock
  const [closingStocks, setClosingStocks] = useState<Record<number, number>>({});
  const [closingCountError, setClosingCountError] = useState('');

  // Retrospective
  const [wentWell, setWentWell] = useState('');
  const [wentWrong, setWentWrong] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Selection for deletion
  const [selectedSales, setSelectedSales] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deletingSales, setDeletingSales] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);

  // Inline breakdown expand
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [breakdownCache, setBreakdownCache] = useState<Record<number, IngredientBreakdown>>({});
  const [breakdownLoading, setBreakdownLoading] = useState<number | null>(null);

  // Quick receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [productionItem, setProductionItem] = useState<DailyPlanItem | null>(null);
  const [pendingDeliveries, setPendingDeliveries] = useState<PurchaseOrder[]>([]);
  const [supplementaryError, setSupplementaryError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
  const [openingHours, setOpeningHours] = useState<OpeningHoursConfig | null>(null);

  // Estimated supplies
  const [estimatedPOs, setEstimatedPOs] = useState<PurchaseOrder[]>([]);
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [generationAttempted, setGenerationAttempted] = useState(false);
  const [generationDiag, setGenerationDiag] = useState<EstimatedSuppliesResult | null>(null);
  const [sendingEmailPO, setSendingEmailPO] = useState<number | null>(null);
  const [emailModalPO, setEmailModalPO] = useState<PurchaseOrder | null>(null);
  const [emailTo, setEmailTo] = useState('');

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = formatDate(selectedDate);
      const today = formatDate(new Date());

      let rpt: DailyFoodCostReport;
      if (dateStr === today) {
        rpt = await getTodayFoodCostReport(rid);
        if (rpt.status === 'open' && canManage) rpt = await computeFoodCostReport(rid, rpt.id);
      } else {
        // Try to find existing report for that date
        const reports = await listFoodCostReports(rid, dateStr, dateStr);
        if (reports.length > 0) {
          rpt = await getFoodCostReport(rid, reports[0].id);
        } else {
          rpt = await createFoodCostReport(rid, dateStr);
          rpt = await getFoodCostReport(rid, rpt.id);
        }
      }
      setReport(rpt);
      setBreakdownCache({});
      setExpandedItemId(null);

      // Populate form state from report
      if (rpt.sales) {
        const entries: Record<number, number> = {};
        rpt.sales.forEach(s => {
          if (s.source === 'manual' && s.menu_item_id != null) entries[s.menu_item_id] = s.quantity;
        });
        setSalesEntries(entries);
      }
      if (rpt.items) {
        const stocks: Record<number, number> = {};
        rpt.items.forEach(i => {
          if (i.stock_item_id && i.closing_stock_counted) stocks[i.stock_item_id] = i.closing_stock;
        });
        setClosingStocks(stocks);
      }
      setClosingCountError('');
      setWentWell(rpt.went_well || '');
      setWentWrong(rpt.went_wrong || '');
      setToImprove(rpt.to_improve || '');

      // Auto-load estimated supply POs when report is closed
      if (rpt.status === 'closed') {
        try {
          const pos = await listPurchaseOrders(rid, { source_report_id: rpt.id });
          setEstimatedPOs(pos);
        } catch { setEstimatedPOs([]); }
      } else {
        setEstimatedPOs([]);
      }
      setGenerationAttempted(false);
      setGenerationDiag(null);
    } catch (error) {
      setReport(null);
      setActionError(error instanceof Error ? error.message : t('dailyLoadError'));
    } finally {
      setLoading(false);
    }
  }, [rid, selectedDate, canManage, t]);

  const loadSupplementary = useCallback(async () => {
    setSupplementaryError('');
    try {
      const [cats, stock, prepPlan, restaurant, deliveries, nextPlan, preparations] = await Promise.all([
        getAllCategories(rid),
        listStockItems(rid),
        getDailyPrepPlan(rid, { day_of_week: selectedDate.getDay() }),
        getRestaurant(rid),
        listPurchaseOrders(rid, { status: 'sent' }),
        getDailyPrepPlan(rid, { day_of_week: (selectedDate.getDay() + 1) % 7 }),
        listPrepItems(rid, { is_active: true }),
      ]);
      setCategories(cats);
      setStockItems(stock);
      setDailyPrepPlan(prepPlan);
      setOpeningHours(restaurant?.opening_hours_config ?? null);
      setPendingDeliveries(deliveries);
      setTomorrowPrepPlan(nextPlan);
      setPrepItems(preparations);

      // Load today's receive transactions
      const txns = await listStockTransactions(rid, { type: 'receive' });
      const dateStr = formatDate(selectedDate);
      const filtered = txns.filter(tx => tx.created_at?.startsWith(dateStr));
      setTodayReceives(filtered);
    } catch (error) {
      setDailyPrepPlan([]);
      setTomorrowPrepPlan([]);
      setPendingDeliveries([]);
      setPrepItems([]);
      setSupplementaryError(error instanceof Error ? error.message : t('dailyLoadError'));
    }
  }, [rid, selectedDate, t]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadSupplementary(); }, [loadSupplementary]);

  const navigateDate = (delta: number) => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  };

  // Recompute report server-side and refresh local state (KPIs, items, closing stocks).
  const recomputeAndReload = useCallback(async (reportId: number) => {
    const updated = await computeFoodCostReport(rid, reportId);
    setReport(updated);
    setBreakdownCache({});
    setExpandedItemId(null);
    if (updated.items) {
      const stocks: Record<number, number> = {};
      updated.items.forEach(i => {
        if (i.stock_item_id && i.closing_stock_counted) stocks[i.stock_item_id] = i.closing_stock;
      });
      setClosingStocks(stocks);
    }
  }, [rid]);

  const handleCompute = async () => {
    if (!report) return;
    setComputing(true);
    try {
      await recomputeAndReload(report.id);
    } finally {
      setComputing(false);
    }
  };

  const handlePullFoodySales = async () => {
    if (!report) return;
    setComputing(true);
    try {
      await syncFoodyPOSSales(rid, report.id);
      await loadReport();
    } finally {
      setComputing(false);
    }
  };


  const handleSaveDraft = async () => {
    if (!report) return;
    setSavingDraft(true);
    setClosingCountError('');
    try {
      const items = Object.entries(closingStocks)
        .map(([stockItemId, quantity]) => ({ stock_item_id: Number(stockItemId), quantity }));
      await Promise.all([
        ...(items.length > 0 ? [updateClosingStock(rid, report.id, items)] : []),
        updateRetrospective(rid, report.id, {
          went_well: wentWell,
          went_wrong: wentWrong,
          to_improve: toImprove,
        }),
      ]);
      await recomputeAndReload(report.id);
    } catch (error) {
      setClosingCountError(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    setActionError('');
    if (!confirm(t('dailyCloseConfirm'))) return;
    setClosing(true);
    setClosingCountError('');
    try {
      const items = Object.entries(closingStocks)
        .map(([stockItemId, quantity]) => ({ stock_item_id: Number(stockItemId), quantity }));
      await Promise.all([
        ...(items.length > 0 ? [updateClosingStock(rid, report.id, items)] : []),
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
      setActionError(error instanceof Error ? error.message : t('closeDayError'));
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    if (!report) return;
    if (!confirm(t('reopenDayConfirm'))) return;
    setActionError('');
    setReopening(true);
    try {
      await reopenFoodCostReport(rid, report.id);
      await loadReport();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('reopenDayError'));
    } finally {
      setReopening(false);
    }
  };

  const handleToggleBreakdown = async (itemId: number, stockItemId: number) => {
    if (expandedItemId === itemId) { setExpandedItemId(null); return; }
    setExpandedItemId(itemId);
    if (breakdownCache[stockItemId]) return;
    setBreakdownLoading(stockItemId);
    try {
      const bd = await getFoodCostBreakdown(rid, report!.id, stockItemId);
      setBreakdownCache(prev => ({ ...prev, [stockItemId]: bd }));
    } catch {
      setExpandedItemId(null);
    } finally {
      setBreakdownLoading(null);
    }
  };

  const handleDeleteSales = async (ids: number[]) => {
    if (!report || ids.length === 0) return;
    setDeletingSales(true);
    try {
      await deleteSalesEntries(rid, report.id, ids);
      setSelectedSales(new Set());
      await recomputeAndReload(report.id);
    } finally {
      setDeletingSales(false);
    }
  };

  const handleDeleteItems = async (ids: number[]) => {
    if (!report || ids.length === 0) return;
    setDeletingItems(true);
    try {
      await deleteCostItems(rid, report.id, ids);
      setSelectedItems(new Set());
      await recomputeAndReload(report.id);
    } finally {
      setDeletingItems(false);
    }
  };

  const toggleSalesSelection = (id: number) => {
    setSelectedSales(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleItemSelection = (id: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSales = () => {
    if (!report?.sales) return;
    if (selectedSales.size === report.sales.length) {
      setSelectedSales(new Set());
    } else {
      setSelectedSales(new Set(report.sales.map(s => s.id)));
    }
  };

  // ─── Estimated Supplies handlers ────────────────────────────────────
  const handleGenerateOrders = async (source: 'pos' | 'manual' | 'both' = 'pos') => {
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
      setActionError(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setGeneratingOrders(false);
    }
  };

  const handleSendEmail = async (po: PurchaseOrder) => {
    setSendingEmailPO(po.id);
    try {
      const to = emailTo || po.supplier?.email || '';
	      await sendOrderEmail(rid, po.id, { to, language: po.supplier?.preferred_language || 'he' });
      // Refresh POs to get updated status
      if (report) {
        const pos = await listPurchaseOrders(rid, { source_report_id: report.id });
        setEstimatedPOs(pos);
      }
      setEmailModalPO(null);
      setEmailTo('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('saveFailed'));
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

  const isOpen = report?.status === 'open' && canManage;
  const prepToLaunch = dailyPrepPlan.filter((item) => item.batches_needed > 0);
  const batchesToLaunch = prepToLaunch.reduce((sum, item) => sum + item.batches_needed, 0);
  const lowStockItems = stockItems.filter(
    (item) => item.is_active !== false && item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold,
  );
  const varianceAlerts = (report?.items ?? []).filter(
    (item) => item.closing_stock_counted && varianceLevel(item.variance_percent) !== 'ok',
  ).length;
  const selectedIsToday = formatDate(selectedDate) === formatDate(new Date());
  const soldQuantity = (report?.sales ?? []).reduce((sum, sale) => sum + sale.quantity, 0);
  const externalSalesPending = report?.status === 'open' && (report.sales ?? []).some((sale) => sale.source !== 'pos');
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const serviceWindow = getServiceWindow(openingHours, selectedDate);
  const operationalNowMinutes = serviceWindow && serviceWindow.close > 24 * 60 && nowMinutes < serviceWindow.open
    ? nowMinutes + 24 * 60
    : nowMinutes;
  const serviceHasStarted = serviceWindow
    ? operationalNowMinutes >= serviceWindow.open
    : nowMinutes >= 11 * 60;
  const serviceHasEnded = serviceWindow
    ? operationalNowMinutes > serviceWindow.close
    : nowMinutes >= 17 * 60;
  const suggestedPhase: 'opening' | 'service' | 'closing' | null = !selectedIsToday || (!serviceWindow && report?.status !== 'closed')
    ? null
    : report?.status === 'closed' || serviceHasEnded
      ? 'closing'
      : serviceHasStarted
        ? 'service'
        : 'opening';

  const jumpToPhase = (phase: 'opening' | 'service' | 'closing') => {
    document.getElementById(`phase-${phase}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Today is the kitchen cockpit: one date, three moments, one recommended focus. */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-fg-primary">
              {t('today')}
            </h1>
            {report && statusBadge(report.status, t)}
            {report?.status === 'closed' && canManage && (
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopening}
                className="inline-flex items-center gap-1.5 rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcwIcon className={`size-3.5 ${reopening ? 'animate-spin' : ''}`} />
                {reopening ? t('reopeningDay') : t('reopenDay')}
              </button>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-secondary)]">
            {t('todayKitchenDesc')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => navigateDate(-1)}
            className="grid size-9 place-items-center rounded-r-md border border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-hover)]"
            aria-label={t('previousDay')}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <input
            type="date"
            value={formatDate(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
            className="input h-9 px-3 text-sm"
          />
          <button
            onClick={() => navigateDate(1)}
            className="grid size-9 place-items-center rounded-r-md border border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-hover)]"
            aria-label={t('nextDay')}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </header>

      <div className="grid items-center gap-3 rounded-r-md bg-[var(--surface-2)] px-4 py-3 text-sm text-fg-secondary sm:grid-cols-[minmax(0,1fr)_auto]">
        <p>{t('dailyAutomaticStockHint')}</p>
        <button type="button" disabled={refreshing} className="btn-secondary inline-flex shrink-0 items-center gap-2 text-xs" onClick={async () => {
          setRefreshing(true);
          try { await loadSupplementary(); if (report?.status === 'open') await recomputeAndReload(report.id); }
          catch (error) { setActionError(error instanceof Error ? error.message : t('dailyLoadError')); }
          finally { setRefreshing(false); }
        }}><RefreshCwIcon className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />{t('refresh')}</button>
      </div>
      {supplementaryError && <p role="alert" className="rounded-r-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">{t('dailyLoadError')} {supplementaryError}</p>}
      {!selectedIsToday && <p className="text-sm text-fg-secondary">{t('dailyLiveStockHint')}</p>}

      {actionError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-r-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label={t('close')} className="shrink-0 font-semibold hover:opacity-70">×</button>
        </div>
      )}

      <nav aria-label={t('todayPhases')} className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid md:grid-cols-3">
          {([
            ['opening', t('dayPhaseOpening'), t('dayPhaseOpeningShort'), SunriseIcon],
            ['service', t('dayPhaseService'), t('dayPhaseServiceShort'), UtensilsIcon],
            ['closing', t('dayPhaseClosing'), t('dayPhaseClosingShort'), MoonIcon],
          ] as const).map(([phase, label, desc, Icon], index) => {
            const recommended = suggestedPhase === phase;
            return (
              <button
                key={phase}
                type="button"
                onClick={() => jumpToPhase(phase)}
                className={`group relative flex min-h-24 items-start gap-3 px-5 py-4 text-start transition-colors md:border-s md:first:border-s-0 md:border-[var(--line)] ${
                  recommended ? 'bg-[var(--brand-50)]' : 'hover:bg-[var(--surface-2)]'
                } ${index > 0 ? 'border-t border-[var(--line)] md:border-t-0' : ''}`}
              >
                <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
                  recommended
                    ? 'bg-[var(--brand-500)] text-white'
                    : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
                }`}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-[var(--fg)]">
                    {label}
                    {recommended && (
                      <span className="rounded-full bg-[var(--brand-100)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-700)]">
                        {t('recommendedNow')}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--fg-muted)]">{desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <PhaseHeading
        id="phase-opening"
        icon={SunriseIcon}
        title={t('dayPhaseOpening')}
        desc={t('dayPhaseOpeningDesc')}
        recommended={suggestedPhase === 'opening'}
        t={t}
      />

      <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[var(--fg)]">
              <ChefHatIcon className="size-4 text-[var(--brand-500)]" />
              {t('prepToLaunch')}
            </h2>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('prepToLaunchDesc')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {batchesToLaunch > 0 && (
              <span className="rounded-r-md bg-[var(--brand-50)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-700)]">
                {batchesToLaunch} {t('batches')}
              </span>
            )}
            <Link
              href={`/${rid}/kitchen/prep`}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-500)] hover:underline"
            >
              {t('viewPreparations')} <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>
        {dailyPrepPlan.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--fg-muted)]">{supplementaryError ? t('dailyLoadError') : t('dailyNoForecast')}</div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {prepToLaunch.map((item) => (
              <div key={item.prep_item_id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--fg)]">{item.prep_item_name}</div>
                  <div className="mt-0.5 text-xs text-[var(--fg-muted)]">{item.category}</div>
                </div>
                <div className="text-xs text-[var(--fg-muted)] sm:text-end">
                  {t('current')}: <span className="font-medium text-[var(--fg)]">{item.current_qty.toFixed(1)} {item.unit}</span>
                  {' / '}
                  {t('demand')}: <span className="font-medium text-[var(--fg)]">{item.required_qty.toFixed(1)} {item.unit}</span>
                </div>
                <div className="flex items-center gap-3"><span className="text-xs font-semibold text-[var(--brand-700)]">{item.batches_needed} {t('batches')}</span>
                  {canManage && selectedIsToday && !supplementaryError && <button className="btn-primary text-xs" onClick={() => setProductionItem(item)}>{t('dailyConfirmProduction')}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="font-semibold">{t('dailyDeliveriesToCheck')}</h2><p className="mt-1 text-xs text-fg-secondary">{t('dailyDeliveriesHint')}</p></div>
          {canManage && selectedIsToday && <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" onClick={() => setShowScanModal(true)}><UploadIcon className="mr-1 inline size-4" />{t('dailyScanDelivery')}</button>
            <button className="btn-secondary text-xs" onClick={() => setShowReceiveModal(true)}><PlusIcon className="mr-1 inline size-4" />{t('dailyManualDelivery')}</button>
          </div>}
        </div>
        <div className="divide-y divide-[var(--line)]">
          {pendingDeliveries.length === 0 ? <p className="px-5 py-4 text-sm text-fg-secondary">{supplementaryError ? t('dailyLoadError') : t('dailyNoDeliveries')}</p> : pendingDeliveries.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div><p className="text-sm font-medium">{order.supplier?.name} <span className="font-normal text-fg-secondary">PO-{order.id}</span></p>
                <p className="mt-1 text-xs text-fg-secondary">{order.items.length} {t('items')}{order.expected_delivery_at ? ` · ${new Date(order.expected_delivery_at).toLocaleDateString()}` : ''}</p></div>
              {canManage && selectedIsToday && <button className="btn-primary text-xs" onClick={() => setReceiptOrder(order)}>{t('dailyReviewDelivery')}</button>}
            </div>
          ))}
        </div>
        <Link href={`/${rid}/kitchen/suppliers?tab=orders`} className="block border-t border-[var(--line)] px-5 py-3 text-sm font-medium text-brand-500">{t('dailyManageOrders')}</Link>
      </section>

      {/* Section 1: Supplies Received */}
      <CollapsibleSection
        title={t('suppliesReceived') || 'Supplies Received'}
        sectionKey="supplies"
        expanded={expandedSections.has('supplies')}
        onToggle={toggleSection}
        badge={todayReceives.length > 0 ? `${todayReceives.length} items` : undefined}
        action={canManage && selectedIsToday ? (
          <button
            onClick={() => setShowReceiveModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t('addSupply') || 'Add Supply'}
          </button>
        ) : undefined}
      >
        <SectionDesc>{t('suppliesReceivedDesc') || 'Log all deliveries received today. Each entry updates your stock levels.'}</SectionDesc>
        {todayReceives.length === 0 ? (
          <p className="text-sm text-[var(--fg-secondary)] py-4">{t('noSuppliesReceived') || 'No supplies received today.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--divider)]">
                <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('ingredient') || 'Ingredient'}</th>
                <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('quantity') || 'Quantity'}</th>
                <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('time') || 'Time'}</th>
                {isOpen && <th className="w-10 py-2" />}
              </tr>
            </thead>
            <tbody>
              {todayReceives.map(tx => {
                const si = stockItems.find(s => s.id === tx.stock_item_id);
                return (
                  <tr key={tx.id} className="border-b border-[var(--divider)] border-opacity-50 group">
                    <td className="py-2 text-fg-primary">{si?.name || `#${tx.stock_item_id}`}</td>
                    <td className="py-2 text-right text-fg-primary">+{tx.quantity_delta} {si?.unit}</td>
                    <td className="py-2 text-right text-[var(--fg-secondary)]">{tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : ''}</td>
                    {isOpen && (
                      <td className="py-2 text-right">
                        <button
                          onClick={async () => {
                            await deleteStockTransaction(rid, tx.id);
                            loadSupplementary();
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--fg-secondary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title={t('delete') || 'Delete'}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      <PhaseHeading
        id="phase-service"
        icon={UtensilsIcon}
        title={t('dayPhaseService')}
        desc={t('dayPhaseServiceDesc')}
        recommended={suggestedPhase === 'service'}
        t={t}
      />

      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid divide-y divide-[var(--line)] md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
          <OperationalMetric
            icon={ChefHatIcon}
            label={t('dailyProductionAlerts')}
            value={supplementaryError || dailyPrepPlan.length === 0 ? '—' : String(prepToLaunch.length)}
            detail={prepToLaunch.length > 0
              ? t('servicePrepRisk').replace('{count}', String(prepToLaunch.length))
              : t('dailyNoForecast')}
            tone={prepToLaunch.length > 0 ? 'warning' : 'default'}
          />
          <OperationalMetric
            icon={PackageIcon}
            label={t('lowStockItems')}
            value={supplementaryError ? '—' : String(lowStockItems.length)}
            detail={supplementaryError ? t('dailyLoadError') : lowStockItems.length > 0 ? t('needsAttention') : t('stockCovered')}
            tone={supplementaryError ? 'default' : lowStockItems.length > 0 ? 'danger' : 'success'}
          />
          <OperationalMetric
            icon={UtensilsIcon}
            label={t('salesEntry')}
            value={String(soldQuantity)}
            detail={externalSalesPending ? t('dailyExternalSalesPending') : t('dailySoldUnits')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] px-5 py-3 text-sm">
          <Link href={`/${rid}/kitchen/prep`} className="inline-flex items-center gap-1 font-medium text-[var(--brand-500)] hover:underline">
            {t('viewPreparations')} <ArrowRightIcon className="size-3.5" />
          </Link>
          <Link href={`/${rid}/kitchen/stock`} className="inline-flex items-center gap-1 font-medium text-[var(--brand-500)] hover:underline">
            {t('viewStock')} <ArrowRightIcon className="size-3.5" />
          </Link>
          <Link href={`/${rid}/settings/stock/availability`} className="inline-flex items-center gap-1 font-medium text-[var(--brand-500)] hover:underline">
            {t('manageAvailability')} <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </section>

      {!supplementaryError && prepItems.length > 0 && <NextServicePanel key={`${rid}-${formatDate(selectedDate)}`} items={prepItems} canProduce={canManage && selectedIsToday} onProduce={setProductionItem} />}
      {!supplementaryError && lowStockItems.length > 0 && <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
        <h3 className="text-sm font-semibold">{t('dailyStockToOrder')}</h3>
        <div className="mt-2 divide-y divide-[var(--line)]">{lowStockItems.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <span>{item.name}<span className="ml-2 text-xs text-fg-secondary">{item.supplier}</span></span><span className="tabular-nums text-fg-secondary">{item.quantity} {item.unit} / {t('reorderThreshold')}: {item.reorder_threshold}</span>
        </div>)}</div>
        <Link className="mt-3 inline-block text-sm font-medium text-brand-500" href={`/${rid}/kitchen/suppliers?tab=orders`}>{t('dailyManageOrders')}</Link>
      </div>}

      {/* Section 2: Sales */}
      <CollapsibleSection
        title={t('salesEntry') || 'Sales'}
        sectionKey="sales"
        expanded={expandedSections.has('sales')}
        onToggle={toggleSection}
        badge={report?.sales?.length ? `${report.sales.length} items` : undefined}
        action={isOpen ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSalesImportModal(true)}
              disabled={computing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 ${computing ? 'animate-spin' : ''}`} />
              {t('pullFromPOS') || 'Pull from POS'}
            </button>
            <button
              onClick={() => setShowSalesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              {t('manualSalesEntry') || 'Manual Entry'}
            </button>
          </div>
        ) : undefined}
      >
        <SectionDesc>{t('salesDesc') || 'Sales data drives the theoretical ingredient usage calculation. Pull from POS or enter manually.'}</SectionDesc>
        {report?.sales && report.sales.length > 0 ? (
          <div className="space-y-2">
            {isOpen && selectedSales.size > 0 && (
              <div className="flex items-center gap-2 py-1">
                <button
                  onClick={() => handleDeleteSales(Array.from(selectedSales))}
                  disabled={deletingSales}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  {t('deleteSelected') || `Delete (${selectedSales.size})`}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--divider)]">
                  {isOpen && (
                    <th className="w-8 py-2 align-middle">
                      <input type="checkbox" checked={report.sales.length > 0 && selectedSales.size === report.sales.length} onChange={toggleAllSales} className="rounded" />
                    </th>
                  )}
                  <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('menuItem') || 'Menu Item'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('qtySold') || 'Qty Sold'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('source') || 'Source'}</th>
                  {isOpen && <th className="w-10 py-2" />}
                </tr>
              </thead>
              <tbody>
                {report.sales.map(s => (
                  <tr key={s.id} className="border-b border-[var(--divider)] border-opacity-50 group">
                    {isOpen && (
                      <td className="w-8 py-2 align-middle">
                        <input type="checkbox" checked={selectedSales.has(s.id)} onChange={() => toggleSalesSelection(s.id)} className="rounded" />
                      </td>
                    )}
                    <td className="py-2 text-fg-primary">
                      <span className="block">{s.menu_item_name}</span>
                      {s.source === 'aviv' && (s.menu_item_id == null || (s.source_name && s.source_name !== s.menu_item_name)) && (
                        <span className="block text-xs text-[var(--fg-secondary)]">
                          {s.menu_item_id == null
                            ? t('notLinkedToRecipe')
                            : `${t('avivItem')}: ${s.source_name}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right text-fg-primary">{s.quantity}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        s.source === 'pos'
                          ? 'bg-blue-500/20 text-blue-400'
                          : s.source === 'aviv'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {s.source}
                      </span>
                    </td>
                    {isOpen && (
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDeleteSales([s.id])}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--fg-secondary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title={t('delete') || 'Delete'}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--fg-secondary)] py-4">
            {t('noSalesDataYet') || 'No sales data yet. Pull from POS or enter manually.'}
          </p>
        )}
      </CollapsibleSection>

      <PhaseHeading
        id="phase-closing"
        icon={MoonIcon}
        title={t('dayPhaseClosing')}
        desc={t('dayPhaseClosingDesc')}
        recommended={suggestedPhase === 'closing'}
        t={t}
      />

      {report && (() => {
        const kpis = computeKpis(report);
        const hasCounts = (report.items ?? []).some((item) => item.closing_stock_counted);
        return (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={t('dailyEstimatedFoodCost')}
              value={`${kpis.foodCostPct.toFixed(1)}%`}
              warn={kpis.foodCostPct > 35}
              tooltip={t('dailyEstimatedFoodCostHint')}
              explain={t('dailyEstimatedFoodCostHint')}
            />
            <KpiCard
              label={t('revenue') || 'Revenue'}
              value={money(kpis.revenue, { decimals: 0 })}
              tooltip={t('revenueTooltip')}
              explain={t('revenueExplain')}
            />
            <KpiCard
              label={t('variance') || 'Variance'}
              value={hasCounts ? money(kpis.varianceCost, { decimals: 0 }) : '—'}
              warn={hasCounts && varianceAlerts > 0}
              tooltip={t('varianceTooltip')}
              explain={t('varianceExplain')}
            />
            <KpiCard
              label={t('wasteValue') || 'Waste'}
              value={money(kpis.wasteCost, { decimals: 0 })}
              warn={kpis.wasteCost > 0}
              tooltip={t('wasteTooltip')}
              explain={t('wasteExplain')}
            />
          </div>
        );
      })()}

      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold">{t('dailyTomorrowTitle')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-secondary">{t('dailyTomorrowHint')}</p>
        <div className="mt-3 divide-y divide-[var(--line)]">
          {tomorrowPrepPlan.length === 0 ? <p className="py-3 text-sm text-fg-secondary">{supplementaryError ? t('dailyLoadError') : t('dailyNoForecast')}</p> : tomorrowPrepPlan.map((item) => <div key={item.prep_item_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span className="font-medium">{item.prep_item_name}</span><span className="text-fg-secondary">{t('current')}: {item.current_qty.toFixed(1)} {item.unit} · {t('demand')}: {item.required_qty.toFixed(1)} {item.unit} · {item.batches_needed} {t('batches')}</span>
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium text-brand-500">
          <Link href={`/${rid}/kitchen/prep`}>{t('viewPreparations')}</Link><Link href={`/${rid}/kitchen/suppliers?tab=orders`}>{t('dailyManageOrders')}</Link>
        </div>
      </section>
      {isOpen && <section className="flex flex-wrap items-center justify-between gap-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="max-w-2xl"><h2 className="font-semibold">{t('closeDay')}</h2><p className="mt-1 text-sm text-fg-secondary">{t('dailyCloseHint')}</p>
          {externalSalesPending && <p className="mt-2 text-sm text-[var(--warning-500)]">{t('dailyExternalSalesPending')}</p>}</div>
        <div className="flex flex-wrap gap-2"><button onClick={handleSaveDraft} disabled={savingDraft || closing} className="btn-secondary">{savingDraft ? t('saving') : t('saveDraft')}</button>
          <button onClick={handleClose} disabled={closing || savingDraft} className="btn-primary">{closing ? t('closing') : t('closeDay')}</button></div>
        {closingCountError && <p role="alert" className="w-full text-sm text-red-500">{closingCountError}</p>}
      </section>}

      {/* Section 3: Stock Count & Variance */}
      <CollapsibleSection
        title={t('dailyOptionalInventory')}
        sectionKey="variance"
        expanded={expandedSections.has('variance')}
        onToggle={toggleSection}
      >
        <div className="space-y-4">
          <SectionDesc>{t('stockCountVarianceDesc') || 'Compare actual vs theoretical ingredient consumption. Enter your physical end-of-day stock count to see where losses occur.'}</SectionDesc>
          {isOpen && (
            <div id="physical-stock-count-help" className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-xs leading-relaxed text-[var(--fg-muted)]">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <p className="font-semibold text-[var(--fg)]">{t('stockCountHelpTitle')}</p>
                <p className="mt-0.5">{t('dailyOptionalInventoryHint')}</p>
                <p className="mt-1">{t('stockCountRequiredHint')}</p>
                <p className="mt-1 font-medium text-[var(--fg)]">{t('stockCountExample')}</p>
              </div>
            </div>
          )}
          {closingCountError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--danger-500)]/30 bg-[var(--danger-50)] px-3 py-2 text-xs leading-relaxed text-[var(--danger-500)]">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{closingCountError}</span>
            </div>
          )}
          {/* Variance table */}
          {report?.items && report.items.length > 0 ? (
            <div className="space-y-2">
              {isOpen && selectedItems.size > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <button
                    onClick={() => handleDeleteItems(Array.from(selectedItems))}
                    disabled={deletingItems}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    {t('deleteSelected') || `Delete (${selectedItems.size})`}
                  </button>
                </div>
              )}
              <div className="space-y-1">
                {/* Table header */}
                <div className={`grid text-xs font-medium text-[var(--fg-secondary)] px-3 py-2 border-b border-[var(--divider)] ${isOpen ? 'grid-cols-[2rem_1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]'} gap-x-4`}>
                  {isOpen && <span className="w-8" />}
                  <span>{t('ingredient') || 'Ingredient'}</span>
                  <span className="text-right"><ThTooltip label={t('opening') || 'Opening'} tooltip={t('colOpeningTooltip')} explain={t('colOpeningExplain')} /></span>
                  <span className="text-right"><ThTooltip label={t('received') || 'Received'} tooltip={t('colReceivedTooltip')} explain={t('colReceivedExplain')} /></span>
                  <span className="text-right"><ThTooltip label={t('colExpectedLabel') || 'Expected'} tooltip={t('colTheoreticalTooltip')} explain={t('colTheoreticalExplain')} /></span>
                  <span className="text-right"><ThTooltip label={t('remainingStockLabel') || 'Stock remaining'} tooltip={t('colClosingTooltip')} explain={t('colClosingExplain')} /></span>
                  <span className="text-right"><ThTooltip label={t('colLossLabel') || 'Loss / Over-use'} tooltip={t('colVarianceTooltip')} explain={t('colVarianceExplain')} /></span>
                  <span className="text-right"><ThTooltip label={t('colImpactLabel') || 'Impact'} tooltip={t('colVariancePctTooltip')} explain={t('colVariancePctExplain')} /></span>
                  {isOpen && <span />}
                </div>
                {/* Rows */}
                {report.items.map(item => {
                  const insight = insightMessage(item, t, money);
                  const isExpanded = expandedItemId === item.id;
                  const bd = item.stock_item_id ? breakdownCache[item.stock_item_id] : undefined;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border transition-colors group ${isExpanded ? 'border-[var(--divider)] bg-[var(--surface)]' : 'border-transparent hover:border-[var(--divider)]'} ${item.closing_stock_counted ? varianceBg(item.variance_percent) : ''}`}
                    >
                      {/* Main row */}
                      <div
                        className={`grid items-center px-3 py-2.5 cursor-pointer ${isOpen ? 'grid-cols-[2rem_1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]'} gap-x-4 text-sm`}
                        onClick={() => item.stock_item_id && handleToggleBreakdown(item.id, item.stock_item_id)}
                      >
                        {isOpen && (
                          <div className="w-8 flex items-center" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleItemSelection(item.id)} className="rounded" />
                          </div>
                        )}
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-medium text-fg-primary">{item.item_name}</span>
                          <span className="text-[var(--fg-secondary)] text-xs">({item.unit})</span>
                          {item.stock_item_id && (
                            isExpanded
                              ? <ChevronUpIcon className="w-3.5 h-3.5 text-[var(--fg-secondary)]" />
                              : <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--fg-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                        <span className="text-right text-fg-primary">{item.opening_stock.toFixed(2)}</span>
                        <span className="text-right text-green-400">+{item.received_qty.toFixed(2)}</span>
                        <span className="text-right text-[var(--fg-secondary)]">{item.theoretical_usage.toFixed(2)}</span>
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          {isOpen ? (
                            <NumberInput
                              value={item.stock_item_id ? closingStocks[item.stock_item_id] : undefined}
                              onChange={(n) => {
                                if (!item.stock_item_id) return;
                                setClosingStocks(prev => ({ ...prev, [item.stock_item_id!]: n }));
                                setClosingCountError('');
                              }}
                              format={(n) => String(n)}
                              placeholder={t('enterClosingCount')}
                              aria-label={`${t('remainingStockLabel')} — ${item.item_name}`}
                              aria-describedby="physical-stock-count-help"
                              className="input w-24 max-w-full px-2 py-0.5 text-sm text-right"
                            />
                          ) : item.closing_stock_counted ? (
                            <span>{item.closing_stock.toFixed(2)}</span>
                          ) : (
                            <span className="text-xs text-[var(--fg-muted)]">{t('notCounted')}</span>
                          )}
                        </div>
                        <span className={`text-right font-medium tabular-nums ${item.closing_stock_counted ? varianceColor(item.variance_percent) : 'text-[var(--fg-muted)]'}`}>
                          {item.closing_stock_counted
                            ? `${item.variance > 0 ? '+' : ''}${item.variance.toFixed(2)}`
                            : '—'}
                        </span>
                        <span className="text-right">
                          {item.closing_stock_counted ? (
                            <VarianceBadge pct={item.variance_percent} t={t} />
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
                            {t('notCounted')}
                            </span>
                          )}
                        </span>
                        {isOpen && (
                          <div onClick={e => e.stopPropagation()} className="flex justify-end">
                            <button
                              onClick={() => handleDeleteItems([item.id])}
                              className="p-1 rounded hover:bg-red-500/10 text-[var(--fg-secondary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              title={t('delete') || 'Delete'}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Insight line */}
                      {insight && (
                        <div className={`px-3 pb-2 text-xs flex items-center gap-1.5 ${item.variance > 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                          <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                          {insight}
                        </div>
                      )}
                      {/* Inline breakdown panel */}
                      {isExpanded && (
                        <div className="px-4 py-3 border-t border-[var(--divider)]">
                          {breakdownLoading === item.stock_item_id ? (
                            <div className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] py-2">
                              <RefreshCwIcon className="w-4 h-4 animate-spin" />
                              {t('loadingBreakdown') || 'Loading breakdown...'}
                            </div>
                          ) : bd ? (
                            (bd.contributions ?? []).length === 0 ? (
                              <p className="text-sm text-[var(--fg-secondary)]">
                                {t('noContributions') || "No menu items contributed to this ingredient's usage."}
                              </p>
                            ) : (
                              <div>
                                <h4 className="text-sm font-semibold text-fg-primary mb-2">{t('dishBreakdown') || 'Dish Breakdown'}</h4>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-[var(--divider)]">
                                      <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('menuItem') || 'Menu Item'}</th>
                                      <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('qtySold') || 'Sold'}</th>
                                      <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('perUnit') || 'Per Unit'}</th>
                                      <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('totalUsage') || 'Total'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(bd.contributions ?? []).map((c, i) => {
                                      const sameUnit = c.recipe_unit === bd.unit;
                                      return (
                                        <tr key={i} className="border-b border-[var(--divider)] border-opacity-50">
                                          <td className="py-2 text-fg-primary">{c.menu_item_name}</td>
                                          <td className="py-2 text-right">{c.qty_sold}</td>
                                          <td className="py-2 text-right text-[var(--fg-secondary)]">{c.recipe_qty}{c.recipe_unit}</td>
                                          <td className="py-2 text-right font-medium">
                                            {c.total_usage.toFixed(1)}{c.recipe_unit}
                                            {!sameUnit && (
                                              <span className="block text-xs text-[var(--fg-secondary)] font-normal">
                                                ≈ {c.total_usage_converted.toFixed(3)}{bd.unit}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {/* Revenue loss */}
                                {(() => {
                                  const loss = computeRevenueLoss(item, bd);
                                  if (!loss) return null;
                                  return (
                                    <div className="mt-3 pt-3 border-t border-[var(--divider)] border-opacity-50">
                                      <div className="flex items-start gap-2 text-sm">
                                        <AlertTriangleIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        <span className="text-red-400 font-medium">
                                          {'≈ '}
                                          {loss.dishes.map((d, i) => (
                                            <span key={i}>
                                              {i > 0 && ' + '}
                                              {d.servings} {d.name}
                                            </span>
                                          ))}
                                          {` → ${money(loss.total, { decimals: 0 })} `}
                                          {t('revenueLossSuffix') || 'potential revenue lost'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--fg-secondary)] py-4">
              {t('noVarianceData') || 'No variance data yet. Click "Pull from POS" or enter sales to compute.'}
            </p>
          )}

          {isOpen && report?.items && report.items.length > 0 && (
            <div className="flex gap-3">
              <button onClick={handleCompute} disabled={computing} className="btn-secondary text-sm px-4 py-1.5 flex items-center gap-2">
                <RefreshCwIcon className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
                {t('recompute') || 'Recompute'}
              </button>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 4: Retrospective */}
      <CollapsibleSection
        title={t('retrospective') || 'Daily Retrospective'}
        sectionKey="retro"
        expanded={expandedSections.has('retro')}
        onToggle={toggleSection}
      >
        <div className="space-y-4">
          <SectionDesc>{t('retrospectiveDesc') || 'A quick end-of-day reflection to track patterns over time.'}</SectionDesc>
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">{t('wentWell') || 'What went well?'}</label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              disabled={!isOpen}
              rows={2}
              className="input w-full px-3 py-2 text-sm"
              placeholder={t('wentWellPlaceholder') || 'e.g., Smooth lunch service, all prep done on time...'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">{t('wentWrong') || 'What went wrong?'}</label>
            <textarea
              value={wentWrong}
              onChange={(e) => setWentWrong(e.target.value)}
              disabled={!isOpen}
              rows={2}
              className="input w-full px-3 py-2 text-sm"
              placeholder={t('wentWrongPlaceholder') || 'e.g., Over-portioning on fish dishes, slow delivery...'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">{t('toImprove') || 'What should be improved?'}</label>
            <textarea
              value={toImprove}
              onChange={(e) => setToImprove(e.target.value)}
              disabled={!isOpen}
              rows={2}
              className="input w-full px-3 py-2 text-sm"
              placeholder={t('toImprovePlaceholder') || 'e.g., Standardize portioning, brief staff on waste...'}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5: Estimated Supplies (shown when report is closed) */}
      {report?.status === 'closed' && (
        <CollapsibleSection
          title={t('estimatedSupplies') || 'Estimated Supplies'}
          sectionKey="estimated"
          expanded={expandedSections.has('estimated')}
          onToggle={toggleSection}
          badge={estimatedPOs.length > 0 ? `${estimatedPOs.length} ${t('ordersBySupplier') || 'orders'}` : undefined}
          action={canManage && estimatedPOs.length > 0 ? (
            <button
              onClick={() => handleGenerateOrders('both')}
              disabled={generatingOrders}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              {t('regenerate') || 'Regenerate'}
            </button>
          ) : undefined}
        >
          {estimatedPOs.length === 0 ? (
            <div className="text-center py-8">
              {generationAttempted && generationDiag && (
                <div className="mb-5 mx-auto max-w-lg rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-4 text-left">
                  {generationDiag.forecasted_items === 0 ? (
                    <>
                      <p className="text-sm text-yellow-400 font-medium mb-2">
                        {t('noForecastData') || 'Not enough historical data to estimate yet.'}
                      </p>
                      <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                        No sales found for <strong>{generationDiag.target_day}s</strong> in the last 6 weeks. The system needs at least 1 week of sales history for the same day of the week to make predictions.
                      </p>
                    </>
                  ) : generationDiag.items_with_recipe === 0 ? (
                    <>
                      <p className="text-sm text-yellow-400 font-medium mb-2">
                        No recipes linked
                      </p>
                      <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                        Found <strong>{generationDiag.forecasted_items}</strong> predicted menu items for {generationDiag.target_day}, but none have recipes linking them to stock ingredients. Go to <strong>Kitchen &gt; Recipes</strong> and add ingredients to your menu items.
                      </p>
                    </>
                  ) : generationDiag.total_shortages === 0 ? (
                    <>
                      <p className="text-sm text-green-400 font-medium mb-2">
                        {t('noShortages') || 'All stock levels are sufficient for tomorrow.'}
                      </p>
                      <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                        Based on <strong>{generationDiag.forecasted_items}</strong> predicted items for {generationDiag.target_day}, your current stock covers all ingredient needs. No orders needed.
                      </p>
                    </>
                  ) : null}
                </div>
              )}
              <p className="text-sm text-[var(--fg-secondary)] mb-4">
                {t('generateOrderFor') || 'Generate order for tomorrow'}
              </p>
              {generatingOrders ? (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--fg-secondary)]">
                  <RefreshCwIcon className="w-4 h-4 animate-spin" /> ...
                </div>
              ) : canManage ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => handleGenerateOrders('pos')}
                    className="px-5 py-2 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors text-sm"
                  >
                    {t('fromPOS') || 'From POS'}
                  </button>
                  <button
                    onClick={() => handleGenerateOrders('manual')}
                    className="px-5 py-2 rounded-xl bg-brand-500/10 text-brand-500 font-medium hover:bg-brand-500/20 transition-colors text-sm border border-brand-500/20"
                  >
                    {t('fromManual') || 'From manual sales'}
                  </button>
                  <button
                    onClick={() => handleGenerateOrders('both')}
                    className="px-5 py-2 rounded-xl bg-[var(--surface)] text-[var(--fg-secondary)] font-medium hover:bg-[var(--surface-hover)] transition-colors text-sm border border-[var(--divider)]"
                  >
                    {t('fromBoth') || 'Both'}
                  </button>
                </div>
              ) : null}
              <a
                href="https://foody-pos.co.il/en/help/kitchen/estimated-supplies"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-400 transition-colors mt-4"
              >
                <InfoIcon className="w-3.5 h-3.5" />
                {t('learnMore') || 'Learn more'}
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {estimatedPOs.map(po => (
                <SupplierOrderCard
                  key={po.id}
                  po={po}
                  canManage={canManage}
                  onSendEmail={() => { setEmailModalPO(po); setEmailTo(po.supplier?.email || ''); }}
                  sendingEmail={sendingEmailPO === po.id}
                  t={t}
                />
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Email modal for sending PO to supplier */}
      {emailModalPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEmailModalPO(null)}>
          <div className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-fg-primary mb-4">
              {t('sendOrder') || 'Send order'}: {emailModalPO.supplier?.name || t('unknownSupplier')}
            </h3>
            <label className="text-sm text-[var(--fg-secondary)]">{t('emailRecipient') || 'Recipient email'}</label>
            <input
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              placeholder="supplier@example.com"
              className="w-full mt-1 mb-4 px-3 py-2 rounded-lg border border-[var(--divider)] bg-[var(--bg)] text-fg-primary"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEmailModalPO(null)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--divider)] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                onClick={() => handleSendEmail(emailModalPO)}
                disabled={sendingEmailPO !== null || !emailTo}
                className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {sendingEmailPO ? (t('sendingEmail') || 'Sending...') : (t('send') || 'Send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Receive Modal */}
      {showScanModal && <DeliveryImportModal rid={rid} stockItems={stockItems} onClose={() => setShowScanModal(false)} onImported={() => { setShowScanModal(false); void loadSupplementary(); }} />}
      {receiptOrder && <DailyReceiptModal rid={rid} order={receiptOrder} onClose={() => setReceiptOrder(null)} onSaved={loadSupplementary} />}
      {productionItem && <DailyProductionModal rid={rid} item={productionItem} onClose={() => setProductionItem(null)} onSaved={loadSupplementary} />}
      {showReceiveModal && (
        <QuickReceiveModal
          stockItems={stockItems}
          onConfirm={async (items, supplierName) => {
            await confirmDelivery(rid, { supplier_name: supplierName, items });
            setShowReceiveModal(false);
            loadSupplementary();
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
            await loadReport();
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
              .map(([menuItemId, quantity]) => ({ menu_item_id: Number(menuItemId), quantity: Number(quantity) }));
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

function SupplierOrderCard({ po, canManage, onSendEmail, sendingEmail, t }: {
  po: PurchaseOrder;
  canManage: boolean;
  onSendEmail: () => void;
  sendingEmail: boolean;
  t: (k: string) => string;
}) {
  const statusColor: Record<string, string> = {
    draft:     'bg-gray-500/15 text-gray-400',
    sent:      'bg-green-500/15 text-green-400',
    received:  'bg-blue-500/15 text-blue-400',
    cancelled: 'bg-red-500/15 text-red-400',
  };

  return (
    <div className="border border-[var(--divider)] rounded-xl overflow-hidden bg-[var(--surface)]">
      {/* Header: supplier name + status badge + send button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg-primary">{po.supplier?.name || (t('unknownSupplier') || 'Unknown Supplier')}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[po.status] || statusColor.draft}`}>
            {po.status}
          </span>
        </div>
        {canManage && po.status === 'draft' && (
          <button
            onClick={onSendEmail}
            disabled={sendingEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
          >
            <MailIcon className="w-4 h-4" />
            {sendingEmail ? (t('sendingEmail') || 'Sending...') : (t('sendOrder') || 'Send order')}
          </button>
        )}
        {po.status === 'sent' && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400">
            <CheckCircleIcon className="w-4 h-4" />
            {t('orderSent') || 'Order sent'}
          </span>
        )}
      </div>
      {/* Items table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--divider)]">
            <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">Item</th>
            <th className="text-right py-2 px-4 font-medium text-[var(--fg-secondary)]">{t('qty') || 'Qty'}</th>
            <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">Unit</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map(item => (
            <tr key={item.id} className="border-b border-[var(--divider)] border-opacity-50">
              <td className="py-2 px-4 text-fg-primary">{item.name}</td>
              <td className="py-2 px-4 text-right text-fg-primary font-mono">{item.quantity.toFixed(1)}</td>
              <td className="py-2 px-4 text-[var(--fg-secondary)]">{item.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Quick Receive Modal ─────────────────────────────────────────────────────

function QuickReceiveModal({
  stockItems, onConfirm, onClose, t,
}: {
  stockItems: StockItem[];
  onConfirm: (items: ConfirmDeliveryItemInput[], supplierName: string) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const { money } = useCurrency();
  const [search, setSearch] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Derive unique categories from stock items
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    stockItems.forEach((si: StockItem) => { if (si.category) cats.add(si.category); });
    return Array.from(cats).sort();
  }, [stockItems]);

  // Filter items by search + category
  const filteredItems = useMemo(() => {
    let items = stockItems.filter(si => si.is_active !== false);
    if (activeCategory) items = items.filter(si => si.category === activeCategory);
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(si => si.name.toLowerCase().includes(lower));
    }
    return items;
  }, [stockItems, activeCategory, search]);

  // Count items with quantity > 0
  const selectedCount = Object.values(quantities).filter(q => q > 0).length;

  const handleConfirm = async () => {
    const selected = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id: Number(id), qty }));

    if (selected.length === 0) {
      setError(t('selectIngredient') || 'Enter quantity for at least one item');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const items: ConfirmDeliveryItemInput[] = selected.map(({ id, qty }) => {
        const si = stockItems.find(s => s.id === id)!;
        return {
          stock_item_id: si.id,
          name: si.name,
          original_name: si.name,
          quantity: qty,
          unit: si.unit,
          category: si.category || '',
          cost_per_unit: si.cost_per_unit || 0,
        };
      });
      await onConfirm(items, supplierName.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-fg-primary">{t('addSupply') || 'Add Supply'}</h3>
            {selectedCount > 0 && (
              <p className="text-xs text-brand-500 mt-0.5">
                {selectedCount} {selectedCount === 1 ? 'item' : 'items'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-hover)] rounded-lg">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <label className="mb-3 block text-sm text-fg-secondary">{t('supplierName')}
          <input className="input mt-1 w-full" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} list="daily-supplier-names" />
        </label>
        <datalist id="daily-supplier-names">{Array.from(new Set(stockItems.map((item) => item.supplier).filter(Boolean))).map((name) => <option key={name} value={name} />)}</datalist>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input w-full px-3 py-2 text-sm mb-3"
          placeholder={`${t('search') || 'Search'}...`}
        />

        {/* Category chips */}
        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                !activeCategory
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-semibold'
                  : 'border-[var(--divider)] text-[var(--fg-secondary)] hover:border-[var(--fg-secondary)]'
              }`}
            >
              {t('all') || 'All'}
            </button>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  activeCategory === cat
                    ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-semibold'
                    : 'border-[var(--divider)] text-[var(--fg-secondary)] hover:border-[var(--fg-secondary)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto border border-[var(--divider)] rounded-lg mb-4">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_50px_80px] gap-2 px-3 py-2 border-b border-[var(--divider)] text-xs font-medium text-[var(--fg-secondary)] sticky top-0 bg-[var(--surface)]">
            <span>{t('ingredient') || 'Ingredient'}</span>
            <span className="text-right">{t('quantity') || 'Qty'}</span>
            <span className="text-center">{t('unit') || 'Unit'}</span>
            <span className="text-right">{t('costPerUnit') || 'Cost/U'}</span>
          </div>
          {filteredItems.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[var(--fg-secondary)] text-center">
              {t('noResults') || 'No items found'}
            </p>
          ) : (
            filteredItems.map(si => {
              const qty = quantities[si.id] || 0;
              const hasQty = qty > 0;
              return (
                <div
                  key={si.id}
                  className={`grid grid-cols-[1fr_80px_50px_80px] gap-2 px-3 py-2 border-b border-[var(--divider)] border-opacity-50 items-center ${
                    hasQty ? 'bg-brand-500/5' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <span className={`text-sm truncate block ${hasQty ? 'text-brand-500 font-medium' : 'text-fg-primary'}`}>
                      {si.name}
                    </span>
                    {si.category && (
                      <span className="text-[10px] text-[var(--fg-secondary)]">{si.category}</span>
                    )}
                  </div>
                  <NumberInput
                    min={0}
                    value={qty}
                    onChange={(n) => setQuantities(prev => ({
                      ...prev,
                      [si.id]: n,
                    }))}
                    className="input px-2 py-1 text-sm text-right w-full"
                    placeholder="0"
                  />
                  <span className="text-xs text-[var(--fg-secondary)] text-center">{si.unit}</span>
                  <span className="text-xs text-[var(--fg-secondary)] text-right">
                    {si.cost_per_unit ? money(si.cost_per_unit, { decimals: 1 }) : '—'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">
            {t('cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || selectedCount === 0}
            className="btn-primary text-sm px-4 py-2"
          >
            {submitting
              ? t('saving') || 'Saving...'
              : `${t('confirmReceive') || 'Confirm'} (${selectedCount})`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── POS Sales Import Modal ──────────────────────────────────────────────────

function SalesImportModal({
  restaurantId, report, categories, onPullFoody, onImported, onClose, t,
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
  const [error, setError] = useState('');

  const allItems = useMemo(
    () => categories
      .flatMap(category => category.items || [])
      .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const matchedRows = preview?.rows.filter(row => mappings[row.source_name_key] != null).length ?? 0;

  const readFile = async (selected: File) => {
    const isPDF = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
    if (!isPDF) {
      setError(t('avivPDFOnly'));
      return;
    }
    setFile(selected);
    setPreview(null);
    setMappings({});
    setAllowDateMismatch(false);
    setError('');
    setLoading(true);
    try {
      const result = await previewAvivSalesImport(restaurantId, report.id, selected);
      setPreview(result);
      const initialMappings: Record<string, number | null> = {};
      result.rows.forEach(row => {
        initialMappings[row.source_name_key] = row.suggested_menu_item_id ?? null;
      });
      setMappings(initialMappings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('avivImportReadError'));
    } finally {
      setLoading(false);
    }
  };

  const pullFoody = async () => {
    setError('');
    setPullingFoody(true);
    try {
      await onPullFoody();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('avivImportSaveError'));
      setPullingFoody(false);
    }
  };

  const confirmAviv = async () => {
    if (!file || !preview) return;
    setError('');
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
      setError(e instanceof Error ? e.message : t('avivImportSaveError'));
      setSubmitting(false);
    }
  };

  const formatPeriod = (value: string) => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="mx-4 flex w-full max-w-5xl flex-col rounded-xl bg-[var(--surface)] p-6 shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-fg-primary">{t('salesImportTitle')}</h3>
            <p className="mt-1 text-sm text-[var(--fg-secondary)]">{t('salesImportDesc')}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--surface-hover)]" aria-label={t('close')}>
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {!preview && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-[var(--divider)] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                  <RefreshCwIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-fg-primary">{t('foodyPOS')}</h4>
                  <p className="mt-1 text-sm text-[var(--fg-secondary)]">{t('foodyPOSImportDesc')}</p>
                </div>
              </div>
              <button
                onClick={pullFoody}
                disabled={pullingFoody || loading}
                className="btn-secondary mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
              >
                <RefreshCwIcon className={`h-4 w-4 ${pullingFoody ? 'animate-spin' : ''}`} />
                {pullingFoody ? t('importing') : t('syncFoodyPOS')}
              </button>
            </section>

            <section className="rounded-xl border border-[var(--divider)] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-fg-primary">{t('avivPOS')}</h4>
                  <p className="mt-1 text-sm text-[var(--fg-secondary)]">{t('avivPOSImportDesc')}</p>
                </div>
              </div>
              <label className={`btn-primary mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 px-4 py-2 text-sm ${loading ? 'pointer-events-none opacity-50' : ''}`}>
                <UploadIcon className="h-4 w-4" />
                {loading ? t('analyzing') : t('chooseAvivPDF')}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={loading || pullingFoody}
                  onChange={event => {
                    const selected = event.target.files?.[0];
                    if (selected) void readFile(selected);
                  }}
                />
              </label>
              {file && loading && <p className="mt-2 truncate text-xs text-[var(--fg-secondary)]">{file.name}</p>}
            </section>
          </div>
        )}

        {preview && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-xs text-[var(--fg-secondary)]">{t('reportPeriod')}</p>
                <p className="mt-1 text-sm font-medium text-fg-primary">
                  {formatPeriod(preview.report_from)} – {formatPeriod(preview.report_to)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-xs text-[var(--fg-secondary)]">{t('salesRows')}</p>
                <p className="mt-1 text-lg font-semibold text-fg-primary">{preview.rows.length}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-xs text-[var(--fg-secondary)]">{t('qtySold')}</p>
                <p className="mt-1 text-lg font-semibold text-fg-primary">{preview.total_quantity}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-xs text-[var(--fg-secondary)]">{t('revenue')}</p>
                <p className="mt-1 text-lg font-semibold text-fg-primary">{money(preview.total_revenue)}</p>
              </div>
            </div>

            {preview.date_mismatch && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">{t('avivPeriodMismatchTitle')}</p>
                    <p className="mt-1 text-amber-200/80">
                      {t('avivPeriodMismatchDesc').replace('{date}', preview.report_date)}
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={allowDateMismatch}
                        onChange={event => setAllowDateMismatch(event.target.checked)}
                        className="mt-0.5 rounded"
                      />
                      <span>{t('avivPeriodMismatchConfirm')}</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-[var(--fg-secondary)]">
                {t('avivMappingSummary')
                  .replace('{matched}', String(matchedRows))
                  .replace('{total}', String(preview.rows.length))}
                <span className="mt-0.5 block text-xs">{t('avivNamesGrouped')}</span>
              </p>
              <button
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                  setMappings({});
                  setError('');
                }}
                className="text-sm font-medium text-[var(--brand-500)] hover:underline"
              >
                {t('chooseAnotherFile')}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--divider)]">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                  <tr className="border-b border-[var(--divider)] text-[var(--fg-secondary)]">
                    <th className="px-3 py-2 text-left font-medium">{t('avivItem')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('qtySold')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('total')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('foodyRecipeMapping')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(row => (
                    <tr key={row.source_name_key} className="border-b border-[var(--divider)]/60">
                      <td className="px-3 py-2 text-fg-primary" dir="auto">{row.name}</td>
                      <td className="px-3 py-2 text-right text-fg-primary">{row.quantity}</td>
                      <td className="px-3 py-2 text-right text-fg-primary">{money(row.line_total)}</td>
                      <td className="px-3 py-2">
                        <select
                          value={mappings[row.source_name_key] ?? ''}
                          onChange={event => setMappings(current => ({
                            ...current,
                            [row.source_name_key]: event.target.value ? Number(event.target.value) : null,
                          }))}
                          className={`input w-full px-2 py-1.5 text-sm ${mappings[row.source_name_key] == null ? 'border-amber-500/50' : ''}`}
                        >
                          <option value="">{t('revenueOnlyNoRecipe')}</option>
                          {allItems.map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-secondary px-4 py-2 text-sm">
            {t('cancel')}
          </button>
          {preview && (
            <button
              onClick={confirmAviv}
              disabled={submitting || (preview.date_mismatch && !allowDateMismatch)}
              className="btn-primary px-4 py-2 text-sm"
            >
              {submitting ? t('importing') : t('confirmAvivImport')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Sales Modal ───────────────────────────────────────────────────────

function QuickSalesModal({
  categories, initialEntries, onConfirm, onClose, t,
}: {
  categories: MenuCategory[];
  initialEntries: Record<number, number>;
  onConfirm: (entries: Record<number, number>) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const { money } = useCurrency();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({ ...initialEntries });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // All menu items from categories
  const allItems = useMemo(() => categories.flatMap(c => c.items || []), [categories]);

  // Filter items
  const filteredItems = useMemo(() => {
    let items = allItems;
    if (activeCategory) items = items.filter(i => i.category_id === activeCategory);
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(lower));
    }
    return items;
  }, [allItems, activeCategory, search]);

  const selectedCount = Object.values(quantities).filter(q => q > 0).length;

  const handleConfirm = async () => {
    if (selectedCount === 0) {
      setError(t('noSalesDataYet') || 'Enter quantity for at least one item');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(quantities);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-fg-primary">{t('manualSalesEntry') || 'Manual Sales Entry'}</h3>
            {selectedCount > 0 && (
              <p className="text-xs text-brand-500 mt-0.5">
                {selectedCount} {selectedCount === 1 ? 'item' : 'items'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-hover)] rounded-lg">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input w-full px-3 py-2 text-sm mb-3"
          placeholder={`${t('search') || 'Search'}...`}
        />

        {/* Category chips */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                !activeCategory
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-semibold'
                  : 'border-[var(--divider)] text-[var(--fg-secondary)] hover:border-[var(--fg-secondary)]'
              }`}
            >
              {t('all') || 'All'}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  activeCategory === cat.id
                    ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-semibold'
                    : 'border-[var(--divider)] text-[var(--fg-secondary)] hover:border-[var(--fg-secondary)]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto border border-[var(--divider)] rounded-lg mb-4">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 border-b border-[var(--divider)] text-xs font-medium text-[var(--fg-secondary)] sticky top-0 bg-[var(--surface)]">
            <span>{t('menuItem') || 'Menu Item'}</span>
            <span className="text-right">{t('price') || 'Price'}</span>
            <span className="text-right">{t('qtySold') || 'Qty'}</span>
          </div>
          {filteredItems.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[var(--fg-secondary)] text-center">
              {t('noResults') || 'No items found'}
            </p>
          ) : (
            filteredItems.map(item => {
              const qty = quantities[item.id] || 0;
              const hasQty = qty > 0;
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 border-b border-[var(--divider)] border-opacity-50 items-center ${
                    hasQty ? 'bg-brand-500/5' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <span className={`text-sm truncate block ${hasQty ? 'text-brand-500 font-medium' : 'text-fg-primary'}`}>
                      {item.name}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--fg-secondary)] text-right">{money(item.price)}</span>
                  <NumberInput
                    integer
                    min={0}
                    value={qty}
                    onChange={(n) => setQuantities(prev => ({
                      ...prev,
                      [item.id]: n,
                    }))}
                    className="input px-2 py-1 text-sm text-right w-full"
                    placeholder="0"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">
            {t('cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || selectedCount === 0}
            className="btn-primary text-sm px-4 py-2"
          >
            {submitting
              ? t('saving') || 'Saving...'
              : `${t('saveSales') || 'Save Sales'} (${selectedCount})`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function ExplainModal({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-fg-primary">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-hover)] rounded-lg">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div dir="auto" className="text-sm text-[var(--fg-secondary)] leading-relaxed whitespace-pre-line text-left">{body}</div>
      </div>
    </div>
  );
}

function PhaseHeading({
  id,
  icon: Icon,
  title,
  desc,
  recommended,
  t,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  recommended: boolean;
  t: (key: string) => string;
}) {
  return (
    <div id={id} className="scroll-mt-24 border-b border-[var(--line)] pb-3 pt-2">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${
          recommended
            ? 'bg-[var(--brand-500)] text-white'
            : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)]'
        }`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-[var(--fg)]">{title}</h2>
            {recommended && (
              <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-700)]">
                {t('recommendedNow')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function OperationalMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const toneClass = tone === 'danger'
    ? 'text-[var(--danger-500)]'
    : tone === 'warning'
      ? 'text-[var(--warning-500)]'
      : tone === 'success'
        ? 'text-[var(--success-500)]'
        : 'text-[var(--fg)]';
  return (
    <div className="flex min-h-28 gap-3 px-5 py-4">
      <Icon className={`mt-1 size-4 shrink-0 ${toneClass}`} />
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--fg-muted)]">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        <div className="mt-1 text-xs text-[var(--fg-muted)]">{detail}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, warn, tooltip, explain }: { label: string; value: string; warn?: boolean; tooltip?: string; explain?: string }) {
  const [showExplain, setShowExplain] = useState(false);
  return (
    <>
      <div className={`rounded-xl p-4 border ${warn ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--divider)] bg-[var(--surface)]'}`}>
        <div className="flex items-center gap-1 mb-1">
          <p className="text-xs text-[var(--fg-secondary)]">{label}</p>
          {(tooltip || explain) && (
            <HelpTooltip
              label={label}
              text={tooltip || explain || ''}
              onClick={explain ? () => setShowExplain(true) : undefined}
            />
          )}
        </div>
        <p className={`text-xl font-bold ${warn ? 'text-red-400' : 'text-fg-primary'}`}>{value}</p>
      </div>
      {showExplain && explain && (
        <ExplainModal title={label} body={explain} onClose={() => setShowExplain(false)} />
      )}
    </>
  );
}

function ThTooltip({ label, tooltip, explain }: { label: string; tooltip: string; explain?: string }) {
  const [showExplain, setShowExplain] = useState(false);
  return (
    <>
      <div className="inline-flex items-center gap-1">
        <span>{label}</span>
        <HelpTooltip
          label={label}
          text={tooltip}
          onClick={explain ? () => setShowExplain(true) : undefined}
        />
      </div>
      {showExplain && explain && (
        <ExplainModal title={label} body={explain} onClose={() => setShowExplain(false)} />
      )}
    </>
  );
}

function HelpTooltip({ label, text, onClick }: { label: string; text: string; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${text}`}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          className="inline-flex rounded-full text-[var(--fg-muted)] opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:shadow-ring"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-xs border border-[var(--line)] bg-popover text-popover-foreground shadow-3 text-left font-normal leading-relaxed"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--fg-secondary)] mb-4 leading-relaxed">{children}</p>
  );
}

function CollapsibleSection({
  title, sectionKey, expanded, onToggle, badge, action, children,
}: {
  title: string;
  sectionKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--divider)] rounded-xl overflow-hidden bg-[var(--surface)]">
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={() => onToggle(sectionKey)}
          className="flex-1 flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <h2 className="text-base font-semibold text-fg-primary">{title}</h2>
          {badge && <span className="px-2 py-0.5 rounded-full text-xs bg-brand-500/20 text-brand-500">{badge}</span>}
          {expanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
        </button>
        {action}
      </div>
      {expanded && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
