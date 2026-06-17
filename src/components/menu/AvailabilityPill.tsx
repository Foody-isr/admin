'use client';

import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { AvailabilityState, AvailabilityOverride } from '@/lib/api';

// The override to apply when the availability pill is toggled, keyed on the
// item's *visible* state. Binary and always a forced override (never 'auto'):
// a forced override wins server-side, so the optimistic flip matches the
// reloaded truth and the pill never bounces / needs a second click.
export function availabilityToggleTarget(state?: AvailabilityState): AvailabilityOverride {
  return state === 'sold_out' || state === 'hidden' ? 'force_available' : 'force_sold_out';
}

interface Props {
  state?: AvailabilityState;
  /** item.is_active — inactive items render read-only (a different axis). */
  isActive: boolean;
  /** Limiting ingredient/prep, shown as the read-only chip's tooltip. */
  bottleneck?: string;
  canEdit: boolean;
  /** In-flight toggle — disables the control. */
  pending?: boolean;
  /** When provided (and the pill is interactive), clicking calls this. */
  onToggle?: () => void;
}

/**
 * Shared availability status pill used by the item Library list and the carte
 * rows so the control looks and behaves identically on both. Shows the
 * effective state (Disponible / Stock faible / Rupture / Indisponible) and, for
 * active items the user can edit, doubles as a one-click availability toggle.
 */
export function AvailabilityPill({ state, isActive, bottleneck, canEdit, pending, onToggle }: Props) {
  const { t } = useI18n();

  let cls: string;
  let label: string;
  if (!isActive) {
    cls = 'bg-neutral-200 dark:bg-neutral-700/40 text-neutral-700 dark:text-neutral-300';
    label = t('unavailable');
  } else if (state === 'sold_out') {
    cls = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    label = t('outOfStock');
  } else if (state === 'low') {
    cls = 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    label = t('lowStock');
  } else {
    cls = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    label = t('available');
  }

  const interactive = canEdit && isActive && !!onToggle;
  if (!interactive) {
    return (
      <span
        title={bottleneck || undefined}
        className={`inline-block px-3 py-1 rounded-lg text-sm font-medium ${cls}`}
      >
        {label}
      </span>
    );
  }

  const tip =
    availabilityToggleTarget(state) === 'force_sold_out'
      ? t('quickMarkSoldOut')
      : t('quickMarkAvailable');
  return (
    <button
      type="button"
      disabled={pending}
      title={tip}
      aria-label={`${label} — ${tip}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle!();
      }}
      className={`group inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium cursor-pointer transition-shadow hover:ring-1 hover:ring-inset hover:ring-current disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {label}
      <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}
