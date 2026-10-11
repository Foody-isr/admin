'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

const tabs = [
  { segment: '', labelKey: 'generalSettings' },
  { segment: '/availability', labelKey: 'autoDisableSoldoutTitle' },
  { segment: '/units', labelKey: 'units' },
] as const;

/** Secondary navigation for stock-related restaurant settings. */
export default function StockSettingsNav() {
  const { restaurantId } = useParams();
  const pathname = usePathname();
  const { t } = useI18n();
  const root = `/${restaurantId}/settings/stock`;

  return (
    <nav
      aria-label={t('stockSettings')}
      className="mb-[var(--s-6)] border-b border-[var(--line)]"
    >
      <div className="flex w-full flex-wrap gap-x-[var(--s-5)] gap-y-1">
        {tabs.map((tab) => {
          const href = `${root}${tab.segment}`;
          const active = tab.segment ? pathname.startsWith(href) || (tab.segment === '/units' && pathname === `/${restaurantId}/kitchen/units`) || (tab.segment === '/availability' && pathname === `/${restaurantId}/kitchen/availability`) : pathname === root;
          return (
            <Link
              key={tab.segment || 'general'}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative whitespace-nowrap py-[var(--s-3)] text-fs-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-ring ${
                active
                  ? 'text-[var(--fg)] after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-r-sm after:bg-[var(--brand-500)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
