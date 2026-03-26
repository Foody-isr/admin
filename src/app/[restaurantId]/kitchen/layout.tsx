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
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
        {tabs.map((tab) => {
          const href = `/${restaurantId}/kitchen/${tab.key}`;
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const badge = tab.key === 'stock' ? lowStockCount : tab.key === 'prep' ? lowPrepCount : 0;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t(tab.labelKey)}
              {badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-500'
                }`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
