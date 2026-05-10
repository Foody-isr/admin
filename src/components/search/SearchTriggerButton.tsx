'use client';

import { SearchIcon } from 'lucide-react';
import { useSearchShortcut } from '@/lib/search-shortcut';

export default function SearchTriggerButton() {
  const { openSearch } = useSearchShortcut();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      onClick={openSearch}
      className="hidden md:flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 w-80 bg-[var(--surface)] text-[var(--fg-muted)] border border-[var(--line-strong)] rounded-r-md transition-colors hover:border-[var(--brand-500)]"
      aria-label="Rechercher"
    >
      <SearchIcon className="w-4 h-4 shrink-0 text-[var(--fg-subtle)]" />
      <span className="flex-1 text-left text-fs-sm">Rechercher…</span>
      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-r-xs bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
