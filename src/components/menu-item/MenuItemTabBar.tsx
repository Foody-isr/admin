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

// Segmented pill tabs, theme-aware.
export default function MenuItemTabBar({ tabs, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 p-1.5 rounded-xl bg-[var(--surface-subtle)] w-full"
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
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab.disabled
                ? 'text-[var(--text-secondary)] opacity-50 cursor-not-allowed'
                : isActive
                  ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <TabIcon id={tab.id} />
            <span className="truncate">{tab.label}</span>
            {tab.warning && (
              <AlertCircle className="w-[14px] h-[14px] text-brand-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
