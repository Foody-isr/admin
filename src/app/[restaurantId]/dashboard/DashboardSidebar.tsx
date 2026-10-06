'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { ordersPaymentAttentionPath } from '@/lib/orders/routes';

/** Financial summary and permission-aware shortcuts use existing Foody destinations. */
export default function DashboardSidebar({ restaurantId, revenue, today }: { restaurantId: number; revenue: string; today: string }) {
  const { t } = useI18n();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const actions = [
    { label: 'acceptPayment', href: ordersPaymentAttentionPath(restaurantId, { from: today, to: today, dateField: 'created' }), allowed: hasAnyPermission('orders.view', 'orders.manage') },
    { label: 'editMenuAction', href: `/${restaurantId}/menu/menus`, allowed: hasPermission('menu.edit') },
    { label: 'addItemAction', href: `/${restaurantId}/menu/items/new`, allowed: hasPermission('menu.edit') },
  ].filter((action) => action.allowed);
  return <aside className="dashboard-side-column">
    <section className="dashboard-card dashboard-money"><h2>{t('money')}</h2>
      <div><strong>{t('dashboardTodaySales')}</strong><span>{revenue}</span></div>
    </section>
    {actions.length > 0 && <section className="dashboard-card dashboard-quick-actions"><h2>{t('quickActions')}</h2>
      {actions.map((action) => <Link key={action.label} href={action.href}>{t(action.label)}</Link>)}
    </section>}
  </aside>;
}
