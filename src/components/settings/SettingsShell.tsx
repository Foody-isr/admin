'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Settings as SettingsIcon,
  Tag,
  Clock,
  DollarSign,
  Printer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface SettingsNavItem {
  id: string;
  href: (rid: number) => string;
  labelKey: string;
  icon: LucideIcon;
  matchPrefix?: string;
}

interface SettingsGroup {
  group: string;
  groupKey: string;
  items: SettingsNavItem[];
}

/**
 * Settings navigation — matches design-reference/design/screens/settings.jsx:4-18.
 * Three groups: Compte, Commerce, Organisation.
 */
const SECTIONS: SettingsGroup[] = [
  {
    group: 'Compte',
    groupKey: 'settingsGroupAccount',
    items: [
      {
        id: 'general',
        labelKey: 'general',
        icon: SettingsIcon,
        href: (rid) => `/${rid}/settings`,
      },
      {
        id: 'branding',
        labelKey: 'branding',
        icon: Tag,
        href: (rid) => `/${rid}/settings/branding`,
      },
      {
        id: 'hours',
        labelKey: 'openingHours',
        icon: Clock,
        href: (rid) => `/${rid}/settings/opening-hours`,
      },
    ],
  },
  {
    group: 'Commerce',
    groupKey: 'settingsGroupCommerce',
    items: [
      {
        id: 'payments',
        labelKey: 'paymentsAndVat',
        icon: DollarSign,
        href: (rid) => `/${rid}/settings/payments`,
      },
      {
        id: 'printers',
        labelKey: 'printersAndKds',
        icon: Printer,
        href: (rid) => `/${rid}/settings/printers`,
      },
    ],
  },
  {
    group: 'Organisation',
    groupKey: 'settingsGroupOrg',
    items: [
      {
        id: 'team',
        labelKey: 'staffAndRoles',
        icon: Users,
        href: (rid) => `/${rid}/settings/team`,
      },
    ],
  },
];

/**
 * Shared Settings layout with a left nav rail inside main (260px).
 * Matches design-reference/design/screens/settings.jsx SettingsShell.
 */
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const params = useParams();
  const pathname = usePathname() || '';
  const rid = Number(params?.restaurantId);

  const isActive = (item: SettingsNavItem): boolean => {
    const href = item.href(rid);
    if (pathname === href) return true;
    if (item.id === 'general' && pathname === `/${rid}/settings`) return true;
    if (item.matchPrefix) {
      return item.matchPrefix
        .split(',')
        .some((pfx) => pathname.startsWith(`/${rid}${pfx}`));
    }
    return false;
  };

  return (
    <div className="grid grid-cols-[260px_1fr] min-h-[calc(100vh-var(--topbar-h))] -mx-[var(--s-6)] -my-[var(--s-6)] lg:-mx-[var(--s-8)]">
      <aside className="border-e border-[var(--line)] bg-[var(--surface)] overflow-y-auto p-[var(--s-5)_var(--s-4)]">
        <div className="text-fs-xs font-semibold uppercase tracking-[.08em] text-[var(--fg-muted)] mb-[var(--s-4)] px-[var(--s-3)]">
          {t('settings') || 'Paramètres'}
        </div>
        {SECTIONS.map((s) => (
          <div key={s.group} className="mb-[var(--s-4)]">
            <div className="text-[11px] text-[var(--fg-subtle)] font-semibold px-[var(--s-3)] py-[var(--s-2)] uppercase tracking-[.06em]">
              {t(s.groupKey) || s.group}
            </div>
            {s.items.map((it) => {
              const active = isActive(it);
              const Icon = it.icon;
              return (
                <Link
                  key={it.id}
                  href={it.href(rid)}
                  className={`flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-sm font-medium transition-colors ${
                    active
                      ? 'text-[var(--fg)] bg-[color-mix(in_oklab,var(--brand-500)_10%,transparent)]'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(it.labelKey) || it.id}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="overflow-y-auto p-[var(--s-6)]">{children}</div>
    </div>
  );
}
