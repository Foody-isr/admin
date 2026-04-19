'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export type MenuItemSection = 'details' | 'modifiers' | 'recipe' | 'cost';

const VALID: MenuItemSection[] = ['details', 'modifiers', 'recipe', 'cost'];

// Legacy alias kept because external callers (bookmarks, Cost panel swap CTA)
// may still address tabs by their old names. Maps them onto the section ids.
const LEGACY_ALIASES: Record<string, MenuItemSection> = {
  details: 'details',
  recipe: 'recipe',
  cost: 'cost',
};

export const sectionAnchorId = (section: MenuItemSection) => `menu-item-section-${section}`;

// Reads `?tab=<section>` on mount and scrolls the matching anchor into view.
// Returns `scrollToSection` so callers (rail jump nav, inline CTAs) can navigate
// between sections and keep the URL in sync for sharing.
export function useMenuItemSections(): {
  scrollToSection: (next: MenuItemSection) => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const didInitialScroll = useRef(false);

  const scrollToSection = useCallback(
    (next: MenuItemSection) => {
      const el = document.getElementById(sectionAnchorId(next));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const q = new URLSearchParams(params.toString());
      if (next === 'details') q.delete('tab');
      else q.set('tab', next);
      const query = q.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (didInitialScroll.current) return;
    const raw = params.get('tab');
    if (!raw) return;
    const target = LEGACY_ALIASES[raw] ?? (VALID.includes(raw as MenuItemSection) ? (raw as MenuItemSection) : null);
    if (!target || target === 'details') return;
    // Wait one frame so the sections have mounted.
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionAnchorId(target));
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
      didInitialScroll.current = true;
    });
  }, [params]);

  return { scrollToSection };
}
