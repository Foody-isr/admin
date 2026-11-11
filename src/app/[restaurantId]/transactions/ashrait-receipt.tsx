'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ds';
import { getTransactionAshraitReceipt } from '@/lib/api';
import { ashraitReceiptFields, type AshraitCardReceipt, type AshraitCopy } from '@/lib/ashrait-card-receipt';
import { useI18n, type Locale } from '@/lib/i18n';
import type { TransactionRecord } from '@/lib/transactions';

function printCopy(title: string, rows: Array<{ label: string; value: string }>, locale: Locale) {
  const preview = window.open('', '_blank', 'popup');
  if (!preview) throw new Error('ashraitReceiptPrintError');
  preview.opener = null;
  const document = preview.document;
  document.title = title;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
  const heading = document.createElement('h1');
  heading.style.fontSize = '16px';
  heading.textContent = title;
  const body = document.createElement('pre');
  body.style.whiteSpace = 'pre-wrap';
  body.style.overflowWrap = 'anywhere';
  body.style.fontFamily = 'system-ui, sans-serif';
  body.textContent = rows.map(({ label, value }) => label + ': ' + value).join('\n');
  document.body.replaceChildren(heading, body);
  preview.addEventListener('afterprint', () => preview.close(), { once: true });
  preview.focus();
  preview.print();
}

/** Reads and prints the card receipt for a single selected transaction. */
export function TransactionAshraitReceipt({ rid, row }: { rid: number; row: TransactionRecord }) {
  const { t, locale } = useI18n();
  const key = row.ashrait_receipt_key;
  const reference = row.reference;
  const [receipt, setReceipt] = useState<AshraitCardReceipt>();
  const [loadError, setLoadError] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key || !reference) return;
    const request = new AbortController();
    void getTransactionAshraitReceipt(rid, key, reference, request.signal).then(value => {
      if (!request.signal.aborted) setReceipt(value);
    }).catch(() => {
      if (!request.signal.aborted) setLoadError(true);
    });
    return () => request.abort();
  }, [rid, key, reference, retry]);

  const eligible = row.source === 'pos' && row.method === 'credit_card' && !row.id.startsWith('provider:') &&
    (['victa_recorded', 'verifone_terminal'].includes(row.payment_rail) || /^[0-9]{23}$/.test(reference ?? ''));
  if (!key && !eligible) return null;
  const copyNames = { customer: t('ashraitReceiptCustomer'), merchant: t('ashraitReceiptMerchant') };

  return <section className="space-y-3 border-t border-[var(--border)] pt-4">
    <h3 className="font-semibold">{t('ashraitReceiptDetails')}</h3>
    {!key ? <p className="text-sm text-[var(--fg-muted)]">{t('ashraitReceiptUnavailable')}</p>
      : loadError || !reference ? <div role="alert">
        <p>{t('ashraitReceiptLoadError')}</p>
        <Button variant="secondary" onClick={() => { setLoadError(false); setRetry(value => value + 1); }}>{t('retry')}</Button>
      </div> : !receipt ? <p role="status">{t('loading')}</p>
        : (['customer', 'merchant'] as const).filter(copy => receipt[copy]).map((copy: AshraitCopy) => {
          const fields = ashraitReceiptFields(receipt, copy, locale);
          return <details key={copy} className="rounded-lg border border-[var(--border)] p-3">
            <summary className="cursor-pointer font-medium">{copyNames[copy]}</summary>
            <dl className="my-3 space-y-2">
              {fields.map(({ key, label, value }) => <div className="grid grid-cols-2 gap-3 text-sm" key={key}>
                <dt className="text-[var(--fg-muted)]">{label}</dt>
                <dd className="break-words" dir="auto">{value}</dd>
              </div>)}
            </dl>
            <Button variant="secondary" onClick={() => {
              setPrintError(false);
              try { printCopy(copyNames[copy], fields, locale); } catch { setPrintError(true); }
            }}>{t('ashraitReceiptPrint')}</Button>
          </details>;
        })}
    {printError && <p role="alert">{t('ashraitReceiptPrintError')}</p>}
  </section>;
}
