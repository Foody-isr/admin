'use client';

import { ChevronDownIcon } from 'lucide-react';

interface Props {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  // Extra content rendered inside the header, right of the title (e.g. badges).
  headerRight?: React.ReactNode;
}

// Section wrapper used by the Menu Item edit/create pages. The <section> keeps
// its id so the scroll-to-anchor hook and deep links (?tab=...) still work even
// when the body is collapsed.
export default function CollapsibleSection({
  id,
  title,
  collapsed,
  onToggle,
  children,
  headerRight,
}: Props) {
  return (
    <section id={id} className="scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-3 w-full text-left py-3 border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)]/40 transition-colors"
      >
        <span className="w-1 h-6 rounded-full bg-brand-500 shrink-0" />
        <h2 className="text-xl font-bold text-fg-primary flex-1 min-w-0 truncate">
          {title}
        </h2>
        {headerRight}
        <ChevronDownIcon
          className={`w-5 h-5 text-fg-secondary shrink-0 transition-transform ${
            collapsed ? '' : 'rotate-180'
          }`}
        />
      </button>
      {!collapsed && <div className="pt-5 space-y-5">{children}</div>}
    </section>
  );
}
