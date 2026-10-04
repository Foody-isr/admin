'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { listDiscounts, deleteDiscount, getRestaurant, type Discount } from '@/lib/api';
import { discountDay, discountStatus, formatDiscountValue } from '@/lib/discounts';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { Button, ConfirmDialog, Field, Input, PageHead } from '@/components/ds';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';
import DiscountEditModal from '@/components/marketing/DiscountEditModal';
import { checkedDiscount } from '@/components/marketing/discount-form';

/** Manage the restaurant's promotion codes, including read-only inspection and recoverable deletion. */
export default function DiscountsPage() {
  const { restaurantId } = useParams();
  return <DiscountsWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function DiscountsWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n(), { code: currency } = useCurrency(), { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('discounts.edit');
  const [discounts, setDiscounts] = useState<Discount[]>([]), [timezone, setTimezone] = useState('Asia/Jerusalem');
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [now, setNow] = useState(() => new Date()), [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ editing?: Discount; today: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Discount | null>(null), [pending, setPending] = useState<Discount | null>(null);
  const [busy, setBusy] = useState(false), [readError, setReadError] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false), lifetime = useRef({ generation: 0, sequence: 0 });
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const [rows, restaurant] = await Promise.all([listDiscounts(rid), getRestaurant(rid)]);
      if (!Array.isArray(rows) || restaurant.id !== rid) throw new Error('Incomplete discount workspace');
      const checked = rows.map(row => checkedDiscount(row, rid));
      let zone = restaurant.timezone?.trim() || 'Asia/Jerusalem';
      try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { zone = 'Asia/Jerusalem'; }
      if (current()) { setDiscounts(checked); setTimezone(zone); }
    } catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation++; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (lock.current || pending) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [pending]);
  const remove = async () => {
    const row = confirmation; setConfirmation(null);
    if (!row || !canEdit || lock.current || pending) return;
    lock.current = true; setBusy(true); setNotice(null); setReadError(false);
    const generation = lifetime.current.generation;
    try { await deleteDiscount(rid, row.id); if (generation === lifetime.current.generation) { setDiscounts(previous => previous.filter(item => item.id !== row.id)); setNotice('discountDeleted'); } }
    catch { if (generation === lifetime.current.generation) setPending(row); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(false); } }
  };
  const verifyRemoval = async () => {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true); setReadError(false);
    const generation = lifetime.current.generation;
    try {
      const rows = (await listDiscounts(rid)).map(row => checkedDiscount(row, rid));
      if (generation === lifetime.current.generation) { setDiscounts(rows); setNotice(rows.some(row => row.id === pending.id) ? 'discountDeleteStillPresent' : 'discountDeleteVerified'); setPending(null); }
    } catch { if (generation === lifetime.current.generation) setReadError(true); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(false); } }
  };
  const accept = (row: Discount) => setDiscounts(previous => previous.some(item => item.id === row.id) ? previous.map(item => item.id === row.id ? row : item) : [row, ...previous]);
  const open = (editing?: Discount) => { if (!busy && !pending) setEditor({ editing, today: discountDay(new Date(), timezone) }); };
  const date = (value: string | null) => {
    if (!value) return t('discountNoEnd');
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value), parsed = new Date(dayOnly ? `${value}T12:00:00Z` : value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: dayOnly ? 'UTC' : timezone }).format(parsed) : value;
  };
  const filtered = discounts.filter(row => `${row.code} ${row.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const active = discounts.filter(row => discountStatus(row, now, timezone) === 'active').length;
  return <div className="mx-auto max-w-[1200px] space-y-6">
    <PageHead title={t('discounts')} desc={t('discountsSubtitle')} actions={canEdit && <Button disabled={loading || loadError || busy || !!pending} onClick={() => open()}><Plus />{t('createDiscount')}</Button>} />
    {loading ? <p role="status" className="py-12 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--line)] p-5"><p className="text-sm text-[var(--danger-500)]">{t('discountLoadError')}</p><Button onClick={() => void load()}>{t('retry')}</Button></div> : <>
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><div className="flex items-center gap-3"><Tag className="size-5 shrink-0" aria-hidden="true" /><p className="font-semibold">{t('discountSummary').replace('{active}', String(active)).replace('{total}', String(discounts.length))}</p></div><p className="text-xs leading-5">{t('discountCalendar')} <bdi>{timezone}</bdi></p></div>
      {pending && <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--danger-500)] p-5"><p className="text-sm leading-6">{t('discountDeleteUnconfirmed')} <bdi className="font-semibold">{pending.code}</bdi></p>{readError && <p className="text-sm text-[var(--danger-500)]">{t('discountReadError')}</p>}<Button variant="secondary" disabled={busy} onClick={() => void verifyRemoval()}>{t('discountVerifyDeletion')}</Button></div>}
      {notice && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t(notice)}</p>}
      {discounts.length === 0 ? <div className="space-y-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-14 text-center"><h2 className="text-lg font-semibold">{t('noDiscountsYet')}</h2><p className="text-sm text-[var(--fg-muted)]">{t('noDiscountsHint')}</p></div> : <>
        <div className="max-w-md"><Field label={t('discountSearch')}><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field></div>
        {filtered.length === 0 ? <p role="status" className="py-8 text-sm text-[var(--fg-muted)]">{t('discountNoResults')}</p> : <DataTable><DataTableHead><DataTableHeadCell>{t('discountCode')}</DataTableHeadCell><DataTableHeadCell>{t('discountName')}</DataTableHeadCell><DataTableHeadCell>{t('discountType')}</DataTableHeadCell><DataTableHeadCell>{t('appliesTo')}</DataTableHeadCell><DataTableHeadCell>{t('statusColumn')}</DataTableHeadCell><DataTableHeadCell>{t('redemptions')}</DataTableHeadCell><DataTableHeadCell>{t('endsAt')}</DataTableHeadCell><DataTableHeadSpacerCell /></DataTableHead><DataTableBody>{filtered.map((row, index) => {
          const status = discountStatus(row, now, timezone), value = formatDiscountValue(row, currency);
          return <DataTableRow key={row.id} index={index}>
            <DataTableCell mobilePrimary className="md:min-w-[144px]"><button type="button" disabled={busy || !!pending} className="rounded-r-sm text-start font-semibold text-[var(--brand-ink)] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-ink)] disabled:opacity-50" onClick={() => open(row)}><bdi className="break-all">{row.code}</bdi></button></DataTableCell>
            <DataTableCell mobileLabel={t('discountName')} className="md:max-w-[280px]"><span dir="auto" className="whitespace-normal break-words">{row.name || '—'}</span></DataTableCell>
            <DataTableCell mobileLabel={t('discountType')}><bdi>{value === 'freeDelivery' ? t('typeFreeDelivery') : value}</bdi></DataTableCell>
            <DataTableCell mobileLabel={t('appliesTo')}>{t(row.scope === 'whole_sale' ? 'scopeWholeSale' : row.scope === 'category' ? 'scopeCategory' : 'scopeSpecificItem')}</DataTableCell>
            <DataTableCell mobileLabel={t('statusColumn')}><span className={`badge ${status === 'active' ? 'badge-ready' : status === 'scheduled' ? 'badge-accepted' : status === 'inactive' ? 'badge-rejected' : 'badge-neutral'}`}>{t(status)}</span></DataTableCell>
            <DataTableCell mobileLabel={t('redemptions')}><bdi>{row.redemption_count}{row.total_cap != null ? ` / ${row.total_cap}` : ''}</bdi></DataTableCell>
            <DataTableCell mobileLabel={t('endsAt')} className="md:whitespace-nowrap"><bdi>{date(row.ends_at)}</bdi></DataTableCell>
            <DataTableCell>{canEdit && <div className="flex justify-end gap-1"><Button variant="ghost" icon aria-label={`${t('edit')} ${row.code}`} disabled={busy || !!pending} onClick={() => open(row)}><Pencil /></Button><Button variant="ghost" icon className="text-[var(--danger-500)]" aria-label={`${t('delete')} ${row.code}`} disabled={busy || !!pending} onClick={() => setConfirmation(row)}><Trash2 /></Button></div>}</DataTableCell>
          </DataTableRow>;
        })}</DataTableBody></DataTable>}
      </>}
    </>}
    {editor && <DiscountEditModal key={editor.editing?.id ?? 'new'} open editing={editor.editing} restaurantId={rid} canEdit={canEdit} today={editor.today} timezone={timezone} onClose={() => setEditor(null)} onCurrent={accept} onSaved={(row, verified) => { accept(row); setEditor(null); setNotice(verified ? 'discountSaveVerified' : 'discountSaved'); }} />}
    <ConfirmDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} title={`${t('delete')} ${confirmation?.code ?? ''}`} description={t('deleteDiscountConfirm')} confirmLabel={t('delete')} cancelLabel={t('cancel')} danger onConfirm={() => void remove()} />
  </div>;
}
