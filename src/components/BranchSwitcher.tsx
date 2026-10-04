'use client';

import { useEffect, useState } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
  const { t, direction } = useI18n();
  const { hasPermission, isOwner } = usePermissions();
  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setOverview(null);
    setOpen(false);
    getChainBranches(restaurantId)
      .then((o) => { if (alive) setOverview(o); })
      .catch(() => { /* switcher is non-critical; stay on plain label */ });
    return () => { alive = false; };
  }, [restaurantId]);

  const branches = overview?.branches ?? [];
  const hasChain = overview?.chain_id != null && branches.length > 1;
  const canManage = isOwner || hasPermission('chain.manage');

  // Show the dropdown when there's a chain to switch within, OR the user can
  // manage branches (so a standalone-restaurant owner still has an entry point to
  // create their first branch). Otherwise degrade to plain text, unchanged.
  const showDropdown = hasChain || canManage;
  if (!showDropdown) {
    return <span className="text-[var(--fg)] font-medium truncate">{restaurantName}</span>;
  }

  const current = branches.find((b) => b.is_current);
  const currentName = current?.name ?? restaurantName;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} dir={direction}>
      <DropdownMenuTrigger asChild>
      <button
        className="flex items-center gap-[var(--s-2)] px-2 min-h-11 rounded-r-md hover:bg-[var(--sidebar-hover)] transition-colors max-w-full sm:max-w-[260px]"
      >
        <Building2Icon className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
        <span className="text-[var(--fg)] font-medium truncate">{currentName}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" />
      </button>
      </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="px-3 py-2 text-fs-xs font-medium text-[var(--fg-muted)]">
            {overview?.chain_name || t('branch_switcher_title')}
          </DropdownMenuLabel>

          {branches.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onSelect={() => { setOpen(false); router.push(`/${b.id}/dashboard`); }}
              className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg)]"
            >
              <span className="flex-1 text-start truncate">
                {b.name}
                {!b.is_active && (
                  <span className="ms-2 text-fs-xs text-[var(--fg-subtle)]">({t('branch_inactive')})</span>
                )}
              </span>
              {b.is_current && <CheckIcon className="w-4 h-4 text-[var(--brand-500)] shrink-0" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {/* Global merged reports only make sense once a chain exists. */}
          {hasChain && overview?.chain_id != null && (
            <DropdownMenuItem
              onSelect={() => { setOpen(false); router.push(`/chain/${overview.chain_id}/dashboard`); }}
              className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg)]"
            >
              <LayersIcon className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
              {t('branch_switcher_global')}
            </DropdownMenuItem>
          )}

          {canManage && (
            <DropdownMenuItem
              onSelect={() => { setOpen(false); router.push(`/${restaurantId}/chain/branches`); }}
              className="w-full flex items-center gap-[var(--s-3)] px-3 py-2 text-fs-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              {t('branch_switcher_manage')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
    </DropdownMenu>
  );
}
