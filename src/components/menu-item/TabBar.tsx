'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export type MenuItemTab = 'details' | 'recipe' | 'cost';

const VALID: MenuItemTab[] = ['details', 'recipe', 'cost'];

// URL-driven tab state (?tab=details|recipe|cost). Refresh-safe and shareable.
export function useMenuItemTab(): [MenuItemTab, (next: MenuItemTab) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('tab');
  const active: MenuItemTab = VALID.includes(raw as MenuItemTab) ? (raw as MenuItemTab) : 'details';

  const setTab = useCallback(
    (next: MenuItemTab) => {
      const q = new URLSearchParams(params.toString());
      if (next === 'details') q.delete('tab');
      else q.set('tab', next);
      const query = q.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [active, setTab];
}

interface Tab {
  id: MenuItemTab;
  label: string;
}

interface Props {
  active: MenuItemTab;
  onChange: (id: MenuItemTab) => void;
  tabs: Tab[];
}

export default function TabBar({ active, onChange, tabs }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-b"
      style={{ borderColor: 'var(--divider)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? 'border-brand-500 text-fg-primary'
                : 'border-transparent text-fg-secondary hover:text-fg-primary'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
