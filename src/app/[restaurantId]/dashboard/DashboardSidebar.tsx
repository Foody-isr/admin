'use client';

import Link from 'next/link';
import { useCurrency, useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { orderDetailPath, ordersPaymentAttentionPath, type OrdersPaymentAttentionScope } from '@/lib/orders/routes';
import type { ListOrdersResult } from '@/lib/api';
import { ArrowUpRight, ClipboardList, CreditCard, Utensils } from 'lucide-react';

/** Financial summary and permission-aware shortcuts use existing Foody destinations. */
export default function DashboardSidebar({ restaurantId, revenue, serieMode, scope, recent, loading }: {
  restaurantId: number; revenue: string; serieMode: boolean; scope: OrdersPaymentAttentionScope; recent: ListOrdersResult | null; loading: boolean;
}) {
  const { t, locale } = useI18n();
  const { code: currency } = useCurrency();
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(value);
  const { hasPermission, hasAnyPermission } = usePermissions();
  const actions = [
    { label: 'productionTitle', href: `/${restaurantId}/orders/production${scope.from === scope.to ? `?date=${scope.to}` : ''}`, icon: ClipboardList, allowed: serieMode && hasAnyPermission('orders.view', 'orders.manage') },
    { label: 'dashboardActionCollect', href: ordersPaymentAttentionPath(restaurantId, scope), icon: CreditCard, allowed: hasAnyPermission('orders.view', 'orders.manage') },
    { label: 'editMenuAction', href: `/${restaurantId}/menu/menus`, icon: Utensils, allowed: hasPermission('menu.edit') },
  ].filter((action) => action.allowed);
  return <aside className="dashboard-side-column">
    {!serieMode && <section className="dashboard-card dashboard-money"><h2>{t('money')}</h2>
      <div><strong>{t('dashboardTodaySales')}</strong><span>{revenue}</span></div>
    </section>}
    {actions.length > 0 && <section className="dashboard-card dashboard-quick-actions"><h2>{t('quickActions')}</h2>
      {actions.map((action) => <Link key={action.label} href={action.href}><action.icon size={18} /><span>{t(action.label)}</span><ArrowUpRight size={16} /></Link>)}
    </section>}
    {hasAnyPermission('orders.view', 'orders.manage') && <section className="dashboard-card dashboard-recent"><h2>{t('recentOrders')}</h2>
      <p className="dashboard-side-hint">{t(serieMode ? 'dashboardRecentSerie' : 'dashboardRecentPeriod')}</p>
      {!recent ? <p className="dashboard-side-hint">{t(loading ? 'loading' : 'couldNotLoad')}</p> : recent.orders.length === 0 ? <p className="dashboard-side-hint">{t('dashboardNoPeriodData')}</p> : recent.orders.map(order =>
        <Link key={order.id} href={orderDetailPath(restaurantId, order.id)} className="dashboard-recent-order">
          <div><strong>{order.customer_name || `#${order.id}`}</strong><span>{t(`chain_mode_${order.order_type}`)} · #{order.id}</span></div>
          <div><strong>{money(order.total_amount)}</strong><span>{new Date(order.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span></div>
        </Link>)}
    </section>}
  </aside>;
}
