'use client';

import { useI18n } from '@/lib/i18n';
import SearchTriggerButton from '@/components/search/SearchTriggerButton';
import RestaurantAccountMenu from '@/components/RestaurantAccountMenu';
import { Menu } from 'lucide-react';

interface TopBarProps {
  restaurantId: number;
  restaurantName: string;
  pageName: string;
  onToggleSidebar: () => void;
}

/** Active restaurant, actual scoped search and keyboard-accessible account controls. */
export default function TopBar({ restaurantId, restaurantName, onToggleSidebar }: TopBarProps) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 lg:hidden h-[var(--topbar-total-h)] flex items-center gap-3 pt-safe-t px-4 sm:px-6 lg:px-8 border-b border-[var(--line)] bg-[var(--topbar-bg)] text-[var(--fg)]">
      <button type="button" onClick={onToggleSidebar} className="lg:hidden size-11 shrink-0 grid place-items-center rounded-r-md hover:bg-[var(--sidebar-hover)]" aria-label={t('menu')}>
        <Menu className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-sm"><RestaurantAccountMenu restaurantId={restaurantId} restaurantName={restaurantName} /></div>
      <SearchTriggerButton />
    </header>
  );
}
