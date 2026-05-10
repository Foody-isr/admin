'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

interface DashboardSidebarProps {
  restaurantId: number;
  todayRevenue: number;
}

export default function DashboardSidebar({ restaurantId, todayRevenue }: DashboardSidebarProps) {
  const { t } = useI18n();

  const quickActions = [
    { labelKey: 'acceptPayment', href: `/${restaurantId}/orders` },
    { labelKey: 'editMenuAction', href: `/${restaurantId}/menu/menus` },
    { labelKey: 'addItemAction', href: `/${restaurantId}/menu/items` },
  ];

  return (
    <aside className="space-y-6">
      {/* Money / Balance */}
      <div className="card">
        <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-3">
          {t('money')}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-secondary">{t('balance')}</span>
          <span className="text-sm font-semibold text-fg-primary">
            {`\u20AA${todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-3">
          {t('quickActions')}
        </h3>
        <div className="space-y-1">
          {quickActions.map((action) => (
            <Link
              key={action.labelKey}
              href={action.href}
              className="block py-2 text-sm text-fg-primary hover:text-brand-500 transition-colors"
            >
              {t(action.labelKey)}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
