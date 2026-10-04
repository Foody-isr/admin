'use client';

import { SearchIcon } from 'lucide-react';
import { useSearchShortcut } from '@/lib/search-shortcut';
import { useI18n } from '@/lib/i18n';

export default function SearchTriggerButton() {
  const { openSearch } = useSearchShortcut();
  const { t } = useI18n();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const label = t('globalSearch');
  return (
    <button
      onClick={openSearch}
      className="flex shrink-0 items-center gap-[var(--s-2)] px-[var(--s-3)] h-11 w-11 justify-center md:h-10 md:w-72 bg-[var(--surface)] text-[var(--fg-muted)] border border-[var(--line-strong)] rounded-r-md transition-colors hover:border-[var(--brand-500)]"
      aria-label={label}
    >
      <SearchIcon className="w-4 h-4 shrink-0 text-[var(--fg-subtle)]" />
      <span className="hidden md:block flex-1 text-start text-fs-sm">{label}</span>
      <kbd className="hidden md:block font-mono text-xs px-1.5 py-0.5 rounded-r-xs bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
