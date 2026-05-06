'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  /**
   * When this value changes, the descendant carrying `data-rail-active` is
   * scrolled into view (so taps on a half-clipped pill bring it on-screen).
   */
  activeKey?: string | number | null;
  /**
   * When true, the rail's negative-margin trick lets it run flush with the
   * page's mobile edges. Disable if the rail sits inside a card.
   */
  edgeFlush?: boolean;
}

/**
 * Horizontally-scrollable rail with mobile-only fade + chevron indicators on
 * the overflow side(s). Indicators appear/disappear live as the user swipes,
 * so users see at a glance that there's more content off-screen. Used for
 * tab strips on narrow screens.
 */
export function HorizontalScrollRail({
  children,
  className,
  activeKey,
  edgeFlush,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasOverflowEnd, setHasOverflowEnd] = useState(false);
  const [hasOverflowStart, setHasOverflowStart] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      // RTL browsers report scrollLeft as negative — Math.abs normalizes.
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
  }, []);

  useEffect(() => {
    if (activeKey == null) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[data-rail-active]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeKey]);

  return (
    <div
      className={cn(
        'relative max-w-full flex-1 min-w-0',
        edgeFlush && '-mx-[var(--s-4)] md:mx-0',
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className={cn(
          'no-scrollbar overflow-x-auto md:overflow-visible [scroll-snap-type:x_proximity]',
          edgeFlush && 'px-[var(--s-4)] md:px-0',
        )}
      >
        {children}
      </div>
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
  );
}
