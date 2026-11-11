'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { listTransactions } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import type { TransactionHistory, TransactionRecord } from '@/lib/transactions';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import { isoDate } from '@/lib/weeks';
import { TransactionAshraitReceipt } from './ashrait-receipt';
import { Button, Drawer, Input, PageHead, Select, Table, TableShell, Tbody, Td, Th, Thead, Tr } from '@/components/ds';

/** One shared history across recorded cash, card-present and online collections. */
export default function TransactionsPage() {
  const rid = Number(useParams().restaurantId);
  const { loading, hasAnyPermission } = usePermissions();
  if (loading || !hasAnyPermission('payments.view', 'payments.manage')) return null;
  return <History key={rid} rid={rid} />;
}

function initialRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 89);
  return { from, to };
}

function History({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const guard = useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const [range, setRange] = useState(initialRange);
  const [search, setSearch] = useState('');
  const [q, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [source, setSource] = useState('');
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: TransactionHistory; error?: boolean }>();
  const [selected, setSelected] = useState<TransactionRecord | null>(null);
  const from = isoDate(range.from), to = isoDate(range.to);
  const key = JSON.stringify([rid, from, to, q, method, source, offset, retry]);
  const data = result?.key === key ? result.data : undefined;
  const failed = result?.key === key && result.error;

  useEffect(() => {
    const current = guard.current;
    const token = current.begin(rid);
    setSelected(null);
    void listTransactions(rid, { from, to, q, method, source, limit: 30, offset })
      .then(data => { if (current.isCurrent(token)) setResult({ key, data }); })
      .catch(() => { if (current.isCurrent(token)) setResult({ key, error: true }); });
    return () => current.invalidate();
  }, [rid, from, to, q, method, source, offset, retry, key]);

  const money = (minor: number, currency: string) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  const date = (row: TransactionRecord) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.occurred_at));
  const kind = (row: TransactionRecord) => t(row.kind === 'refund' ? 'transactionHistoryRefund' : row.kind === 'void' ? 'transactionHistoryVoid' : 'transactionHistorySale');
  const methodLabel = (value: string) => t(value === 'cash' ? 'transactionHistoryCash' : value === 'credit_card' ? 'transactionHistoryCard' : value === 'bank_transfer' ? 'transactionHistoryTransfer' : 'transactionHistoryUnknown');
  const sourceLabel = (value: string) => t(value === 'online' ? 'transactionHistoryOnline' : value === 'pos' ? 'transactionHistoryPos' : 'transactionHistoryUnknown');
  const rail = (row: TransactionRecord) => ({ verifone_checkout: 'Verifone Checkout', sumit: 'Sumit', stancer: 'Stancer', payplus: 'PayPlus', cibus: 'Cibus',
    victa_recorded: t('transactionHistoryVicta'), cash: t('transactionHistoryCash'), bank_transfer: t('transactionHistoryTransfer'),
    card_recorded_unverified: t('transactionHistoryExternalCard') }[row.payment_rail] ?? t('transactionHistoryUnknown'));
  const amount = (row: TransactionRecord) => money(row.kind === 'sale' ? row.amount_minor : -row.amount_minor, row.currency);

  return <>
    <PageHead title={t('transactions')} desc={t('transactionHistoryIntro')} actions={<Button variant="secondary" onClick={() => setRetry(n => n + 1)}>{t('retry')}</Button>} />
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <DateRangePicker value={range} onChange={value => { setRange(value); setOffset(0); }} />
      <label className="min-w-44 flex-1 text-sm">{t('transactionHistoryMethod')}<Select aria-label={t('transactionHistoryMethod')} value={method} onChange={e => { setMethod(e.target.value); setOffset(0); }}>
        <option value="">{t('transactionHistoryAllMethods')}</option><option value="cash">{t('transactionHistoryCash')}</option><option value="credit_card">{t('transactionHistoryCard')}</option><option value="bank_transfer">{t('transactionHistoryTransfer')}</option>
      </Select></label>
      <label className="min-w-44 flex-1 text-sm">{t('transactionHistorySource')}<Select aria-label={t('transactionHistorySource')} value={source} onChange={e => { setSource(e.target.value); setOffset(0); }}>
        <option value="">{t('transactionHistoryAllSources')}</option><option value="pos">{t('transactionHistoryPos')}</option><option value="online">{t('transactionHistoryOnline')}</option>
      </Select></label>
      <form className="flex min-w-0 flex-1 gap-2" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setOffset(0); }}>
        <Input className="min-w-0 flex-1" aria-label={t('transactionHistorySearch')} placeholder={t('transactionHistorySearch')} maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
        <Button type="submit" variant="secondary">{t('transactionHistoryFind')}</Button>
      </form>
    </div>
    {failed ? <p role="alert" className="py-8">{t('transactionHistoryLoadError')}</p> : !data ? <p role="status" className="py-8">{t('loading')}</p> : <>
      <div className="mb-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
        <div><strong>{t('transactionHistoryGross')}</strong>{Object.entries(data.totals_by_currency).map(([currency, minor]) => <div key={currency}>{money(minor, currency)}</div>)}</div>
        <div><strong>{t('transactionHistoryRecordedReturns')}</strong>{Object.entries(data.recorded_returns_by_currency).map(([currency, minor]) => <div key={currency}>{money(minor, currency)}</div>)}</div>
      </div>
      {data.transactions.length === 0 ? <p className="py-10 text-[var(--fg-muted)]">{t('transactionHistoryEmpty')}</p> : <TableShell className="responsive-table"><Table><Thead><Tr>
        <Th>{t('transactionHistoryDate')}</Th><Th>{t('transactionHistoryType')}</Th><Th>{t('transactionHistoryMethod')}</Th><Th>{t('transactionHistorySource')}</Th><Th>{t('transactionHistoryProcessor')}</Th><Th>{t('transactionHistoryAmount')}</Th><Th><span className="sr-only">{t('transactionHistoryDetails')}</span></Th>
      </Tr></Thead><Tbody>{data.transactions.map(row => <Tr key={row.id}>
        <Td data-label={t('transactionHistoryDate')}>{date(row)}</Td><Td data-label={t('transactionHistoryType')}>{kind(row)}</Td><Td data-label={t('transactionHistoryMethod')}>{methodLabel(row.method)}</Td><Td data-label={t('transactionHistorySource')}>{sourceLabel(row.source)}</Td><Td data-label={t('transactionHistoryProcessor')}>{rail(row)}</Td><Td data-label={t('transactionHistoryAmount')} className="tabular-nums">{amount(row)}</Td>
        <Td><Button variant="ghost" onClick={() => setSelected(row)} aria-label={`${t('transactionHistoryDetails')} ${row.id}`}>{t('transactionHistoryDetails')}</Button></Td>
      </Tr>)}</Tbody></Table></TableShell>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{data.total} {t('transactions')}</span><div className="flex gap-2"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 30))}>{t('transactionHistoryPrevious')}</Button>
        <Button variant="secondary" disabled={offset + data.transactions.length >= data.total} onClick={() => setOffset(n => n + 30)}>{t('transactionHistoryNext')}</Button></div>
      </div>
    </>}
    <Drawer open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }} title={t('transactionHistoryDetails')}>
      {selected && <div className="space-y-6 break-words">
        <p className="text-2xl font-semibold">{amount(selected)}</p>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[
          [t('transactionHistoryDate'), date(selected)], [t('transactionHistoryType'), kind(selected)], [t('transactionHistoryMethod'), methodLabel(selected.method)],
          [t('transactionHistorySource'), sourceLabel(selected.source)], [t('transactionHistoryProcessor'), rail(selected)], [t('transactionHistoryReference'), selected.reference || selected.id],
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-[var(--fg-muted)]">{label}</dt><dd>{value}</dd></div>)}</dl>
        {selected.allocation_details_unavailable ? <p>{t('transactionHistoryAllocationUnavailable')}</p> : selected.allocations.map((allocation, index) => <div key={index}>
          {allocation.order_id ? hasAnyPermission('orders.view', 'orders.manage') ? <Link className="underline" href={`/${rid}/orders/${allocation.order_id}`}>#{allocation.order_id}</Link> : <span>#{allocation.order_id}</span> : <span>{allocation.check_id}</span>}
          {allocation.amount_minor != null && <span> — {money(allocation.amount_minor, selected.currency)}</span>}
        </div>)}
        {selected.items.length > 0 && <ul>{selected.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <TransactionAshraitReceipt key={selected.id} rid={rid} row={selected} />
        <p className="text-sm text-[var(--fg-muted)]">{t('transactionHistoryReadOnly')}</p>
      </div>}
    </Drawer>
  </>;
}
