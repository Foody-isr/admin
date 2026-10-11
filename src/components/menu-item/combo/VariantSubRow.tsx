'use client';

// One variant row inside an OptionRowWithVariants. Lets the operator:
//   • include / exclude the variant from this combo
//   • set its upcharge (₪)
//   • see the live combo price for this choice
//   • flip default

import { Check, Pin } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
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
  const { money, symbol } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const comboPrice = basePrice + (included ? upcharge : 0);
  const upchargeWarn = included && upcharge > 0;

  return (
    <div
      className={`grid grid-cols-[44px_minmax(0,1fr)] 2xl:grid-cols-[44px_minmax(0,1fr)_120px_110px_44px] items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] border-s-2 transition-opacity ${
        included ? 'opacity-100' : 'opacity-50'
      }`}
      style={{ borderColor: 'color-mix(in oklab, var(--brand-500) 30%, transparent)' }}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => canEdit && onToggleIncluded()}
        disabled={!canEdit}
        aria-pressed={included} aria-label={`${t('composeIncludeVariant')} — ${name}`}
        className={`w-11 h-11 rounded-r-xs flex items-center justify-center disabled:cursor-default ${
          included
            ? 'bg-[var(--action)] border border-[var(--action)] text-[var(--action-fg)]'
            : 'bg-[var(--surface)] border border-[var(--line-strong)]'
        }`}
      >
        {included && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</span>
          {isDefault && included && (
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[var(--info-50)] text-[var(--info-500)] border border-[var(--line)]">
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
        <div className="text-xs text-[var(--fg-subtle)] mt-0.5">
          {t('composeSoldSeparately')}: {money(soloPrice)}
        </div>
      </div>

      {/* Upcharge input */}
      <div className="col-start-2 flex min-w-0 flex-col gap-1 2xl:col-start-auto">
        <span className="text-xs uppercase tracking-[.04em] font-semibold text-[var(--fg-subtle)]">
          {t('composeUpchargeLabel')}
        </span>
        <div
          className={`flex items-center min-h-11 px-2 rounded-r-sm border bg-[var(--surface)] ${
            upchargeWarn
              ? 'border-[var(--warning-500)]'
              : 'border-[var(--line-strong)]'
          }`}
        >
          <NumberInput
            min={0} aria-label={`${t('composeUpchargeLabel')} — ${name}`}
            value={upcharge}
            disabled={!included || !canEdit}
            onChange={onUpchargeChange}
            className={`w-full bg-transparent border-none outline-none text-end text-fs-sm tabular-nums ${
              upchargeWarn ? 'font-semibold text-[var(--brand-ink)]' : 'text-[var(--fg)]'
            }`}
          />
          <span className="text-fs-xs text-[var(--fg-muted)] ms-1">{symbol}</span>
        </div>
      </div>

      {/* Live combo price chip */}
      <div className="col-start-2 flex flex-wrap justify-start 2xl:col-start-auto 2xl:justify-end">
        <span
          className={`inline-flex items-center h-[22px] px-2 rounded-r-sm text-fs-xs font-medium ${
            upchargeWarn
              ? 'bg-[var(--warning-50)] text-[var(--warning-500)]'
              : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
          }`}
        >
          {t('typeCombo')}: {money(comboPrice)}
        </span>
      </div>

      {/* Overflow */}
      <button
        type="button"
        onClick={onSetDefault}
        disabled={!included || !canEdit}
        title={t('composeSetDefault')} aria-label={`${t('composeSetDefault')} — ${name}`} aria-pressed={isDefault && included}
        className="col-start-1 row-start-2 2xl:col-start-auto 2xl:row-start-auto w-11 min-h-11 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Pin className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
