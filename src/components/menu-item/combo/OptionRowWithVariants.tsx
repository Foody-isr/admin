'use client';

// Option row for source items WITH variants. Renders:
//   • a parent header (item name, "N variantes" badge, collapse, remove)
//   • a vertical list of VariantSubRow — one per source variant (excluded
//     ones rendered greyed-out so the operator can re-include them).

import { AlertTriangle, ChevronDown, ChevronUp, HelpCircle, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
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
      <div className="flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)]">
        <Thumb url={option.imageUrl} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-fs-sm font-semibold text-[var(--fg)] truncate">{option.itemName}</span>
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]">
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
            <label className="inline-flex items-center gap-1.5 mt-0.5 text-fs-xs text-[var(--fg-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={option.forceOffCarte}
                onChange={(e) => onForceOffCarteToggle(e.target.checked)}
                className="w-3 h-3 accent-[var(--brand-500)]"
              />
              <span>{t('composeOffCarteForceLabel')}</span>
              <span
                title={t('composeOffCarteForceTooltip')}
                aria-label={t('composeOffCarteForceTooltip')}
                className="inline-flex"
              >
                <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100 transition-opacity" />
              </span>
            </label>
          ) : (
            <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
              {t('composeIncludedInCombo')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]"
          aria-label="Collapse"
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-500)]"
          aria-label="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
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

