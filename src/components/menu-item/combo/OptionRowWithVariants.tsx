'use client';

// Option row for source items WITH variants. Renders:
//   • a parent header (item name, "N variantes" badge, collapse, remove)
//   • a vertical list of VariantSubRow — one per source variant (excluded
//     ones rendered greyed-out so the operator can re-include them).

import { AlertTriangle, ChevronDown, ChevronUp, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type { ComboOptionView, VariantView } from './types';
import VariantSubRow from './VariantSubRow';
import Thumb from './Thumb';

interface Props {
  option: ComboOptionView;
  basePrice: number;
  /** Item isn't on any carte. Triggers the warning chip + "Inclure quand
   *  même" toggle so the operator decides per-option (not per-variant —
   *  carte status is a property of the source MenuItem). */
  comboOnly?: boolean;
  onChange: (variants: VariantView[]) => void;
  onForceOffCarteToggle: (next: boolean) => void;
  onRemove: () => void;
}

export default function OptionRowWithVariants({ option, basePrice, comboOnly, onChange, onForceOffCarteToggle, onRemove }: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [collapsed, setCollapsed] = useState(false);

  const updateVariant = (variantId: number, patch: Partial<VariantView>) => {
    onChange(
      option.variants.map((v) => (v.variantId === variantId ? { ...v, ...patch } : v)),
    );
  };

  const promoteDefault = (variantId: number) => {
    onChange(
      option.variants.map((v) => ({ ...v, isDefault: v.variantId === variantId })),
    );
  };

  return (
    <div className="rounded-r-md bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden">
      {/* Parent header */}
      <div className="flex flex-wrap items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)]">
        <Thumb url={option.imageUrl} size={36} />
        <div className="min-w-[120px] flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-fs-sm font-semibold text-[var(--fg)] break-words">{option.itemName}</span>
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-ink)]">
              <Layers className="w-2.5 h-2.5" />
              {t('composeVariantsCount').replace('{n}', String(option.variants.length))}
            </span>
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
          {comboOnly ? (
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
          ) : (
            <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
              {t('composeIncludedInCombo')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-11 h-11 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]"
          aria-label={`${t('variants')} — ${option.itemName}`} aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
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

      {/* Variant sub-rows */}
      {!collapsed && (
        <div className="bg-[var(--surface)] border-t border-[var(--line)] flex flex-col gap-px">
          {option.variants.map((v) => (
            <VariantSubRow
              key={v.variantId}
              name={v.name}
              soloPrice={v.soloPrice}
              basePrice={basePrice}
              included={v.included}
              upcharge={v.upcharge}
              isDefault={v.isDefault}
              onToggleIncluded={() => updateVariant(v.variantId, { included: !v.included })}
              onUpchargeChange={(next) => updateVariant(v.variantId, { upcharge: next })}
              onSetDefault={() => promoteDefault(v.variantId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

