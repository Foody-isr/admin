'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Layers, ChefHat, DollarSign, AlertCircle, Boxes, ChevronRight, ChevronLeft } from 'lucide-react';
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Edge fade indicators — visible on mobile only when there's more content
  // to scroll in that direction. Lets the user know the strip is swipeable
  // (otherwise the cut-off tab is easy to miss).
  const [hasOverflowEnd, setHasOverflowEnd] = useState(false);
  const [hasOverflowStart, setHasOverflowStart] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      // Use Math.abs for scrollLeft because RTL reports negative values in
      // some browsers; the comparison stays correct either way.
      const scrolled = Math.abs(el.scrollLeft);
      const max = el.scrollWidth - el.clientWidth;
      setHasOverflowStart(scrolled > 4);
      setHasOverflowEnd(scrolled < max - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [tabs.length]);

  // Keep the active tab in view when it changes (helps when the user taps a
  // visible tab that pushes the strip such that the new active is half-cut).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLButtonElement>(`[data-tab-id="${active}"]`);
    activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <div className="flex items-center justify-between gap-[var(--s-3)] flex-wrap">
      {/* Horizontal-scroll container so tabs stay reachable on narrow screens
          (the pill wrapper itself never shrinks). The negative-margin trick
          lets the scroll area run flush with the page edges on mobile.
          On mobile, fade overlays + a chevron indicator on the overflow side
          signal that more tabs exist beyond the visible edge. */}
      <div className="relative max-w-full -mx-[var(--s-4)] md:mx-0 flex-1 min-w-0">
        <div
          ref={scrollerRef}
          className="no-scrollbar overflow-x-auto px-[var(--s-4)] md:px-0 md:overflow-visible [scroll-snap-type:x_proximity]"
        >
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
              data-tab-id={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={`inline-flex items-center gap-[var(--s-2)] h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ease-out [scroll-snap-align:start] ${
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
        </div>
        {/* Edge indicators — mobile only, only when there's more to scroll.
            Pointer-events-none so the swipe still passes through to the
            scroller underneath. */}
        {hasOverflowStart && (
          <div className="md:hidden pointer-events-none absolute top-0 bottom-0 start-0 w-10 flex items-center justify-start ps-1 bg-gradient-to-r rtl:bg-gradient-to-l from-[var(--bg)] to-transparent">
            <ChevronLeft className="w-4 h-4 text-[var(--fg-muted)] rtl:hidden" />
            <ChevronRight className="w-4 h-4 text-[var(--fg-muted)] hidden rtl:block" />
          </div>
        )}
        {hasOverflowEnd && (
          <div className="md:hidden pointer-events-none absolute top-0 bottom-0 end-0 w-10 flex items-center justify-end pe-1 bg-gradient-to-l rtl:bg-gradient-to-r from-[var(--bg)] to-transparent">
            <ChevronRight className="w-4 h-4 text-[var(--fg-muted)] rtl:hidden" />
            <ChevronLeft className="w-4 h-4 text-[var(--fg-muted)] hidden rtl:block" />
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}
