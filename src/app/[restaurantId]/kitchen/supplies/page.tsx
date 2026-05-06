'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import {
  listSupplies, getSupplyDetail,
  listImportDrafts, deleteImportDraft,
  SupplySummary, StockTransaction, DeliveryImportDraft,
} from '@/lib/api';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  SortableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  DataTableHeadSpacerCell,
} from '@/components/data-table';
import { Badge, Button, Drawer, Kpi, PageHead, Section } from '@/components/ds';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import {
  TruckIcon, FileTextIcon, ImageIcon, EyeIcon, MaximizeIcon,
  XIcon, SearchIcon, ChevronDownIcon, ChevronUpIcon,
  TrashIcon, SparklesIcon, RefreshCwIcon, DownloadIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function isImage(mime?: string) {
  return !!mime && mime.startsWith('image/');
}
function isPdf(mime?: string) {
  return mime === 'application/pdf';
}

// ─── Page ──────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'supplier' | 'items' | 'total';

export default function SuppliesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [supplies, setSupplies] = useState<SupplySummary[]>([]);
  const [drafts, setDrafts] = useState<DeliveryImportDraft[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [docFilter, setDocFilter] = useState<'all' | 'with' | 'without'>('all');
  const [showKpis, setShowKpis] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'date' ? 'desc' : 'asc'); }
  };

  // Drawer state
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, StockTransaction[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Document fullscreen viewer
  const [viewerDoc, setViewerDoc] = useState<{ url: string; type: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [data, draftData] = await Promise.all([
        listSupplies(rid),
        listImportDrafts(rid),
      ]);
      setSupplies(data);
      setDrafts(draftData);
    } finally {
      setLoading(false);
    }
  }, [rid]);
  useEffect(() => { reload(); }, [reload]);

  const handleDeleteDraft = async (draftId: number) => {
    if (!confirm(t('deleteDraft') || 'Delete this draft?')) return;
    await deleteImportDraft(rid, draftId);
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  const openDrawer = async (batchId: string) => {
    setOpenBatchId(batchId);
    if (!batchDetails[batchId]) {
      setLoadingDetail(true);
      try {
        const txs = await getSupplyDetail(rid, batchId);
        setBatchDetails((prev) => ({ ...prev, [batchId]: txs }));
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  // Derived: unique suppliers, KPIs, filtering, sorting
  const supplierNames = useMemo(
    () => Array.from(new Set(supplies.map((s) => s.supplier_name).filter(Boolean))).sort(),
    [supplies],
  );

  const filtered = useMemo(() => {
    return supplies.filter((s) => {
      if (search && !(s.supplier_name || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (supplierFilter && s.supplier_name !== supplierFilter) return false;
      if (docFilter === 'with' && !s.document_url) return false;
      if (docFilter === 'without' && s.document_url) return false;
      return true;
    });
  }, [supplies, search, supplierFilter, docFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        case 'supplier':
          return (a.supplier_name || '').localeCompare(b.supplier_name || '') * dir;
        case 'items':
          return (a.item_count - b.item_count) * dir;
        case 'total':
          return (a.total_cost - b.total_cost) * dir;
      }
    });
  }, [filtered, sortKey, sortDir]);

  // KPIs from the unfiltered list — easier to spot trends.
  const totalDeliveries = supplies.length;
  const totalSpent = supplies.reduce((s, x) => s + x.total_cost, 0);
  const avgPerDelivery = totalDeliveries > 0 ? totalSpent / totalDeliveries : 0;
  const last30 = supplies.filter((s) => {
    const ageDays = (Date.now() - new Date(s.created_at).getTime()) / 86_400_000;
    return ageDays <= 30;
  }).length;

  const openSupply = openBatchId ? supplies.find((s) => s.batch_id === openBatchId) ?? null : null;
  const openItems = openBatchId ? batchDetails[openBatchId] ?? [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  // ── Pills row (All / supplier names) — same as Stock page
  const pillSuppliers = ['Tous', ...supplierNames];
  const activePill = supplierFilter || 'Tous';
  const selectPill = (name: string) => setSupplierFilter(name === 'Tous' ? '' : name);

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('supplies') || 'Approvisionnements'}
        desc={t('suppliesDesc') || 'Livraisons et approvisionnements'}
        actions={
          <>
            <Button
              variant="ghost"
              size="md"
              icon
              onClick={() => setShowKpis((v) => !v)}
              aria-label="Toggle KPIs"
              title={showKpis ? (t('hideKpis') || 'Masquer les KPIs') : (t('showKpis') || 'Afficher les KPIs')}
            >
              {showKpis ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
            <Button variant="secondary" size="md" onClick={reload}>
              <RefreshCwIcon /> {t('refresh') || 'Actualiser'}
            </Button>
          </>
        }
      />

      <header className="mb-[var(--s-4)]">
        {showKpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
            <Kpi
              label={t('supplies') || 'Approvisionnements'}
              value={totalDeliveries}
              sub={`${supplierNames.length} ${t('suppliers') || 'fournisseurs'}`}
            />
            <Kpi
              label={t('totalValue') || 'Valeur totale'}
              value={
                <>
                  ₪{Math.round(totalSpent).toLocaleString()}
                  <span className="text-fs-lg text-[var(--fg-muted)] font-medium">
                    .{String(Math.round((totalSpent % 1) * 100)).padStart(2, '0')}
                  </span>
                </>
              }
              sub={t('exVat') || 'HT'}
            />
            <Kpi
              label={t('avgPerDelivery') || 'Moy. / livraison'}
              value={
                <>
                  ₪{Math.round(avgPerDelivery).toLocaleString()}
                </>
              }
              sub={`${totalDeliveries} ${t('deliveries') || 'livraisons'}`}
            />
            <Kpi
              tone={drafts.length > 0 ? 'warning' : 'default'}
              label={t('pendingImports') || 'Imports en attente'}
              value={drafts.length}
              sub={last30 > 0 ? `${last30} ${t('inLast30Days') || 'sur 30 j'}` : 'OK'}
            />
          </div>
        )}

        {/* Search + filter row */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)]">
          <div className="relative flex-1 min-w-[240px]">
            <SearchIcon className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder={t('search') || 'Rechercher'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-11 pe-3 h-11 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
            />
          </div>

          {/* Document filter */}
          <button
            type="button"
            onClick={() =>
              setDocFilter((d) => (d === 'all' ? 'with' : d === 'with' ? 'without' : 'all'))
            }
            className={`inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 rounded-r-lg text-fs-sm font-medium transition-colors whitespace-nowrap ${
              docFilter === 'all'
                ? 'bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--fg)] hover:bg-[var(--surface-2)]'
                : 'bg-[var(--brand-500)]/10 border border-[var(--brand-500)] text-[var(--brand-500)] hover:bg-[var(--brand-500)]/15'
            }`}
            title={t('filterDocument') || 'Filtrer par document'}
          >
            <FileTextIcon className="w-4 h-4" />
            <span className="text-[var(--fg-muted)]">{t('document') || 'Document'} ·</span>
            <span className="font-semibold">
              {docFilter === 'all'
                ? (t('all') || 'Tous')
                : docFilter === 'with'
                  ? (t('withDocument') || 'Avec document')
                  : (t('withoutDocument') || 'Sans document')}
            </span>
          </button>
        </div>
      </header>

      {/* Supplier pills */}
      {pillSuppliers.length > 1 && (
        <div className="mb-[var(--s-4)] flex flex-wrap gap-[var(--s-2)]">
          {pillSuppliers.map((name) => {
            const active = activePill === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => selectPill(name)}
                aria-pressed={active}
                className={`inline-flex items-center h-10 px-[var(--s-4)] rounded-r-lg text-fs-sm font-semibold uppercase tracking-[.02em] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--brand-500)] text-white shadow-1'
                    : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Pending drafts strip */}
      {drafts.length > 0 && (
        <div className="mb-[var(--s-5)]">
          <h2 className="text-fs-sm font-semibold text-[var(--fg-muted)] uppercase tracking-wider flex items-center gap-2 mb-[var(--s-3)]">
            <SparklesIcon className="w-4 h-4 text-[var(--brand-500)]" />
            {t('pendingImports') || 'Imports en attente'} ({drafts.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--s-3)]">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="rounded-r-lg border border-[var(--brand-500)]/25 p-[var(--s-4)] space-y-[var(--s-3)]"
                style={{ background: 'var(--surface-2)' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-[var(--s-2)]">
                    {isImage(draft.document_type) && draft.document_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.document_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-[var(--line)]"
                      />
                    ) : (
                      <FileTextIcon className="w-10 h-10 text-[var(--fg-subtle)]" />
                    )}
                    <div>
                      <p className="text-fs-sm font-medium text-[var(--fg)]">
                        {draft.supplier_name || (t('unknownSupplier') || 'Fournisseur inconnu')}
                      </p>
                      <p className="text-fs-xs text-[var(--fg-muted)]">
                        {draft.item_count} {t('items') || 'articles'} · {formatDate(draft.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDraft(draft.id)}
                    className="p-1 text-red-500 hover:text-red-400"
                    aria-label={t('delete') || 'Supprimer'}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    window.location.href = `/${rid}/kitchen/stock?draft=${draft.id}`;
                  }}
                >
                  {t('resumeDraft') || 'Reprendre'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <TruckIcon className="w-12 h-12 text-[var(--fg-subtle)]" />
            <p className="text-base text-[var(--fg-muted)] text-center max-w-md">
              {supplies.length === 0 ? (t('noSupplies') || 'Aucun approvisionnement') : (t('tryAdjustingFilters') || 'Aucun résultat — ajustez vos filtres.')}
            </p>
          </div>
        ) : (
          <DataTable>
            <DataTableHead>
              <SortableHeadCell sortKey="date" currentSortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>
                {t('date') || 'Date'}
              </SortableHeadCell>
              <SortableHeadCell sortKey="supplier" currentSortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>
                {t('supplier') || 'Fournisseur'}
              </SortableHeadCell>
              <SortableHeadCell sortKey="items" currentSortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>
                {t('items') || 'Articles'}
              </SortableHeadCell>
              <SortableHeadCell sortKey="total" currentSortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>
                {t('supplyTotal') || 'Total'}
              </SortableHeadCell>
              <DataTableHeadCell>{t('document') || 'Document'}</DataTableHeadCell>
              <DataTableHeadSpacerCell />
            </DataTableHead>
            <DataTableBody>
              {sorted.map((supply, index) => {
                const docPresent = !!supply.document_url;
                return (
                  <DataTableRow
                    key={supply.batch_id}
                    index={index}
                    onClick={() => openDrawer(supply.batch_id)}
                    className="cursor-pointer"
                  >
                    <DataTableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-neutral-900 dark:text-white tabular-nums">
                          {formatDate(supply.created_at)}
                        </span>
                        <span className="text-fs-xs text-[var(--fg-subtle)] tabular-nums">
                          {formatTime(supply.created_at)}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-[var(--s-3)]">
                        <div className="w-9 h-9 rounded-lg bg-[var(--brand-500)]/10 grid place-items-center shrink-0">
                          <TruckIcon className="w-4 h-4 text-[var(--brand-500)]" />
                        </div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {supply.supplier_name || (t('unknownSupplier') || 'Fournisseur inconnu')}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge tone="neutral">
                        {supply.item_count} {t('items') || 'articles'}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
                        ₪{supply.total_cost.toFixed(2)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      {docPresent ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewerDoc({ url: supply.document_url!, type: supply.document_type || '' });
                          }}
                          className="inline-flex items-center gap-[var(--s-2)] text-fs-sm text-[var(--brand-500)] hover:underline"
                          title={t('viewDocument') || 'Voir le document'}
                        >
                          {isImage(supply.document_type) ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : (
                            <FileTextIcon className="w-4 h-4" />
                          )}
                          {t('view') || 'Voir'}
                        </button>
                      ) : (
                        <span className="text-fs-xs text-[var(--fg-subtle)]">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          {
                            label: t('viewDetails') || 'Voir le détail',
                            onClick: () => openDrawer(supply.batch_id),
                            icon: <EyeIcon className="w-4 h-4" />,
                          },
                          ...(docPresent
                            ? [{
                                label: t('viewDocument') || 'Voir le document',
                                onClick: () =>
                                  setViewerDoc({ url: supply.document_url!, type: supply.document_type || '' }),
                                icon: <FileTextIcon className="w-4 h-4" />,
                              }]
                            : []),
                        ]}
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}

        {sorted.length > 0 && (
          <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
            <p className="text-[var(--fg-muted)] text-fs-sm">
              {sorted.length} {sorted.length > 1 ? (t('deliveries') || 'livraisons') : (t('delivery') || 'livraison')}
            </p>
          </div>
        )}
      </div>

      {/* Right detail drawer */}
      <SupplyDetailDrawer
        supply={openSupply}
        items={openItems}
        loading={loadingDetail}
        onClose={() => setOpenBatchId(null)}
        onViewDocument={(url, type) => setViewerDoc({ url, type })}
      />

      {/* Fullscreen document viewer */}
      <DocumentViewer
        doc={viewerDoc}
        onClose={() => setViewerDoc(null)}
        closeLabel={t('close') || 'Fermer'}
      />
    </div>
  );
}

// ─── Supply Detail Drawer ──────────────────────────────────────────────────

function SupplyDetailDrawer({
  supply, items, loading, onClose, onViewDocument,
}: {
  supply: SupplySummary | null;
  items: StockTransaction[];
  loading: boolean;
  onClose: () => void;
  onViewDocument: (url: string, type: string) => void;
}) {
  const { t } = useI18n();

  if (!supply) {
    // Render a closed Drawer so the slide-out animation plays cleanly.
    return (
      <Drawer open={false} onOpenChange={(v) => { if (!v) onClose(); }} title="" width={920}>
        {' '}
      </Drawer>
    );
  }

  const totalUnits = items.reduce((s, t) => s + Math.abs(t.quantity_delta), 0);
  const docPresent = !!supply.document_url;

  const headerSubtitle = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: 'var(--brand-500)' }}
      />
      <span className="font-semibold tracking-[-0.005em]" style={{ color: 'var(--brand-500)' }}>
        {formatDate(supply.created_at)} · {formatTime(supply.created_at)}
      </span>
      <span className="opacity-40">·</span>
      <span className="shrink-0">
        {supply.item_count} {t('items') || 'articles'}
      </span>
    </span>
  );

  return (
    <Drawer
      open={!!supply}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={supply.supplier_name || (t('unknownSupplier') || 'Fournisseur inconnu')}
      subtitle={headerSubtitle}
      width={920}
      primaryAction={
        docPresent ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onViewDocument(supply.document_url!, supply.document_type || '')}
          >
            <FileTextIcon /> {t('viewDocument') || 'Voir le document'}
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[var(--s-5)]">
        {/* LEFT — items */}
        <div className="flex flex-col gap-[var(--s-4)]">
          <Section
            title={`${items.length || supply.item_count} ${t('items') || 'articles'} · ${totalUnits.toFixed(2)} ${t('totalUnits') || 'unités'}`}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-fs-sm text-[var(--fg-muted)]">
                {t('noItems') || 'Aucun article'}
              </div>
            ) : (
              <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
                <table className="w-full text-fs-sm">
                  <thead>
                    <tr
                      className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-wider"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      <th className="text-left px-[var(--s-5)] py-[var(--s-2)] font-semibold">{t('name') || 'Nom'}</th>
                      <th className="text-right px-[var(--s-5)] py-[var(--s-2)] font-semibold">{t('quantity') || 'Quantité'}</th>
                      <th className="text-right px-[var(--s-5)] py-[var(--s-2)] font-semibold">{t('unit') || 'Unité'}</th>
                      <th className="text-right px-[var(--s-5)] py-[var(--s-2)] font-semibold">{t('unitCost') || 'Prix unitaire'}</th>
                      <th className="text-right px-[var(--s-5)] py-[var(--s-2)] font-semibold">{t('supplyTotal') || 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {items.map((tx) => {
                      const itemName = tx.stock_item?.name || '—';
                      const unit = tx.stock_item?.unit || '';
                      const costPerUnit = tx.stock_item?.cost_per_unit || 0;
                      const lineCost = tx.quantity_delta * costPerUnit;
                      return (
                        <tr key={tx.id}>
                          <td className="px-[var(--s-5)] py-[var(--s-3)] text-[var(--fg)] font-medium">
                            {itemName}
                          </td>
                          <td className="px-[var(--s-5)] py-[var(--s-3)] text-[var(--fg-muted)] text-right tabular-nums">
                            {tx.quantity_delta}
                          </td>
                          <td className="px-[var(--s-5)] py-[var(--s-3)] text-[var(--fg-muted)] text-right">
                            {unit}
                          </td>
                          <td className="px-[var(--s-5)] py-[var(--s-3)] text-[var(--fg-muted)] text-right tabular-nums">
                            ₪{costPerUnit.toFixed(2)}
                          </td>
                          <td className="px-[var(--s-5)] py-[var(--s-3)] text-[var(--fg)] text-right font-semibold tabular-nums">
                            ₪{lineCost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — totals + document */}
        <div className="flex flex-col gap-[var(--s-4)]">
          <Section title={t('summary') || 'Résumé'}>
            <div className="flex flex-col gap-[var(--s-2)]">
              <div className="flex items-center justify-between">
                <span className="text-fs-sm text-[var(--fg-muted)]">{t('items') || 'Articles'}</span>
                <span className="font-mono tabular-nums text-fs-sm">{supply.item_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fs-sm text-[var(--fg-muted)]">{t('supplyTotal') || 'Total'}</span>
                <span className="font-mono tabular-nums text-fs-sm font-semibold">
                  ₪{supply.total_cost.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fs-sm text-[var(--fg-muted)]">{t('date') || 'Date'}</span>
                <span className="font-mono tabular-nums text-fs-sm">
                  {formatDate(supply.created_at)} {formatTime(supply.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fs-sm text-[var(--fg-muted)]">{t('batchId') || 'Batch ID'}</span>
                <span className="font-mono tabular-nums text-fs-xs text-[var(--fg-subtle)] truncate ms-2 max-w-[140px]" title={supply.batch_id}>
                  {supply.batch_id.slice(0, 8)}…
                </span>
              </div>
            </div>
          </Section>

          <Section
            title={t('document') || 'Document'}
            aside={
              docPresent ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDocument(supply.document_url!, supply.document_type || '')}
                >
                  <MaximizeIcon /> {t('fullscreen') || 'Plein écran'}
                </Button>
              ) : null
            }
          >
            {!docPresent ? (
              <div className="text-center py-6 text-fs-sm text-[var(--fg-muted)]">
                <FileTextIcon className="w-10 h-10 mx-auto mb-[var(--s-2)] text-[var(--fg-subtle)]" />
                {t('noDocument') || 'Aucun document scanné'}
              </div>
            ) : isImage(supply.document_type) ? (
              <button
                type="button"
                onClick={() => onViewDocument(supply.document_url!, supply.document_type || '')}
                className="block w-full rounded-r-md overflow-hidden border border-[var(--line)] hover:border-[var(--brand-500)] transition-colors group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={supply.document_url}
                  alt={t('scannedDocument') || 'Document scanné'}
                  className="w-full max-h-[320px] object-contain bg-[var(--surface-2)]"
                />
                <div className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs text-[var(--fg-muted)] text-center group-hover:text-[var(--brand-500)] transition-colors">
                  {t('clickToOpenFullscreen') || 'Cliquer pour ouvrir en plein écran'}
                </div>
              </button>
            ) : isPdf(supply.document_type) ? (
              <div className="flex flex-col gap-[var(--s-3)]">
                <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-5)] flex flex-col items-center text-center gap-[var(--s-2)]">
                  <FileTextIcon className="w-10 h-10 text-[var(--fg-subtle)]" />
                  <span className="text-fs-sm font-medium text-[var(--fg)]">PDF</span>
                  <span className="text-fs-xs text-[var(--fg-muted)]">
                    {t('pdfPreviewHint') || 'Aperçu PDF en plein écran'}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onViewDocument(supply.document_url!, supply.document_type || '')}
                >
                  <MaximizeIcon /> {t('openFullscreen') || 'Ouvrir en plein écran'}
                </Button>
              </div>
            ) : (
              <a
                href={supply.document_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-[var(--s-2)] text-fs-sm text-[var(--brand-500)] hover:underline"
              >
                <DownloadIcon className="w-4 h-4" />
                {t('downloadDocument') || 'Télécharger le document'}
              </a>
            )}
          </Section>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Fullscreen Document Viewer ────────────────────────────────────────────

function DocumentViewer({
  doc, onClose, closeLabel,
}: {
  doc: { url: string; type: string } | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const open = !!doc;
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          className="fixed inset-0 z-[60] flex flex-col focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{closeLabel}</Dialog.Title>
          {/* Top bar */}
          <div className="h-14 shrink-0 px-[var(--s-5)] flex items-center justify-between gap-[var(--s-3)] bg-black/60 text-white">
            <div className="flex items-center gap-[var(--s-2)] min-w-0">
              <FileTextIcon className="w-4 h-4 shrink-0" />
              <span className="text-fs-sm font-medium truncate">
                {doc?.type || 'document'}
              </span>
            </div>
            <div className="flex items-center gap-[var(--s-2)]">
              {doc && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-[var(--s-2)] h-9 px-[var(--s-3)] rounded-r-md bg-white/10 hover:bg-white/20 text-fs-sm transition-colors"
                >
                  <DownloadIcon className="w-4 h-4" />
                  {closeLabel === 'Close' ? 'Open' : 'Ouvrir'}
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center w-9 h-9 rounded-r-md bg-white/10 hover:bg-white/20 transition-colors"
                aria-label={closeLabel}
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 grid place-items-center bg-black p-[var(--s-3)]">
            {doc && isImage(doc.type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doc.url}
                alt=""
                className="max-w-full max-h-full object-contain"
              />
            ) : doc && isPdf(doc.type) ? (
              <iframe
                src={doc.url}
                title="document"
                className="w-full h-full bg-white"
              />
            ) : doc ? (
              <iframe
                src={doc.url}
                title="document"
                className="w-full h-full bg-white"
              />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
