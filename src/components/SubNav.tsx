'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

export interface SubNavItem {
  href: string;
  labelKey: string;
  badge?: number;
}

interface SubNavProps {
  items: SubNavItem[];
  children: React.ReactNode;
}

export default function SubNav({ items, children }: SubNavProps) {
  const pathname = usePathname();
  const { t, direction } = useI18n();
  const isRtl = direction === 'rtl';

  return (
    <div className="flex min-h-[calc(100vh-7rem)]">
      {/* Sub-navigation sidebar */}
      <nav
        className={`w-48 flex-shrink-0 pt-2 ${isRtl ? 'border-l' : 'border-r'}`}
        style={{ borderColor: 'var(--divider)' }}
      >
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? `font-semibold text-brand-500 ${isRtl ? 'border-r-[3px]' : 'border-l-[3px]'} border-brand-500`
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {t(item.labelKey)}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-500">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <div className={`flex-1 ${isRtl ? 'pr-8' : 'pl-8'} pt-2`}>
        {children}
      </div>
    </div>
  );
}
