'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check, Ruler, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { UnitConversionLike } from '@/lib/units';

const STANDARD_UNITS = ['g', 'kg', 'ml', 'l', 'unit'] as const;
type StandardUnit = typeof STANDARD_UNITS[number];

function isStandard(u: string): u is StandardUnit {
  return (STANDARD_UNITS as readonly string[]).includes(u);
}

interface Props {
  value: string;
  disabled?: boolean;
  label?: string;
  onChange: (unit: string) => void;
  conversions: UnitConversionLike[];
  /** Base unit of the linked stock item, used to render the conversion rule
   *  (e.g. "1 Unité = 0.35 kg"). */
  baseUnit?: string | null;
  /** Stock item ID powering the "edit conversion" link. Omit for prep rows. */
  stockItemId?: number | null;
}

// Recipe-row unit picker. A Radix Popover instead of a native <select> so each
// custom-unit option can render its conversion rule inline and offer a direct
// link to the stock item editor.
/** Selects a standard or item-specific unit while retaining its conversion details. */
export default function RecipeUnitSelect({ value, disabled, label, onChange, conversions, baseUnit, stockItemId }: Props) {
  const { t } = useI18n();
  const { restaurantId } = useParams();
  const [open, setOpen] = useState(false);

  const customUnits = conversions
    .filter((c) => c.base_quantity > 0 && c.custom_unit?.name)
    .map((c) => ({ name: c.custom_unit!.name, qty: c.base_quantity }));

  // Always include the current value somewhere so a stale/removed unit stays
  // selectable — the ⚠️ icon next to the ingredient name signals the mismatch.
  const valueIsStandard = isStandard(value);
  const standardList = Array.from(new Set<string>([...STANDARD_UNITS, ...(valueIsStandard ? [value] : [])]));
  const customList = customUnits.some((u) => u.name === value)
    ? customUnits
    : value && !valueIsStandard
      ? [...customUnits, { name: value, qty: 0 }]
      : customUnits;

  const editHref = stockItemId ? `/${restaurantId}/kitchen/stock?edit=${stockItemId}` : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label ?? t('unit')}
          className={cn(
            'flex items-center justify-between gap-1 w-full min-h-11 px-[var(--s-2)] rounded-r-md',
            'bg-[var(--surface)] hover:bg-[var(--surface-2)]',
            'border border-[var(--line-strong)] hover:border-[var(--fg-subtle)]',
            'text-fs-sm text-[var(--fg)]',
            'focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring',
            'transition-colors',
            'data-[state=open]:border-[var(--brand-500)] data-[state=open]:shadow-ring',
          )}
        >
          <span className="truncate">{value || '—'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-subtle)] shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-[70] w-[280px] max-w-[calc(100vw-32px)] max-h-[320px] overflow-y-auto rounded-r-md border shadow-2 p-1',
            'bg-[var(--surface)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          style={{ borderColor: 'var(--line)' }}
        >
          <GroupLabel>{t('unitGroupStandard')}</GroupLabel>
          {standardList.map((u) => (
            <Option
              key={u}
              label={u}
              selected={u === value}
              onSelect={() => { onChange(u); setOpen(false); }}
            />
          ))}
          {customList.length > 0 && (
            <>
              <Divider />
              <GroupLabel>{t('unitGroupCustom')}</GroupLabel>
              {customList.map((u) => (
                <Option
                  key={u.name}
                  label={u.name}
                  selected={u.name === value}
                  rule={u.qty > 0 && baseUnit
                    ? `1 ${u.name} = ${u.qty} ${baseUnit}`
                    : t('unitRuleMissing')}
                  ruleIsMissing={u.qty <= 0}
                  editHref={editHref}
                  editLabel={t('unitEditConversion')}
                  onSelect={() => { onChange(u.name); setOpen(false); }}
                />
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)] select-none">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-[var(--line)] mx-1" />;
}

function Option({
  label, selected, onSelect, rule, ruleIsMissing, editHref, editLabel,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  rule?: string;
  ruleIsMissing?: boolean;
  editHref?: string;
  editLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1">
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-r-md px-2 py-2 text-start hover:bg-[var(--surface-2)]',selected && 'bg-[var(--brand-50)]')}>
      {rule !== undefined && (
        <Ruler className={cn(
          'w-3.5 h-3.5 shrink-0',
          ruleIsMissing ? 'text-[var(--warn-500,#d97706)]' : 'text-[var(--fg-subtle)]',
        )} />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-fs-sm text-[var(--fg)] truncate">{label}</span>
        {rule && (
          <span className={cn(
            'text-xs font-mono tabular-nums truncate',
            ruleIsMissing ? 'text-[var(--warn-500,#d97706)]' : 'text-[var(--fg-muted)]',
          )}>
            {rule}
          </span>
        )}
      </div>
      {selected && <Check className="w-3.5 h-3.5 text-[var(--brand-ink)] shrink-0" />}
      </button>
      {editHref && (
        <Link
          href={editHref}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-r-md text-fg-secondary hover:bg-[var(--surface-2)]',
          )}
          aria-label={editLabel}
          title={editLabel}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
