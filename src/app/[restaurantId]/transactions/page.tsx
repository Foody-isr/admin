'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftRight, Banknote, CreditCard, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { getRestaurant, listTransactions, type ListTransactionsParams, type ListTransactionsResult, type TransactionRecord } from '@/lib/api';
import { formatMoney } from '@/lib/currency';
import { useI18n } from '@/lib/i18n';

const PAGE_SIZE = 30;

function dayInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (kind: string) => parts.find(part => part.type === kind)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function defaultRange(timeZone: string): { from: string; to: string } {
  const to = dayInZone(new Date(), timeZone);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}

function displayLocale(locale: string): string {
  return locale === 'he' ? 'he-IL' : locale === 'fr' ? 'fr-FR' : 'en-US';
}

function tenderLabel(t: (key: string) => string, method: string): string {
  if (method === 'cash') return t('txnCash');
  if (method === 'credit_card' || method === 'card') return t('txnCard');
  if (method === 'bank_transfer') return t('txnBankTransfer');
  return method.replaceAll('_', ' ');
}

function railLabel(t: (key: string) => string, rail: string): string {
  if (rail === 'cash') return t('txnCash');
  if (rail === 'verifone_checkout') return t('txnRailCheckout');
  if (rail === 'victa_recorded') return t('txnRailVictaRecorded');
  if (rail === 'card_recorded_unverified') return t('txnRailCardUnverified');
  if (rail === 'bank_transfer') return t('txnBankTransfer');
  if (rail === 'sumit') return 'Sumit';
  if (rail === 'payplus') return 'PayPlus';
  if (rail === 'cibus') return 'Cibus';
  return t('txnRailUnknown');
}

function TenderIcon({ method }: { method: string }) {
  const Icon = method === 'cash' ? Banknote : method === 'bank_transfer' ? ArrowLeftRight : CreditCard;
  return <Icon aria-hidden="true" className="size-5 shrink-0 text-[var(--fg-muted)]" />;
}

function movementLabel(t: (key: string) => string, kind: TransactionRecord['kind']): string {
  return kind === 'refund' ? t('txnRefund') : kind === 'void' ? t('txnVoid') : kind === 'sale' ? t('txnSale') : t('txnDetails');
}

function movementAmount(row: TransactionRecord, grouped = false): string {
  const signedMinor = row.kind === 'sale' ? row.amount_minor : -row.amount_minor;
  return formatMoney(signedMinor / 100, row.currency, { grouped });
}

/** Read-only cross-channel payment history, separate from order fulfillment. */
export default function TransactionsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const [range, setRange] = useState(() => defaultRange('UTC'));
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [timeZoneError, setTimeZoneError] = useState(false);
  const [timeZoneRetry, setTimeZoneRetry] = useState(0);
  const [source, setSource] = useState<ListTransactionsParams['source'] | ''>('');
  const [method, setMethod] = useState<ListTransactionsParams['method'] | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ListTransactionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    setTimeZone(null);
    setTimeZoneError(false);
    getRestaurant(rid).then(restaurant => {
      if (!active) return;
      const zone = restaurant.timezone || 'Asia/Jerusalem';
      setRange(defaultRange(zone));
      setPage(0);
      setTimeZone(zone);
    }).catch(() => { if (active) setTimeZoneError(true); });
    return () => { active = false; };
  }, [rid, timeZoneRetry]);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!timeZone || range.from > range.to) return;
    const sequence = ++request.current;
    setLoading(true);
    setError('');
    try {
      const data = await listTransactions(rid, {
        from: range.from, to: range.to, source: source || undefined,
        method: method || undefined, q: query || undefined,
        limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      });
      if (sequence !== request.current) return;
      setResult(data);
      setSelectedId(current => data.transactions.some(row => row.id === current) ? current : null);
    } catch (cause) {
      if (sequence === request.current) {
        setResult(null);
        setError(cause instanceof Error ? cause.message : t('txnLoadFailed'));
      }
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, [rid, range.from, range.to, source, method, query, page, t, timeZone]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  const selected = useMemo(() => result?.transactions.find(row => row.id === selectedId) ?? null, [result, selectedId]);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(displayLocale(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone ?? 'UTC' }), [locale, timeZone]);
  const dayName = useMemo(() => new Intl.DateTimeFormat(displayLocale(locale), { dateStyle: 'full', timeZone: timeZone ?? 'UTC' }), [locale, timeZone]);
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; rows: TransactionRecord[] }[] = [];
    for (const row of result?.transactions ?? []) {
      const date = new Date(row.occurred_at);
      const key = dayInZone(date, timeZone ?? 'UTC');
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) groups.push({ key, label: dayName.format(date), rows: [row] });
      else last.rows.push(row);
    }
    return groups;
  }, [result, dayName, timeZone]);

  function changeRange(field: 'from' | 'to', value: string) {
    setRange(current => ({ ...current, [field]: value }));
    setPage(0);
  }

  const invalidRange = range.from > range.to;
  const totals = Object.entries(result?.totals_by_currency ?? {});
  const recordedReturns = Object.entries(result?.recorded_returns_by_currency ?? {});
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{t('transactions')}</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">{t('txnIntro')}</p>
      </div>
      <button type="button" onClick={() => void load()} aria-label={t('refresh')}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]">
        <RefreshCw aria-hidden="true" className="size-4" />{t('refresh')}
      </button>
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <label className="grid gap-1 text-xs font-medium text-[var(--fg-muted)]">{t('txnFrom')}
        <input type="date" value={range.from} max={range.to} onChange={event => changeRange('from', event.target.value)}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-transparent px-3 text-sm text-[var(--fg)]" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-[var(--fg-muted)]">{t('txnTo')}
        <input type="date" value={range.to} min={range.from} onChange={event => changeRange('to', event.target.value)}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-transparent px-3 text-sm text-[var(--fg)]" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-[var(--fg-muted)]">{t('txnSource')}
        <select value={source} onChange={event => { setSource(event.target.value as ListTransactionsParams['source']); setPage(0); }}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)]">
          <option value="">{t('txnAllSources')}</option><option value="pos">{t('txnPos')}</option><option value="online">{t('txnOnline')}</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-[var(--fg-muted)]">{t('txnMethod')}
        <select value={method} onChange={event => { setMethod(event.target.value as ListTransactionsParams['method']); setPage(0); }}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)]">
          <option value="">{t('txnAllMethods')}</option><option value="cash">{t('txnCash')}</option><option value="credit_card">{t('txnCard')}</option><option value="bank_transfer">{t('txnBankTransfer')}</option>
        </select>
      </label>
      <label className="relative grid min-w-48 flex-1 gap-1 text-xs font-medium text-[var(--fg-muted)]">{t('search')}
        <span className="relative"><Search aria-hidden="true" className="absolute inset-y-0 start-3 my-auto size-4" />
          <input type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={t('txnSearchHint')}
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-transparent ps-10 pe-3 text-sm text-[var(--fg)]" /></span>
      </label>
      {timeZone && <span className="self-center text-xs text-[var(--fg-muted)]" dir="ltr">{timeZone}</span>}
    </div>

    {timeZoneError && <div role="alert" className="rounded-xl border border-[var(--line)] p-5 text-sm text-[var(--danger-500)]">{t('txnLoadFailed')} <button type="button" className="ms-2 underline" onClick={() => setTimeZoneRetry(value => value + 1)}>{t('retry')}</button></div>}
    {invalidRange && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('txnInvalidRange')}</p>}
    {!timeZoneError && !invalidRange && error && <div role="alert" className="rounded-xl border border-[var(--line)] p-5 text-sm text-[var(--danger-500)]">{error}</div>}
    {!timeZoneError && !invalidRange && !error && <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">{t('txnConfirmedCount')}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{result?.total ?? '—'}</p>
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">{t('txnCollectedTotal')}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{totals.length ? totals.map(([currency, minor]) => formatMoney(minor / 100, currency, { grouped: true })).join(' · ') : '—'}</p>
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">{t('txnRecordedReturns')}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{recordedReturns.length ? recordedReturns.map(([currency, minor]) => formatMoney(-minor / 100, currency, { grouped: true })).join(' · ') : '—'}</p>
      </div>
    </div>}

    {!timeZoneError && !invalidRange && !error && <div className="grid min-h-[32rem] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] lg:grid-cols-[minmax(19rem,36%)_minmax(0,1fr)]">
      <section aria-label={t('transactions')} className="border-b border-[var(--line)] lg:border-b-0 lg:border-e">
        <div className="border-b border-[var(--line)] px-5 py-4 text-sm font-semibold">{t('transactions')} <span className="font-normal text-[var(--fg-muted)]">({result?.total ?? 0})</span></div>
        {loading ? <p role="status" className="p-8 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : grouped.length === 0 ?
          <p className="p-8 text-sm text-[var(--fg-muted)]">{t('txnEmpty')}</p> : grouped.map(group => <div key={group.key}>
            <h2 className="border-b border-[var(--line)] bg-[var(--surface-2)] px-5 py-2 text-xs font-semibold capitalize text-[var(--fg-muted)]">{group.label}</h2>
            {group.rows.map(row => <button type="button" key={row.id} onClick={() => setSelectedId(row.id)}
              aria-pressed={selectedId === row.id} className={`flex min-h-20 w-full items-center gap-3 border-b border-[var(--line)] px-5 text-start transition-colors hover:bg-[var(--surface-2)] ${selectedId === row.id ? 'bg-[var(--surface-2)]' : ''}`}>
              {row.kind === 'sale' ? <TenderIcon method={row.method} /> : <RotateCcw aria-hidden="true" className="size-5 shrink-0 text-[var(--fg-muted)]" />}
              <span className="min-w-0 flex-1"><span className="block font-semibold tabular-nums">{movementAmount(row)}</span>
                <span className="block truncate text-sm text-[var(--fg-muted)]">{row.kind === 'sale' ? row.items.length ? row.items.join(', ') : tenderLabel(t, row.method) : movementLabel(t, row.kind)}</span></span>
              <time className="text-xs tabular-nums text-[var(--fg-muted)]">{new Intl.DateTimeFormat(displayLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone: timeZone ?? 'UTC' }).format(new Date(row.occurred_at))}</time>
            </button>)}
          </div>)}
        <div className="flex items-center justify-between gap-3 p-4 text-sm">
          <button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="min-h-11 rounded-lg border border-[var(--line)] px-3 disabled:opacity-40">{t('previous')}</button>
          <span className="text-[var(--fg-muted)]">{page + 1} / {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(page + 1)} className="min-h-11 rounded-lg border border-[var(--line)] px-3 disabled:opacity-40">{t('next')}</button>
        </div>
      </section>
      <section aria-label={t('txnDetails')} className="min-w-0 p-5 md:p-8">
        {selected ? <div className="mx-auto max-w-2xl space-y-8">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[var(--fg-muted)]">{movementLabel(t, selected.kind)}</p><h2 className="mt-1 text-2xl font-semibold tabular-nums">{movementAmount(selected, true)}</h2></div>
            <button type="button" aria-label={t('close')} onClick={() => setSelectedId(null)} className="flex size-11 items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"><X aria-hidden="true" className="size-5" /></button></div>
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
            <DetailRow label={t('txnDate')} value={dateTime.format(new Date(selected.occurred_at))} />
            <DetailRow label={t('txnStatus')} value={t('txnCompleted')} />
            <DetailRow label={t('txnMethod')} value={tenderLabel(t, selected.method)} />
            <DetailRow label={t('txnSource')} value={selected.source === 'pos' ? t('txnPos') : t('txnOnline')} />
            <DetailRow label={t('txnPaymentRail')} value={railLabel(t, selected.payment_rail)} />
            {selected.reference && <DetailRow label={t('txnReference')} value={selected.reference} />}
          </div>
          {selected.items.length > 0 && <div><h3 className="mb-3 font-semibold">{t('txnItems')}</h3><ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{selected.items.map((item, index) => <li key={`${item}-${index}`} className="py-3 text-sm">{item}</li>)}</ul></div>}
          {selected.allocations.some(allocation => allocation.order_id) && <div><h3 className="mb-3 font-semibold">{t('txnLinkedOrders')}</h3><div className="flex flex-wrap gap-2">{selected.allocations.filter(allocation => allocation.order_id).map((allocation, index) =>
            <Link key={`${allocation.order_id}-${index}`} href={`/${rid}/orders/${allocation.order_id}`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-3 text-sm text-[var(--action)] hover:underline">#{allocation.order_id}</Link>)}</div></div>}
          <p className="text-xs text-[var(--fg-muted)]">{t('txnReadOnlyHint')}</p>
        </div> : <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-[var(--fg-muted)]">{t('txnSelect')}</div>}
      </section>
    </div>}
  </div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-2 py-3"><span className="text-[var(--fg-muted)]">{label}</span><span className="font-medium" dir="auto">{value}</span></div>;
}
