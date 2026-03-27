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
      <div className="flex items-center gap-6 border-b" style={{ borderColor: 'var(--divider)' }}>
        {tabs.map((tab) => {
          const href = `/${restaurantId}/analytics/${tab.key}`;
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={tab.key}
              href={href}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-500'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t(tab.labelKey)}
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
