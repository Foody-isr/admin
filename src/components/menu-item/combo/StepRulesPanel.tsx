'use client';

// Compact step-rules editor — required toggle + min/max inputs.
//
// Used in two places:
//   • StepCard "Règles" popover — quick rules edit without opening the full picker.
//   • StepPicker right-panel — contextual rules edit while picking items.
//
// Both share this component so the two surfaces can't drift. "Required" is a
// derived concept: required ⇔ min_picks > 0. Toggling required moves min_picks
// between 0 and `max(1, current)`; max_picks is preserved.

import { useI18n } from '@/lib/i18n';

interface Props {
  minPicks: number;
  maxPicks: number;
  onChange: (next: { minPicks: number; maxPicks: number }) => void;
  /** When true, omits the wrapping border + padding so the panel can be
   *  embedded inside another card (the picker's right panel). When false
   *  (default), renders as a self-contained card. */
  flush?: boolean;
}

export default function StepRulesPanel({ minPicks, maxPicks, onChange, flush }: Props) {
  const { t } = useI18n();
  const required = minPicks > 0;

  const setRequired = (next: boolean) => {
    if (next) {
      onChange({ minPicks: Math.max(1, minPicks || 1), maxPicks: Math.max(maxPicks, 1) });
    } else {
      onChange({ minPicks: 0, maxPicks });
    }
  };

  const setMin = (raw: number) => {
    const next = Math.max(0, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks: next, maxPicks: Math.max(next, maxPicks) });
  };

  const setMax = (raw: number) => {
    const next = Math.max(minPicks, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks, maxPicks: next });
  };

  return (
    <div
      className={
        flush
          ? ''
          : 'rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-[var(--s-3)]'
      }
    >
      <div className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)] mb-1.5">
        {t('pickerStepRules')}
      </div>

      <div className="flex items-center justify-between mb-[var(--s-2)]">
        <span className="text-fs-sm">{t('composeRequired')}</span>
        <button
          type="button"
          onClick={() => setRequired(!required)}
          aria-pressed={required}
          className={`relative w-8 h-4 rounded-full transition-colors ${
            required ? 'bg-[var(--success-500)]' : 'bg-[var(--surface-3)]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
              required ? 'right-0.5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-[var(--s-2)]">
        <span className="text-fs-sm">
          {t('composeMin')} — {t('composeMax')}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={minPicks}
            onChange={(e) => setMin(parseInt(e.target.value, 10) || 0)}
            className="w-12 h-7 px-1.5 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)]"
          />
          <span className="text-[var(--fg-muted)]">–</span>
          <input
            type="number"
            min={Math.max(1, minPicks)}
            value={maxPicks}
            onChange={(e) => setMax(parseInt(e.target.value, 10) || 0)}
            className="w-12 h-7 px-1.5 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)]"
          />
        </div>
      </div>
    </div>
  );
}
