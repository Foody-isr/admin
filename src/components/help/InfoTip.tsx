'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** A small ⓘ icon that reveals a short explanation on hover/focus. Use for
 *  field-level help where a persistent line would be too noisy. Never put
 *  essential information only in here — it's progressive disclosure. */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className={cn('inline-flex align-middle text-[var(--fg-muted)] hover:text-[var(--fg)]', className)}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-fs-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}
