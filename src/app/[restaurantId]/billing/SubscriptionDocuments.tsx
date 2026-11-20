'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Section } from '@/components/ds';
import { ApiError, downloadFoodyDocuments, getFoodyDocuments, resendFoodyDocument, setFoodyDocumentDelivery,
  type FoodyDocumentPage, type FoodyDocumentState } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const copy = {
  fr: {
    nativePending: 'Facture demandée à Verifone. Le PDF sera disponible après vérification de l’original.',
    nativeMail: 'Transmettre la boîte de test à Verifone pour les factures des prochains paiements',
    title: 'Factures d’abonnement', sandbox: 'Documents de test Invoice4U · Sans valeur fiscale', month: 'Mois du paiement', number: 'Nº de facture', state: 'État du document',
    all: 'Tous', pending: 'En préparation', ready: 'Disponible', review: 'À vérifier par Foody', legacy: 'Paiement antérieur à l’archive',
    empty: 'Aucun paiement correspondant.', loading: 'Chargement des documents…', unavailable: 'Foody doit connecter son dossier Invoice4U de test pour émettre les documents.',
    open: 'Voir le PDF', save: 'Télécharger', resend: 'Renvoyer par e-mail', zip: 'Télécharger le mois (.zip)', next: 'Suivants', previous: 'Précédents',
    mail: 'Recevoir les confirmations et les PDF dans la boîte de test', mailOff: 'L’envoi par e-mail sera disponible après configuration de la boîte de test par Foody.',
    queued: 'Envoi demandé.', failed: 'Impossible de terminer cette action. Réessaie dans un instant.', noFiles: 'Aucun PDF disponible pour ce mois.',
    tax: 'TVA', net: 'HT', gross: 'TTC', period: 'Période', close: 'Fermer', retry: 'Réessayer', mailReview: 'Envoi à vérifier', sent: 'E-mail envoyé', mailPending: 'Envoi en attente',
    monthly: 'Mensuel', annual: 'Annuel', upgrade: 'Ajustement', reset: 'Effacer les filtres',
  },
  en: {
    nativePending: 'Invoice requested from Verifone. The PDF will be available once the original has been verified.',
    nativeMail: 'Share the test inbox with Verifone for invoices on future payments',
    title: 'Subscription invoices', sandbox: 'Invoice4U test documents · No fiscal value', month: 'Payment month', number: 'Invoice no.', state: 'Document status',
    all: 'All', pending: 'Preparing', ready: 'Available', review: 'Foody review needed', legacy: 'Payment predates archive',
    empty: 'No matching payments.', loading: 'Loading documents…', unavailable: 'Foody needs to connect its Invoice4U test account to issue documents.',
    open: 'View PDF', save: 'Download', resend: 'Resend by email', zip: 'Download month (.zip)', next: 'Next', previous: 'Previous',
    mail: 'Send confirmations and PDFs to the test inbox', mailOff: 'Email delivery will be available once Foody configures the test inbox.',
    queued: 'Delivery requested.', failed: 'This action could not be completed. Try again shortly.', noFiles: 'There are no PDFs available for this month.',
    tax: 'VAT', net: 'Excl. VAT', gross: 'Incl. VAT', period: 'Period', close: 'Close', retry: 'Retry', mailReview: 'Check email delivery', sent: 'Email sent', mailPending: 'Email pending',
    monthly: 'Monthly', annual: 'Annual', upgrade: 'Adjustment', reset: 'Clear filters',
  },
  he: {
    nativePending: 'הוגשה בקשה לחשבונית דרך Verifone. קובץ ה־PDF יהיה זמין לאחר אימות מסמך המקור.',
    nativeMail: 'העברת כתובת תיבת הבדיקה ל־Verifone עבור חשבוניות של תשלומים עתידיים',
    title: 'חשבוניות המינוי', sandbox: 'מסמכי בדיקה של Invoice4U · ללא תוקף לצורכי מס', month: 'חודש התשלום', number: 'מספר חשבונית', state: 'מצב המסמך',
    all: 'הכול', pending: 'בהכנה', ready: 'זמין', review: 'נדרשת בדיקה של Foody', legacy: 'התשלום בוצע לפני פתיחת הארכיון',
    empty: 'לא נמצאו תשלומים מתאימים.', loading: 'המסמכים נטענים…', unavailable: 'כדי להפיק מסמכים, על Foody לחבר את חשבון הבדיקה שלה ב־Invoice4U.',
    open: 'הצגת PDF', save: 'הורדה', resend: 'שליחה חוזרת בדוא״ל', zip: 'הורדת החודש (ZIP)', next: 'הבא', previous: 'הקודם',
    mail: 'שליחת אישורי תשלום ומסמכי PDF לתיבת הבדיקה', mailOff: 'שליחת דוא״ל תהיה זמינה לאחר הגדרת תיבת הבדיקה על ידי Foody.',
    queued: 'בקשת השליחה נקלטה.', failed: 'לא ניתן היה להשלים את הפעולה. אפשר לנסות שוב בעוד רגע.', noFiles: 'אין מסמכי PDF זמינים לחודש זה.',
    tax: 'מע״מ', net: 'לפני מע״מ', gross: 'כולל מע״מ', period: 'תקופה', close: 'סגירה', retry: 'ניסיון נוסף', mailReview: 'משלוח הדוא״ל דורש בדיקה', sent: 'הדוא״ל נשלח', mailPending: 'הדוא״ל ממתין לשליחה',
    monthly: 'חודשי', annual: 'שנתי', upgrade: 'התאמה', reset: 'ניקוי מסננים',
  },
};

function saveBlob(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Browse the authenticated owner's archive of Foody subscription payments. */
export function SubscriptionDocuments({ rid, lastPayment }: { rid: number; lastPayment: string }) {
  const { locale } = useI18n();
  const t = copy[locale];
  const [month, setMonth] = useState('');
  const [number, setNumber] = useState('');
  const [state, setState] = useState('');
  const [pages, setPages] = useState<number[]>([]);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<FoodyDocumentPage | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const running = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const before = pages.at(-1);
  useEffect(() => {
    const ctl = new AbortController();
    lifetime.current = ctl;
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (number) params.set('number', number);
    if (state) params.set('state', state);
    if (before) params.set('before', String(before));
    setError(false);
    setPage(null);
    getFoodyDocuments(rid, params, controller.signal).then(result => {
      if (!controller.signal.aborted) setPage(result);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [rid, month, number, state, before, revision, lastPayment]);
  useEffect(() => {
    if (!page?.documents.some(d => (d.issue_state === 'pending' && (page.archive_connected ?? page.issuer_configured)) ||
      (d.mail_state === 'pending' && page.email_enabled && page.email_available && d.issue_state === 'ready'))) return;
    const timer = window.setTimeout(() => setRevision(n => n + 1), 30000);
    return () => window.clearTimeout(timer);
  }, [page]);
  useEffect(() => {
    if (!preview) return;
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(value / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
  function filter(setter: (v: string) => void, value: string) { setPages([]); setNotice(''); setter(value); }
  async function action(work: (signal: AbortSignal) => Promise<void>) {
    if (running.current || !lifetime.current) return;
    const signal = lifetime.current.signal;
    running.current = true; setBusy(true); setNotice('');
    try { await work(signal); }
    catch (err) { if (!signal.aborted) setNotice(err instanceof ApiError && err.status === 404 ? t.noFiles : t.failed); }
    finally { running.current = false; if (!signal.aborted) setBusy(false); }
  }
  function file(selection: { payment: number } | { month: string }, filename: string, view = false) {
    void action(async signal => {
      const blob = await downloadFoodyDocuments(rid, selection, signal);
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (view) setPreview({ url, filename });
      else { saveBlob(url, filename); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    });
  }
  return <Section id="documents" title={t.title} desc={t.sandbox}>
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>{t.month}<input className="mt-1 block w-full rounded-lg border bg-transparent p-2" type="month" value={month} onChange={e => filter(setMonth, e.target.value)} /></label>
        <label>{t.number}<input className="mt-1 block w-full rounded-lg border bg-transparent p-2" inputMode="numeric" dir="ltr" maxLength={18} value={number} onChange={e => filter(setNumber, e.target.value.replace(/\D/g, ''))} /></label>
        <label>{t.state}<select className="mt-1 block w-full rounded-lg border bg-[var(--surface)] p-2" value={state} onChange={e => filter(setState, e.target.value)}>
          <option value="">{t.all}</option>{(['ready', 'pending', 'review', 'legacy'] as FoodyDocumentState[]).map(key => <option key={key} value={key}>{t[key]}</option>)}
        </select></label>
      </div>
      {(month || state || number) && <div className="flex flex-wrap gap-2">
        {month && <Button variant="secondary" disabled={busy} onClick={() => file({ month }, 'Foody-Invoice4U-TEST-' + month + '.zip')}>{t.zip}</Button>}
        <Button variant="ghost" onClick={() => { setMonth(''); setNumber(''); setState(''); setPages([]); setNotice(''); }}>{t.reset}</Button>
      </div>}
      {error ? <div role="alert">{t.failed} <Button variant="secondary" onClick={() => setRevision(n => n + 1)}>{t.retry}</Button></div> :
        !page ? <p role="status">{t.loading}</p> : <>
          {!page.issuer_configured && <p>{t.unavailable}</p>}
          {page.documents.length === 0 && <p>{t.empty}</p>}
          <ul className="divide-y divide-[var(--line)]">
            {page.documents.map(doc => {
              const filename = 'Foody-Invoice4U-TEST-' + doc.number + '.pdf';
              return <li key={doc.payment_id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong dir="auto">{doc.title}{doc.number && <> · <bdi>#{doc.number}</bdi></>}</strong><strong><bdi>{money(doc.price.total_minor)}</bdi> {t.gross}</strong>
                </div>
                <p><bdi>{date(doc.paid_at)}</bdi> · {t[doc.kind === 'upgrade' ? 'upgrade' : doc.cycle]} · {doc.verifone_invoice && doc.issue_state === 'pending' ? t.nativePending : t[doc.issue_state]}</p>
                <p className="text-[var(--fg-muted)]"><bdi>{money(doc.price.net_minor)}</bdi> {t.net} · {t.tax} <bdi>{money(doc.price.vat_minor)}</bdi>
                  {doc.period_end && <> · {t.period} <bdi>{date(doc.period_start)} – {date(doc.period_end)}</bdi></>}</p>
                {doc.mail_state !== 'off' && <p>{doc.mail_state === 'sent' ? t.sent : doc.mail_state === 'review' ? t.mailReview : t.mailPending}</p>}
                {doc.issue_state === 'ready' && <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => file({ payment: doc.payment_id }, filename, true)}>{t.open}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => file({ payment: doc.payment_id }, filename)}>{t.save}</Button>
                  {(doc.resend_available ?? page.email_available) && page.email_enabled && <Button size="sm" variant="ghost" disabled={busy || doc.mail_state === 'sending' || doc.mail_state === 'pending'} onClick={() => void action(async signal => {
                    await resendFoodyDocument(rid, doc.payment_id); if (!signal.aborted) { setNotice(t.queued); setRevision(n => n + 1); }
                  })}>{t.resend}</Button>}
                </div>}
              </li>;
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            {!!pages.length && <Button variant="secondary" onClick={() => setPages(v => v.slice(0, -1))}>{t.previous}</Button>}
            {page.has_more && <Button variant="secondary" onClick={() => setPages(v => [...v, page.documents[page.documents.length - 1].payment_id])}>{t.next}</Button>}
          </div>
          {page.email_available ? <label className="flex items-center gap-2"><input type="checkbox" checked={page.email_enabled} disabled={busy}
            onChange={e => { const enabled = e.target.checked; void action(async signal => { await setFoodyDocumentDelivery(rid, enabled); if (!signal.aborted) setRevision(n => n + 1); }); }} />{page.native_invoices ? t.nativeMail : t.mail}</label> : <p className="text-[var(--fg-muted)]">{t.mailOff}</p>}
        </>}
      <p role="status">{notice}</p>
    </div>
    {preview && <dialog ref={dialog} onClose={() => setPreview(null)} className="m-auto w-[94vw] max-w-4xl rounded-lg bg-[var(--surface)] p-4 text-[var(--fg)] backdrop:bg-black/50" aria-label={t.open}>
      <div className="mb-3 flex flex-wrap justify-between gap-2"><Button variant="secondary" onClick={() => saveBlob(preview.url, preview.filename)}>{t.save}</Button>
        <Button autoFocus onClick={() => dialog.current?.close()}>{t.close}</Button></div>
      <iframe className="h-[70vh] w-full" title={t.open} src={preview.url} />
    </dialog>}
  </Section>;
}
