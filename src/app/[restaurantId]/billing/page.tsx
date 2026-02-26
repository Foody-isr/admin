'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getSubscription, setupBilling, changePlan, SubscriptionDetail, PlanTier } from '@/lib/api';
import { CreditCardIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const STATUS_CONFIG = {
  trial: { label: 'Free Trial', color: 'bg-blue-100 text-blue-700', icon: CheckCircleIcon },
  active: { label: 'Active', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  past_due: { label: 'Past Due', color: 'bg-yellow-100 text-yellow-700', icon: ExclamationTriangleIcon },
  deactivated: { label: 'Deactivated', color: 'bg-red-100 text-red-700', icon: ExclamationTriangleIcon },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600', icon: ExclamationTriangleIcon },
};

const PLANS: { tier: PlanTier; name: string; price: string; features: string[] }[] = [
  {
    tier: 'starter',
    name: 'Starter',
    price: '₪299/mo',
    features: ['POS Screen', 'Menu Management', 'Receipt Printing', 'Pickup & Takeaway', 'Push Notifications'],
  },
  {
    tier: 'premium',
    name: 'Premium',
    price: '₪799/mo',
    features: ['Everything in Starter', 'QR Dine-In', 'Online Payments', 'Delivery', 'Stock Management', 'Advanced Analytics', 'WhatsApp Notifications'],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: ['Everything in Premium', 'Multi-Restaurant', 'Custom API Access', 'Priority Support'],
  },
];

export default function BillingPage() {
  const { restaurantId } = useParams();
  const searchParams = useSearchParams();
  const rid = Number(restaurantId);

  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Handle redirect back from PayPlus
    const setup = searchParams.get('setup');
    if (setup === 'success') setMessage('✓ Billing set up successfully! Your subscription is now active.');
    else if (setup === 'failed') setMessage('✗ Payment setup failed. Please try again.');

    getSubscription(rid).then(setSub).finally(() => setLoading(false));
  }, [rid, searchParams]);

  const handleSetupBilling = async () => {
    setBillingLoading(true);
    try {
      const { payment_url } = await setupBilling(rid);
      window.location.href = payment_url;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not start billing setup');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleChangePlan = async (tier: PlanTier) => {
    if (sub?.plan_tier === tier) return;
    if (!confirm(`Switch to the ${tier} plan?`)) return;
    setPlanLoading(true);
    try {
      await changePlan(rid, tier);
      const updated = await getSubscription(rid);
      setSub(updated);
      setMessage('Plan updated successfully.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not change plan');
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
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>

      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${
          message.startsWith('✓') ? 'bg-green-50 border border-green-200 text-green-700'
          : message.startsWith('✗') ? 'bg-red-50 border border-red-200 text-red-700'
          : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          {message}
        </div>
      )}

      {/* Subscription status card */}
      {sub && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Subscription</h2>
            {statusCfg && (
              <span className={`badge ${statusCfg.color}`}>{statusCfg.label}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Current plan</div>
              <div className="font-semibold text-gray-900 capitalize">{sub.plan_tier}</div>
            </div>
            {sub.trial_ends_at && sub.status === 'trial' && (
              <div>
                <div className="text-gray-500">Trial ends</div>
                <div className="font-semibold text-gray-900">
                  {new Date(sub.trial_ends_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.current_period_end && sub.status === 'active' && (
              <div>
                <div className="text-gray-500">Next billing</div>
                <div className="font-semibold text-gray-900">
                  {new Date(sub.current_period_end).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.grace_period_until && sub.status === 'past_due' && (
              <div>
                <div className="text-gray-500">Grace period until</div>
                <div className="font-semibold text-red-600">
                  {new Date(sub.grace_period_until).toLocaleDateString('he-IL')}
                </div>
              </div>
            )}
            {sub.card_last_four && (
              <div>
                <div className="text-gray-500">Payment method</div>
                <div className="flex items-center gap-2 font-medium text-gray-900">
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
                ? 'Redirecting…'
                : sub.card_last_four
                ? 'Update payment method'
                : 'Set up billing'}
            </button>
          )}

          {sub.status === 'deactivated' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              Your account is deactivated due to a missed payment. Please contact support or set up billing to re-activate.
            </div>
          )}
        </div>
      )}

      {/* Plan selection */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = sub?.plan_tier === plan.tier;
            return (
              <div
                key={plan.tier}
                className={`card relative flex flex-col ${isCurrent ? 'border-brand-500 ring-2 ring-brand-500' : ''}`}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 left-4 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
                <div className="mb-4">
                  <div className="font-bold text-gray-900 text-lg">{plan.name}</div>
                  <div className="text-brand-500 font-semibold">{plan.price}</div>
                </div>
                <ul className="space-y-1.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.tier !== 'enterprise' && (
                  <button
                    onClick={() => handleChangePlan(plan.tier)}
                    disabled={planLoading}
                    className="btn-secondary w-full justify-center disabled:opacity-50"
                  >
                    {planLoading ? 'Switching…' : `Switch to ${plan.name}`}
                  </button>
                )}
                {plan.tier === 'enterprise' && !isCurrent && (
                  <a
                    href="mailto:support@foody-pos.co.il?subject=Enterprise Plan"
                    className="btn-secondary w-full justify-center text-center"
                  >
                    Contact Sales
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      {sub && sub.events && sub.events.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Payment History</h2>
          <div className="space-y-2">
            {sub.events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`badge ${
                    evt.event_type === 'payment_succeeded' ? 'bg-green-100 text-green-700'
                    : evt.event_type === 'payment_failed' ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {evt.event_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-gray-500">
                  {evt.amount != null && (
                    <span className="font-medium text-gray-900">₪{evt.amount.toFixed(0)}</span>
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
