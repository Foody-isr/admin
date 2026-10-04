'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { isSettingsDestinationActive, settingsNavigation } from '@/lib/settings-navigation';

/** Show the settings location without adding a second navigation system. */
export function SettingsBreadcrumb({ restaurantId }: { restaurantId: number }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const group = settingsNavigation(restaurantId).find(group => group.items.some(item => isSettingsDestinationActive(pathname, item)));
  if (!group) return null;
  return <div data-settings-breadcrumb className="mb-5 flex items-center gap-2 text-fs-sm text-[var(--fg-muted)]" aria-label={t('settingsLocation')}>
    <span>{t('settings')}</span><ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden /><span>{t(group.labelKey)}</span>
  </div>;
}
