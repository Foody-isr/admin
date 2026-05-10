'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 h-[22px] px-2 rounded-r-sm text-fs-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-2)] text-[var(--fg-muted)]',
        success: 'bg-[var(--success-50)] text-[var(--success-500)] dark:text-[#4ade80]',
        warning: 'bg-[var(--warning-50)] text-[var(--warning-500)] dark:text-[#fbbf24]',
        danger: 'bg-[var(--danger-50)] text-[var(--danger-500)] dark:text-[#fb7185]',
        info: 'bg-[var(--info-50)] text-[var(--info-500)] dark:text-[#60a5fa]',
        brand:
          'text-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)]',
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
