'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getLowStockCount, getPrepLowStockCount } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const tabs = [
  { key: 'stock', labelKey: 'stock' },
  { key: 'prep', labelKey: 'recipesAndPrep' },
  { key: 'food-cost', labelKey: 'foodCost' },
] as const;

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const pathname = usePathname();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowPrepCount, setLowPrepCount] = useState(0);

  useEffect(() => {
    getLowStockCount(rid).then(setLowStockCount).catch(() => {});
    getPrepLowStockCount(rid).then(setLowPrepCount).catch(() => {});
  }, [rid]);

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-6 border-b" style={{ borderColor: 'var(--divider)' }}>
        {tabs.map((tab) => {
          const href = `/${restaurantId}/kitchen/${tab.key}`;
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const badge = tab.key === 'stock' ? lowStockCount : tab.key === 'prep' ? lowPrepCount : 0;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-500'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t(tab.labelKey)}
              {badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-500">
                  {badge}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
