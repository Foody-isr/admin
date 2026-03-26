'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getSubscription, setupBilling, changePlan, SubscriptionDetail, PlanTier } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { CreditCardIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const STATUS_CONFIG = {
  trial: { labelKey: 'freeTrial' as const, color: 'badge-accepted', icon: CheckCircleIcon },
  active: { labelKey: 'active' as const, color: 'badge-ready', icon: CheckCircleIcon },
  past_due: { labelKey: 'pastDue' as const, color: 'badge-in-kitchen', icon: ExclamationTriangleIcon },
  deactivated: { labelKey: 'deactivated' as const, color: 'badge-rejected', icon: ExclamationTriangleIcon },
  cancelled: { labelKey: 'cancelled' as const, color: 'badge-neutral', icon: ExclamationTriangleIcon },
};

const PLANS: { tier: PlanTier; nameKey: string; priceKey: string; featureKeys: string[] }[] = [
  {
    tier: 'starter',
    nameKey: 'starter',
    priceKey: '₪299/mo',
    featureKeys: ['posScreen', 'menuManagement', 'receiptPrinting', 'pickupAndTakeaway', 'pushNotifications'],
  },
  {
    tier: 'premium',
    nameKey: 'premium',
    priceKey: '₪799/mo',
    featureKeys: ['everythingInStarter', 'qrDineIn', 'onlinePayments', 'delivery', 'stockManagement', 'advancedAnalytics', 'whatsappNotifications'],
  },
  {
    tier: 'enterprise',
    nameKey: 'enterprise',
    priceKey: 'custom',
    featureKeys: ['everythingInPremium', 'multiRestaurant', 'customApiAccess', 'prioritySupport'],
  },
];

export default function BillingPage() {
  const { restaurantId } = useParams();
  const searchParams = useSearchParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Handle redirect back from PayPlus
    const setup = searchParams.get('setup');
    if (setup === 'success') setMessage(t('billingSetupSuccess'));
    else if (setup === 'failed') setMessage(t('billingSetupFailed'));

    getSubscription(rid).then(setSub).finally(() => setLoading(false));
  }, [rid, searchParams]);

  const handleSetupBilling = async () => {
    setBillingLoading(true);
    try {
      const { payment_url } = await setupBilling(rid);
      window.location.href = payment_url;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : t('couldNotStartBilling'));
    } finally {
      setBillingLoading(false);
    }
  };

  const handleChangePlan = async (tier: PlanTier) => {
    if (sub?.plan_tier === tier) return;
    if (!confirm(t('switchPlanConfirm').replace('{plan}', tier))) return;
    setPlanLoading(true);
    try {
      await changePlan(rid, tier);
      const updated = await getSubscription(rid);
      setSub(updated);
      setMessage(t('planUpdated'));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : t('couldNotChangePlan'));
    } finally {
      setPlanLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const statusCfg = sub ? STATUS_CONFIG[sub.status] : null;
  const needsBillingSetup = sub && (sub.status === 'trial' || sub.status === 'past_due') && !sub.payplus_recurring_uid;

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-fg-primary">{t('billing')}</h1>

      {message && (
        <div className={`p-4 rounded-standard text-sm font-medium ${
          message.startsWith('✓') ? 'bg-green-500/10 border border-green-500/20 text-status-ready'
          : message.startsWith('✗') ? 'bg-red-500/10 border border-red-500/20 text-status-rejected'
          : 'bg-blue-500/10 border border-blue-500/20 text-status-accepted'
        }`}>
          {message}
        </div>
      )}

      {/* Subscription status card */}
      {sub && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-fg-primary">{t('subscription')}</h2>
            {statusCfg && (
              <span className={`badge ${statusCfg.color}`}>{t(statusCfg.labelKey)}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-fg-secondary">{t('currentPlan')}</div>
              <div className="font-semibold text-fg-primary capitalize">{sub.plan_tier}</div>
            </div>
            {sub.trial_ends_at && sub.status === 'trial' && (
              <div>
                <div className="text-fg-secondary">{t('trialEnds')}</div>
                <div className="font-semibold text-fg-primary">
                  {new Date(sub.trial_ends_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.current_period_end && sub.status === 'active' && (
              <div>
                <div className="text-fg-secondary">{t('nextBilling')}</div>
                <div className="font-semibold text-fg-primary">
                  {new Date(sub.current_period_end).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.grace_period_until && sub.status === 'past_due' && (
              <div>
                <div className="text-fg-secondary">{t('gracePeriod')}</div>
                <div className="font-semibold text-red-600">
                  {new Date(sub.grace_period_until).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.card_last_four && (
              <div>
                <div className="text-fg-secondary">{t('paymentMethod')}</div>
                <div className="flex items-center gap-2 font-medium text-fg-primary">
                  <CreditCardIcon className="w-4 h-4" />
                  {sub.card_brand} •••• {sub.card_last_four}
                </div>
              </div>
            )}
          </div>

          {/* Setup / update billing CTA */}
          {(needsBillingSetup || sub.status === 'active') && (
            <button
              onClick={handleSetupBilling}
              disabled={billingLoading}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <CreditCardIcon className="w-4 h-4" />
              {billingLoading
                ? t('redirecting')
                : sub.card_last_four
                ? t('updatePaymentMethod')
                : t('setupBilling')}
            </button>
          )}

          {sub.status === 'deactivated' && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {t('accountDeactivated')}
            </div>
          )}
        </div>
      )}

      {/* Plan selection — only when a subscription exists */}
      {!loading && !sub && (
        <div className="card text-sm text-fg-secondary text-center py-8">
          {t('noActiveSubscription')}
        </div>
      )}
      {sub && (
      <div>
        <h2 className="font-semibold text-fg-primary mb-4">{t('plans')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = sub.plan_tier === plan.tier;
            const planName = t(plan.nameKey);
            return (
              <div
                key={plan.tier}
                className={`card relative flex flex-col ${isCurrent ? 'border-brand-500 ring-2 ring-brand-500' : ''}`}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 left-4 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {t('current')}
                  </span>
                )}
                <div className="mb-4">
                  <div className="font-bold text-fg-primary text-lg">{planName}</div>
                  <div className="text-brand-500 font-semibold">
                    {plan.tier === 'enterprise' ? t('custom') : plan.priceKey}
                  </div>
                </div>
                <ul className="space-y-1.5 flex-1 mb-6">
                  {plan.featureKeys.map((fk) => (
                    <li key={fk} className="flex items-center gap-2 text-sm text-fg-secondary">
                      <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {t(fk)}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.tier !== 'enterprise' && (
                  <button
                    onClick={() => handleChangePlan(plan.tier)}
                    disabled={planLoading}
                    className="btn-secondary w-full justify-center disabled:opacity-50"
                  >
                    {planLoading ? t('switching') : t('switchToPlan').replace('{plan}', planName)}
                  </button>
                )}
                {plan.tier === 'enterprise' && !isCurrent && (
                  <a
                    href="mailto:support@foody-pos.co.il?subject=Enterprise Plan"
                    className="btn-secondary w-full justify-center text-center"
                  >
                    {t('contactSales')}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Payment history */}
      {sub && sub.events && sub.events.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-fg-primary mb-4">{t('paymentHistory')}</h2>
          <div className="space-y-2">
            {sub.events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between text-sm py-2 border-b border-divider last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`badge ${
                    evt.event_type === 'payment_succeeded' ? 'badge-ready'
                    : evt.event_type === 'payment_failed' ? 'badge-rejected'
                    : 'badge-neutral'
                  }`}>
                    {evt.event_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-fg-secondary">
                  {evt.amount != null && (
                    <span className="font-medium text-fg-primary">₪{evt.amount.toFixed(0)}</span>
                  )}
                  <span>{new Date(evt.created_at).toLocaleDateString('he-IL')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
