'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  getTodayFoodCostReport, getFoodCostReport, computeFoodCostReport,
  upsertSalesEntries, updateClosingStock, updateRetrospective,
  closeFoodCostReport, createFoodCostReport, listFoodCostReports,
  getFoodCostBreakdown, getFoodCostSummary, deleteSalesEntries, deleteCostItems,
  listStockTransactions, getAllCategories, listStockItems,
  confirmDelivery, deleteStockTransaction,
  DailyFoodCostReport, DailyFoodCostItem, DailySalesEntry,
  IngredientBreakdown, StockTransaction, MenuCategory, MenuItem, StockItem,
  ConfirmDeliveryItemInput,
} from '@/lib/api';
import {
  ChevronDownIcon, ChevronUpIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationTriangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XMarkIcon, PlusIcon, TrashIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
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

function insightMessage(item: DailyFoodCostItem, t: (k: string) => string): string | null {
  if (Math.abs(item.variance) < 0.001) return null;
  const qty = `${Math.abs(item.variance).toFixed(2)}${item.unit}`;
  const cost = item.variance_cost !== 0 ? ` (≈ ₪${Math.abs(item.variance_cost).toFixed(0)})` : '';
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

function computeKpis(report: DailyFoodCostReport) {
  const items = report.items || [];
  const actualCost = items.reduce((sum, i) => sum + i.actual_usage * i.cost_per_unit, 0);
  const wasteCost = items.reduce((sum, i) => sum + i.waste_qty * i.cost_per_unit, 0);
  const varianceCost = items.reduce((sum, i) => sum + i.variance_cost, 0);
  const revenue = report.total_sales_revenue;
  const foodCostPct = revenue > 0 ? (actualCost / revenue) * 100 : 0;
  return { foodCostPct, revenue, varianceCost, wasteCost };
}

function statusBadge(status: string) {
  switch (status) {
    case 'open': return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400">Open</span>;
    case 'closed': return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Closed</span>;
    case 'reviewed': return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400">Reviewed</span>;
    default: return null;
  }
}

export default function DailyOperationsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [report, setReport] = useState<DailyFoodCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Section expansion
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['supplies', 'sales', 'variance', 'retro'])
  );

  // Supplies received today
  const [todayReceives, setTodayReceives] = useState<StockTransaction[]>([]);

  // Sales entry
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [salesEntries, setSalesEntries] = useState<Record<number, number>>({});

  // Closing stock
  const [closingStocks, setClosingStocks] = useState<Record<number, number>>({});

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

  // Breakdown modal
  const [breakdown, setBreakdown] = useState<IngredientBreakdown | null>(null);

  // Quick receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  // Sales entry modal
  const [showSalesModal, setShowSalesModal] = useState(false);

  // Stock items for reference
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

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

      // Populate form state from report
      if (rpt.sales) {
        const entries: Record<number, number> = {};
        rpt.sales.forEach(s => { entries[s.menu_item_id] = s.quantity; });
        setSalesEntries(entries);
      }
      if (rpt.items) {
        const stocks: Record<number, number> = {};
        rpt.items.forEach(i => {
          if (i.stock_item_id) stocks[i.stock_item_id] = i.closing_stock;
        });
        setClosingStocks(stocks);
      }
      setWentWell(rpt.went_well || '');
      setWentWrong(rpt.went_wrong || '');
      setToImprove(rpt.to_improve || '');
    } finally {
      setLoading(false);
    }
  }, [rid, selectedDate]);

  const loadSupplementary = useCallback(async () => {
    try {
      const [cats, stock] = await Promise.all([
        getAllCategories(rid),
        listStockItems(rid),
      ]);
      setCategories(cats);
      setStockItems(stock);

      // Load today's receive transactions
      const txns = await listStockTransactions(rid, { type: 'receive' });
      const dateStr = formatDate(selectedDate);
      const filtered = txns.filter(tx => tx.created_at?.startsWith(dateStr));
      setTodayReceives(filtered);
    } catch {
      // non-critical
    }
  }, [rid, selectedDate]);

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
    if (updated.items) {
      const stocks: Record<number, number> = {};
      updated.items.forEach(i => {
        if (i.stock_item_id) stocks[i.stock_item_id] = i.closing_stock;
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


  const handleSaveDraft = async () => {
    if (!report) return;
    setSavingDraft(true);
    try {
      const items = Object.entries(closingStocks)
        .map(([stockItemId, quantity]) => ({ stock_item_id: Number(stockItemId), quantity }));
      await Promise.all([
        updateClosingStock(rid, report.id, items),
        updateRetrospective(rid, report.id, {
          went_well: wentWell,
          went_wrong: wentWrong,
          to_improve: toImprove,
        }),
      ]);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    if (!confirm('Close this day\'s report? It will be frozen and cannot be modified.')) return;
    setClosing(true);
    try {
      await closeFoodCostReport(rid, report.id);
      await loadReport();
    } finally {
      setClosing(false);
    }
  };

  const handleShowBreakdown = async (stockItemId: number) => {
    if (!report) return;
    try {
      const bd = await getFoodCostBreakdown(rid, report.id, stockItemId);
      setBreakdown(bd);
    } catch {
      // ignore
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


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-[var(--fg-secondary)]" />
      </div>
    );
  }

  const isOpen = report?.status === 'open';

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg-primary">{t('dailyOperations') || 'Daily Operations'}</h1>
          <p className="text-sm text-[var(--fg-secondary)] mt-1">{t('dailyOperationsDesc') || 'Track food cost, waste, and run your daily retrospective'}</p>
        </div>
        {report && statusBadge(report.status)}
      </div>

      {/* Date Navigator */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigateDate(-1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <input
          type="date"
          value={formatDate(selectedDate)}
          onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
          className="input px-3 py-1.5 text-sm"
        />
        <button onClick={() => navigateDate(1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      {/* KPI Cards */}
      {report && (() => {
        const kpis = report.status === 'open'
          ? computeKpis(report)
          : {
              foodCostPct: report.food_cost_percent,
              revenue: report.total_sales_revenue,
              varianceCost: report.total_variance_value,
              wasteCost: report.total_waste_value,
            };
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Food Cost %"
              value={`${kpis.foodCostPct.toFixed(1)}%`}
              warn={kpis.foodCostPct > 35}
              tooltip={t('foodCostPctTooltip') || 'Actual ingredient cost as a % of revenue. Below 35% is healthy.'}
            />
            <KpiCard
              label={t('revenue') || 'Revenue'}
              value={`₪${kpis.revenue.toFixed(0)}`}
              tooltip={t('revenueTooltip') || 'Total revenue from paid orders for this day.'}
            />
            <KpiCard
              label={t('variance') || 'Variance'}
              value={`₪${kpis.varianceCost.toFixed(0)}`}
              warn={kpis.varianceCost > 0}
              tooltip={t('varianceTooltip') || 'Actual vs theoretical ingredient usage in cost. Positive = over-use or loss.'}
            />
            <KpiCard
              label={t('wasteValue') || 'Waste'}
              value={`₪${kpis.wasteCost.toFixed(0)}`}
              warn={kpis.wasteCost > 0}
              tooltip={t('wasteTooltip') || 'Cost of ingredients explicitly logged as waste today.'}
            />
          </div>
        );
      })()}

      {/* Section 1: Supplies Received */}
      <CollapsibleSection
        title={t('suppliesReceived') || 'Supplies Received'}
        sectionKey="supplies"
        expanded={expandedSections.has('supplies')}
        onToggle={toggleSection}
        badge={todayReceives.length > 0 ? `${todayReceives.length} items` : undefined}
        action={isOpen ? (
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
              onClick={handleCompute}
              disabled={computing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${computing ? 'animate-spin' : ''}`} />
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
                    <th className="w-8 py-2">
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
                      <td className="py-2">
                        <input type="checkbox" checked={selectedSales.has(s.id)} onChange={() => toggleSalesSelection(s.id)} className="rounded" />
                      </td>
                    )}
                    <td className="py-2 text-fg-primary">{s.menu_item_name}</td>
                    <td className="py-2 text-right text-fg-primary">{s.quantity}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${s.source === 'pos' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
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

      {/* Section 3: Stock Count & Variance */}
      <CollapsibleSection
        title={t('stockCountVariance') || 'Stock Count & Variance'}
        sectionKey="variance"
        expanded={expandedSections.has('variance')}
        onToggle={toggleSection}
      >
        <div className="space-y-4">
          <SectionDesc>{t('stockCountVarianceDesc') || 'Compare actual vs theoretical ingredient consumption. Enter your physical end-of-day stock count to see where losses occur.'}</SectionDesc>
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
                <div className={`grid text-xs font-medium text-[var(--fg-secondary)] px-3 py-2 border-b border-[var(--divider)] ${isOpen ? 'grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]'} gap-x-4`}>
                  {isOpen && <span />}
                  <span>{t('ingredient') || 'Ingredient'}</span>
                  <span className="text-right"><ThTooltip label={t('opening') || 'Opening'} tooltip={t('colOpeningTooltip') || "Yesterday's closing stock."} /></span>
                  <span className="text-right"><ThTooltip label={t('received') || 'Received'} tooltip={t('colReceivedTooltip') || "Deliveries added today."} /></span>
                  <span className="text-right"><ThTooltip label={t('colExpectedLabel') || 'Expected'} tooltip={t('colTheoreticalTooltip') || 'What you should have consumed based on sales and recipes.'} /></span>
                  <span className="text-right"><ThTooltip label={t('closing') || 'Closing'} tooltip={t('colClosingTooltip') || 'Physical stock count at end of day.'} /></span>
                  <span className="text-right"><ThTooltip label={t('colLossLabel') || 'Loss / Over-use'} tooltip={t('colVarianceTooltip') || 'Actual − Expected. Positive = over-used.'} /></span>
                  <span className="text-right"><ThTooltip label={t('colImpactLabel') || 'Impact'} tooltip={t('colVariancePctTooltip') || 'Green < 5%, yellow 5–15%, red ≥ 15%.'} /></span>
                  {isOpen && <span />}
                </div>
                {/* Rows */}
                {report.items.map(item => {
                  const insight = insightMessage(item, t);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border border-transparent hover:border-[var(--divider)] transition-colors group ${varianceBg(item.variance_percent)}`}
                    >
                      {/* Main row */}
                      <div
                        className={`grid items-center px-3 py-2.5 cursor-pointer ${isOpen ? 'grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]'} gap-x-4 text-sm`}
                        onClick={() => item.stock_item_id && handleShowBreakdown(item.stock_item_id)}
                      >
                        {isOpen && (
                          <div onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleItemSelection(item.id)} className="rounded" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-fg-primary">{item.item_name}</span>
                          <span className="text-[var(--fg-secondary)] text-xs ml-1">({item.unit})</span>
                        </div>
                        <span className="text-right text-fg-primary">{item.opening_stock.toFixed(2)}</span>
                        <span className="text-right text-green-400">+{item.received_qty.toFixed(2)}</span>
                        <span className="text-right text-[var(--fg-secondary)]">{item.theoretical_usage.toFixed(2)}</span>
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          {isOpen ? (
                            <input
                              type="number"
                              step="0.01"
                              value={closingStocks[item.stock_item_id!] ?? item.closing_stock}
                              onChange={(e) => item.stock_item_id && setClosingStocks(prev => ({
                                ...prev,
                                [item.stock_item_id!]: parseFloat(e.target.value) || 0,
                              }))}
                              className="input w-20 px-2 py-0.5 text-sm text-right"
                            />
                          ) : (
                            <span>{item.closing_stock.toFixed(2)}</span>
                          )}
                        </div>
                        <span className={`text-right font-medium tabular-nums ${varianceColor(item.variance_percent)}`}>
                          {item.variance > 0 ? '+' : ''}{item.variance.toFixed(2)}
                        </span>
                        <span className="text-right">
                          <VarianceBadge pct={item.variance_percent} t={t} />
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
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                          {insight}
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
                <ArrowPathIcon className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
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
          {isOpen && (
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <button onClick={handleSaveDraft} disabled={savingDraft} className="btn-primary text-sm px-4 py-1.5 w-full">
                    {savingDraft ? t('saving') || 'Saving...' : t('saveDraft') || 'Save Draft'}
                  </button>
                  <p className="text-xs text-[var(--fg-secondary)] mt-1">{t('saveDraftDesc') || 'Saves your data without finalizing. You can continue editing.'}</p>
                </div>
                <div className="flex-1">
                  <button
                    onClick={handleClose}
                    disabled={closing}
                    className="text-sm px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 w-full"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    {closing ? t('closing') || 'Closing...' : t('closeDay') || 'Close Day'}
                  </button>
                  <p className="text-xs text-[var(--fg-secondary)] mt-1">{t('closeDayDesc') || 'Finalizes the report — it cannot be edited afterward.'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Breakdown Modal */}
      {breakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBreakdown(null)}>
          <div className="bg-[var(--surface)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-fg-primary">
                {breakdown.item_name} <span className="text-sm font-normal text-[var(--fg-secondary)]">({breakdown.unit})</span>
              </h3>
              <button onClick={() => setBreakdown(null)} className="p-1 hover:bg-[var(--surface-hover)] rounded-lg">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {breakdown.contributions.length === 0 ? (
              <p className="text-sm text-[var(--fg-secondary)]">{t('noContributions') || 'No menu items contributed to this ingredient\'s usage.'}</p>
            ) : (
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
                  {breakdown.contributions.map((c, i) => {
                    const sameUnit = c.recipe_unit === breakdown.unit;
                    return (
                      <tr key={i} className="border-b border-[var(--divider)] border-opacity-50">
                        <td className="py-2 text-fg-primary">{c.menu_item_name}</td>
                        <td className="py-2 text-right">{c.qty_sold}</td>
                        <td className="py-2 text-right text-[var(--fg-secondary)]">
                          {c.recipe_qty}{c.recipe_unit}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {c.total_usage.toFixed(1)}{c.recipe_unit}
                          {!sameUnit && (
                            <span className="block text-xs text-[var(--fg-secondary)] font-normal">
                              ≈ {c.total_usage_converted.toFixed(3)}{breakdown.unit}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Quick Receive Modal */}
      {showReceiveModal && (
        <QuickReceiveModal
          stockItems={stockItems}
          onConfirm={async (items) => {
            await confirmDelivery(rid, { supplier_name: '', items });
            setShowReceiveModal(false);
            loadSupplementary();
          }}
          onClose={() => setShowReceiveModal(false)}
          t={t}
        />
      )}

      {/* Quick Sales Modal */}
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

// ─── Quick Receive Modal ─────────────────────────────────────────────────────

function QuickReceiveModal({
  stockItems, onConfirm, onClose, t,
}: {
  stockItems: StockItem[];
  onConfirm: (items: ConfirmDeliveryItemInput[]) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [search, setSearch] = useState('');
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
      await onConfirm(items);
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
            <XMarkIcon className="w-5 h-5" />
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
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={qty || ''}
                    onChange={e => setQuantities(prev => ({
                      ...prev,
                      [si.id]: parseFloat(e.target.value) || 0,
                    }))}
                    className="input px-2 py-1 text-sm text-right w-full"
                    placeholder="0"
                  />
                  <span className="text-xs text-[var(--fg-secondary)] text-center">{si.unit}</span>
                  <span className="text-xs text-[var(--fg-secondary)] text-right">
                    {si.cost_per_unit ? `₪${si.cost_per_unit.toFixed(1)}` : '—'}
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
            <XMarkIcon className="w-5 h-5" />
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
                  <span className="text-xs text-[var(--fg-secondary)] text-right">₪{item.price}</span>
                  <input
                    type="number"
                    min="0"
                    value={qty || ''}
                    onChange={e => setQuantities(prev => ({
                      ...prev,
                      [item.id]: parseInt(e.target.value) || 0,
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

function KpiCard({ label, value, warn, tooltip }: { label: string; value: string; warn?: boolean; tooltip?: string }) {
  return (
    <div className={`rounded-xl p-4 border ${warn ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--divider)] bg-[var(--surface)]'}`}>
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-[var(--fg-secondary)]">{label}</p>
        {tooltip && (
          <div className="relative group/tip">
            <InformationCircleIcon className="w-3.5 h-3.5 text-[var(--fg-secondary)] opacity-60 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--surface-elevated,#1e1e1e)] border border-[var(--divider)] text-[var(--fg-secondary)] shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-10 text-left leading-snug">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <p className={`text-xl font-bold ${warn ? 'text-red-400' : 'text-fg-primary'}`}>{value}</p>
    </div>
  );
}

function ThTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span>{label}</span>
      <div className="relative group/tip">
        <InformationCircleIcon className="w-3.5 h-3.5 text-[var(--fg-secondary)] opacity-50 cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--surface-elevated,#1e1e1e)] border border-[var(--divider)] text-[var(--fg-secondary)] shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20 text-left leading-snug font-normal">
          {tooltip}
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
