'use client';

// Summit fiscal invoice: view, download, email, share. Moved verbatim from
// OrderDetailDrawer.tsx (2047-2306).

import { useEffect, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, DownloadIcon, FileTextIcon,
  LinkIcon, MailIcon, MessageCircleIcon, SendIcon,
} from 'lucide-react';
import { Button } from '@/components/ds';
import { getOrderInvoice, sendOrderInvoice, fetchOrderInvoicePdf, type Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { buildWhatsAppUrl } from '@/lib/receipt-share';

// ─── Invoice Section (Summit) ────────────────────────────────────────────────
// For a Summit-paid order, fetches the official invoice (number + downloadable
// PDF URL) and lets staff view/download it, email it via Summit (recipient
// editable), or share the link (WhatsApp / copy). Rendered only when the order
// carries a Summit document_id. No fiscal document is generated here — Summit
// already created it at payment.
//
// Supplementary invoices (from balance charges on already-paid orders) are
// listed below the original, each with its own Voir / Télécharger buttons.

// Shape stored by the server in external_metadata.supplementary_invoices.
// The server serializes `number` as a JSON string (Go string via datatypes.JSONMap),
// so we accept string | number and normalize to a numeric docNum at parse time.
interface SupplementaryInvoice {
  /** Numeric Summit document number, derived from the raw string the server stores. */
  number: number;
  amount: number;
}

// Parse supplementary_invoices safely — the field is typed as unknown in
// external_metadata. The server serializes `number` as a JSON string (Go string
// via datatypes.JSONMap), so we must accept string | number and coerce. We keep
// only entries whose `number` coerces to a positive integer (valid Summit document
// number); non-numeric UIDs (e.g. PayPlus transaction IDs) are dropped, which is
// correct — PayPlus orders have no downloadable invoice UI anyway.
function parseSupplements(order: Order): SupplementaryInvoice[] {
  const raw = order.external_metadata?.supplementary_invoices;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).flatMap((s) => {
    if (typeof s !== 'object' || s === null) return [];
    const row = s as Record<string, unknown>;
    const docNum = Number(row.number);
    const amount = Number(row.amount);
    if (!Number.isInteger(docNum) || docNum <= 0) return [];
    if (!Number.isFinite(amount)) return [];
    return [{ number: docNum, amount }];
  });
}

/**
 * How many fiscal documents this order carries, from external_metadata alone —
 * no fetch, so it is safe to call for the reference tab's count before the tab
 * is ever opened. Zero means the tab should not exist.
 *
 * This is the same parse the section itself uses, deliberately: the caller used
 * to test `supplementary_invoices.length > 0` on the raw array, which counted
 * PayPlus transaction UIDs the section then dropped — an "Invoice" heading over
 * an empty body.
 */
export function countOrderInvoices(order: Order): number {
  return (order.external_metadata?.document_number ? 1 : 0) + parseSupplements(order).length;
}

// A lightweight row for a single supplement invoice — its own PDF busy/error
// state so multiple rows are independently interactive.
function SupplementInvoiceRow({
  order,
  sup,
}: {
  order: Order;
  sup: SupplementaryInvoice;
}) {
  const { t } = useI18n();
  const [pdfBusy, setPdfBusy] = useState<false | 'view' | 'download'>(false);
  const [pdfError, setPdfError] = useState(false);

  const openPdf = async (mode: 'view' | 'download') => {
    setPdfBusy(mode);
    setPdfError(false);
    try {
      const blob = await fetchOrderInvoicePdf(order.restaurant_id, order.id, sup.number);
      const blobUrl = URL.createObjectURL(blob);
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `facture-${sup.number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(blobUrl, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--s-2)] text-fs-sm border-t border-[var(--line)] pt-[var(--s-2)]">
      <div className="flex items-center justify-between">
        <span className="font-medium">#{sup.number} · {sup.amount} ₪</span>
        <span className="text-fs-xs text-[var(--fg-muted)]">{t('supplementInvoice') || 'complément'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--s-2)]">
        <Button variant="secondary" size="sm" onClick={() => openPdf('view')} disabled={pdfBusy !== false}>
          <FileTextIcon className="size-3.5" /> {pdfBusy === 'view' ? `${t('loading')}…` : (t('invoiceView') || 'Voir')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => openPdf('download')} disabled={pdfBusy !== false}>
          <DownloadIcon className="size-3.5" /> {pdfBusy === 'download' ? `${t('loading')}…` : (t('invoiceDownload') || 'Télécharger')}
        </Button>
      </div>
      {pdfError && <span className="text-fs-xs text-[var(--danger-500)]">{t('invoiceUnavailable') || 'Facture indisponible'}</span>}
    </div>
  );
}

export function InvoiceSection({ order }: { order: Order }) {
  const { t } = useI18n();
  const hasPrimary = Boolean(order.external_metadata?.document_number);
  const [loading, setLoading] = useState(hasPrimary);
  const [failed, setFailed] = useState(false);
  const [invoice, setInvoice] = useState<{ document_number: number; document_url: string } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(order.customer_email || '');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<false | 'view' | 'download'>(false);
  const [pdfError, setPdfError] = useState(false);

  const supplements = parseSupplements(order);

  useEffect(() => {
    if (!hasPrimary) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    getOrderInvoice(order.restaurant_id, order.id)
      .then((inv) => { if (active) { setInvoice(inv); setLoading(false); } })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [order.restaurant_id, order.id, hasPrimary]);

  // Reset the send panel + recipient when a different order is shown in the
  // same reused drawer instance.
  useEffect(() => {
    setEmailDraft(order.customer_email || '');
    setSendOpen(false);
    setSendState('idle');
  }, [order.id, order.customer_email]);

  if (hasPrimary && loading) {
    return <div className="text-fs-sm text-[var(--fg-subtle)]">{t('invoiceLoading') || 'Chargement de la facture…'}</div>;
  }

  const shareBtn =
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-xs font-medium hover:bg-[var(--surface-2)]';

  const openPdf = async (mode: 'view' | 'download') => {
    if (!invoice) return;
    setPdfBusy(mode);
    setPdfError(false);
    try {
      const blob = await fetchOrderInvoicePdf(order.restaurant_id, order.id);
      const blobUrl = URL.createObjectURL(blob);
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `facture-${invoice.document_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(blobUrl, '_blank', 'noopener');
      }
      // Give the new tab / download time to read the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  const copyLink = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.document_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link still reachable via the other actions */
    }
  };

  const doSend = async () => {
    setSendState('sending');
    try {
      await sendOrderInvoice(order.restaurant_id, order.id, emailDraft.trim() || undefined);
      setSendState('sent');
      setSendOpen(false);
    } catch {
      setSendState('error');
    }
  };

  const waUrl = invoice
    ? buildWhatsAppUrl(
        order.customer_phone,
        t('invoiceShareMessage')
          .replace('{name}', order.customer_name ? ` ${order.customer_name}` : '')
          .replace('{number}', String(invoice.document_number))
          .replace('{id}', String(order.id))
          .replace('{url}', invoice.document_url)
          .trim(),
      )
    : null;

  return (
    <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
      {/* Primary invoice */}
      {hasPrimary && (failed || !invoice) ? (
        <div className="text-fs-sm text-[var(--danger-500)]">{t('invoiceUnavailable') || 'Facture indisponible'}</div>
      ) : invoice ? (
        <>
          <div className="flex items-center justify-between">
            <span className="font-medium">#{invoice.document_number}</span>
            <span className="text-fs-xs text-[var(--fg-muted)]">Summit</span>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            <Button variant="secondary" size="sm" onClick={() => openPdf('view')} disabled={pdfBusy !== false}>
              <FileTextIcon className="size-3.5" /> {pdfBusy === 'view' ? `${t('loading')}…` : (t('invoiceView') || 'Voir')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openPdf('download')} disabled={pdfBusy !== false}>
              <DownloadIcon className="size-3.5" /> {pdfBusy === 'download' ? `${t('loading')}…` : (t('invoiceDownload') || 'Télécharger')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSendOpen((v) => !v)}>
              <SendIcon className="size-3.5" /> {t('invoiceSend') || 'Envoyer la facture'}
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
          {sendOpen && (
            <div className="flex flex-col gap-[var(--s-2)] rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)]">
              <label htmlFor="invoice-recipient" className="text-fs-xs text-[var(--fg-muted)]">{t('invoiceRecipient') || 'Destinataire'}</label>
              <div className="flex flex-wrap items-center gap-[var(--s-2)]">
                <input
                  id="invoice-recipient"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="client@email.com"
                  className="flex-1 min-w-[180px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1 text-fs-sm"
                />
                <Button variant="primary" size="sm" onClick={doSend} disabled={sendState === 'sending'}>
                  <MailIcon className="size-3.5" />
                  {sendState === 'sending' ? (t('invoiceSending') || 'Envoi…') : (t('invoiceSendEmail') || 'Par email (via Summit)')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-[var(--s-2)]">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className={shareBtn}>
                    <MessageCircleIcon className="size-3.5" /> {t('shareWhatsApp')}
                  </a>
                )}
                <button onClick={copyLink} className={shareBtn}>
                  {copied ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
                  {copied ? (t('linkCopied') || 'Lien copié') : (t('copyLink') || 'Copier le lien')}
                </button>
              </div>
            </div>
          )}
          {sendState === 'sent' && <span className="text-fs-xs text-[var(--success-500)]">{t('invoiceSent') || 'Facture envoyée'}</span>}
          {sendState === 'error' && <span className="text-fs-xs text-[var(--danger-500)]">{t('invoiceSendError') || "Échec de l'envoi de la facture"}</span>}
          {pdfError && <span className="text-fs-xs text-[var(--danger-500)]">{t('invoiceUnavailable') || 'Facture indisponible'}</span>}
        </>
      ) : null}

      {/* Supplementary invoices — one row per balance charge */}
      {supplements.map((sup) => (
        <SupplementInvoiceRow key={sup.number} order={order} sup={sup} />
      ))}
    </div>
  );
}
