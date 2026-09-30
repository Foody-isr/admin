'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DeliveryImportModal from '../stock/DeliveryImportModal';
import { DailyProductionModal, DailyReceiptModal } from '@/components/kitchen/DailyActionModals';
import NextServicePanel from '@/components/kitchen/NextServicePanel';
import KitchenDayReview from '@/components/kitchen/KitchenDayReview';
import ProductionObjectives from '@/components/kitchen/ProductionObjectives';
import {
  getTodayFoodCostReport, getFoodCostReport, computeFoodCostReport,
  upsertSalesEntries, updateClosingStock, updateRetrospective,
  previewAvivSalesImport, importAvivSales, syncFoodyPOSSales,
  closeFoodCostReport, reopenFoodCostReport, listFoodCostReports,
  getKitchenSummary, type KitchenSummary, deleteSalesEntries,
  listStockTransactions, getAllCategories, listStockItems, getRestaurant,
  confirmDelivery, deleteStockTransaction,
  getDailyPrepPlan, getDemandForecast, listPrepItems, type PrepItem,
  generateEstimatedSupplies, sendOrderEmail, listPurchaseOrders, EstimatedSuppliesResult,
  DailyFoodCostReport, DailySalesEntry,
  StockTransaction, MenuCategory, MenuItem, StockItem,
  ConfirmDeliveryItemInput, PurchaseOrder, DailyPlanItem, OpeningHoursConfig,
  AvivSalesImportPreview, type DemandForecast,
} from '@/lib/api';
import {
  ChevronDownIcon, ChevronUpIcon, RefreshCwIcon,
  CheckCircleIcon, AlertTriangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XIcon, PlusIcon, TrashIcon, InfoIcon,
  MailIcon, SunriseIcon, UtensilsIcon, MoonIcon, ArrowRightIcon,
  ChefHatIcon, PackageIcon,
  UploadIcon, FileTextIcon, RotateCcwIcon,
} from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import styles from '@/components/kitchen/companion.module.css';
import { NumberInput } from '@/components/ui/NumberInput';


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

function statusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case 'open': return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-500">{t('open')}</span>;
    case 'closed': return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-600">{t('closed')}</span>;
    case 'reviewed': return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400">Reviewed</span>;
    default: return null;
  }
}

export default function DailyOperationsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
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
    new Set()
  );

  // Supplies received today
  const [todayReceives, setTodayReceives] = useState<StockTransaction[]>([]);

  // Sales entry
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [salesEntries, setSalesEntries] = useState<Record<number, number>>({});

  const [closingCountError, setClosingCountError] = useState('');
  const [phaseSelection, setPhaseSelection] = useState<'opening' | 'service' | 'closing' | null>(null);
  const [showAllProduction, setShowAllProduction] = useState(false);
  const [kitchenSummary, setKitchenSummary] = useState<KitchenSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Retrospective
  const [wentWell, setWentWell] = useState('');
  const [wentWrong, setWentWrong] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Selection for deletion
  const [selectedSales, setSelectedSales] = useState<Set<number>>(new Set());
  const [deletingSales, setDeletingSales] = useState(false);

  // Quick receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [productionItem, setProductionItem] = useState<DailyPlanItem | null>(null);
  const [pendingDeliveries, setPendingDeliveries] = useState<PurchaseOrder[]>([]);
  const [supplementaryError, setSupplementaryError] = useState('');
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
  const [salesForecast, setSalesForecast] = useState<DemandForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastLoadFailed, setForecastLoadFailed] = useState(false);
  const [showAllForecastItems, setShowAllForecastItems] = useState(false);
  const forecastRequest = useRef(0);
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
    const request = ++reportRequest.current;
    setLoading(true);
    setActionError('');
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
          if (request === reportRequest.current) {
            setReport(null); setSalesEntries({}); setWentWell(''); setWentWrong(''); setToImprove(''); setEstimatedPOs([]);
          }
          return;
        }
      }
      if (request !== reportRequest.current) return;
      setReport(rpt);

      // Populate form state from report
      if (rpt.sales) {
        const entries: Record<number, number> = {};
        rpt.sales.forEach(s => {
          if (s.source === 'manual' && s.menu_item_id != null) entries[s.menu_item_id] = s.quantity;
        });
        setSalesEntries(entries);
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
      if (request !== reportRequest.current) return;
      setReport(null);
      setActionError(error instanceof Error ? error.message : t('dailyLoadError'));
    } finally {
      if (request === reportRequest.current) setLoading(false);
    }
  }, [rid, selectedDate, canManage, t]);

  const loadForecast = useCallback(async () => {
    const request = ++forecastRequest.current;
    setShowAllForecastItems(false);
    setForecastLoading(true);
    setForecastLoadFailed(false);
    try {
      const forecast = await getDemandForecast(rid, { day_of_week: selectedDate.getDay() });
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

  const loadSupplementary = useCallback(async () => {
    const request = ++supplementaryRequest.current;
    setSupplementaryLoading(true);
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
      if (request !== supplementaryRequest.current) return;
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
      const filtered = txns.filter(tx => tx.created_at && formatDate(new Date(tx.created_at)) === dateStr);
      if (request === supplementaryRequest.current) setTodayReceives(filtered);
    } catch (error) {
      if (request !== supplementaryRequest.current) return;
      setStockItems([]); setTodayReceives([]);
      setDailyPrepPlan([]);
      setTomorrowPrepPlan([]);
      setPendingDeliveries([]);
      setPrepItems([]);
      setSupplementaryError(error instanceof Error ? error.message : t('dailyLoadError'));
    } finally {
      if (request === supplementaryRequest.current) setSupplementaryLoading(false);
    }
  }, [rid, selectedDate, t]);

  const loadKitchenSummary = useCallback(async () => {
    if (!report) return;
    setReviewLoading(true); setReviewError('');
    try { setKitchenSummary(await getKitchenSummary(rid, report.id)); }
    catch (error) { setReviewError(error instanceof Error ? error.message : t('chefReviewError')); throw error; }
    finally { setReviewLoading(false); }
  }, [rid, report, t]);
  useEffect(() => {
    let cancelled = false;
    if (!report) { setKitchenSummary(null); return; }
    setReviewLoading(true); setReviewError('');
    getKitchenSummary(rid, report.id).then((summary) => { if (!cancelled) setKitchenSummary(summary); })
      .catch((error) => { if (!cancelled) { setKitchenSummary(null); setReviewError(error instanceof Error ? error.message : t('chefReviewError')); } })
      .finally(() => { if (!cancelled) setReviewLoading(false); });
    return () => { cancelled = true; };
  }, [rid, report, t]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadSupplementary(); }, [loadSupplementary]);
  useEffect(() => { void loadForecast(); }, [loadForecast]);

  const confirmDiscard = () => toImprove === (report?.to_improve ?? '') || confirm(t('companionDiscard'));

  const navigateDate = (delta: number) => {
    if (!confirmDiscard()) return;
    setPhaseSelection(null); setExpandedSections(new Set());
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
  }, [rid]);

  const handlePullFoodySales = async () => {
    if (!report) return;
    setComputing(true);
    try {
      await syncFoodyPOSSales(rid, report.id);
      await loadReport();
      await Promise.all([loadSupplementary(), loadForecast()]);
    } finally {
      setComputing(false);
    }
  };


  const handleSaveDraft = async () => {
    if (!report) return;
    setSavingDraft(true);
    setClosingCountError('');
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

  const toggleSalesSelection = (id: number) => {
    setSelectedSales(prev => {
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
  const objectivePlans: DailyPlanItem[] = (kitchenSummary?.preparations ?? []).filter((row) => row.target_qty != null).flatMap((row): DailyPlanItem[] => {
    const item = prepItems.find((prep) => prep.id === row.prep_item_id);
    if (!item) return [];
    const missing = Math.max(0, row.target_qty! - row.produced_qty);
    return [{ prep_item_id: item.id, prep_item_name: item.name, unit: item.unit, current_qty: item.quantity,
      required_qty: row.target_qty!, shortfall_qty: missing, batches_needed: item.yield_per_batch > 0 ? Math.ceil(missing / item.yield_per_batch) : 0,
      yield_per_batch: item.yield_per_batch, shelf_life_hours: item.shelf_life_hours, category: item.category, priority: 'high' }];
  });
  const prepToLaunch = [...objectivePlans, ...dailyPrepPlan.filter((item) => !objectivePlans.some((target) => target.prep_item_id === item.prep_item_id))]
    .filter((item) => item.current_qty < 0 || item.batches_needed > 0 || item.shortfall_qty > 0)
    .sort((a, b) => Number(b.current_qty < 0) - Number(a.current_qty < 0));
  const batchesToLaunch = prepToLaunch.filter((item) => item.current_qty >= 0).reduce((sum, item) => sum + item.batches_needed, 0);
  const lowStockItems = stockItems.filter(
    (item) => item.is_active !== false && (item.quantity < 0 || (item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold)),
  );
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

  const activePhase = phaseSelection ?? (report?.status !== 'open' || !selectedIsToday ? 'closing' : suggestedPhase ?? 'opening');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.identity}><span className={styles.emblem}><ChefHatIcon size={25} /></span><div><h1>{t('companionTitle')}</h1><p>{t('companionSubtitle')}</p></div></div>
        <div className={styles.date}>
          <button onClick={() => navigateDate(-1)} aria-label={t('previousDay')}><ChevronLeftIcon size={17} /></button>
          <input type="date" aria-label={t('date')} value={formatDate(selectedDate)} onChange={e => { if (e.target.value && confirmDiscard()) setSelectedDate(new Date(e.target.value + 'T12:00:00')); }} />
          <button onClick={() => navigateDate(1)} aria-label={t('nextDay')}><ChevronRightIcon size={17} /></button>
          {!selectedIsToday && <button className="px-2 text-xs" onClick={() => { if (confirmDiscard()) setSelectedDate(new Date()); }}>{t('today')}</button>}
        </div>
      </header>
      <div className="mb-3">            {report?.status === 'closed' && canManage && (
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
      {actionError && <div role="alert" className={styles.error}>{actionError}</div>}
      {supplementaryError && <p role="alert" className={styles.error}>{t('companionLoadError')} {supplementaryError}</p>}
      <section className={styles.brief} aria-label={t('companionBrief')}>
        <div className={styles.briefMain}>
          <div className={styles.briefTop}><ChefHatIcon size={17} /><span>{selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>{report && statusBadge(report.status, t)}<span> / </span><span>{t(report?.status === 'closed' || report?.status === 'reviewed' ? 'companionClosed' : 'companionBrief')}</span></div>
          <h2>{t(supplementaryLoading ? 'loading' : supplementaryError ? 'companionIncomplete' : prepToLaunch.length || lowStockItems.length ? 'companionAttentionTitle' : 'companionCalmTitle')}</h2>
          <p>{t(supplementaryError ? 'companionLoadError' : 'companionBriefDesc')}</p>
          <button className={styles.briefAction} onClick={() => setPhaseSelection(suggestedPhase ?? 'opening')}>{t(suggestedPhase === 'closing' ? 'dayPhaseClosing' : suggestedPhase === 'service' ? 'dayPhaseService' : 'dayPhaseOpening')}<ArrowRightIcon size={16} /></button>
        </div>
        <div className={styles.priorities}>
          <button className={styles.priority} onClick={() => setPhaseSelection('opening')}><span><ChefHatIcon size={19} /></span><span><strong>{t('prepToLaunch')}</strong><small>{t('companionPrepHint')}</small></span><b>{supplementaryLoading || supplementaryError ? '—' : prepToLaunch.length}</b></button>
          <Link className={styles.priority} href={`/${rid}/kitchen/stock`}><span><PackageIcon size={19} /></span><span><strong>{t('lowStockItems')}</strong><small>{t('companionStockHint')}</small></span><b>{supplementaryLoading || supplementaryError ? '—' : lowStockItems.length}</b></Link>
          <Link className={styles.priority} href={`/${rid}/kitchen/suppliers?tab=orders`}><span><FileTextIcon size={19} /></span><span><strong>{t('companionDeliveries')}</strong><small>{t('companionDeliveryHint')}</small></span><b>{supplementaryLoading || supplementaryError ? '—' : pendingDeliveries.length}</b></Link>
        </div>
      </section>
      <div className={styles.context}><InfoIcon size={15} /><span>{t(selectedIsToday ? 'companionStockAuto' : 'companionDateContext')}</span><button className={styles.refresh} disabled={refreshing || loading || supplementaryLoading} onClick={() => { if (confirmDiscard()) { setRefreshing(true); void Promise.all([loadReport(), loadSupplementary(), loadForecast()]).finally(() => setRefreshing(false)); } }}><RefreshCwIcon size={14} className={supplementaryLoading ? 'animate-spin' : ''} />{t('refresh')}</button></div>
      {!loading && !report && !actionError && <p className={styles.context}>{t('companionNoReport')}</p>}
      <nav role="tablist" aria-label={t('todayPhases')} className={styles.tabs}>
        {([
          ['opening', 'companionOpening', 'companionOpeningHint', SunriseIcon],
          ['service', 'companionService', 'companionServiceHint', UtensilsIcon],
          ['closing', 'companionClosing', 'companionClosingHint', MoonIcon],
        ] as const).map(([phase, label, hint, Icon], index) => <button key={phase} role="tab" aria-label={t(label)} id={`tab-${phase}`} aria-selected={activePhase === phase} aria-controls={`phase-${phase}`} tabIndex={activePhase === phase ? 0 : -1} className={styles.tab} onClick={() => setPhaseSelection(phase)} onKeyDown={event => {
          const phases = ['opening', 'service', 'closing'] as const;
          const step = event.key === 'ArrowRight' ? (locale === 'he' ? -1 : 1) : event.key === 'ArrowLeft' ? (locale === 'he' ? 1 : -1) : 0;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + step + 3) % 3;
          if (!step && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault(); setPhaseSelection(phases[next]); document.getElementById(`tab-${phases[next]}`)?.focus();
        }}><Icon size={21} /><span><strong>{t(label)}</strong><small>{t(hint)}</small></span></button>)}
      </nav>
      <div role="tabpanel" id="phase-opening" aria-labelledby="tab-opening" hidden={activePhase !== 'opening'} className={styles.content}>
      <div className={styles.columns}>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
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
        {prepToLaunch.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--fg-muted)]">
            {supplementaryError ? t('dailyLoadError') : salesForecast?.sample_days === 0 ? t('noWeekdayHistory') : t('dailyNoForecast')}
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {(showAllProduction ? prepToLaunch : prepToLaunch.slice(0, 3)).map((item) => (
              <div key={item.prep_item_id} className={styles.productionRow}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--fg)]">{item.prep_item_name}</div>
                  <div className="mt-0.5 text-xs text-[var(--fg-muted)]">{item.category}</div>
                </div>
                <div className="text-xs text-[var(--fg-muted)] sm:text-end">
                  {objectivePlans.some((target) => target.prep_item_id === item.prep_item_id) ? t('chefPlannedQty').replace('{qty}', `${item.required_qty} ${item.unit}`) : `${t('current')}: ${item.current_qty.toFixed(1)} ${item.unit} / ${t('demand')}: ${item.required_qty.toFixed(1)} ${item.unit}`}
                </div>
                <div className="flex items-center gap-3">
                  {item.current_qty >= 0 && <span className="text-xs font-semibold text-[var(--brand-700)]">{item.batches_needed} {t('batches')}</span>}
                  {item.current_qty < 0 || item.yield_per_batch <= 0 ? <Link className="text-xs font-medium text-[var(--warning-500)]" href={`/${rid}/kitchen/prep`}>{t('chefReviewProduction')}</Link> : canManage && selectedIsToday && !supplementaryError && <button className="btn-primary text-xs" onClick={() => setProductionItem(item)}>{t('dailyConfirmProduction')}</button>}
                </div>
                {item.current_qty < 0 && <p className="text-xs text-[var(--warning-500)] sm:col-span-3">{t('chefNegativePrep')}</p>}
              </div>
            ))}
          </div>
        )}
        {prepToLaunch.length > 3 && <button className="px-5 py-3 text-sm text-brand-500" onClick={() => setShowAllProduction(!showAllProduction)}>{showAllProduction ? t('chefShowLess') : t('chefShowAllProduction').replace('{count}', String(prepToLaunch.length))}</button>}
        {isOpen && selectedIsToday && report && !supplementaryError && <ProductionObjectives rid={rid} reportId={report.id} items={prepItems} summary={kitchenSummary} onSaved={loadKitchenSummary} />}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-semibold text-[var(--fg)]">{t('salesForecast')}</h2>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            {salesForecast && salesForecast.sample_days > 0
              ? t('salesForecastBasis').replace('{count}', String(salesForecast.sample_days))
              : t('salesForecastDesc')}
          </p>
        </div>
        {forecastLoading ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-[var(--fg-muted)]">
            <RefreshCwIcon className="size-4 animate-spin" />{t('loading')}
          </div>
        ) : forecastLoadFailed ? (
          <p role="alert" className="px-5 py-6 text-sm text-[var(--fg-muted)]">{t('forecastUnavailable')}</p>
        ) : !salesForecast || salesForecast.sample_days === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--fg-muted)]">{t('noWeekdayHistory')}</p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {(showAllForecastItems ? salesForecast.top_items : salesForecast.top_items.slice(0, 10)).map((item, index) => (
              <div key={`${item.menu_item_id ?? item.menu_item_name}-${index}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-[var(--fg)]">
                  {item.menu_item_name}
                  {item.menu_item_id == null && <span className="ms-2 text-xs text-[var(--fg-muted)]">{t('forecastUnmapped')}</span>}
                </span>
                <span className="shrink-0 font-medium text-[var(--fg)]">{item.predicted_qty.toFixed(1)} {t('forecastUnits')}</span>
              </div>
            ))}
            {salesForecast.top_items.length > 10 && (
              <button type="button" onClick={() => setShowAllForecastItems(value => !value)} className="w-full px-5 py-3 text-start text-xs font-medium text-[var(--brand-500)] hover:bg-[var(--surface-2)]">
                {showAllForecastItems
                  ? t('forecastShowLess')
                  : t('forecastMoreItems').replace('{count}', String(salesForecast.top_items.length - 10))}
              </button>
            )}
            <p className="px-5 py-3 text-xs text-[var(--fg-muted)]">{t('forecastRecipeNote')}</p>
          </div>
        )}
      </section>

      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="font-semibold">{t('dailyDeliveriesToCheck')}</h2><p className="mt-1 text-xs text-fg-secondary">{t('dailyDeliveriesHint')}</p></div>
          {canManage && selectedIsToday && <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" onClick={() => setShowScanModal(true)}><UploadIcon className="mr-1 inline size-4" />{t('dailyScanDelivery')}</button>
            <button className="btn-secondary text-xs" onClick={() => setShowReceiveModal(true)}><PlusIcon className="mr-1 inline size-4" />{t('dailyManualDelivery')}</button>
          </div>}
        </div>
        <div className="divide-y divide-[var(--line)]">
          {pendingDeliveries.length === 0 ? <p className="px-5 py-4 text-sm text-fg-secondary">{supplementaryError ? t('dailyLoadError') : t('dailyNoDeliveries')}</p> : pendingDeliveries.slice(0, 3).map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div><p className="text-sm font-medium">{order.supplier?.name} <span className="font-normal text-fg-secondary">PO-{order.id}</span></p>
                <p className="mt-1 text-xs text-fg-secondary">{(order.items ?? []).length} {t('items')}{order.expected_delivery_at ? ` · ${new Date(order.expected_delivery_at).toLocaleDateString()}` : ''}</p></div>
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
          <div className="overflow-x-auto"><table className="w-full text-sm">
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
                            setActionError('');
                            try {
                              await deleteStockTransaction(rid, tx.id);
                              await loadSupplementary();
                              await loadKitchenSummary();
                            } catch (error) {
                              setActionError(error instanceof Error ? error.message : t('saveFailed'));
                            }
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
          </table></div>
        )}
      </CollapsibleSection>

      </div>
      <div role="tabpanel" id="phase-service" aria-labelledby="tab-service" hidden={activePhase !== 'service'} className={styles.content}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="font-medium">{t('chefSoldSummary').replace('{qty}', String(soldQuantity))}</p>
          <Link href={`/${rid}/settings/stock/availability`} className="font-medium text-brand-500">{t('manageAvailability')}</Link>
        </div>
        {externalSalesPending && <p className="text-xs text-fg-secondary">{t('dailyExternalSalesPending')}</p>}
        {prepToLaunch.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-sm">{t('servicePrepRisk').replace('{count}', String(prepToLaunch.length))}</p><button className="btn-primary text-sm" onClick={() => setPhaseSelection('opening')}>{t('chefReviewProduction')}</button></div>}
      {!supplementaryError && prepItems.length > 0 && <NextServicePanel key={`${rid}-${formatDate(selectedDate)}`} items={prepItems} canProduce={canManage && selectedIsToday} onProduce={setProductionItem} />}
      {!supplementaryError && lowStockItems.length > 0 && <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
        <h3 className="text-sm font-semibold">{t('dailyStockToOrder')}</h3>
        <div className="mt-2 divide-y divide-[var(--line)]">{lowStockItems.slice(0, 3).map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <span>{item.name}<span className="ml-2 text-xs text-fg-secondary">{item.supplier}</span></span><span className="tabular-nums text-fg-secondary">{item.quantity} {item.unit} / {t('reorderThreshold')}: {item.reorder_threshold}</span>
        </div>)}</div>
        <Link className="mt-3 inline-block text-sm font-medium text-brand-500" href={`/${rid}/kitchen/suppliers?tab=orders`}>{t('dailyManageOrders')}</Link>
      </div>}

      </div>
      <div role="tabpanel" id="phase-closing" aria-labelledby="tab-closing" hidden={activePhase !== 'closing'} className={styles.content}>
        {report && <KitchenDayReview key={`${rid}-${report.id}`} report={report} summary={kitchenSummary} loading={reviewLoading} error={reviewError} canCount={isOpen} onRetry={() => { void loadKitchenSummary().catch(() => {}); }} onCount={async (stockItemId, quantity) => {
          await updateClosingStock(rid, report.id, [{ stock_item_id: stockItemId, quantity }]);
          await recomputeAndReload(report.id);
        }} />}
        {isOpen && <div className="flex flex-wrap items-center justify-between gap-3 rounded-r-md bg-[var(--surface-2)] px-4 py-3">
          <p className="max-w-xl text-sm text-fg-secondary">{t('chefSalesHint')}</p>
          <div className="flex gap-2"><button className="btn-secondary text-sm" onClick={() => setShowSalesImportModal(true)}>{t('chefImportSales')}</button><button className="btn-secondary text-sm" onClick={() => setShowSalesModal(true)}>{t('manualSalesEntry')}</button></div>
        </div>}

      {/* Sales details are available on demand; they are not the chef's default form. */}
      <CollapsibleSection
        title={t('salesEntry') || 'Sales'}
        sectionKey="sales"
        expanded={expandedSections.has('sales')}
        onToggle={toggleSection}
        badge={report?.sales?.length ? `${report.sales.length} items` : undefined}
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
            <div className="overflow-x-auto"><table className="w-full text-sm">
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
            </table></div>
          </div>
        ) : (
          <p className="text-sm text-[var(--fg-secondary)] py-4">
            {t('noSalesDataYet') || 'No sales data yet. Pull from POS or enter manually.'}
          </p>
        )}
      </CollapsibleSection>

      <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer font-semibold">{t('dailyTomorrowTitle')}</summary>
        <p className="mt-1 max-w-3xl text-sm text-fg-secondary">{t('dailyTomorrowHint')}</p>
        <div className="mt-3 divide-y divide-[var(--line)]">
          {tomorrowPrepPlan.length === 0 ? <p className="py-3 text-sm text-fg-secondary">{supplementaryError ? t('dailyLoadError') : t('dailyNoForecast')}</p> : tomorrowPrepPlan.map((item) => <div key={item.prep_item_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span className="font-medium">{item.prep_item_name}</span><span className="text-fg-secondary">{t('current')}: {item.current_qty.toFixed(1)} {item.unit} · {t('demand')}: {item.required_qty.toFixed(1)} {item.unit} · {item.batches_needed} {t('batches')}</span>
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium text-brand-500">
          <Link href={`/${rid}/kitchen/prep`}>{t('viewPreparations')}</Link><Link href={`/${rid}/kitchen/suppliers?tab=orders`}>{t('dailyManageOrders')}</Link>
        </div>
      </details>
      {isOpen && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="max-w-2xl"><h2 className="font-semibold">{t('closeDay')}</h2><p className="mt-1 text-sm text-fg-secondary">{t('dailyCloseHint')}</p>
          {externalSalesPending && <p className="mt-2 text-sm text-[var(--warning-500)]">{t('dailyExternalSalesPending')}</p>}</div>
        <div className="flex flex-wrap gap-2"><button onClick={handleClose} disabled={closing || savingDraft} className="btn-primary">{closing ? t('closing') : t('closeDay')}</button></div>
        {closingCountError && <p role="alert" className="w-full text-sm text-red-500">{closingCountError}</p>}
      </section>}

      <CollapsibleSection title={t('chefHandoverNote')} sectionKey="retro" expanded={expandedSections.has('retro')} onToggle={toggleSection}>
        <label className="block text-sm font-medium">{t('chefHandoverHint')}<textarea value={toImprove} onChange={(event) => setToImprove(event.target.value)} disabled={!isOpen} rows={2} className="input mt-2 w-full text-sm" /></label>
        {(wentWell || wentWrong) && <p className="mt-2 whitespace-pre-line text-xs text-fg-secondary">{[wentWell, wentWrong].filter(Boolean).join('\n')}</p>}
        {isOpen && <button className="btn-secondary mt-3 text-sm" disabled={savingDraft} onClick={handleSaveDraft}>{savingDraft ? t('saving') : t('saveDraft')}</button>}
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
                    onClick={() => handleGenerateOrders('both')}
                    className="px-5 py-2 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors text-sm"
                  >
                    {t('fromBoth')}
                  </button>
                  <button
                    onClick={() => handleGenerateOrders('manual')}
                    className="px-5 py-2 rounded-xl bg-brand-500/10 text-brand-500 font-medium hover:bg-brand-500/20 transition-colors text-sm border border-brand-500/20"
                  >
                    {t('fromManual') || 'From manual sales'}
                  </button>
                  <button
                    onClick={() => handleGenerateOrders('pos')}
                    className="px-5 py-2 rounded-xl bg-[var(--surface)] text-[var(--fg-secondary)] font-medium hover:bg-[var(--surface-hover)] transition-colors text-sm border border-[var(--divider)]"
                  >
                    {t('fromPOS')}
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

      </div>

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
      {showScanModal && <DeliveryImportModal rid={rid} stockItems={stockItems} onClose={() => setShowScanModal(false)} onImported={() => {
        setShowScanModal(false);
        void Promise.all([loadSupplementary(), loadKitchenSummary()]).catch((error) => {
          setActionError(error instanceof Error ? error.message : t('dailyLoadError'));
        });
      }} />}
      {receiptOrder && <DailyReceiptModal rid={rid} order={receiptOrder} onClose={() => setReceiptOrder(null)} onSaved={async () => { await loadSupplementary(); await loadKitchenSummary(); }} />}
      {productionItem && <DailyProductionModal rid={rid} item={productionItem} onClose={() => setProductionItem(null)} onSaved={async () => { await loadSupplementary(); await loadKitchenSummary(); }} />}
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
            await loadReport();
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
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--divider)]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--divider)]">
            <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">Item</th>
            <th className="text-right py-2 px-4 font-medium text-[var(--fg-secondary)]">{t('qty') || 'Qty'}</th>
            <th className="text-left py-2 px-4 font-medium text-[var(--fg-secondary)]">Unit</th>
          </tr>
        </thead>
        <tbody>
          {(po.items ?? []).map(item => (
            <tr key={item.id} className="border-b border-[var(--divider)] border-opacity-50">
              <td className="py-2 px-4 text-fg-primary">{item.name}</td>
              <td className="py-2 px-4 text-right text-fg-primary font-mono">{item.quantity.toFixed(1)}</td>
              <td className="py-2 px-4 text-[var(--fg-secondary)]">{item.unit}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
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
                    aria-label={`${t('received')}: ${si.name}`}
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
          aria-expanded={expanded}
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
