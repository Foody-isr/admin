'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listSupplies, getSupplyDetail,
  listImportDrafts, deleteImportDraft,
  SupplySummary, StockTransaction, DeliveryImportDraft,
} from '@/lib/api';
import {
  TruckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  TrashIcon,
  FileTextIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function SuppliesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [supplies, setSupplies] = useState<SupplySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, StockTransaction[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DeliveryImportDraft[]>([]);

  const reload = useCallback(async () => {
    try {
      const [data, draftData] = await Promise.all([
        listSupplies(rid, supplierFilter || undefined),
        listImportDrafts(rid),
      ]);
      setSupplies(data);
      setDrafts(draftData);
    } finally {
      setLoading(false);
    }
  }, [rid, supplierFilter]);

  useEffect(() => { reload(); }, [reload]);

  const handleDeleteDraft = async (draftId: number) => {
    if (!confirm(t('deleteDraft') || 'Delete this draft?')) return;
    await deleteImportDraft(rid, draftId);
    setDrafts(prev => prev.filter(d => d.id !== draftId));
  };

  const toggleBatch = async (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      return;
    }
    setExpandedBatch(batchId);
    if (!batchDetails[batchId]) {
      setLoadingDetail(batchId);
      try {
        const txs = await getSupplyDetail(rid, batchId);
        setBatchDetails(prev => ({ ...prev, [batchId]: txs }));
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  // Derive unique supplier names for filter
  const supplierNames = Array.from(new Set(supplies.map(s => s.supplier_name).filter(Boolean))).sort();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-fg-primary">{t('supplies')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={supplierFilter}
            onChange={e => { setSupplierFilter(e.target.value); setLoading(true); }}
            className="px-3 py-2 rounded-lg border border-border bg-bg-primary text-fg-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">{t('allItems')}</option>
            {supplierNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Pending import drafts */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-brand-500" />
            {t('pendingImports')} ({drafts.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drafts.map(draft => (
              <div key={draft.id} className="rounded-xl border border-brand-500/20 p-4 space-y-3" style={{ background: 'var(--surface-subtle)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {draft.document_url && draft.document_type?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.document_url} alt="" className="w-10 h-10 rounded object-cover border border-[var(--divider)]" />
                    ) : (
                      <FileTextIcon className="w-10 h-10 text-fg-tertiary" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-fg-primary">{draft.supplier_name || t('unknownSupplier')}</p>
                      <p className="text-xs text-fg-secondary">{draft.item_count} {t('items')} &middot; {formatDate(draft.created_at)}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDraft(draft.id)} className="p-1 text-red-400 hover:text-red-300">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    // Navigate to stock page with draft ID to resume
                    window.location.href = `/${rid}/kitchen/stock?draft=${draft.id}`;
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                >
                  {t('resumeDraft')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supply list */}
      {supplies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-fg-secondary">
          <TruckIcon className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">{t('noSupplies')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {supplies.map(supply => {
            const isExpanded = expandedBatch === supply.batch_id;
            const details = batchDetails[supply.batch_id];
            const isLoadingThis = loadingDetail === supply.batch_id;

            return (
              <div key={supply.batch_id} className="bg-bg-primary rounded-xl border border-border shadow-sm overflow-hidden">
                {/* Supply header row */}
                <button
                  onClick={() => toggleBatch(supply.batch_id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <TruckIcon className="h-5 w-5 text-brand" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-fg-primary text-sm">
                        {supply.supplier_name || '—'}
                      </div>
                      <div className="text-xs text-fg-secondary mt-0.5">
                        {formatDate(supply.created_at)} {formatTime(supply.created_at)}
                        {' \u00B7 '}
                        {t('supplyItems').replace('{count}', String(supply.item_count))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-fg-primary">
                        {supply.total_cost.toFixed(2)} &#8362;
                      </div>
                      <div className="text-[10px] text-fg-secondary uppercase tracking-wide">{t('supplyTotal')}</div>
                    </div>
                    {isExpanded ? (
                      <ChevronUpIcon className="h-4 w-4 text-fg-secondary" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-fg-secondary" />
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {isLoadingThis ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand" />
                      </div>
                    ) : details && details.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-fg-secondary uppercase tracking-wider" style={{ background: 'var(--surface-subtle, var(--bg-secondary))' }}>
                            <th className="text-left px-5 py-2 font-medium">{t('name')}</th>
                            <th className="text-right px-5 py-2 font-medium">{t('quantity')}</th>
                            <th className="text-right px-5 py-2 font-medium">{t('unit')}</th>
                            <th className="text-right px-5 py-2 font-medium">{t('unitCost')}</th>
                            <th className="text-right px-5 py-2 font-medium">{t('supplyTotal')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {details.map(tx => {
                            const itemName = tx.stock_item?.name || '—';
                            const unit = tx.stock_item?.unit || '';
                            const costPerUnit = tx.stock_item?.cost_per_unit || 0;
                            const lineCost = tx.quantity_delta * costPerUnit;
                            return (
                              <tr key={tx.id}>
                                <td className="px-5 py-2.5 text-fg-primary font-medium">{itemName}</td>
                                <td className="px-5 py-2.5 text-fg-secondary text-right">{tx.quantity_delta}</td>
                                <td className="px-5 py-2.5 text-fg-secondary text-right">{unit}</td>
                                <td className="px-5 py-2.5 text-fg-secondary text-right">{costPerUnit.toFixed(2)} &#8362;</td>
                                <td className="px-5 py-2.5 text-fg-primary text-right font-medium">{lineCost.toFixed(2)} &#8362;</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="px-5 py-4 text-sm text-fg-secondary">No items</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
