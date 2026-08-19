'use client';

import { cn } from '@/lib/utils';
import { formatMoney, type FormatMoneyOptions } from '@/lib/format-money';

/**
 * A monetary figure, rendered the one way.
 *
 * Two things this centralises and nothing else should re-derive:
 *
 * `dir="ltr"` — a price is not text. In Hebrew, "₪35.00" left to its own devices
 * reorders into "35.00₪" or worse once a sign is involved. The order detail is
 * used daily in Hebrew, so every figure gets an explicit direction.
 *
 * `.num` — mono + tabular-nums, from globals.css. The centre column's money
 * lane is a fixed 92px and only reads as a lane if every glyph is the same
 * width, so the decimal points stack down the page.
 */
export function Money({
  value,
  className,
  ...opts
}: {
  value: number | null | undefined;
  className?: string;
} & FormatMoneyOptions) {
  return (
    <span dir="ltr" className={cn('num', className)}>
      {formatMoney(value, opts)}
    </span>
  );
}
