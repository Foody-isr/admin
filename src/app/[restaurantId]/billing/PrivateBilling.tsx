'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, getFoodyBilling, getFoodyBillingUsage, reconcileFoodyBilling, startFoodyBillingCheckout,
  stopFoodyBillingRenewal, type FoodyBillingCycle, type FoodyBillingUsage, type FoodyBillingView } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, PageHead, Section } from '@/components/ds';

type Availability = FoodyBillingView | 'loading' | 'error' | 'legacy';

/** Show the private offer to its owner; other accounts retain legacy billing. */
export function FoodyBillingEntry({ rid, children }: { rid: number; children: ReactNode }) {
  const { t } = useI18n();
  const [view, setView] = useState<Availability>('loading');
  const [reload, setReload] = useState(0);
  const [returnUnverified, setReturnUnverified] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    getFoodyBilling(rid, request.signal).then(async (data) => {
      if (request.signal.aborted) return;
      if (data?.offer?.id && new URLSearchParams(window.location.search).has('foody_billing_return')) {
        if (data.payment && openStatus.has(data.payment.status)) {
          try { data = await reconcileFoodyBilling(rid, request.signal); }
          catch { if (!request.signal.aborted) setReturnUnverified(true); }
        }
        // Ignore and strip gateway query fields; the server verifies its own claim.
        if (!request.signal.aborted) window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      if (!request.signal.aborted) setView(data?.offer?.id ? data : 'error');
    }).catch((error) => {
      if (request.signal.aborted) return;
      setView(error instanceof ApiError && (error.status === 404 || error.status === 403) ? 'legacy' : 'error');
    });
    return () => request.abort();
  }, [rid, reload]);
  if (view === 'legacy') return children;
  if (view === 'loading') return <p role="status" className="py-10 text-center">{t('loading')}</p>;
  if (view === 'error') return <div role="alert" className="mx-auto max-w-[980px] space-y-3 py-8">
    <p>{t('billingLoadError')}</p><Button onClick={() => { setView('loading'); setReload((n) => n + 1); }}>{t('retry')}</Button>
  </div>;
  return <PrivateBilling rid={rid} initial={view} returnUnverified={returnUnverified} />;
}

const openStatus = new Set(['creating', 'pending', 'review']);
const metricKeys = [
  'google_autocomplete', 'google_details', 'google_geocoding', 'google_routes', 'google_optimization_single', 'google_optimization_fleet',
  'google_tiles', 'geoapify_credits', 'openai_whisper_requests', 'anthropic_stock_input_tokens', 'anthropic_stock_output_tokens',
  'twilio_verify_sms_requests', 'anthropic_assistant_input_tokens', 'anthropic_assistant_output_tokens', 'whatsapp_order_messages',
];

function PrivateBilling({ rid, initial, returnUnverified }: { rid: number; initial: FoodyBillingView; returnUnverified: boolean }) {
  const { t, locale } = useI18n();
  const [view, setView] = useState(initial);
  const [cycle, setCycle] = useState<FoodyBillingCycle | null>(null);
  const [accept, setAccept] = useState(false);
  const [renew, setRenew] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [usage, setUsage] = useState<FoodyBillingUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(returnUnverified ? 'foodyPilotVerifyError' : '');
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const work = new AbortController();
    getFoodyBillingUsage(rid, work.signal).then((data) => { if (!work.signal.aborted) setUsage(data); },
      () => { if (!work.signal.aborted) setUsageError(true); });
    return () => { mounted.current = false; work.abort(); };
  }, [rid]);

  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(minor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
  const { offer, agreement, payment } = view;
  const open = !!payment && openStatus.has(payment.status);
  const amended = !!agreement && agreement.offer_id !== offer.id;
  const auto = !!agreement?.renews && view.monthly_enabled && !amended;
  const canPay = view.due && view.checkout_enabled && !open && !auto;
  const price = cycle ? offer[cycle] : null;
  const reset = () => { setCycle(null); setAccept(false); setRenew(false); };

  async function action(kind: 'pay' | 'resume' | 'verify' | 'stop') {
    if (lock.current) return;
    if (kind === 'pay' && (!canPay || !cycle || !accept || (cycle === 'monthly' && (!renew || !view.monthly_enabled)))) return;
    if (kind === 'resume' && (!view.can_resume || !payment)) return;
    lock.current = true; setBusy(true); setError(''); setConfirmStop(false);
    try {
      if (kind === 'pay' || kind === 'resume') {
        const chosen = kind === 'resume' ? payment!.cycle : cycle!;
        const result = await startFoodyBillingCheckout(rid, {
          offer_id: kind === 'resume' ? payment!.offer_id : offer.id, cycle: chosen, accept_terms: true,
          accept_renewal: chosen === 'monthly', locale,
        });
        const url = new URL(result.checkout_url);
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.test-gsc.vfims.com') || url.username || url.password || url.port) {
          throw new Error('Invalid sandbox checkout link');
        }
        if (mounted.current) window.location.assign(url.href);
      } else {
        const data = await (kind === 'stop' ? stopFoodyBillingRenewal(rid) : reconcileFoodyBilling(rid));
        if (mounted.current) { setView(data); reset(); }
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(kind === 'pay' || kind === 'resume' ? 'foodyPilotCheckoutError' : kind === 'stop' ? 'foodyPilotStopError' : 'foodyPilotVerifyError');
      // Re-read the durable attempt and current version after an unknown response.
      if (kind !== 'verify') {
        try {
          const data = await getFoodyBilling(rid);
          if (mounted.current) { setView(data); reset(); }
        } catch {
          if (mounted.current && e instanceof ApiError && e.status === 409) reset();
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <div className="mx-auto max-w-[980px] space-y-6">
    <PageHead title={t('billing')} desc={t('foodyPilotIntro')} />
    <Section title={t('foodyPilotOffer')}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="warning">{t('foodyPilotSandbox')}</Badge>
          <span className="text-sm text-[var(--fg-muted)]">{t('foodyPilotVersion').replace('{version}', String(offer.version))}</span></div>
        <h2 className="text-2xl font-semibold" dir="auto">{offer.title}</h2>
        <p className="text-sm text-[var(--fg-muted)]">{t('foodyPilotAvailable').replace('{date}', date(offer.start_date + 'T12:00:00Z'))}</p>
        <div><h3 className="text-sm font-semibold">{t('foodyPilotIncludes')}</h3><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{offer.includes}</p></div>
        <div><h3 className="text-sm font-semibold">{t('foodyPilotTerms')}</h3><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{offer.terms}</p></div>
        {agreement && <div className="space-y-2 rounded-lg border border-[var(--line)] p-3 text-sm">
          <p>{t('foodyPilotPaidUntil').replace('{date}', date(agreement.period_end))} · {t(agreement.cycle === 'monthly' ? 'foodyPilotMonthly' : 'foodyPilotAnnual')}
            {agreement.card_last_four && <> · <bdi>•••• {agreement.card_last_four}</bdi></>}
          </p>
          {amended && <p>{t('foodyPilotAmended')}</p>}
          {auto && <p>{t('foodyPilotNextDebit').replace('{date}', date(agreement.period_end)).replace('{total}', money((view.accepted_offer ?? offer).monthly.total_minor))}</p>}
          {agreement.cycle === 'monthly' && !agreement.renews && <p>{t('foodyPilotNoRenewal')}</p>}
          {amended && view.accepted_offer && <details><summary>{t('foodyPilotAcceptedTerms')}</summary>
            <p className="whitespace-pre-wrap break-words" dir="auto">{view.accepted_offer.includes}</p>
            <p className="whitespace-pre-wrap break-words" dir="auto">{view.accepted_offer.terms}</p>
          </details>}
          {agreement.renews && <Button variant="secondary" disabled={busy || open} onClick={() => setConfirmStop(true)}>{t('foodyPilotStop')}</Button>}
        </div>}
        {payment && <div className="space-y-2 rounded-lg border border-[var(--line)] p-3 text-sm">
          <p role="status">{t('foodyPilotStatus_' + payment.status)} · <bdi>{money(payment.amount_minor)}</bdi></p>
          {open && <p className="text-[var(--fg-muted)]">{t('foodyPilotRef')} <bdi>{payment.reference}</bdi></p>}
          {open && <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void action('verify')}>{t('foodyPilotVerify')}</Button>
            {view.can_resume && <Button disabled={busy} onClick={() => void action('resume')}>{t('foodyPilotResume')}</Button>}
          </div>}
        </div>}
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}</p>}
        {!view.checkout_enabled && <p className="text-sm">{t('foodyPilotCheckoutDisabled')}</p>}
        {view.checkout_enabled && !view.monthly_enabled && <p className="text-sm">{t('foodyPilotMonthlyDisabled')}</p>}
        <form onSubmit={(event) => { event.preventDefault(); void action('pay'); }}>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 font-semibold">{t('foodyPilotChoose')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['monthly', 'annual'] as const).map((choice) => {
                const rate = offer[choice];
                return <label key={choice} className={'space-y-1 rounded-lg border p-3 ' + (cycle === choice ? 'border-[var(--fg)]' : 'border-[var(--line)]')}>
                  <span className="flex items-center gap-2 font-semibold">
                    <input name="cycle" type="radio" checked={cycle === choice} disabled={!canPay || choice === 'monthly' && !view.monthly_enabled}
                      onChange={() => { reset(); setCycle(choice); }} />
                    {t(choice === 'monthly' ? 'foodyPilotMonthly' : 'foodyPilotAnnual')}
                  </span>
                  <span className="block font-semibold"><bdi>{money(rate.total_minor)}</bdi> <span className="text-sm font-normal">{t('foodyPilotGross')}</span></span>
                  <span className="block text-sm text-[var(--fg-muted)]"><bdi>{money(rate.net_minor)}</bdi> {t('foodyPilotNet')} + <bdi>{money(rate.vat_minor)}</bdi> {t('foodyPilotVAT')}</span>
                  <span className="block text-sm">{t(choice === 'monthly' ? 'foodyPilotMonthlyNote' : 'foodyPilotAnnualNote')}</span>
                </label>;
              })}
            </div>
            {canPay && cycle && price && <>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />{t('foodyPilotAccept')}</label>
              {cycle === 'monthly' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />{t('foodyPilotAuthorize').replace('{total}', money(price.total_minor))}</label>}
              <Button type="submit" disabled={busy || !accept || cycle === 'monthly' && !renew}>{t('foodyPilotPay')}</Button>
            </>}
          </fieldset>
        </form>
      </div>
    </Section>
    <Section title={t('foodyPilotUsage')}>
      <p className="text-sm text-[var(--fg-muted)]">{t('foodyPilotUsageHint')}</p>
      {usageError && <p role="status" className="mt-2 text-sm">{t('foodyPilotUsageUnavailable')}</p>}
      {usage && <>
        <p className="mt-2 text-sm"><bdi>{usage.month} UTC</bdi></p>
        {!usage.complete && <p role="status" className="text-sm">{t('foodyPilotUsageUnavailable')}</p>}
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {metricKeys.map((key) => {
            const value = usage.quotas?.counters.find((c) => c.id === key)?.used ?? usage.observed[key];
            if (value == null) return null;
            return <div key={key} className="flex justify-between gap-2 rounded border border-[var(--line)] p-2"><dt>{t('foodyPilotUsage_' + key)}</dt><dd>{new Intl.NumberFormat(locale).format(value)}</dd></div>;
          })}
        </dl>
      </>}
    </Section>
    <ConfirmDialog open={confirmStop} title={t('foodyPilotStop')} description={t('foodyPilotStopHint')} confirmLabel={t('foodyPilotStop')}
      cancelLabel={t('cancel')} onOpenChange={(open) => { if (!open) setConfirmStop(false); }} onConfirm={() => void action('stop')} />
  </div>;
}
