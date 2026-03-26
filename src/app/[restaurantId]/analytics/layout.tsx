'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'customers', label: 'Customers' },
] as const;

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const pathname = usePathname();

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
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
