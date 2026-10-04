'use client';

// One option row inside a step — for items WITHOUT variants.
//
// Layout: [drag] [thumb] [name + default badge] [upcharge chip / inclus] [edit] [remove]

import { AlertTriangle, Pin, X } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type { ComboOptionView } from './types';
import { NumberInput } from '@/components/ui/NumberInput';
import Thumb from './Thumb';

interface Props {
  option: ComboOptionView;
  /** Item isn't on any carte. Triggers the off-carte warning chip + the
   *  "Inclure quand même" toggle so the operator decides whether the combo
   *  surfaces this item to customers anyway. */
  comboOnly?: boolean;
  onUpchargeChange: (next: number) => void;
  onForceOffCarteToggle: (next: boolean) => void;
  onRemove: () => void;
  onSetDefault: () => void;
}

export default function OptionRow({ option, comboOnly, onUpchargeChange, onForceOffCarteToggle, onRemove, onSetDefault }: Props) {
  const { symbol } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  return (
    <div className="flex flex-wrap items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md bg-[var(--surface-2)] border border-[var(--line)]">
      <Thumb url={option.imageUrl} />
      <div className="min-w-[120px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fs-sm font-medium text-[var(--fg)] break-words">{option.itemName}</span>
          {option.isDefault && (
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[var(--info-50)] text-[var(--info-500)] border border-[var(--line)]">
              <Pin className="w-2.5 h-2.5" /> {t('composeDefaultBadge')}
            </span>
          )}
          {comboOnly && (
            <span
              className="inline-flex items-center gap-1 text-fs-xs px-1.5 py-0.5 rounded-r-sm shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
                color: 'var(--warning-500)',
              }}
              title={t('composeOffCarteWarnTooltip')}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {t('composeOffCarteWarnShort')}
            </span>
          )}
        </div>
        {comboOnly && (
          <>
          <label className="inline-flex min-h-11 items-center gap-1.5 mt-0.5 text-fs-xs text-[var(--fg-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={option.forceOffCarte}
              disabled={!canEdit}
              onChange={(e) => onForceOffCarteToggle(e.target.checked)}
              className="w-4 h-4 accent-[var(--brand-500)]"
            />
            <span>{t('composeOffCarteForceLabel')}</span>

          </label>
<details className="text-xs text-fg-secondary"><summary className="cursor-pointer min-h-11 py-3">{t('learnMore')}</summary><p className="pb-3 leading-relaxed">{t('composeOffCarteForceTooltip')}</p></details>
</>
        )}
      </div>

      <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-secondary">
        <span>{t('composeUpchargeLabel')}</span>
        <span className="inline-flex min-h-11 items-center gap-2 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3">
          <NumberInput min={0} disabled={!canEdit} value={option.upcharge} onChange={onUpchargeChange} aria-label={`${t('composeUpchargeLabel')} — ${option.itemName}`} className="min-h-11 w-16 bg-transparent text-end text-sm tabular-nums text-[var(--fg)]"/>
          <span>{symbol}</span>
        </span>
      </label>

      {canEdit && !option.isDefault && (
        <button
          type="button"
          onClick={onSetDefault}
          title={t('composeSetDefault')}
          className="min-h-11 px-2 text-fs-xs text-[var(--brand-ink)] hover:underline whitespace-nowrap"
        >
          {t('composeSetDefault')}
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          className="w-11 h-11 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-500)]"
          aria-label={`${t('remove')} — ${option.itemName}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

