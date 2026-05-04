'use client';

// One variant row inside an OptionRowWithVariants. Lets the operator:
//   • include / exclude the variant from this combo
//   • set its upcharge (₪)
//   • see the live combo price for this choice
//   • flip default

import { Check, MoreHorizontal, Pin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

interface Props {
  /** Source variant name. */
  name: string;
  /** Solo (à-la-carte) price of this variant on the source item. */
  soloPrice: number;
  /** Combo's base price — used for the live "Combo: ₪X" preview. */
  basePrice: number;
  included: boolean;
  upcharge: number;
  isDefault: boolean;
  onToggleIncluded: () => void;
  onUpchargeChange: (next: number) => void;
  onSetDefault: () => void;
}

export default function VariantSubRow({
  name, soloPrice, basePrice, included, upcharge, isDefault,
  onToggleIncluded, onUpchargeChange, onSetDefault,
}: Props) {
  const { t } = useI18n();
  const comboPrice = basePrice + (included ? upcharge : 0);
  const upchargeWarn = included && upcharge > 0;

  return (
    <div
      className={`grid grid-cols-[24px_1fr_140px_100px_28px] items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] border-s-2 transition-opacity ${
        included ? 'opacity-100' : 'opacity-50'
      }`}
      style={{ borderColor: 'color-mix(in oklab, var(--brand-500) 30%, transparent)' }}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggleIncluded}
        aria-pressed={included}
        className={`w-[18px] h-[18px] rounded-r-xs flex items-center justify-center ${
          included
            ? 'bg-[var(--brand-500)] border border-[var(--brand-500)] text-white'
            : 'bg-[var(--surface)] border border-[var(--line-strong)]'
        }`}
      >
        {included && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</span>
          {isDefault && included && (
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[color-mix(in_oklab,#2563eb_14%,transparent)] text-[#60a5fa] border border-[color-mix(in_oklab,#2563eb_30%,transparent)]">
              <Pin className="w-2.5 h-2.5" /> {t('composeDefaultBadge')}
            </span>
          )}
        </div>
        <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
          {!included
            ? t('composeNotAvailable')
            : upcharge === 0
              ? t('composeIncludedAtBase').replace('{price}', comboPrice.toFixed(2))
              : t('composeUpchargeApplied').replace('{delta}', upcharge.toFixed(2)).replace('{price}', comboPrice.toFixed(2))
          }
        </div>
        <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
          {t('composeSoldSeparately')}: ₪{soloPrice.toFixed(2)}
        </div>
      </div>

      {/* Upcharge input */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[.04em] font-semibold text-[var(--fg-subtle)]">
          {t('composeUpchargeLabel')}
        </span>
        <div
          className={`flex items-center h-7 px-2 rounded-r-sm border bg-[var(--surface)] ${
            upchargeWarn
              ? 'border-[var(--warning-500)]'
              : 'border-[var(--line-strong)]'
          }`}
        >
          <NumberInput
            min={0}
            value={upcharge}
            disabled={!included}
            onChange={onUpchargeChange}
            className={`w-full bg-transparent border-none outline-none text-end text-fs-sm tabular-nums ${
              upchargeWarn ? 'font-semibold text-[var(--brand-500)]' : 'text-[var(--fg)]'
            }`}
          />
          <span className="text-fs-xs text-[var(--fg-muted)] ms-1">₪</span>
        </div>
      </div>

      {/* Live combo price chip */}
      <div className="flex justify-end">
        <span
          className={`inline-flex items-center h-[22px] px-2 rounded-r-sm text-fs-xs font-medium ${
            upchargeWarn
              ? 'bg-[var(--warning-50)] text-[var(--warning-500)] dark:text-[#fbbf24]'
              : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
          }`}
        >
          Combo: ₪{comboPrice.toFixed(2)}
        </span>
      </div>

      {/* Overflow */}
      <button
        type="button"
        onClick={onSetDefault}
        disabled={!included}
        title={t('composeSetDefault')}
        className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
