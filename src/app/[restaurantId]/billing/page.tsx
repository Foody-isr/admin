'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, CreditCard, Mail } from 'lucide-react';
import { changePlan, getSubscription, type PlanTier, type SubscriptionDetail, type SubscriptionEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, PageHead, Section } from '@/components/ds';

const PLANS: { tier: PlanTier; price: number | null; features: string[] }[] = [
  { tier: 'starter', price: 299, features: ['posScreen', 'menuManagement', 'receiptPrinting', 'pickupAndTakeaway', 'pushNotifications'] },
  { tier: 'premium', price: 799, features: ['everythingInStarter', 'qrDineIn', 'onlinePayments', 'delivery', 'stockManagement', 'advancedAnalytics', 'whatsappNotifications'] },
  { tier: 'enterprise', price: null, features: ['everythingInPremium', 'multiRestaurant', 'customApiAccess', 'prioritySupport'] },
];
const statusLabels: Record<string, string> = { trial: 'freeTrial', active: 'active', past_due: 'pastDue', deactivated: 'deactivated', cancelled: 'cancelled' };
const eventLabels: Record<string, string> = { payment_succeeded: 'billingEventPaid', payment_failed: 'billingEventFailed', activated: 'billingEventActivated', deactivated: 'billingEventDeactivated', trial_started: 'billingEventTrial', card_updated: 'billingEventCard', reactivated: 'billingEventReactivated', plan_changed: 'billingEventPlan', cancelled: 'billingEventCancelled' };
function checkedSubscription(value: SubscriptionDetail, rid: number): SubscriptionDetail {
  if (!value || value.restaurant_id !== rid || typeof value.plan_tier !== 'string' || typeof value.status !== 'string' || (value.events != null && !Array.isArray(value.events))) throw new Error('Incomplete subscription');
  return { ...value, events: value.events ?? [] };
}

/** Review this restaurant's subscription and confirm owner-only plan changes. */
export default function BillingPage() {
  const { restaurantId } = useParams();
  return <BillingWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function BillingWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n(), { user } = useAuth(), { isOwner, loading: permissionsLoading } = usePermissions();
  // Both the scoped role middleware and the handler's account-role check apply.
  const canEdit = !permissionsLoading && isOwner && (user?.role === 'owner' || user?.role === 'superadmin');
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<PlanTier | null>(null), [confirmation, setConfirmation] = useState<PlanTier | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [readError, setReadError] = useState(false);
  const lock = useRef(false), lifetime = useRef({ generation: 0, sequence: 0 });
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const next = checkedSubscription(await getSubscription(rid), rid); if (current()) setSubscription(next); }
    catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation++; }; }, [load]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, []);
  const readAfterChange = async (target: PlanTier, generation: number) => {
    const next = checkedSubscription(await getSubscription(rid), rid);
    if (generation !== lifetime.current.generation) return;
    setSubscription(next); setPending(null); setReadError(false);
    setNotice(next.plan_tier === target ? 'billingPlanVerified' : 'billingPlanDifferent');
  };
  const apply = async () => {
    const target = confirmation; setConfirmation(null);
    if (!canEdit || !target || lock.current || pending || subscription?.plan_tier === target) return;
    lock.current = true; setBusy(true); setNotice(null); setReadError(false);
    const generation = lifetime.current.generation;
    try {
      await changePlan(rid, target);
      if (generation !== lifetime.current.generation) return;
      setPending(target);
      try { await readAfterChange(target, generation); }
      catch { if (generation === lifetime.current.generation) setReadError(true); }
    } catch { if (generation === lifetime.current.generation) setPending(target); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(false); } }
  };
  const verify = async () => {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true); setReadError(false);
    const generation = lifetime.current.generation;
    try { await readAfterChange(pending, generation); }
    catch { if (generation === lifetime.current.generation) setReadError(true); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(false); } }
  };
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('billingDateUnknown');
  const planName = (tier: string) => PLANS.some(plan => plan.tier === tier) ? t(tier) : tier;
  const amount = (event: SubscriptionEvent) => {
    if (event.amount == null) return null;
    if (!Number.isFinite(event.amount)) return t('billingAmountUnknown');
    if (/^[A-Za-z]{3}$/.test(event.currency ?? '')) return new Intl.NumberFormat(locale, { style: 'currency', currency: event.currency!.toUpperCase() }).format(event.amount);
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(event.amount)} · ${t('billingCurrencyUnknown')}`;
  };
  const statusTone = subscription?.status === 'active' ? 'success' : subscription?.status === 'deactivated' ? 'danger' : subscription?.status === 'past_due' ? 'warning' : 'neutral';
  return <div className="mx-auto max-w-[980px] space-y-6">
    <PageHead title={t('billing')} desc={t('billingDesc')} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--line)] p-5"><p className="text-sm text-[var(--danger-500)]">{t('billingLoadError')}</p><Button onClick={() => void load()}>{t('retry')}</Button></div> : subscription && <>
      <Section title={t('subscription')}>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><div><p className="text-sm">{t('currentPlan')}</p><p className="mt-2 text-2xl font-semibold">{planName(subscription.plan_tier)}</p></div><Badge tone={statusTone}>{statusLabels[subscription.status] ? t(statusLabels[subscription.status]) : subscription.status}</Badge></div>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          {[[subscription.status === 'trial' && subscription.trial_ends_at, 'trialEnds'], [subscription.status === 'active' && subscription.current_period_end, 'nextBilling'], [subscription.status === 'past_due' && subscription.grace_period_until, 'gracePeriod']].map(([value, label]) => typeof value === 'string' && <div key={String(label)}><dt className="text-sm text-[var(--fg-muted)]">{t(String(label))}</dt><dd className="mt-1 text-sm font-semibold"><bdi>{date(value)}</bdi></dd></div>)}
          {subscription.card_last_four && <div><dt className="text-sm text-[var(--fg-muted)]">{t('paymentMethod')}</dt><dd className="mt-1 flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4 shrink-0" aria-hidden="true" /><bdi>{subscription.card_brand} •••• {subscription.card_last_four}</bdi></dd></div>}
        </dl>
        {subscription.status === 'deactivated' && <p className="mt-4 text-sm leading-6 text-[var(--danger-500)]">{t('accountDeactivated')}</p>}
      </Section>
      {pending && <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--danger-500)] p-5"><p className="text-sm font-semibold">{t('billingChangeUnconfirmed').replace('{plan}', planName(pending))}</p><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('billingVerifyHint')}</p>{readError && <p className="text-sm text-[var(--danger-500)]">{t('billingReadError')}</p>}<Button variant="secondary" disabled={busy} onClick={() => void verify()}>{t('billingReadSubscription')}</Button></div>}
      {notice && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t(notice)}</p>}
      <section aria-label={t('plans')} className="space-y-4">
        <div><h2 className="text-lg font-semibold">{t('plans')}</h2>{!canEdit && <p className="mt-2 text-sm text-[var(--fg-muted)]">{t('billingOwnerOnly')}</p>}</div>
        <div className="grid gap-4 lg:grid-cols-3">{PLANS.map(plan => {
          const current = subscription.plan_tier === plan.tier;
          return <article key={plan.tier} className={`flex min-w-0 flex-col rounded-r-lg border bg-[var(--surface)] p-5 ${current ? 'border-[var(--brand-ink)]' : 'border-[var(--line)]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">{planName(plan.tier)}</h3>{current && <Badge>{t('current')}</Badge>}</div>
            <p className="mt-3 text-xl font-semibold">{plan.price == null ? t('custom') : <><bdi>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(plan.price)}</bdi><span className="ms-1 text-sm font-normal text-[var(--fg-muted)]">{t('billingPerMonth')}</span></>}</p>
            <ul className="my-5 flex-1 space-y-3">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm leading-5 text-[var(--fg-muted)]"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{t(feature)}</span></li>)}</ul>
            {!current && plan.tier !== 'enterprise' && canEdit && <Button variant="secondary" disabled={busy || !!pending} className="w-full whitespace-normal py-2 leading-5" onClick={() => setConfirmation(plan.tier)}>{t('switchToPlan').replace('{plan}', planName(plan.tier))}</Button>}
            {!current && plan.tier === 'enterprise' && <Button asChild variant="secondary" className="w-full whitespace-normal py-2 leading-5"><a href="mailto:support@foody-pos.co.il?subject=Enterprise%20Plan">{t('contactSales')}</a></Button>}
          </article>;
        })}</div>
      </section>
      <Section title={t('paymentHistory')}>
        {subscription.events.length === 0 ? <p className="text-sm text-[var(--fg-muted)]">{t('billingHistoryEmpty')}</p> : <ol className="divide-y divide-[var(--line)]">{subscription.events.map(event => <li key={event.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><div className="min-w-0"><p dir="auto" className="break-words text-sm font-medium">{eventLabels[event.event_type] ? t(eventLabels[event.event_type]) : event.event_type.replace(/_/g, ' ')}</p><p className="mt-1 text-xs text-[var(--fg-muted)]"><bdi>{date(event.created_at)}</bdi></p></div>{event.amount != null && <span className="shrink-0 text-sm font-semibold tabular-nums"><bdi>{amount(event)}</bdi></span>}</li>)}</ol>}
        <p className="mt-5 text-xs leading-5 text-[var(--fg-muted)]">{t('billingDatesZone')} <bdi>{Intl.DateTimeFormat().resolvedOptions().timeZone}</bdi></p>
      </Section>
    </>}
    {!loading && <div className="flex items-start gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><Mail className="mt-1 size-5 shrink-0 text-[var(--brand-ink)]" aria-hidden="true" /><p className="min-w-0 text-sm leading-6 text-[var(--fg-muted)]">{t('billingManagedBySupport')} <a className="break-words font-medium text-[var(--brand-ink)] underline underline-offset-4" href="mailto:support@foody-pos.co.il?subject=Billing"><bdi>support@foody-pos.co.il</bdi></a></p></div>}
    <ConfirmDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} title={t('switchToPlan').replace('{plan}', planName(confirmation ?? 'starter'))} description={t('billingPlanChangeHint')} confirmLabel={t('confirm')} cancelLabel={t('cancel')} onConfirm={() => void apply()} />
  </div>;
}
