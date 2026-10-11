'use client';

import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

// Three-way choice for an item's VAT rate:
//   null → use restaurant default (no override stored on the item)
//   0    → exempt (e.g. fresh produce in Israel)
//   n    → custom rate (e.g. a reduced rate used in other countries)
type Mode = 'default' | 'exempt' | 'custom';

function modeFor(value: number | null | undefined): Mode {
  if (value == null) return 'default';
  if (value === 0) return 'exempt';
  return 'custom';
}

interface Props {
  value: number | null;
  onChange: (value: number | null) => void;
  restaurantRate: number;
  /** Compact styling for inline use (e.g. per-line in delivery import). */
  compact?: boolean;
}

export default function VatRateSelect({ value, onChange, restaurantRate, compact }: Props) {
  const { t } = useI18n();
  const mode = modeFor(value);
  const selectCls = `min-h-11 max-w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm ${compact ? 'max-w-56' : ''}`;
  const numCls = 'min-h-11 w-24 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm tabular-nums';

  const handleModeChange = (next: Mode) => {
    if (next === 'default') onChange(null);
    else if (next === 'exempt') onChange(0);
    else onChange(value && value > 0 ? value : restaurantRate); // seed with current or restaurant
  };

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <select
        className={selectCls}
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as Mode)}
        aria-label={t('vatRate')}
      >
        <option value="default">
          {t('vatDefault')} ({restaurantRate}%)
        </option>
        <option value="exempt">0% ({t('vatExempt')})</option>
        <option value="custom">{t('vatCustom')}</option>
      </select>
      {mode === 'custom' && (
        <span className="inline-flex items-center gap-0.5">
          <NumberInput
            aria-label={t('vatCustom')}
            min={0}
            className={numCls}
            value={value ?? 0}
            onChange={onChange}
          />
          <span className="text-fg-secondary text-xs">%</span>
        </span>
      )}
    </span>
  );
}
