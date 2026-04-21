'use client';

import {
  DocumentTextIcon,
  Square3Stack3DIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { MenuItemSection } from './TabBar';

export interface TabBarItem {
  id: MenuItemSection;
  label: string;
  warning?: boolean;
  disabled?: boolean;
}

interface Props {
  tabs: TabBarItem[];
  active: MenuItemSection;
  onChange: (id: MenuItemSection) => void;
}

function TabIcon({ id }: { id: MenuItemSection }) {
  switch (id) {
    case 'details':
      return <DocumentTextIcon className="w-[18px] h-[18px]" />;
    case 'modifiers':
      return <Square3Stack3DIcon className="w-[18px] h-[18px]" />;
    case 'recipe':
      // Chef's toque — heroicons has no equivalent; inline SVG keeps the look consistent.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
          <path d="M6 15.5h12v3a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18.5v-3z" />
          <path d="M6 15.5c-1.657 0-3-1.343-3-3a3 3 0 013.5-2.959 3.5 3.5 0 016.5-2 3.5 3.5 0 016.5 2A3 3 0 0121 12.5c0 1.657-1.343 3-3 3H6z" />
          <path d="M9 15.5v3" />
          <path d="M15 15.5v3" />
        </svg>
      );
    case 'cost':
      return (
        <span className="w-[18px] h-[18px] inline-flex items-center justify-center text-base font-bold leading-none">$</span>
      );
  }
}

// Top-level tab bar used on the menu-item edit/create pages. Each tab is a
// card-style pill that switches the visible section below. Active tab is
// lifted visually; inactive tabs share the page's subtle background.
export default function MenuItemTabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border text-sm font-semibold transition-colors ${
              tab.disabled
                ? 'border-[var(--divider)] bg-[var(--surface-subtle)] text-fg-tertiary cursor-not-allowed opacity-60'
                : isActive
                  ? 'border-[var(--divider)] bg-[var(--surface)] text-fg-primary shadow-sm'
                  : 'border-transparent bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface)]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <TabIcon id={tab.id} />
            <span className="truncate">{tab.label}</span>
            {tab.warning && (
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
