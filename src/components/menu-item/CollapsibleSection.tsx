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
        className="flex items-center gap-[var(--s-3)] w-full text-left py-[var(--s-3)] border-b border-[var(--line)] hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)] shrink-0" />
        <h2 className="text-fs-xl font-semibold text-[var(--fg)] flex-1 min-w-0 truncate">
          {title}
        </h2>
        {headerRight}
        <ChevronDownIcon
          className={`w-5 h-5 text-[var(--fg-muted)] shrink-0 transition-transform duration-fast ${
            collapsed ? '' : 'rotate-180'
          }`}
        />
      </button>
      {!collapsed && <div className="pt-[var(--s-5)] space-y-[var(--s-5)]">{children}</div>}
    </section>
  );
}
