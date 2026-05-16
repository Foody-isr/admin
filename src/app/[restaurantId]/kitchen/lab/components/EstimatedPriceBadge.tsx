import type { Component } from '../types';

/**
 * EstimatedPriceBadge — small inline badge shown next to a component's cost
 * when its price is estimated rather than exact.
 *
 * Tone reflects the server-computed `price_confidence` value:
 * - high → blue (reasonable confidence)
 * - low  → amber with ⚠ warning
 * - absent / medium → neutral grey
 */
export function EstimatedPriceBadge({
  confidence,
}: {
  confidence?: Component['price_confidence'];
}) {
  const tone =
    confidence === 'high'
      ? { bg: 'rgba(59,130,246,.1)', fg: 'rgb(29,78,216)' }
      : confidence === 'low'
        ? { bg: 'rgba(245,158,11,.15)', fg: 'rgb(146,64,14)' }
        : { bg: 'var(--bg-subtle,#f3f4f6)', fg: 'var(--fg-muted,#6b7280)' };

  const showWarning = confidence === 'low';

  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        background: tone.bg,
        color: tone.fg,
      }}
    >
      est{showWarning ? ' ⚠' : ''}
    </span>
  );
}
