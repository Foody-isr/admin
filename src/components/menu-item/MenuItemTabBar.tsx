'use client';

import { FileText, Layers, ChefHat, DollarSign, AlertCircle } from 'lucide-react';
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
      return <FileText className="w-4 h-4" />;
    case 'modifiers':
      return <Layers className="w-4 h-4" />;
    case 'recipe':
      return <ChefHat className="w-4 h-4" />;
    case 'cost':
      return <DollarSign className="w-4 h-4" />;
  }
}

// Segmented pill tabs — matches Figma MenuItemDetails.tsx:95-121.
export default function MenuItemTabBar({ tabs, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex gap-2 bg-neutral-200 dark:bg-[#1a1a1a] p-1.5 rounded-xl"
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
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
              tab.disabled
                ? 'text-neutral-500 dark:text-neutral-400 opacity-50 cursor-not-allowed'
                : isActive
                  ? 'bg-white dark:bg-[#0a0a0a] text-neutral-900 dark:text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <TabIcon id={tab.id} />
            <span className="truncate">{tab.label}</span>
            {tab.warning && (
              <AlertCircle size={14} className="text-orange-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
