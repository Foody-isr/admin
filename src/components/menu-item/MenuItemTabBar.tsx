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
      return <DocumentTextIcon className="w-4 h-4" />;
    case 'modifiers':
      return <Square3Stack3DIcon className="w-4 h-4" />;
    case 'recipe':
      // Chef's toque — heroicons has no equivalent, so inline SVG.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 15.5h12v3a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18.5v-3z" />
          <path d="M6 15.5c-1.657 0-3-1.343-3-3a3 3 0 013.5-2.959 3.5 3.5 0 016.5-2 3.5 3.5 0 016.5 2A3 3 0 0121 12.5c0 1.657-1.343 3-3 3H6z" />
          <path d="M9 15.5v3" />
          <path d="M15 15.5v3" />
        </svg>
      );
    case 'cost':
      return (
        <span className="w-4 h-4 inline-flex items-center justify-center text-[14px] font-bold leading-none">$</span>
      );
  }
}

// Tablist + segmented pill tabs, styled to match Figma node 0:64.
// Colors are scoped to this page — the design is dark-only, so we hardcode the
// Figma palette instead of relying on the light/dark theme tokens.
export default function MenuItemTabBar({ tabs, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center justify-center gap-1 p-1 rounded-[8px] bg-[#27272a] w-full"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`flex-1 h-[41px] inline-flex items-center justify-center gap-2 px-[17px] rounded-[6px] text-[14px] leading-[20px] transition-colors ${
              tab.disabled
                ? 'border border-[rgba(255,255,255,0.1)] text-[#9f9fa9] opacity-50 cursor-not-allowed'
                : isActive
                  ? 'bg-[#09090b] border border-[rgba(255,255,255,0.1)] text-[#fafafa] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]'
                  : 'border border-[rgba(255,255,255,0.1)] text-[#9f9fa9] hover:text-[#fafafa] hover:bg-[#09090b]/40'
            }`}
          >
            <TabIcon id={tab.id} />
            <span className="truncate">{tab.label}</span>
            {tab.warning && (
              <ExclamationTriangleIcon className="w-[14px] h-[14px] text-[#f54900] shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
