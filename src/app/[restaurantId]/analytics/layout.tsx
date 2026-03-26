'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

const tabs = [
  { key: 'overview', labelKey: 'overview' },
  { key: 'customers', labelKey: 'customers' },
] as const;

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
        {tabs.map((tab) => {
          const href = `/${restaurantId}/analytics/${tab.key}`;
          const isActive = pathname === href || pathname.startsWith(href + '/');
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
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
