'use client';

import { useI18n } from '@/lib/i18n';

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
  const selectCls = compact
    ? 'rounded-md border px-2 py-1 text-xs bg-transparent'
    : 'rounded-[10px] border px-3 py-2 text-[15px] font-medium bg-transparent';
  const numCls = compact
    ? 'rounded-md border px-2 py-1 text-xs w-16 tabular-nums bg-transparent'
    : 'rounded-[10px] border px-3 py-2 text-[15px] font-medium w-20 tabular-nums bg-transparent';
  const borderStyle = { borderColor: 'rgba(255,255,255,0.08)' };

  const handleModeChange = (next: Mode) => {
    if (next === 'default') onChange(null);
    else if (next === 'exempt') onChange(0);
    else onChange(value && value > 0 ? value : restaurantRate); // seed with current or restaurant
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={selectCls}
        style={borderStyle}
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as Mode)}
        aria-label={t('vatRate') || 'TVA'}
      >
        <option value="default">
          {(t('vatDefault') || 'Par défaut')} ({restaurantRate}%)
        </option>
        <option value="exempt">0% ({t('vatExempt') || 'exonéré'})</option>
        <option value="custom">{t('vatCustom') || 'Personnalisé'}</option>
      </select>
      {mode === 'custom' && (
        <span className="inline-flex items-center gap-0.5">
          <input
            type="number"
            min="0"
            step="0.1"
            className={numCls}
            style={borderStyle}
            value={value ?? 0}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChange(Number.isFinite(n) && n >= 0 ? n : 0);
            }}
          />
          <span className="text-fg-secondary text-xs">%</span>
        </span>
      )}
    </span>
  );
}
