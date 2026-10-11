'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Eye, FileText, ListFilter, Trash2 } from 'lucide-react';
import { listSupplies, getSupplyDetail, getRestaurant, listImportDrafts, deleteImportDraft,
  type SupplySummary, type StockTransaction, type DeliveryImportDraft } from '@/lib/api';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, Drawer, Section } from '@/components/ds';
import Modal from '@/components/Modal';
import { DataTable, DataTableHead, DataTableHeadCell, SortableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableHeadSpacerCell } from '@/components/data-table';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';

import SupplyDocumentViewer from '@/components/suppliers/SupplyDocumentViewer';

interface DocumentRef { url: string; type: string }
type SortKey = 'date' | 'supplier' | 'items' | 'total';

/** Received deliveries and resumable import drafts, isolated by restaurant. */
export default function SuppliesPage() {
  const { restaurantId } = useParams();
  return <SuppliesWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}

function SuppliesWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [supplies, setSupplies] = useState<SupplySummary[]>([]);
  const [drafts, setDrafts] = useState<DeliveryImportDraft[]>([]);
  const [timeZone, setTimeZone] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const router = useRouter();
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openSupply, setOpenSupply] = useState<SupplySummary | null>(null);
  const [viewer, setViewer] = useState<DocumentRef | null>(null);
  const [deleting, setDeleting] = useState<DeliveryImportDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const lock = useRef(false);
  const guard = useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const request = guard.current.begin(rid);
    setLoading(true); setError('');
    try {
      const [nextSupplies, nextDrafts, restaurant] = await Promise.all([
        listSupplies(rid), listImportDrafts(rid), getRestaurant(rid),
      ]);
      if (!guard.current.isCurrent(request)) return;
      setSupplies(nextSupplies); setDrafts(nextDrafts); setTimeZone(restaurant.timezone); setLoaded(true);
    } catch (cause) {
      if (guard.current.isCurrent(request)) setError(cause instanceof Error ? cause.message : t('workspaceLoadError'));
    } finally {
      if (guard.current.isCurrent(request)) setLoading(false);
    }
  }, [rid, t]);
  useEffect(() => {
    void reload();
    const requests = guard.current;
    return () => requests.invalidate();
  }, [reload]);

  const removeDraft = async () => {
    if (!deleting || !canManage || lock.current) return;
    lock.current = true; setSaving(true); setDeleteError('');
    try {
      await deleteImportDraft(rid, deleting.id);
      setDrafts(previous => previous.filter(draft => draft.id !== deleting.id));
      setDeleting(null);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { lock.current = false; setSaving(false); }
  };
  const names = useMemo(() => Array.from(new Set(supplies.map(supply => supply.supplier_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, locale)), [supplies, locale]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    const rows = supplies.filter(supply => (!query || supply.supplier_name.toLocaleLowerCase(locale).includes(query))
      && (!supplierFilter.size || supplierFilter.has(supply.supplier_name))
      && (!docFilter.size || docFilter.has(supply.document_url ? 'with' : 'without')));
    const direction = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => direction * (sortKey === 'date' ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : sortKey === 'supplier' ? a.supplier_name.localeCompare(b.supplier_name, locale)
      : sortKey === 'items' ? a.item_count - b.item_count : a.total_cost - b.total_cost));
  }, [supplies, search, supplierFilter, docFilter, sortKey, sortDir, locale]);
  const sort = (key: string) => {
    if (key === sortKey) setSortDir(previous => previous === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key as SortKey); setSortDir(key === 'date' ? 'desc' : 'asc'); }
  };
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
  const documentOptions = [{ value: 'with', label: t('withDocument') }, { value: 'without', label: t('withoutDocument') }];
  const listFilters = [
    { id: 'supplier', label: t('supplier'), options: names.map(name => ({ value: name, label: name })), selected: supplierFilter },
    { id: 'document', label: t('document'), options: documentOptions, selected: docFilter },
  ];
  const viewDocument = (supply: SupplySummary) => setViewer({ url: supply.document_url!, type: supply.document_type || '' });

  return <div className="min-w-0 space-y-5">
    <h1 className="sr-only">{t('supplierDeliveries')}</h1>
    <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
      filters={<>
        <ListFilterButton label={t('supplier')} value={supplierFilter.size || undefined} onClick={() => setFilterView('supplier')} />
        <ListStateFilter label={t('document')} options={documentOptions} selected={docFilter} onChange={setDocFilter} />
        <ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => setFilterView('index')} />
      </>}
      primaryAction={canManage && <Button onClick={() => router.push(`/${rid}/kitchen/stock?newDelivery=1`)}>{t('importDelivery')}</Button>}
      actions={<ActionsDropdown actions={[
        { label: t('refresh'), disabled: loading, onClick: () => void reload() },
        { label: `${t('pendingImports')} (${drafts.length})`, onClick: () => setDraftsOpen(true) },
        { label: t('suppliers'), onClick: () => router.push(`/${rid}/kitchen/suppliers?tab=suppliers`) },
        { label: t('purchaseOrders'), onClick: () => router.push(`/${rid}/kitchen/suppliers?tab=orders`) },
      ]} />}
    />
    <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters} onApply={values => { setSupplierFilter(values.supplier); setDocFilter(values.document); }} />
    {error && <div role="alert" className="space-y-3 rounded-r-md border border-[var(--danger-500)] p-4"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button variant="secondary" size="lg" disabled={loading} onClick={() => void reload()}>{t('retry')}</Button></div>}
    {!loaded ? loading && <p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p> : <>
      {filtered.length === 0 ? <p role="status" className="rounded-r-md border border-[var(--line)] px-4 py-16 text-center text-sm text-fg-secondary">{t(supplies.length ? 'tryAdjustingFilters' : 'noSupplies')}</p> : <>
        <DataTable className="list-table"><DataTableHead>
          {(['date', 'supplier', 'items', 'total'] as const).map(key => <SortableHeadCell key={key} sortKey={key} currentSortKey={sortKey} sortDir={sortDir} onSort={sort}>{t(key === 'total' ? 'supplyTotal' : key)}</SortableHeadCell>)}
          <DataTableHeadCell>{t('document')}</DataTableHeadCell><DataTableHeadSpacerCell />
        </DataTableHead><DataTableBody>{filtered.map((supply, index) => <DataTableRow key={supply.batch_id} index={index} onClick={() => setOpenSupply(supply)}>
          <DataTableCell mobileLabel={t('date')}><time dateTime={supply.created_at}><bdi>{date(supply.created_at)}</bdi></time></DataTableCell>
          <DataTableCell mobilePrimary><button className="min-h-11 text-start font-semibold hover:underline" onClick={event => { event.stopPropagation(); setOpenSupply(supply); }}><bdi>{supply.supplier_name || t('unknownSupplier')}</bdi></button></DataTableCell>
          <DataTableCell mobileLabel={t('items')}><Badge>{supply.item_count}</Badge></DataTableCell>
          <DataTableCell mobileLabel={t('supplyTotal')}><bdi className="font-semibold tabular-nums">{money(supply.total_cost)}</bdi></DataTableCell>
          <DataTableCell mobileLabel={t('document')}>{supply.document_url ? <Button variant="ghost" size="lg" onClick={event => { event.stopPropagation(); viewDocument(supply); }}><FileText />{t('viewDocument')}</Button> : <span className="text-fg-secondary">{t('withoutDocument')}</span>}</DataTableCell>
          <DataTableCell onClick={event => event.stopPropagation()}><RowActionsMenu label={`${t('actions')} — ${supply.supplier_name || t('unknownSupplier')} — ${date(supply.created_at)}`} actions={[
            { label: t('viewDetails'), icon: <Eye />, onClick: () => setOpenSupply(supply) },
            ...(supply.document_url ? [{ label: t('viewDocument'), icon: <FileText />, onClick: () => viewDocument(supply) }] : []),
          ]} /></DataTableCell>
        </DataTableRow>)}</DataTableBody></DataTable>
        <p className="text-sm text-fg-secondary">{filtered.length} {t(filtered.length === 1 ? 'delivery' : 'deliveries')}</p>
      </>}
    </>}
      {draftsOpen && <Modal title={t('pendingImports')} onClose={() => setDraftsOpen(false)}><section aria-label={t('pendingImports')} className="space-y-3"><h2 className="text-base font-semibold">{t('pendingImports')} ({drafts.length})</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{drafts.map(draft => <article key={draft.id} className="min-w-0 space-y-3 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold"><bdi>{draft.supplier_name || t('unknownSupplier')}</bdi></h3><p className="mt-1 text-sm text-fg-secondary">{draft.item_count} {t('items')} · <bdi>{date(draft.created_at)}</bdi></p></div>
            {canManage && <Button variant="ghost" size="lg" icon aria-label={`${t('deleteDraft')} — ${draft.supplier_name || t('unknownSupplier')}`} onClick={() => { setDraftsOpen(false); setDeleteError(''); setDeleting(draft); }}><Trash2 /></Button>}
          </div>
          <p className="text-sm text-fg-secondary">{t(draft.document_url ? 'withDocument' : 'withoutDocument')}</p>
          {canManage && <Button asChild variant="secondary" size="lg" className="w-full"><Link href={`/${rid}/kitchen/stock?draft=${draft.id}`}>{t('resumeDraft')}</Link></Button>}
        </article>)}</div>
        {drafts.length === 0 && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}
      </section></Modal>}
    <p className="text-sm text-fg-secondary">{t('suppliesValuationHint')} {t('suppliesListLimit')}</p>
    {openSupply && <SupplyDetailDrawer key={openSupply.batch_id} rid={rid} supply={openSupply} timeZone={timeZone} onClose={() => setOpenSupply(null)} onViewDocument={() => viewDocument(openSupply)} />}
    {viewer && <SupplyDocumentViewer doc={viewer} onClose={() => setViewer(null)} />}
    {deleting && <Modal title={t('deleteDraft')} subtitle={deleting.supplier_name} size="md" onClose={() => { if (!lock.current) setDeleting(null); }} closeDisabled={saving} footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={() => setDeleting(null)}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={saving || !canManage} onClick={() => void removeDraft()}>{t(saving ? 'deleting' : 'delete')}</Button></div>}>
      <p className="text-sm text-fg-secondary">{t('suppliesDeleteDraftHint')}</p>{deleteError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{deleteError}</p>}
    </Modal>}
  </div>;
}

function SupplyDetailDrawer({ rid, supply, timeZone, onClose, onViewDocument }: {
  rid: number; supply: SupplySummary; timeZone?: string; onClose: () => void; onViewDocument: () => void;
}) {
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const [items, setItems] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    getSupplyDetail(rid, supply.batch_id).then(result => { if (active) setItems(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : t('workspaceLoadError')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [rid, supply.batch_id, attempt, t]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(supply.created_at));
  const totalUnits = items.reduce((sum, item) => sum + Math.abs(item.quantity_delta), 0);
  return <Drawer open onOpenChange={open => { if (!open) onClose(); }} title={supply.supplier_name || t('unknownSupplier')} subtitle={<bdi>{date}</bdi>} width={920} footer={supply.document_url && <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={onViewDocument}><FileText />{t('viewDocument')}</Button>}>
    <div className="space-y-5">
      <Section title={t('summary')}><dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-fg-secondary">{t('items')}</dt><dd className="mt-1 text-lg font-semibold">{supply.item_count}</dd></div>
        <div><dt className="text-sm text-fg-secondary">{t('supplyTotal')}</dt><dd className="mt-1 break-words text-lg font-semibold"><bdi>{money(supply.total_cost)}</bdi></dd></div>
        <div><dt className="text-sm text-fg-secondary">{t('document')}</dt><dd className="mt-1 text-sm">{t(supply.document_url ? 'withDocument' : 'withoutDocument')}</dd></div>
      </dl><p className="mt-4 text-sm text-fg-secondary">{t('suppliesValuationHint')}</p></Section>
      {loading ? <p role="status" className="py-10 text-center">{t('loading')}</p> : error ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button variant="secondary" size="lg" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</Button></div> : items.length === 0 ? <p role="status" className="py-10 text-center text-sm">{t('noItems')}</p> : <>
        <DataTable><DataTableHead>{['name', 'quantity', 'unit', 'unitCost', 'supplyTotal'].map(key => <DataTableHeadCell key={key}>{t(key)}</DataTableHeadCell>)}</DataTableHead><DataTableBody>{items.map((item, index) => <DataTableRow key={item.id} index={index}>
          <DataTableCell mobilePrimary><bdi>{item.stock_item?.name || '—'}</bdi></DataTableCell><DataTableCell mobileLabel={t('quantity')}><bdi>{item.quantity_delta}</bdi></DataTableCell><DataTableCell mobileLabel={t('unit')}><bdi>{item.stock_item?.unit || '—'}</bdi></DataTableCell>
          <DataTableCell mobileLabel={t('unitCost')}><bdi>{money(item.stock_item?.cost_per_unit || 0)}</bdi></DataTableCell><DataTableCell mobileLabel={t('supplyTotal')}><bdi>{money(item.quantity_delta * (item.stock_item?.cost_per_unit || 0))}</bdi></DataTableCell>
        </DataTableRow>)}</DataTableBody></DataTable>
        <p className="text-xs text-fg-secondary">{t('totalUnits')} : <bdi>{totalUnits.toFixed(2)}</bdi>. {t('suppliesQuantityHint')}</p>
      </>}
      <Section title={t('document')}>{supply.document_url ? <div className="space-y-3">
        {supply.document_type?.startsWith('image/') && <button type="button" className="block w-full rounded-r-md border border-[var(--line)] p-3" onClick={onViewDocument} aria-label={t('viewDocument')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={supply.document_url} alt={t('scannedDocument')} className="max-h-64 w-full object-contain" />
        </button>}
        <Button size="lg" variant="secondary" onClick={onViewDocument}><FileText />{t('openFullscreen')}</Button>
      </div> : <p className="text-sm text-fg-secondary">{t('noDocument')}</p>}</Section>
      <div className="text-xs text-fg-secondary"><p>{t('batchId')}</p><bdi className="mt-1 block break-all">{supply.batch_id}</bdi></div>
    </div>
  </Drawer>;
}
