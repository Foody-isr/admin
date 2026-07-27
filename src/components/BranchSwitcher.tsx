'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { getChainBranches, ChainOverview } from '@/lib/api';
import { ChevronDownIcon, CheckIcon, Building2Icon, LayersIcon, SettingsIcon } from 'lucide-react';

interface BranchSwitcherProps {
  restaurantId: number;
  /** Fallback label (the current restaurant name) shown before the chain loads
   *  and for standalone restaurants that are not part of any chain. */
  restaurantName: string;
}

/**
 * BranchSwitcher renders the current branch as a dropdown when the restaurant
 * belongs to a chain, letting a chain owner jump between branches or open the
 * merged "Global" reports. For a standalone restaurant (no chain, or a single
 * branch) it degrades to plain text so nothing changes visually.
 */
export default function BranchSwitcher({ restaurantId, restaurantName }: BranchSwitcherProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { hasPermission, isOwner } = usePermissions();
  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getChainBranches(restaurantId)
      .then((o) => { if (alive) setOverview(o); })
      .catch(() => { /* switcher is non-critical; stay on plain label */ });
    return () => { alive = false; };
  }, [restaurantId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const branches = overview?.branches ?? [];
  const hasChain = overview?.chain_id != null && branches.length > 1;
  const canManage = isOwner || hasPermission('chain.manage');

  // No chain (or single branch) → plain label, identical to the old crumb.
  if (!hasChain) {
    return <span className="text-[var(--fg)] font-medium truncate">{restaurantName}</span>;
  }

  const current = branches.find((b) => b.is_current);
  const currentName = current?.name ?? restaurantName;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[var(--s-2)] px-2 py-1 rounded-r-md hover:bg-[var(--sidebar-hover)] transition-colors max-w-[220px]"
      >
        <Building2Icon className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
        <span className="text-[var(--fg)] font-medium truncate">{currentName}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" />
      </button>

      {open && (
        <div className="absolute start-0 top-full mt-1 w-64 rounded-r-md shadow-3 py-1 z-50 bg-[var(--surface)] border border-[var(--line)]">
          <div className="px-3 py-2 text-fs-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            {overview?.chain_name || t('branch_switcher_title')}
          </div>

          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => { setOpen(false); router.push(`/${b.id}/dashboard`); }}
              className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg)]"
            >
              <span className="flex-1 text-start truncate">
                {b.name}
                {!b.is_active && (
                  <span className="ms-2 text-fs-xs text-[var(--fg-subtle)]">({t('branch_inactive')})</span>
                )}
              </span>
              {b.is_current && <CheckIcon className="w-4 h-4 text-[var(--brand-500)] shrink-0" />}
            </button>
          ))}

          <div className="my-1 border-t border-[var(--line)]" />

          <button
            onClick={() => { setOpen(false); router.push(`/chain/${overview?.chain_id}/dashboard`); }}
            className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg)]"
          >
            <LayersIcon className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
            {t('branch_switcher_global')}
          </button>

          {canManage && (
            <button
              onClick={() => { setOpen(false); router.push(`/${restaurantId}/chain/branches`); }}
              className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              {t('branch_switcher_manage')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
