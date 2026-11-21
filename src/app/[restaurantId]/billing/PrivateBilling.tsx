'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronDown, FileText, LockKeyhole, ReceiptText } from 'lucide-react';
import { ApiError, getFoodyBilling, getFoodyBillingUsage, payFoodyBillingRegisteredCard, reconcileFoodyBilling, startFoodyBillingCheckout,
  stopFoodyBillingRenewal, type FoodyBillingCycle, type FoodyBillingOffer, type FoodyBillingUsage, type FoodyBillingView } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, ConfirmDialog } from '@/components/ds';
import { SubscriptionDocuments } from './SubscriptionDocuments';
import { SubscriptionAdditions } from './SubscriptionAdditions';
import { ModuleAccessSummary, ModuleOnboarding } from './ModuleOnboarding';

import { AgreementSummary, BillingHeader, PaymentMethod, portalCopy, useBillingSection } from './BillingPortal';
import styles from './billing-portal.module.css';

type Availability = FoodyBillingView | 'loading' | 'error' | 'legacy';

/** Show the private offer to its owner; other accounts retain legacy billing. */
export function FoodyBillingEntry({ rid, children }: { rid: number; children: ReactNode }) {
  const { t } = useI18n();
  const [view, setView] = useState<Availability>('loading');
  const [reload, setReload] = useState(0);
  const [compare, setCompare] = useState(false);
  const section = useBillingSection();
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
      if (!request.signal.aborted) setView(data?.plan_catalog || data?.onboarding || data?.offer?.id ? data : 'error');
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
  const comparePublic = !!view.plan_catalog && (compare || !view.offer || !view.offer.owner_selected && view.lifecycle?.state === 'expired');
  const invitation = view.onboarding && !view.onboarding.inherited_access && (!view.offer || view.onboarding.trial_days > 0 && view.onboarding.access.status === 'pending' && !view.payment);
  if (comparePublic || invitation) {
    return <div className={styles.portal}>
      <BillingHeader section={section === 'usage' ? 'subscription' : section} showUsage={false} />
      {section === 'documents' ? <SubscriptionDocuments rid={rid} lastPayment={String(view.payment?.id ?? '')} />
        : <ModuleOnboarding restaurantId={rid} view={view} compare={comparePublic} onConfirmed={next => {setView(next); setCompare(false);}} />}
    </div>;
  }
  return <PrivateBilling key={view.offer?.id} rid={rid} initial={view} returnUnverified={returnUnverified} onCompare={next => {setView(next); setCompare(true);}} />;
}

const openStatus = new Set(['creating', 'pending', 'review']);
const metricKeys = [
  'openai_whisper_requests', 'anthropic_stock_input_tokens', 'anthropic_stock_output_tokens',
  'twilio_verify_sms_requests', 'anthropic_assistant_input_tokens', 'anthropic_assistant_output_tokens', 'whatsapp_order_messages',
];

function PrivateBilling({ rid, initial, returnUnverified, onCompare }: { rid: number; initial: FoodyBillingView; returnUnverified: boolean; onCompare: (view: FoodyBillingView) => void }) {
  const { t, locale } = useI18n();
  const section = useBillingSection();
  const c = portalCopy[locale];
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
  if (!offer) return <p role="alert">{t('billingLoadError')}</p>;
  const open = !!payment && openStatus.has(payment.status);
  const amended = !!agreement && agreement.offer_id !== offer.id;
  const upgrade = amended && offer.previous_offer_id === agreement?.offer_id && !!offer.upgrade_period_end;
  const freeUpgrade = upgrade && offer.upgrade_minor === 0;
  const auto = !!agreement?.renews && (agreement.cycle === 'annual' ? !!view.annual_renewal_enabled : view.monthly_enabled) && (!amended || upgrade);
  const canPay = view.due && view.checkout_enabled && !open && (!auto || upgrade);
  const accepted = !amended ? offer : view.accepted_offer?.id === agreement?.offer_id ? view.accepted_offer : null;
  const showOffer = !agreement || amended || canPay;
  const price = cycle ? offer[cycle] : null;
  const reset = () => { setCycle(null); setAccept(false); setRenew(false); };

  async function action(kind: 'pay' | 'resume' | 'verify' | 'stop' | 'pay-registered') {
    if (!offer) return;
    if (lock.current) return;
    if (kind === 'pay' && (!canPay || !cycle || !accept || (cycle === 'monthly' && ((!freeUpgrade && !renew) || !view.monthly_enabled)))) return;
    if (kind === 'resume' && (!view.can_resume || !payment)) return;
    if (kind === 'pay-registered' && (!view.can_pay_registered_card || !payment?.id)) return;
    lock.current = true; setBusy(true); setError(''); setConfirmStop(false);
    try {
      if (kind === 'pay' || kind === 'resume') {
        const chosen = kind === 'resume' ? payment!.cycle : cycle!;
        const result = await startFoodyBillingCheckout(rid, {
          offer_id: kind === 'resume' ? payment!.offer_id : offer.id, cycle: chosen, accept_terms: true,
          accept_renewal: kind === 'resume' ? (chosen === 'monthly' || !!payment?.accept_renewal)
            : freeUpgrade ? (chosen === 'monthly' || !!agreement?.renews) : renew, locale,
        });
        const url = new URL(result.checkout_url);
        if (upgrade && (offer.upgrade_minor ?? 0) === 0 && url.origin === window.location.origin && url.pathname === `/${rid}/billing` && !url.search && !url.hash) {
          const updated = await getFoodyBilling(rid); if (mounted.current) { setView(updated); reset(); } return;
        }
        if (url.protocol !== 'https:' || !(url.hostname === 'cst.checkout.vficloud.net' || url.hostname.endsWith('.test-gsc.vfims.com')) || url.username || url.password || url.port) {
          throw new Error('Invalid sandbox checkout link');
        }
        if (mounted.current) window.location.assign(url.href);
      } else {
        const data = kind === 'pay-registered' ? await payFoodyBillingRegisteredCard(rid, payment!.id)
          : kind === 'stop' ? await stopFoodyBillingRenewal(rid) : await reconcileFoodyBilling(rid);
        if (mounted.current) { setView(data); reset(); }
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof ApiError && e.licence ? 'foodyLicenceExceeded' : kind === 'pay' || kind === 'resume' ? 'foodyPilotCheckoutError' : kind === 'stop' ? 'foodyPilotStopError' : 'foodyPilotVerifyError');
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

  return <div className={styles.portal}>
    <BillingHeader section={section} />
    {section === 'documents' && <SubscriptionDocuments rid={rid} lastPayment={payment?.id + ':' + payment?.status} />}
    {section === 'usage' && <section id="usage" tabIndex={-1} className={styles.panel}>
      <h2>{t('foodyPilotUsage')}</h2>
      <p className={styles.hint}>{t('foodyPilotUsageHint')}</p>
      {usageError && <p role="alert">{t('foodyPilotUsageUnavailable')}</p>}
      {!usage && !usageError && <p role="status">{t('loading')}</p>}
      {usage && <>
        <p className={styles.usageMonth}><bdi>{usage.month} UTC</bdi></p>
        {!usage.complete && <p role="status">{t('foodyPilotUsageUnavailable')}</p>}
        <dl className={styles.metrics}>{metricKeys.map(key => {
          const value = usage.observed[key];
          return value == null ? null : <div key={key}><dt>{t('foodyPilotUsage_' + key)}</dt><dd>{new Intl.NumberFormat(locale).format(value)}</dd></div>;
        })}</dl>
      </>}
    </section>}
    {section === 'subscription' && <div id="subscription" tabIndex={-1} className={styles.stack}>
      {agreement && <>
        <AgreementSummary agreement={agreement} accepted={accepted} scheduled={auto} money={money} date={date} />
        <div className={styles.accountRow}>
          {agreement.card_last_four && <PaymentMethod lastFour={agreement.card_last_four} />}
          {payment?.status === 'paid' && <div className={styles.item}>
            <CheckCircle2 className={styles.itemIcon} aria-hidden="true" />
            <div><p className={styles.label}>{c.last}</p><strong role="status">{t('foodyPilotStatus_paid')} · <bdi>{money(payment.amount_minor)}</bdi></strong></div>
          </div>}
          <a className={styles.shortcut} href="#documents"><FileText size={16} aria-hidden="true" />{c.history}<ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
        <div className={styles.disclosures}>
          {accepted && <OfferDetails offer={accepted} publicTerms={view.onboarding?.mode === 'public' && !amended} label={c.detailsAccepted} />}
          <details className={styles.disclosure}>
            <summary>{c.manage}<ChevronDown size={16} aria-hidden="true" /></summary>
            <div className={styles.detailBody}>
              <p>{t('foodyPilotPaidUntil').replace('{date}', date(agreement.period_end))}</p>
              {!agreement.renews && <p>{t('foodyPilotNoRenewal')}</p>}
              {amended && <p>{t(upgrade ? 'foodyUpgradeNextPrice' : 'foodyPilotAmended')}</p>}
              {agreement.renews && <Button variant="secondary" disabled={busy || open} onClick={() => setConfirmStop(true)}>{t('foodyPilotStop')}</Button>}
            </div>
          </details>
        </div>
      </>}
      {payment && (payment.status !== 'paid' || !agreement) && <section className={styles.paymentNotice}>
        <ReceiptText size={20} aria-hidden="true" /><div>
          <p role="status"><strong>{t(view.can_pay_registered_card ? 'foodyPilotCardVerified' : 'foodyPilotStatus_' + payment.status)}</strong> · <bdi>{money(payment.amount_minor)}</bdi></p>
          {open && <p className={styles.hint}>{t('foodyPilotRef')} <bdi>{payment.reference}</bdi></p>}
          {open && <div className={styles.actions}>
            {view.can_pay_registered_card
              ? <Button disabled={busy} onClick={() => void action('pay-registered')}>{t('foodyPilotPayRegistered').replace('{total}', money(payment.amount_minor))}</Button>
              : <Button variant="secondary" disabled={busy} onClick={() => void action('verify')}>{t('foodyPilotVerify')}</Button>}
            {view.can_resume && <Button disabled={busy} onClick={() => void action('resume')}>{t('foodyPilotResume')}</Button>}
          </div>}
        </div>
      </section>}
      {error && <p role="alert" className={styles.error}>{t(error)}</p>}
      {showOffer && <section className={styles.offer} aria-labelledby="foody-offer">
        <div className={styles.offerHead}>
          <p className={styles.kicker}>{offer.owner_selected ? t('foodyPlanSelected') : amended ? c.offer : t('foodyPilotOffer')}</p>
          <h2 id="foody-offer" dir="auto">{offer.title}</h2>
          {view.plan_catalog && !open && <Button variant="secondary" onClick={() => onCompare(view)}>{t('foodyPlanChange')}</Button>}
          {amended && <p>{t(upgrade ? 'foodyUpgradeNextPrice' : 'foodyPilotAmended')}</p>}
          <p>{t('foodyPilotAvailable').replace('{date}', date(offer.start_date + 'T12:00:00Z'))}</p>
          {offer.commercial_source?.valid_until && <p>{t('foodyPilotQuoteUntil').replace('{date}', date(offer.commercial_source.valid_until + 'T12:00:00Z'))}</p>}
        </div>
        {upgrade && <div className={styles.upgrade}>
          <strong>{t('foodyUpgradeDueNow').replace('{amount}', money(offer.upgrade_minor ?? 0))}</strong>
          <p>{t('foodyUpgradePeriod').replace('{date}', date(offer.upgrade_period_end!))}</p>
          <p>{t('foodyUpgradeReviewHint')}</p>
          {offer.scope && <><p>{offer.scope.modules.map(id => view.onboarding?.catalog.products.find(p => p.id === id)?.name[locale] ?? id).join(', ')}</p>
            <ul>{Object.entries(offer.scope.seats).filter(([, n]) => n != null).map(([key, n]) => <li key={key}>{t('foodyLicence_' + key)} · {String(n)}</li>)}</ul></>}
        </div>}
        <OfferDetails key={offer.id} offer={offer} publicTerms={view.onboarding?.mode === 'public'} label={c.details} />
        {!open && <>
          {!view.checkout_enabled && <p className={styles.info}>{t('foodyPilotCheckoutDisabled')}</p>}
          {view.checkout_enabled && !view.monthly_enabled && <p className={styles.info}>{t('foodyPilotMonthlyDisabled')}</p>}
          <form className={styles.checkout} onSubmit={event => { event.preventDefault(); void action('pay'); }}>
            <fieldset className={styles.choices} disabled={busy}>
              <legend>{canPay ? t('foodyPilotChoose') : c.rates}</legend>
              {(['monthly', 'annual'] as const).filter(choice => offer[choice].total_minor > 0 && (!upgrade || choice === offer.upgrade_cycle)).map(choice => {
                const rate = offer[choice];
                const selectable = canPay && (choice === 'annual' || view.monthly_enabled);
                const Option = selectable ? 'label' : 'div';
                return <Option key={choice} className={styles.option} data-selected={cycle === choice} data-selectable={selectable}>
                  <span className={styles.optionHead}>
                    <strong>{t(choice === 'monthly' ? 'foodyPilotMonthly' : 'foodyPilotAnnual')}</strong>
                    {selectable && <input name="cycle" type="radio" checked={cycle === choice} onChange={() => { reset(); setCycle(choice); }} />}
                  </span>
                  <span className={styles.optionPrice}><bdi>{money(rate.total_minor)}</bdi> <small>{t('foodyPilotGross')}</small></span>
                  <span className={styles.hint}><bdi>{money(rate.net_minor)}</bdi> {t('foodyPilotNet')} + <bdi>{money(rate.vat_minor)}</bdi> {t('foodyPilotVAT')}</span>
                  {selectable && <span className={styles.optionNote}>{t(choice === 'monthly' ? 'foodyPilotMonthlyNote' : view.annual_renewal_enabled ? 'foodyPilotAnnualOptional' : 'foodyPilotAnnualNote')}</span>}
                </Option>;
              })}
            </fieldset>
            {canPay && <aside className={styles.order}>
              <h3>{c.summary}</h3>
              {cycle && price ? <>
                <div className={styles.total}><span>{c.dueNow}</span><strong><bdi>{money(upgrade ? offer.upgrade_minor! : price.total_minor)}</bdi> <small>{t('foodyPilotGross')}</small></strong></div>
                {!!view.registration_minor && !freeUpgrade && (cycle === 'monthly' || renew) && <p>{t('foodyPilotRegistrationAmount').replace('{amount}', money(view.registration_minor)).replace('{total}', money(upgrade ? offer.upgrade_minor! : price.total_minor))}</p>}
                <label><input type="checkbox" checked={accept} disabled={busy} onChange={e => setAccept(e.target.checked)} />{t('foodyPilotAccept')}</label>
                {!freeUpgrade && (cycle === 'monthly' || view.annual_renewal_enabled) && <label><input type="checkbox" checked={renew} disabled={busy} onChange={e => setRenew(e.target.checked)} />{t(cycle === 'monthly' ? 'foodyPilotAuthorize' : 'foodyPilotAuthorizeAnnual').replace('{total}', money(price.total_minor))}</label>}
                <Button type="submit" disabled={busy || !accept || cycle === 'monthly' && !freeUpgrade && !renew}>{t(freeUpgrade ? 'confirm' : 'foodyPilotPay')}</Button>
                {!freeUpgrade && <small className={styles.secure}><LockKeyhole size={14} aria-hidden="true" />{c.payBy}</small>}
              </> : <p>{c.selectCycle}</p>}
            </aside>}
          </form>
        </>}
      </section>}
      {view.onboarding && <ModuleAccessSummary restaurantId={rid} onboarding={view.onboarding} />}
      {view.onboarding?.access.enforced && <SubscriptionAdditions rid={rid} view={view} onPrepared={next => { setView(next); reset(); }} />}
    </div>}
    <ConfirmDialog open={confirmStop} title={t('foodyPilotStop')} description={t('foodyPilotStopHint')} confirmLabel={t('foodyPilotStop')}
      cancelLabel={t('cancel')} onOpenChange={next => { if (!next) setConfirmStop(false); }} onConfirm={() => void action('stop')} />
  </div>;
}

function OfferDetails({ offer, publicTerms, label }: { offer: FoodyBillingOffer; publicTerms?: boolean; label: string }) {
  const { t } = useI18n();
  return <details className={styles.disclosure}>
    <summary>{label}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className={styles.detailBody}>
      <p className={styles.hint}>{t('foodyPilotVersion').replace('{version}', String(offer.version))}</p>
      {offer.includes && <div><h3>{t('foodyPilotIncludes')}</h3><p dir="auto">{offer.includes}</p></div>}
      {(publicTerms || offer.terms) && <div><h3>{t('foodyPilotTerms')}</h3><p dir="auto">{publicTerms ? t('foodyModulePublicTerms') : offer.terms}</p></div>}
    </div>
  </details>;
}
