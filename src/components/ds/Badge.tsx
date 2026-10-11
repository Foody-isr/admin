'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 min-h-[24px] px-2 rounded-r-sm text-fs-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-2)] text-[var(--fg-muted)]',
        success: 'bg-[var(--success-50)] text-[var(--success-500)]',
        warning: 'bg-[var(--warning-50)] text-[var(--warning-500)]',
        danger: 'bg-[var(--danger-50)] text-[var(--danger-500)]',
        info: 'bg-[var(--info-50)] text-[var(--info-500)]',
        brand:
          'text-[var(--brand-ink)] bg-[var(--brand-soft)]',
        // Combo indicator — violet, distinct from the panel's blue/green/amber
        // breakdown hues and from brand orange (= default sales).
        combo:
          'text-[#7c3aed] dark:text-[#a78bfa] bg-[color-mix(in_oklab,#7c3aed_16%,transparent)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  ),
);
Badge.displayName = 'Badge';

export { badgeVariants };
