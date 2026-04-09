'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  getTodayFoodCostReport, getFoodCostReport, computeFoodCostReport,
  upsertSalesEntries, updateClosingStock, updateRetrospective,
  closeFoodCostReport, createFoodCostReport, listFoodCostReports,
  getFoodCostBreakdown, getFoodCostSummary,
  listStockTransactions, getAllCategories, listStockItems,
  confirmDelivery,
  DailyFoodCostReport, DailyFoodCostItem, DailySalesEntry,
  IngredientBreakdown, StockTransaction, MenuCategory, MenuItem, StockItem,
  ConfirmDeliveryItemInput,
} from '@/lib/api';
import {
  ChevronDownIcon, ChevronUpIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationTriangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XMarkIcon, PlusIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 5) return 'text-green-500';
  if (abs < 15) return 'text-yellow-500';
  return 'text-red-500';
}

function varianceBg(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 5) return 'bg-green-500/10';
  if (abs < 15) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
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
  const [savingSales, setSavingSales] = useState(false);

  // Closing stock
  const [closingStocks, setClosingStocks] = useState<Record<number, number>>({});
  const [savingStock, setSavingStock] = useState(false);

  // Retrospective
  const [wentWell, setWentWell] = useState('');
  const [wentWrong, setWentWrong] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [savingRetro, setSavingRetro] = useState(false);

  // Breakdown modal
  const [breakdown, setBreakdown] = useState<IngredientBreakdown | null>(null);

  // Quick receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);

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

  const handleCompute = async () => {
    if (!report) return;
    setComputing(true);
    try {
      const updated = await computeFoodCostReport(rid, report.id);
      setReport(updated);
      if (updated.items) {
        const stocks: Record<number, number> = {};
        updated.items.forEach(i => {
          if (i.stock_item_id) stocks[i.stock_item_id] = i.closing_stock;
        });
        setClosingStocks(stocks);
      }
    } finally {
      setComputing(false);
    }
  };

  const handleSaveSales = async () => {
    if (!report) return;
    setSavingSales(true);
    try {
      const entries = Object.entries(salesEntries)
        .filter(([, qty]) => qty > 0)
        .map(([menuItemId, quantity]) => ({ menu_item_id: Number(menuItemId), quantity }));
      await upsertSalesEntries(rid, report.id, entries);
    } finally {
      setSavingSales(false);
    }
  };

  const handleSaveClosingStock = async () => {
    if (!report) return;
    setSavingStock(true);
    try {
      const items = Object.entries(closingStocks)
        .map(([stockItemId, quantity]) => ({ stock_item_id: Number(stockItemId), quantity }));
      await updateClosingStock(rid, report.id, items);
    } finally {
      setSavingStock(false);
    }
  };

  const handleSaveRetro = async () => {
    if (!report) return;
    setSavingRetro(true);
    try {
      await updateRetrospective(rid, report.id, {
        went_well: wentWell,
        went_wrong: wentWrong,
        to_improve: toImprove,
      });
    } finally {
      setSavingRetro(false);
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

  // All menu items from categories
  const allMenuItems = categories.flatMap(c => c.items || []);

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
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Food Cost %" value={`${report.food_cost_percent.toFixed(1)}%`} warn={report.food_cost_percent > 35} />
          <KpiCard label={t('revenue') || 'Revenue'} value={`₪${report.total_sales_revenue.toFixed(0)}`} />
          <KpiCard label={t('variance') || 'Variance'} value={`₪${report.total_variance_value.toFixed(0)}`} warn={report.total_variance_value > 0} />
          <KpiCard label={t('wasteValue') || 'Waste'} value={`₪${report.total_waste_value.toFixed(0)}`} warn={report.total_waste_value > 0} />
        </div>
      )}

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
        {todayReceives.length === 0 ? (
          <p className="text-sm text-[var(--fg-secondary)] py-4">{t('noSuppliesReceived') || 'No supplies received today.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--divider)]">
                <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('ingredient') || 'Ingredient'}</th>
                <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('quantity') || 'Quantity'}</th>
                <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('time') || 'Time'}</th>
              </tr>
            </thead>
            <tbody>
              {todayReceives.map(tx => {
                const si = stockItems.find(s => s.id === tx.stock_item_id);
                return (
                  <tr key={tx.id} className="border-b border-[var(--divider)] border-opacity-50">
                    <td className="py-2 text-fg-primary">{si?.name || `#${tx.stock_item_id}`}</td>
                    <td className="py-2 text-right text-fg-primary">+{tx.quantity_delta} {si?.unit}</td>
                    <td className="py-2 text-right text-[var(--fg-secondary)]">{tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : ''}</td>
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
      >
        <div className="space-y-3">
          {/* POS auto-pull button */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={handleCompute}
              disabled={computing || !isOpen}
              className="btn-primary text-sm px-4 py-1.5 flex items-center gap-2"
            >
              <ArrowPathIcon className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
              {t('pullFromPOS') || 'Pull from POS'}
            </button>
            <span className="text-xs text-[var(--fg-secondary)]">
              {report?.sales_source === 'pos' ? 'Auto-synced from orders' : 'Manual entry mode'}
            </span>
          </div>

          {/* Show existing sales */}
          {report?.sales && report.sales.length > 0 && (
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="border-b border-[var(--divider)]">
                  <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('menuItem') || 'Menu Item'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('qtySold') || 'Qty Sold'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('source') || 'Source'}</th>
                </tr>
              </thead>
              <tbody>
                {report.sales.map(s => (
                  <tr key={s.id} className="border-b border-[var(--divider)] border-opacity-50">
                    <td className="py-2 text-fg-primary">{s.menu_item_name}</td>
                    <td className="py-2 text-right text-fg-primary">{s.quantity}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${s.source === 'pos' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {s.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Manual sales entry (only for open reports) */}
          {isOpen && (
            <div className="border border-[var(--divider)] rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-fg-primary">{t('manualSalesEntry') || 'Manual Sales Entry'}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {allMenuItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="text-sm text-fg-primary flex-1 truncate">{item.name}</span>
                    <input
                      type="number"
                      min="0"
                      value={salesEntries[item.id] || ''}
                      onChange={(e) => setSalesEntries(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 0 }))}
                      className="input w-20 px-2 py-1 text-sm text-right"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <button onClick={handleSaveSales} disabled={savingSales} className="btn-primary text-sm px-4 py-1.5">
                {savingSales ? t('saving') || 'Saving...' : t('saveSales') || 'Save Sales'}
              </button>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 3: Stock Count & Variance */}
      <CollapsibleSection
        title={t('stockCountVariance') || 'Stock Count & Variance'}
        sectionKey="variance"
        expanded={expandedSections.has('variance')}
        onToggle={toggleSection}
      >
        <div className="space-y-4">
          {/* Variance table */}
          {report?.items && report.items.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--divider)]">
                  <th className="text-left py-2 font-medium text-[var(--fg-secondary)]">{t('ingredient') || 'Ingredient'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('opening') || 'Opening'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('received') || 'Received'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('theoretical') || 'Theoretical'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('closing') || 'Closing'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">{t('variance') || 'Variance'}</th>
                  <th className="text-right py-2 font-medium text-[var(--fg-secondary)]">%</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map(item => (
                  <tr
                    key={item.id}
                    className={`border-b border-[var(--divider)] border-opacity-50 cursor-pointer hover:bg-[var(--surface-hover)] ${varianceBg(item.variance_percent)}`}
                    onClick={() => item.stock_item_id && handleShowBreakdown(item.stock_item_id)}
                  >
                    <td className="py-2 text-fg-primary font-medium">{item.item_name} <span className="text-[var(--fg-secondary)] text-xs">({item.unit})</span></td>
                    <td className="py-2 text-right text-fg-primary">{item.opening_stock.toFixed(1)}</td>
                    <td className="py-2 text-right text-green-400">+{item.received_qty.toFixed(1)}</td>
                    <td className="py-2 text-right text-[var(--fg-secondary)]">{item.theoretical_usage.toFixed(1)}</td>
                    <td className="py-2 text-right">
                      {isOpen ? (
                        <input
                          type="number"
                          step="0.1"
                          value={closingStocks[item.stock_item_id!] ?? item.closing_stock}
                          onChange={(e) => item.stock_item_id && setClosingStocks(prev => ({
                            ...prev,
                            [item.stock_item_id!]: parseFloat(e.target.value) || 0,
                          }))}
                          className="input w-20 px-2 py-0.5 text-sm text-right"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span>{item.closing_stock.toFixed(1)}</span>
                      )}
                    </td>
                    <td className={`py-2 text-right font-medium ${varianceColor(item.variance_percent)}`}>
                      {item.variance > 0 ? '+' : ''}{item.variance.toFixed(1)}
                    </td>
                    <td className={`py-2 text-right font-medium ${varianceColor(item.variance_percent)}`}>
                      {item.variance_percent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[var(--fg-secondary)] py-4">
              {t('noVarianceData') || 'No variance data yet. Click "Pull from POS" or enter sales to compute.'}
            </p>
          )}

          {isOpen && report?.items && report.items.length > 0 && (
            <div className="flex gap-3">
              <button onClick={handleSaveClosingStock} disabled={savingStock} className="btn-primary text-sm px-4 py-1.5">
                {savingStock ? t('saving') || 'Saving...' : t('saveClosingStock') || 'Save Closing Stock'}
              </button>
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
          <div className="flex gap-3">
            {isOpen && (
              <>
                <button onClick={handleSaveRetro} disabled={savingRetro} className="btn-primary text-sm px-4 py-1.5">
                  {savingRetro ? t('saving') || 'Saving...' : t('saveRetrospective') || 'Save'}
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="text-sm px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-2"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  {closing ? t('closing') || 'Closing...' : t('closeDay') || 'Close Day'}
                </button>
              </>
            )}
          </div>
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
                  {breakdown.contributions.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--divider)] border-opacity-50">
                      <td className="py-2 text-fg-primary">{c.menu_item_name}</td>
                      <td className="py-2 text-right">{c.qty_sold}</td>
                      <td className="py-2 text-right text-[var(--fg-secondary)]">{c.recipe_qty}{breakdown.unit}</td>
                      <td className="py-2 text-right font-medium">{c.total_usage.toFixed(1)}{breakdown.unit}</td>
                    </tr>
                  ))}
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
          onConfirm={async (supplierName, items) => {
            await confirmDelivery(rid, { supplier_name: supplierName, items });
            setShowReceiveModal(false);
            loadSupplementary();
          }}
          onClose={() => setShowReceiveModal(false)}
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
  onConfirm: (supplierName: string, items: ConfirmDeliveryItemInput[]) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [supplierName, setSupplierName] = useState('');
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
      await onConfirm(supplierName, items);
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

        {/* Supplier name */}
        <input
          type="text"
          value={supplierName}
          onChange={e => setSupplierName(e.target.value)}
          className="input w-full px-3 py-2 text-sm mb-3"
          placeholder={t('supplierName') || 'Supplier name (optional)'}
        />

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

function KpiCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${warn ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--divider)] bg-[var(--surface)]'}`}>
      <p className="text-xs text-[var(--fg-secondary)] mb-1">{label}</p>
      <p className={`text-xl font-bold ${warn ? 'text-red-400' : 'text-fg-primary'}`}>{value}</p>
    </div>
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
