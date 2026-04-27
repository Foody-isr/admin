'use client';

import { FileText, Layers, ChefHat, DollarSign, AlertCircle, Boxes } from 'lucide-react';
import type { MenuItemSection } from './TabBar';

export interface TabBarItem {
  id: MenuItemSection;
  label: string;
  warning?: boolean;
  disabled?: boolean;
  /** Optional inline count pill (e.g. number of combo steps). */
  count?: number;
}

interface Props {
  tabs: TabBarItem[];
  active: MenuItemSection;
  onChange: (id: MenuItemSection) => void;
  /** Optional trailing element (e.g. the TYPE · COMBO badge). */
  trailing?: React.ReactNode;
}

function TabIcon({ id }: { id: MenuItemSection }) {
  switch (id) {
    case 'details':
      return <FileText className="w-4 h-4" />;
    case 'modifiers':
      return <Layers className="w-4 h-4" />;
    case 'composition':
      return <Boxes className="w-4 h-4" />;
    case 'recipe':
      return <ChefHat className="w-4 h-4" />;
    case 'cost':
      return <DollarSign className="w-4 h-4" />;
  }
}

// Segmented pill tabs — aligned to Foody OS design tokens.
// Matches the .tabs pattern from design-reference/design/components.css.
export default function MenuItemTabBar({ tabs, active, onChange, trailing }: Props) {
  return (
    <div className="flex items-center justify-between gap-[var(--s-3)] flex-wrap">
      <div
        role="tablist"
        className="inline-flex gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md"
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
              className={`inline-flex items-center gap-[var(--s-2)] h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ease-out ${
                tab.disabled
                  ? 'text-[var(--fg-subtle)] opacity-50 cursor-not-allowed'
                  : isActive
                    ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              <TabIcon id={tab.id} />
              <span className="truncate">{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-r-sm bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)] text-[10px] font-semibold tabular-nums">
                  {tab.count}
                </span>
              )}
              {tab.warning && (
                <AlertCircle size={14} className="text-[var(--brand-500)] shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}
