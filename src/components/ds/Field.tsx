'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FieldProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  grow?: boolean;
}

export function Field({ label, hint, grow, children, className, ...props }: FieldProps) {
  return (
    <label
      className={cn(
        'flex flex-col gap-1.5 min-w-0',
        grow && 'flex-1',
        className,
      )}
      {...props}
    >
      {label && (
        <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="text-fs-xs text-[var(--fg-subtle)]">{hint}</span>}
    </label>
  );
}
