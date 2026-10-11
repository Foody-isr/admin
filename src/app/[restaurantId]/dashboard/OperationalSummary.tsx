'use client';

import Link from 'next/link';
import { CircleCheck, CircleAlert, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ListOrdersResult } from '@/lib/api';
import { orderDetailPath, ordersPaymentAttentionPath, type OrdersPaymentAttentionScope } from '@/lib/orders/routes';

/** A compact contextual notice surfaces the next action for the selected service. */
export default function OperationalSummary({ restaurantId, review, readyOrders, payments, scope, loading }: {
  restaurantId: number; review: ListOrdersResult | null;
  readyOrders: ListOrdersResult | null; payments: ListOrdersResult | null; scope: OrdersPaymentAttentionScope; loading: boolean;
}) {
  const { t } = useI18n();
  const unavailable = !review || !readyOrders || !payments;
  const reviewOrder = review?.orders[0];
  const readyOrder = readyOrders?.orders[0];
  const action = reviewOrder ? { label: t('dashboardActionReview'), href: orderDetailPath(restaurantId, reviewOrder.id),
    message: t('dashboardUrgentReview').replace('{count}', String(review.total)) }
    : payments && payments.total > 0 ? { label: t('dashboardActionCollect'), href: ordersPaymentAttentionPath(restaurantId, scope),
      message: t(payments.total === 1 ? 'dashboardUrgentPayment' : 'dashboardUrgentPayments').replace('{count}', String(payments.total)) }
    : readyOrder ? { label: t('dashboardActionReady'), href: orderDetailPath(restaurantId, readyOrder.id),
      message: t('dashboardUrgentReady').replace('{count}', String(readyOrders.total)) } : null;
  return <section className="dashboard-operations" aria-label={t('dashboardNow')}>
    <div className="dashboard-attention">
      <span className={`dashboard-attention-icon${action ? ' needs-attention' : ''}`}>{action ? <CircleAlert size={20} /> : <CircleCheck size={20} />}</span>
      <div><h2>{t('dashboardNow')}</h2><p>{unavailable ? t(loading ? 'loading' : 'dashboardNowUnavailable') : action?.message ?? t('dashboardNoUrgent')}</p></div>
      {action && <Link className="dashboard-action" href={action.href}>{action.label}<ArrowRight size={16} /></Link>}
    </div>
  </section>;
}
