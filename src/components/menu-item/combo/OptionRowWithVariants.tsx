'use client';

// Option row for source items WITH variants. Renders:
//   • a parent header (item name, "N variantes" badge, collapse, remove)
//   • a vertical list of VariantSubRow — one per source variant (excluded
//     ones rendered greyed-out so the operator can re-include them).

import { ChevronDown, ChevronUp, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { ComboOptionView, VariantView } from './types';
import VariantSubRow from './VariantSubRow';

interface Props {
  option: ComboOptionView;
  basePrice: number;
  onChange: (variants: VariantView[]) => void;
  onRemove: () => void;
}

export default function OptionRowWithVariants({ option, basePrice, onChange, onRemove }: Props) {
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
        <Thumb url={option.imageUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-fs-sm font-semibold text-[var(--fg)] truncate">{option.itemName}</span>
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]">
              <Layers className="w-2.5 h-2.5" />
              {t('composeVariantsCount').replace('{n}', String(option.variants.length))}
            </span>
          </div>
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
            {t('composeIncludedInCombo')}
          </div>
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

function Thumb({ url }: { url?: string }) {
  if (url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={url} alt="" className="w-9 h-9 rounded-r-sm object-cover bg-[var(--surface-3)] shrink-0" />;
  }
  return (
    <div
      className="w-9 h-9 rounded-r-sm shrink-0"
      style={{
        background: 'var(--surface-3)',
        backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--fg) 14%, transparent) 0 4px, transparent 4px 8px)',
      }}
      aria-hidden
    />
  );
}
